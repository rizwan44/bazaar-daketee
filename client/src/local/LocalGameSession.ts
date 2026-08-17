import {
  AIController,
  buildFourCardView,
  computeCollectorScores,
  fourCardEngine,
  fourCardMoveScorer,
  type AIConfig,
  type AIDifficulty,
  type AIPersonality,
  type FourCardEndedPayload,
  type FourCardGameMode,
  type FourCardState,
  type GameMove,
  type GamePlayerRef,
  type RoomPlayerView,
  type RoomStatePayload,
} from '@card-games/shared';
import { useConnectionStore } from '../store/connectionStore';
import { useGameStore } from '../store/gameStore';
import { useRoomStore } from '../store/roomStore';

export const LOCAL_ROOM_CODE = 'LOCAL';
const LOCAL_GAME_SESSION_ID = 'local-session';

interface LocalPlayerInfo {
  userId: string;
  username: string;
  isAI: boolean;
  aiConfig?: AIConfig;
}

interface LocalSession {
  state: FourCardState;
  players: LocalPlayerInfo[];
  humanUserId: string;
  mode: FourCardGameMode;
  /** Whoever's collector scored lowest last game — feeds the next rematch's shuffler pick, same rule `RoomManager.pickShufflerUserId` uses. */
  lastLoserUserIds: string[];
  aiTimer: ReturnType<typeof setTimeout> | null;
  /** Injectable so tests can get a fully deterministic game (same pattern `AIController` itself already uses) — defaults to `Math.random` for real play. */
  rng: () => number;
  /** Real play uses a human-like 500-2000ms "thinking" delay (matches `GameSessionManager.advanceTurn`); tests set this to 0 so a full game runs near-instantly. */
  aiDelayMs: () => number;
}

let session: LocalSession | null = null;

/** True while a fully offline solo game is active — every entry point in `gameSocket.ts`/`roomSocket.ts` checks this before touching a real socket. */
export function isLocalSessionActive(): boolean {
  return session !== null;
}

function pickShufflerUserId(players: LocalPlayerInfo[], lastLoserUserIds: string[], rng: () => number): string {
  const pool = lastLoserUserIds.length > 0 ? lastLoserUserIds : players.map((p) => p.userId);
  return pool[Math.floor(rng() * pool.length)];
}

function beginLocalGame(
  players: LocalPlayerInfo[],
  mode: FourCardGameMode,
  lastLoserUserIds: string[],
  rng: () => number,
  aiDelayMs: () => number,
): void {
  const isTeam = mode === 'four-team';
  const shufflerUserId = pickShufflerUserId(players, lastLoserUserIds, rng);

  const playerRefs: GamePlayerRef[] = players.map((p, i) => ({
    playerId: p.userId,
    isAI: p.isAI,
    teamId: isTeam ? (i % 2 === 0 ? 'team-1' : 'team-2') : undefined,
    isShuffler: p.userId === shufflerUserId,
  }));

  const rngSeed = Math.floor(rng() * (2 ** 31 - 1));
  let state = fourCardEngine.initializeGame(playerRefs, rngSeed) as FourCardState;
  state = fourCardEngine.dealCards(state) as FourCardState;

  session = {
    state,
    players,
    humanUserId: players.find((p) => !p.isAI)!.userId,
    mode,
    lastLoserUserIds,
    aiTimer: null,
    rng,
    aiDelayMs,
  };

  syncRoomStore();
  pushView();
  scheduleAiIfNeeded();
}

/** Starts a brand-new fully offline solo game — no room/AI-fill round trip, no socket at all. */
export function startLocalGame(opts: {
  mode: FourCardGameMode;
  difficulty: AIDifficulty;
  personality: AIPersonality;
  /** Test-only hooks — omit for real play, which uses `Math.random` and a human-like AI delay. */
  rng?: () => number;
  aiDelayMs?: () => number;
}): void {
  const { guestId, username } = useConnectionStore.getState();
  const aiConfig: AIConfig = { difficulty: opts.difficulty, personality: opts.personality };
  const seatCount = opts.mode === 'two-player' ? 2 : 4;

  const players: LocalPlayerInfo[] = [{ userId: guestId || 'you', username: username || 'You', isAI: false }];
  for (let i = 1; i < seatCount; i++) {
    players.push({ userId: `ai-${i}`, username: `AI ${i}`, isAI: true, aiConfig });
  }

  beginLocalGame(
    players,
    opts.mode,
    [],
    opts.rng ?? Math.random,
    opts.aiDelayMs ?? (() => Math.round(500 + Math.random() * 1500)),
  );
}

export function sendLocalMove(moveType: string, extra?: { cardId?: string; payload?: Record<string, unknown> }): void {
  if (!session) return;
  applyLocalMove(session.humanUserId, { type: moveType, ...extra } as GameMove);
}

export function leaveLocalGame(): void {
  clearAiTimer();
  session = null;
  useRoomStore.getState().clearRoom();
  useGameStore.getState().clear();
}

/** Reuses the same seats/mode, re-shuffles, and picks the next shuffler from last game's losers — same rule a real rematch follows. No "everyone accepts" wait needed: there are no other real players to ask. */
export function requestLocalRematch(): void {
  if (!session) return;
  beginLocalGame(session.players, session.mode, session.lastLoserUserIds, session.rng, session.aiDelayMs);
}

function applyLocalMove(userId: string, move: GameMove): void {
  if (!session) return;
  const validation = fourCardEngine.validateMove(session.state, userId, move);
  if (!validation.valid) return; // mirrors the server rejecting silently — the UI only ever offers legal drags anyway

  session.state = fourCardEngine.applyMove(session.state, userId, move) as FourCardState;
  // Four Card's shouldAdvanceTurn is unconditionally true (see fourCardAdapter's own comment) — nextTurn is safe after every move.
  session.state = fourCardEngine.nextTurn(session.state) as FourCardState;

  pushView();
  scheduleAiIfNeeded();
}

function scheduleAiIfNeeded(): void {
  if (!session || session.state.phase !== 'playing') return;
  clearAiTimer();

  const currentUserId = session.state.turnOrder[session.state.currentTurnIndex];
  const currentPlayer = session.players.find((p) => p.userId === currentUserId);
  if (!currentPlayer?.isAI || !currentPlayer.aiConfig) return;

  const config = currentPlayer.aiConfig;
  const rng = session.rng;
  session.aiTimer = setTimeout(() => {
    if (!session) return;
    const controller = new AIController(fourCardEngine, config, rng, fourCardMoveScorer);
    const move = controller.decide(session.state, currentUserId);
    applyLocalMove(currentUserId, move);
  }, session.aiDelayMs());
}

function clearAiTimer(): void {
  if (session?.aiTimer) {
    clearTimeout(session.aiTimer);
    session.aiTimer = null;
  }
}

function syncRoomStore(): void {
  if (!session) return;
  const roomPlayers: RoomPlayerView[] = session.players.map((p, i) => ({
    userId: p.userId,
    username: p.username,
    seatIndex: i,
    isHost: p.userId === session!.humanUserId,
    isReady: true,
    isConnected: true,
    isAI: p.isAI,
    aiDifficulty: p.aiConfig?.difficulty,
    aiPersonality: p.aiConfig?.personality,
  }));

  const room: RoomStatePayload = {
    id: LOCAL_ROOM_CODE,
    code: LOCAL_ROOM_CODE,
    gameKey: 'four-card',
    hostUserId: session.humanUserId,
    isPrivate: true,
    minPlayers: roomPlayers.length,
    maxPlayers: roomPlayers.length,
    status: session.state.phase === 'complete' ? 'finished' : 'in_progress',
    players: roomPlayers,
    gameHistory: [],
  };

  useRoomStore.setState({
    room,
    selfUserId: session.humanUserId,
    identified: true,
    startedSession: { gameSessionId: LOCAL_GAME_SESSION_ID, roomCode: LOCAL_ROOM_CODE },
  });
}

function pushView(): void {
  if (!session) return;
  const ctx = {
    gameSessionId: LOCAL_GAME_SESSION_ID,
    players: new Map(session.players.map((p) => [p.userId, { username: p.username, isAI: p.isAI, isConnected: true }])),
  };
  useGameStore.getState().setView(buildFourCardView(session.state, session.humanUserId, ctx));

  if (session.state.phase !== 'complete') return;

  const collectorScores = computeCollectorScores(session.state);
  const ended: FourCardEndedPayload = {
    gameSessionId: LOCAL_GAME_SESSION_ID,
    mode: session.state.mode,
    winnerIds: session.state.winnerIds,
    scores: collectorScores,
  };
  useGameStore.getState().setEnded(ended);
  syncRoomStore(); // flips room.status to 'finished' so RoomScreen keeps rendering the table's own end screen

  // Same loser rule fourCardAdapter.settle uses, so a rematch's shuffler pick matches the real game exactly.
  const scoreValues = Object.values(collectorScores);
  const minScore = Math.min(...scoreValues);
  const maxScore = Math.max(...scoreValues);
  session.lastLoserUserIds =
    minScore === maxScore
      ? []
      : session.players
          .filter((p) => {
            const statePlayer = session!.state.players.find((sp) => sp.userId === p.userId)!;
            return (collectorScores[statePlayer.collectorId] ?? 0) === minScore;
          })
          .map((p) => p.userId);
}
