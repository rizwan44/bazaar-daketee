import { AIController, SOCKET_EVENTS, type GameMove } from '@card-games/shared';
import type { GameStartedInfo } from '../rooms/types.js';
import { AppError } from '../utils/errors.js';
import type { GameAdapter } from './adapters/types.js';
import type { GamePersistence, LiveGamePlayer } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface LiveGameSession {
  gameSessionId: string;
  gameKey: string;
  roomCode: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: GameAdapter<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any;
  players: Map<string, LiveGamePlayer>;
  turnTimer: ReturnType<typeof setTimeout> | null;
  turnExpiresAtMs: number | null;
  adapterData: unknown;
  /** Next `GameMove.moveIndex` to write — see `recordMove`. */
  nextMoveIndex: number;
}

export interface SessionEndedInfo {
  gameSessionId: string;
  loserUserIds?: string[];
  resultSummary?: { scores: Record<string, number>; winnerIds: string[] };
}

export interface GameSessionManagerOptions {
  persistence: GamePersistence;
  emitToSocket: (socketId: string, event: string, payload: unknown) => void;
  /** One per game this server can run live — see server/src/game/adapters. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapters: GameAdapter<any>[];
  /** Fired once a session finishes, so the room it was played in can be closed out — see `RoomManager.closeRoomAfterGame`. */
  onSessionEnded?: (roomCode: string, info: SessionEndedInfo) => void;
}

/**
 * Runs live turn-based game sessions for every game with a registered
 * `GameAdapter` (see server/src/game/adapters). Structurally the same shape
 * as `RoomManager` (in-memory sessions, injected persistence/emit, own
 * reconnect handling). Everything in this class only calls generic
 * `GameEngine<TState>` methods plus the small `GameAdapter` seam — no game
 * gets special-cased here, so a third game only ever needs a new adapter.
 * Per-game turn-timeout behavior (or its absence — see Four Card's `null`)
 * comes from `adapter.turnTimeoutMs`, never a constructor-level default.
 */
export class GameSessionManager {
  private readonly sessions = new Map<string, LiveGameSession>();
  private readonly adapters: Map<string, GameAdapter<unknown>>;
  private readonly persistence: GamePersistence;
  private readonly emitToSocket: GameSessionManagerOptions['emitToSocket'];
  private readonly onSessionEnded?: GameSessionManagerOptions['onSessionEnded'];

  constructor(opts: GameSessionManagerOptions) {
    this.adapters = new Map(opts.adapters.map((a) => [a.gameKey, a]));
    this.persistence = opts.persistence;
    this.emitToSocket = opts.emitToSocket;
    this.onSessionEnded = opts.onSessionEnded;
  }

  async startSession(info: GameStartedInfo): Promise<void> {
    const adapter = this.adapters.get(info.gameKey);
    if (!adapter) return;

    const { playerRefs, adapterData } = await adapter.preparePlayers(info, this.persistence);

    let state = adapter.engine.initializeGame(playerRefs, info.rngSeed);
    state = adapter.engine.dealCards(state);

    const players = new Map<string, LiveGamePlayer>();
    for (const p of info.players) {
      const aiConfig =
        p.isAI && p.aiDifficulty && p.aiPersonality
          ? { difficulty: p.aiDifficulty, personality: p.aiPersonality }
          : undefined;
      players.set(p.userId, {
        userId: p.userId,
        username: p.username,
        seatIndex: p.seatIndex,
        isAI: p.isAI,
        aiConfig,
        socketId: null,
        isConnected: p.isAI, // AI is always "connected"; humans connect via game:join
      });
    }

    this.sessions.set(info.gameSessionId, {
      gameSessionId: info.gameSessionId,
      gameKey: info.gameKey,
      roomCode: info.roomCode,
      adapter,
      state,
      players,
      turnTimer: null,
      turnExpiresAtMs: null,
      adapterData,
      nextMoveIndex: 0,
    });

    this.advanceTurn(info.gameSessionId);
  }

  handleJoin(gameSessionId: string, userId: string, socketId: string): void {
    const session = this.requireSession(gameSessionId);
    const player = session.players.get(userId);
    if (!player) throw new AppError('NOT_IN_GAME', 'You are not seated in this game.');

    player.socketId = socketId;
    player.isConnected = true;
    this.sendStateTo(session, userId);
  }

  handleMove(gameSessionId: string, userId: string, move: GameMove): void {
    const session = this.requireSession(gameSessionId);
    this.applyMoveInternal(session, userId, move);
  }

  /** Marks whichever seat owned this socket as disconnected; the next turn timer covers the rest (see class doc). */
  handleSocketDisconnect(socketId: string): void {
    for (const session of this.sessions.values()) {
      for (const player of session.players.values()) {
        if (player.socketId === socketId) {
          player.isConnected = false;
          player.socketId = null;
          this.broadcastAll(session);
          return;
        }
      }
    }
  }

  private requireSession(gameSessionId: string): LiveGameSession {
    const session = this.sessions.get(gameSessionId);
    if (!session) throw new AppError('GAME_NOT_FOUND', 'Game session not found.');
    return session;
  }

  private applyMoveInternal(session: LiveGameSession, userId: string, move: GameMove): void {
    const validation = session.adapter.engine.validateMove(session.state, userId, move);
    if (!validation.valid) {
      throw new AppError('INVALID_MOVE', validation.reason ?? 'That move is not allowed right now.');
    }

    this.clearTurnTimer(session);
    session.state = session.adapter.engine.applyMove(session.state, userId, move);

    void this.persistence.recordMove({
      gameSessionId: session.gameSessionId,
      userId,
      moveType: move.type,
      payload: move.payload,
      moveIndex: session.nextMoveIndex++,
    });

    if (session.adapter.shouldAdvanceTurn(move.type)) {
      session.state = session.adapter.engine.nextTurn(session.state);
    }

    if (session.adapter.engine.checkWinner(session.state)) {
      void this.completeSession(session);
      return;
    }

    this.advanceTurn(session.gameSessionId);
  }

  private advanceTurn(gameSessionId: string): void {
    const session = this.sessions.get(gameSessionId);
    if (!session || session.adapter.engine.checkWinner(session.state)) return;

    const currentUserId = session.state.turnOrder[session.state.currentTurnIndex];
    const currentPlayer = session.players.get(currentUserId);
    const turnTimeoutMs = session.adapter.turnTimeoutMs;
    session.turnExpiresAtMs = turnTimeoutMs !== null ? Date.now() + turnTimeoutMs : null;

    this.broadcastAll(session);

    if (currentPlayer?.isAI) {
      const config = currentPlayer.aiConfig ?? { difficulty: 'normal', personality: 'friendly' };
      const delayMs = Math.round(500 + Math.random() * 1500);
      session.turnTimer = setTimeout(() => {
        const controller = new AIController(session.adapter.engine, config, Math.random, session.adapter.scorer);
        const move = controller.decide(session.state, currentUserId);
        this.applyMoveInternal(session, currentUserId, move);
      }, delayMs);
    } else if (turnTimeoutMs !== null) {
      // Covers both "thinking too long" and "disconnected" with one timer —
      // see the class doc comment for why there's no separate grace period.
      // Auto-plays whichever legal move comes first — for Teen Patti that's
      // always fold (see its getValidMoves), for Four Card whatever capture
      // or discard is available. Games with `turnTimeoutMs: null` (Four
      // Card) never schedule this at all — the turn just waits indefinitely.
      session.turnTimer = setTimeout(() => {
        const stillValid = session.adapter.engine.getValidMoves(session.state, currentUserId);
        if (stillValid.length > 0) {
          this.applyMoveInternal(session, currentUserId, stillValid[0]);
        }
      }, turnTimeoutMs);
    }
  }

  private async completeSession(session: LiveGameSession): Promise<void> {
    const result = await session.adapter.settle({
      gameSessionId: session.gameSessionId,
      state: session.state,
      players: session.players,
      adapterData: session.adapterData,
      persistence: this.persistence,
    });
    if (!result) return;

    for (const player of session.players.values()) {
      if (player.socketId) this.emitToSocket(player.socketId, result.event, result.payload);
    }
    this.broadcastAll(session);
    this.sessions.delete(session.gameSessionId);
    this.onSessionEnded?.(session.roomCode, {
      gameSessionId: session.gameSessionId,
      loserUserIds: result.loserUserIds,
      resultSummary: result.resultSummary,
    });
  }

  private broadcastAll(session: LiveGameSession): void {
    for (const userId of session.players.keys()) {
      this.sendStateTo(session, userId);
    }
  }

  private sendStateTo(session: LiveGameSession, userId: string): void {
    const player = session.players.get(userId);
    if (!player?.socketId) return;
    this.emitToSocket(player.socketId, SOCKET_EVENTS.GAME_STATE, this.buildView(session, userId));
  }

  private buildView(session: LiveGameSession, userId: string): unknown {
    return session.adapter.buildView(session.state, userId, {
      gameSessionId: session.gameSessionId,
      players: session.players,
      turnExpiresAtMs: session.turnExpiresAtMs,
    });
  }

  private clearTurnTimer(session: LiveGameSession): void {
    if (session.turnTimer) {
      clearTimeout(session.turnTimer);
      session.turnTimer = null;
    }
  }
}
