import { randomInt } from 'node:crypto';
import {
  getGameByKey,
  type AIConfig,
  type RoomStartedPayload,
  type RoomStatePayload,
} from '@card-games/shared';
import { SOCKET_EVENTS } from '@card-games/shared';
import { generateRoomCode } from './roomCode.js';
import type { GameStartedInfo, LiveRoom, LiveRoomPlayer, RoomPersistence } from './types.js';
import { AppError } from '../utils/errors.js';

export interface RoomManagerOptions {
  persistence: RoomPersistence;
  /** Sends `event` with `payload` to every socket currently joined to the Socket.IO room named `code`. */
  broadcast: (code: string, event: string, payload: unknown) => void;
  /** How long a disconnected player's seat is held before it's released. Defaults to 60s. */
  disconnectGraceMs?: number;
  /**
   * Fired right after a game session is created, so a game-session runner
   * can pick it up. Awaited before `ROOM_STARTED` is broadcast — see
   * `GameStartedInfo`'s doc comment for why that ordering matters.
   */
  onGameStarted?: (info: GameStartedInfo) => void | Promise<void>;
}

const DEFAULT_GRACE_MS = 60_000;

export class RoomManager {
  private readonly rooms = new Map<string, LiveRoom>();
  private readonly userIdToRoomCode = new Map<string, string>();
  private readonly persistence: RoomPersistence;
  private readonly broadcast: RoomManagerOptions['broadcast'];
  private readonly graceMs: number;
  private readonly onGameStarted?: RoomManagerOptions['onGameStarted'];

  constructor(opts: RoomManagerOptions) {
    this.persistence = opts.persistence;
    this.broadcast = opts.broadcast;
    this.graceMs = opts.disconnectGraceMs ?? DEFAULT_GRACE_MS;
    this.onGameStarted = opts.onGameStarted;
  }

  async createRoom(
    host: { userId: string; username: string },
    gameKey: string,
    isPrivate: boolean,
    socketId: string,
    mode?: string,
  ): Promise<RoomStatePayload> {
    const catalogEntry = getGameByKey(gameKey);
    if (!catalogEntry) {
      throw new AppError('UNKNOWN_GAME', `No such game: ${gameKey}`);
    }
    const gameDbId = await this.persistence.getGameDbId(gameKey);
    if (!gameDbId) {
      throw new AppError('GAME_NOT_SEEDED', 'Game catalog is not seeded in the database.');
    }

    // Games with modes (e.g. 4 Card) resolve min/max from the chosen variant
    // instead of the catalog's top-level values — defaults to the first
    // mode if none was requested, so callers that don't know about modes
    // yet keep getting the original (2-player) behavior.
    const modeVariant = catalogEntry.modes?.find((m) => m.key === mode) ?? catalogEntry.modes?.[0];
    const minPlayers = modeVariant?.minPlayers ?? catalogEntry.minPlayers;
    const maxPlayers = modeVariant?.maxPlayers ?? catalogEntry.maxPlayers;

    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const dbRoom = await this.persistence.createRoom({
      code,
      gameDbId,
      hostUserId: host.userId,
      isPrivate,
      maxPlayers,
    });
    await this.persistence.addPlayer({ roomId: dbRoom.id, userId: host.userId, seatIndex: 0 });

    const room: LiveRoom = {
      id: dbRoom.id,
      code,
      gameKey,
      gameDbId,
      hostUserId: host.userId,
      isPrivate,
      minPlayers,
      maxPlayers,
      status: 'waiting',
      players: new Map(),
      mode: modeVariant?.key,
      gameHistory: [],
    };
    room.players.set(host.userId, {
      userId: host.userId,
      username: host.username,
      seatIndex: 0,
      isReady: false,
      isConnected: true,
      socketId,
      disconnectTimer: null,
      isAI: false,
    });

    this.rooms.set(code, room);
    this.userIdToRoomCode.set(host.userId, code);
    return this.toPayload(room);
  }

  async joinRoom(
    code: string,
    player: { userId: string; username: string },
    socketId: string,
  ): Promise<RoomStatePayload> {
    const room = this.requireRoom(code);
    if (room.status !== 'waiting') {
      throw new AppError('ALREADY_STARTED', 'This room has already started.');
    }

    const existing = room.players.get(player.userId);
    if (existing) {
      this.clearDisconnectTimer(existing);
      existing.socketId = socketId;
      existing.isConnected = true;
      existing.username = player.username;
    } else {
      if (room.players.size >= room.maxPlayers) {
        throw new AppError('ROOM_FULL', 'This room is full.');
      }
      const seatIndex = this.nextFreeSeat(room);
      await this.persistence.addPlayer({ roomId: room.id, userId: player.userId, seatIndex });
      room.players.set(player.userId, {
        userId: player.userId,
        username: player.username,
        seatIndex,
        isReady: false,
        isConnected: true,
        socketId,
        disconnectTimer: null,
        isAI: false,
      });
    }

    this.userIdToRoomCode.set(player.userId, code);
    const payload = this.toPayload(room);
    this.broadcast(code, SOCKET_EVENTS.ROOM_STATE, payload);
    return payload;
  }

  /**
   * Host-only: fills the next free seat with an AI player. AI seats are
   * always ready and never disconnect, so a solo room can start the moment
   * the human is ready — no separate "solo mode" lobby needed.
   */
  async addAIPlayer(code: string, hostUserId: string, config: AIConfig): Promise<RoomStatePayload> {
    const room = this.requireRoom(code);
    if (room.hostUserId !== hostUserId) {
      throw new AppError('NOT_HOST', 'Only the host can add AI players.');
    }
    if (room.status !== 'waiting') {
      throw new AppError('ALREADY_STARTED', 'This room has already started.');
    }
    if (room.players.size >= room.maxPlayers) {
      throw new AppError('ROOM_FULL', 'This room is full.');
    }

    const aiUser = await this.persistence.ensureAIUser(config.difficulty, config.personality);
    const seatIndex = this.nextFreeSeat(room);
    await this.persistence.addPlayer({ roomId: room.id, userId: aiUser.userId, seatIndex });

    room.players.set(aiUser.userId, {
      userId: aiUser.userId,
      username: aiUser.username,
      seatIndex,
      isReady: true,
      isConnected: true,
      socketId: null,
      disconnectTimer: null,
      isAI: true,
      aiDifficulty: config.difficulty,
      aiPersonality: config.personality,
    });
    await this.persistence.setPlayerReady({ roomId: room.id, userId: aiUser.userId, isReady: true });

    const payload = this.toPayload(room);
    this.broadcast(code, SOCKET_EVENTS.ROOM_STATE, payload);
    return payload;
  }

  async setReady(code: string, userId: string, isReady: boolean): Promise<RoomStatePayload> {
    const room = this.requireRoom(code);
    const player = room.players.get(userId);
    if (!player) throw new AppError('NOT_IN_ROOM', 'You are not in this room.');

    player.isReady = isReady;
    await this.persistence.setPlayerReady({ roomId: room.id, userId, isReady });

    const payload = this.toPayload(room);
    this.broadcast(code, SOCKET_EVENTS.ROOM_STATE, payload);
    return payload;
  }

  async startGame(code: string, userId: string): Promise<RoomStartedPayload> {
    const room = this.requireRoom(code);
    if (room.hostUserId !== userId) {
      throw new AppError('NOT_HOST', 'Only the host can start the game.');
    }
    if (room.status !== 'waiting') {
      throw new AppError('ALREADY_STARTED', 'This room has already started.');
    }

    const players = [...room.players.values()];
    if (players.length < room.minPlayers || players.length > room.maxPlayers) {
      throw new AppError(
        'INVALID_PLAYER_COUNT',
        `${room.gameKey} needs ${room.minPlayers}-${room.maxPlayers} players.`,
      );
    }
    if (players.some((p) => !p.isReady)) {
      throw new AppError('NOT_READY', 'All players must be ready to start.');
    }

    return this.beginGame(room, players);
  }

  /**
   * Everything past validation for actually starting a game session — used
   * both by the host-triggered `startGame` above and by `respondToRematch`
   * below (which auto-triggers this the instant every seated player has
   * accepted a rematch, with no separate manual "Start Game" click needed).
   * Callers are responsible for their own preconditions (host/ready/count) —
   * this assumes `players` is already a valid, fully-ready roster.
   */
  private async beginGame(room: LiveRoom, players: LiveRoomPlayer[]): Promise<RoomStartedPayload> {
    // Whoever shuffles this game — see the class doc on `lastGameLoserUserIds`
    // for why. First game in a fresh room: random among everyone seated
    // ("system decided", not silently always the host). Any game after a
    // rematch: random among the players who lost the previous game — in
    // team mode "the system decides which of the two losing teammates"
    // exactly by this same random pick over their 2 userIds.
    const shufflerUserId = this.pickShufflerUserId(room, players);

    // GameEngine.initializeGame wants a number; stringified only for DB storage.
    const rngSeed = randomInt(0, 2 ** 31 - 1);
    const gameSession = await this.persistence.createGameSession({
      roomId: room.id,
      gameDbId: room.gameDbId,
      rngSeed: String(rngSeed),
    });
    await this.persistence.addGamePlayers({
      gameSessionId: gameSession.id,
      players: players.map((p) => ({
        userId: p.userId,
        seatIndex: p.seatIndex,
        isAI: p.isAI,
        aiDifficulty: p.aiDifficulty,
        aiPersonality: p.aiPersonality,
      })),
    });
    await this.persistence.setRoomStatus({ roomId: room.id, status: 'in_progress' });
    room.status = 'in_progress';
    room.rematchRequestedBy = undefined;

    this.broadcast(room.code, SOCKET_EVENTS.ROOM_STATE, this.toPayload(room));

    // Awaited so the game session fully exists before any client can be told
    // to transition and start emitting `game:join` for it — see the doc
    // comment on `GameStartedInfo`.
    await this.onGameStarted?.({
      gameSessionId: gameSession.id,
      gameKey: room.gameKey,
      roomCode: room.code,
      rngSeed,
      mode: room.mode,
      shufflerUserId,
      players: players.map((p) => ({
        userId: p.userId,
        username: p.username,
        seatIndex: p.seatIndex,
        isAI: p.isAI,
        aiDifficulty: p.aiDifficulty,
        aiPersonality: p.aiPersonality,
      })),
    });

    const startedPayload: RoomStartedPayload = { gameSessionId: gameSession.id, roomCode: room.code };
    this.broadcast(room.code, SOCKET_EVENTS.ROOM_STARTED, startedPayload);

    return startedPayload;
  }

  async leaveRoom(code: string, userId: string): Promise<void> {
    const room = this.rooms.get(code);
    if (!room) return;
    const player = room.players.get(userId);
    if (!player) return;

    this.clearDisconnectTimer(player);
    await this.removePlayerAndSettle(room, userId);
  }

  /** Returns the socketId of the removed player (if any) so the caller can notify them directly. */
  async kickPlayer(code: string, hostUserId: string, targetUserId: string): Promise<string | null> {
    const room = this.requireRoom(code);
    if (room.hostUserId !== hostUserId) {
      throw new AppError('NOT_HOST', 'Only the host can remove players.');
    }
    if (targetUserId === hostUserId) {
      throw new AppError('CANNOT_KICK_SELF', 'The host cannot remove themselves — use Leave.');
    }
    const target = room.players.get(targetUserId);
    if (!target) throw new AppError('NOT_IN_ROOM', 'That player is not in this room.');

    this.clearDisconnectTimer(target);
    const socketId = target.socketId;
    await this.removePlayerAndSettle(room, targetUserId);
    return socketId;
  }

  /**
   * Called once a game session finishes (see `GameSessionManager`'s
   * `onSessionEnded` hook).
   *
   * Without `loserUserIds` (Teen Patti, and any other game that hasn't
   * opted into rematch): unchanged original behavior — a room exists to get
   * its players into one hand, so once that hand is over the room closes
   * outright instead of sitting `in_progress` forever, and deliberately
   * without a ROOM_CLOSED broadcast (the players are looking at the
   * game-specific end-of-hand screen, which already told them the result
   * via `game:ended` and has its own "Back to Lobby" exit — broadcasting a
   * room-closed event here would yank that screen away via `RoomScreen`'s
   * closedInfo branch).
   *
   * With `loserUserIds` (Four Card's rematch flow): the room stays live and
   * transitions to `finished` instead of being deleted, remembering who
   * lost so the next game's shuffler can be picked (see
   * `pickShufflerUserId`). `RoomScreen` keeps rendering the same table
   * component for a `finished` room (not just `in_progress`) precisely so
   * this broadcast doesn't yank the end screen away either — the table's
   * own "Play Again" / "Back to Lobby" buttons are what the player acts on.
   */
  async closeRoomAfterGame(
    code: string,
    info?: {
      gameSessionId?: string;
      loserUserIds?: string[];
      resultSummary?: { scores: Record<string, number>; winnerIds: string[] };
    },
  ): Promise<void> {
    const room = this.rooms.get(code);
    if (!room) return;

    if (info?.loserUserIds && info.loserUserIds.length > 0) {
      room.status = 'finished';
      room.lastGameLoserUserIds = info.loserUserIds;
      if (info.resultSummary && info.gameSessionId) {
        // Never overwritten — each rematch appends a new entry (§37).
        room.gameHistory.push({
          gameSessionId: info.gameSessionId,
          endedAt: new Date().toISOString(),
          scores: info.resultSummary.scores,
          winnerIds: info.resultSummary.winnerIds,
        });
      }
      for (const player of room.players.values()) {
        if (!player.isAI) player.isReady = false;
      }
      await this.persistence.setRoomStatus({ roomId: room.id, status: 'finished' });
      this.broadcast(code, SOCKET_EVENTS.ROOM_STATE, this.toPayload(room));
      return;
    }

    for (const player of room.players.values()) {
      this.clearDisconnectTimer(player);
      this.userIdToRoomCode.delete(player.userId);
    }
    this.rooms.delete(code);
    await this.persistence.setRoomStatus({ roomId: room.id, status: 'finished' });
  }

  /**
   * A player asks for a rematch on a `finished`, rematch-capable room (see
   * `closeRoomAfterGame`). Transitions the room back to `waiting` and marks
   * the requester (and every AI seat, which always auto-accepts, same as it
   * always auto-readies today) accepted — everyone else starts unaccepted
   * and responds via `respondToRematch`. Same room, same seats, no new room
   * code — only `lastGameLoserUserIds`/`gameHistory` carry over.
   */
  async requestRematch(code: string, userId: string): Promise<RoomStatePayload> {
    const room = this.requireRoom(code);
    if (!room.players.has(userId)) {
      throw new AppError('NOT_IN_ROOM', 'You are not in this room.');
    }
    if (room.status !== 'finished') {
      throw new AppError('NOT_FINISHED', 'This room is not ready for a rematch.');
    }

    room.status = 'waiting';
    room.rematchRequestedBy = userId;
    for (const player of room.players.values()) {
      player.isReady = player.isAI || player.userId === userId;
    }
    await this.persistence.setRoomStatus({ roomId: room.id, status: 'waiting' });

    const payload = this.toPayload(room);
    this.broadcast(code, SOCKET_EVENTS.ROOM_STATE, payload);
    return payload;
  }

  /**
   * A player accepts or declines an in-flight rematch request. Accepting
   * marks them ready (reusing the same `isReady` flag the normal lobby
   * already uses) and, once every seated player has accepted, immediately
   * starts the new game itself — no separate manual "Start Game" click.
   * Declining removes that player via the same path `leaveRoom` already
   * uses (host reassignment, empty-room teardown, all unchanged); the room
   * simply reverts to being an ordinary `waiting` room afterward.
   */
  async respondToRematch(code: string, userId: string, accept: boolean): Promise<RoomStatePayload | null> {
    const room = this.requireRoom(code);
    const player = room.players.get(userId);
    if (!player) throw new AppError('NOT_IN_ROOM', 'You are not in this room.');
    if (!room.rematchRequestedBy) {
      throw new AppError('NO_REMATCH_PENDING', 'There is no rematch request to respond to.');
    }

    if (!accept) {
      this.clearDisconnectTimer(player);
      await this.removePlayerAndSettle(room, userId);
      return null;
    }

    player.isReady = true;
    await this.persistence.setPlayerReady({ roomId: room.id, userId, isReady: true });

    const players = [...room.players.values()];
    const everyoneIn =
      players.length >= room.minPlayers && players.length <= room.maxPlayers && players.every((p) => p.isReady);

    if (everyoneIn) {
      await this.beginGame(room, players);
      return this.toPayload(room);
    }

    const payload = this.toPayload(room);
    this.broadcast(code, SOCKET_EVENTS.ROOM_STATE, payload);
    return payload;
  }

  /** Called when a socket disconnects. Starts the reconnect grace window for whichever player owned it. */
  handleSocketDisconnect(socketId: string): void {
    for (const room of this.rooms.values()) {
      for (const player of room.players.values()) {
        if (player.socketId !== socketId) continue;

        player.isConnected = false;
        player.socketId = null;
        this.broadcast(room.code, SOCKET_EVENTS.ROOM_STATE, this.toPayload(room));

        player.disconnectTimer = setTimeout(() => {
          void this.removePlayerAndSettle(room, player.userId);
        }, this.graceMs);
        return;
      }
    }
  }

  /**
   * Called right after a socket (re-)identifies. If that user already has a
   * live seat somewhere (e.g. a page reload), re-attaches this socket to it
   * and cancels any pending disconnect timer — this is what makes
   * reconnection automatic instead of needing a separate resume event.
   */
  reattachIfReturning(userId: string, socketId: string, username: string): RoomStatePayload | null {
    const code = this.userIdToRoomCode.get(userId);
    if (!code) return null;
    const room = this.rooms.get(code);
    if (!room) {
      this.userIdToRoomCode.delete(userId);
      return null;
    }
    const player = room.players.get(userId);
    if (!player) return null;

    this.clearDisconnectTimer(player);
    player.socketId = socketId;
    player.isConnected = true;
    player.username = username;

    const payload = this.toPayload(room);
    this.broadcast(code, SOCKET_EVENTS.ROOM_STATE, payload);
    return payload;
  }

  getRoomState(code: string): RoomStatePayload | null {
    const room = this.rooms.get(code);
    return room ? this.toPayload(room) : null;
  }

  private async removePlayerAndSettle(room: LiveRoom, userId: string): Promise<void> {
    const wasHost = room.hostUserId === userId;
    room.players.delete(userId);
    this.userIdToRoomCode.delete(userId);
    await this.persistence.removePlayer({ roomId: room.id, userId });

    if (room.players.size === 0) {
      this.rooms.delete(room.code);
      await this.persistence.setRoomStatus({ roomId: room.id, status: 'finished' });
      this.broadcast(room.code, SOCKET_EVENTS.ROOM_CLOSED, { code: room.code, reason: 'empty' });
      return;
    }

    if (wasHost) {
      const nextHost = [...room.players.values()].sort((a, b) => a.seatIndex - b.seatIndex)[0];
      room.hostUserId = nextHost.userId;
      await this.persistence.setRoomHost({ roomId: room.id, hostUserId: nextHost.userId });
    }

    this.broadcast(room.code, SOCKET_EVENTS.ROOM_STATE, this.toPayload(room));
  }

  /** First game in a room: random among everyone seated. Any game after a rematch: random among last game's loser(s) — see `closeRoomAfterGame`'s doc comment. */
  private pickShufflerUserId(room: LiveRoom, players: LiveRoomPlayer[]): string {
    const candidates = room.lastGameLoserUserIds?.filter((id) => room.players.has(id)) ?? [];
    const pool = candidates.length > 0 ? candidates : players.map((p) => p.userId);
    return pool[randomInt(0, pool.length)];
  }

  private nextFreeSeat(room: LiveRoom): number {
    const used = new Set([...room.players.values()].map((p) => p.seatIndex));
    for (let seat = 0; seat < room.maxPlayers; seat++) {
      if (!used.has(seat)) return seat;
    }
    throw new AppError('ROOM_FULL', 'This room is full.');
  }

  private clearDisconnectTimer(player: LiveRoomPlayer): void {
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }
  }

  private requireRoom(code: string): LiveRoom {
    const room = this.rooms.get(code);
    if (!room) throw new AppError('ROOM_NOT_FOUND', 'Room not found.');
    return room;
  }

  private toPayload(room: LiveRoom): RoomStatePayload {
    const players = [...room.players.values()]
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map((p) => ({
        userId: p.userId,
        username: p.username,
        seatIndex: p.seatIndex,
        isHost: p.userId === room.hostUserId,
        isReady: p.isReady,
        isConnected: p.isConnected,
        isAI: p.isAI,
        aiDifficulty: p.aiDifficulty,
        aiPersonality: p.aiPersonality,
      }));

    return {
      id: room.id,
      code: room.code,
      gameKey: room.gameKey,
      hostUserId: room.hostUserId,
      isPrivate: room.isPrivate,
      minPlayers: room.minPlayers,
      maxPlayers: room.maxPlayers,
      status: room.status,
      players,
      rematchRequestedBy: room.rematchRequestedBy,
      gameHistory: room.gameHistory,
    };
  }
}
