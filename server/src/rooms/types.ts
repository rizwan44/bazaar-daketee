import type { AIDifficulty, AIPersonality, GameHistoryEntry, RoomStatus } from '@card-games/shared';

export interface LiveRoomPlayer {
  userId: string;
  username: string;
  seatIndex: number;
  isReady: boolean;
  isConnected: boolean;
  socketId: string | null;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  isAI: boolean;
  aiDifficulty?: AIDifficulty;
  aiPersonality?: AIPersonality;
}

export interface LiveRoom {
  id: string;
  code: string;
  gameKey: string;
  gameDbId: string;
  hostUserId: string;
  isPrivate: boolean;
  minPlayers: number;
  maxPlayers: number;
  status: RoomStatus;
  players: Map<string, LiveRoomPlayer>;
  /** Selected mode key for games with modes (e.g. 4 Card) — see `GameCatalogEntry.modes`. Undefined for games without any. */
  mode?: string;
  /** Loser(s) of the most recently finished game in this room — consulted to pick the next game's shuffler (see `RoomManager.startGame`). Undefined until a rematch-capable game has actually finished once. */
  lastGameLoserUserIds?: string[];
  /** Who asked for a rematch on a `finished` room — see `requestRematch`/`respondToRematch`. */
  rematchRequestedBy?: string;
  /** Past completed games in this room, oldest first — never overwritten. */
  gameHistory: GameHistoryEntry[];
}

/**
 * The narrow slice of Prisma that RoomManager needs, injected so tests can
 * supply an in-memory fake instead of requiring a live MySQL connection —
 * the same rationale as DeckEngine's injected RNG, just for a different
 * external dependency.
 */
export interface RoomPersistence {
  getGameDbId(gameKey: string): Promise<string | null>;
  createRoom(input: {
    code: string;
    gameDbId: string;
    hostUserId: string;
    isPrivate: boolean;
    maxPlayers: number;
  }): Promise<{ id: string }>;
  addPlayer(input: { roomId: string; userId: string; seatIndex: number }): Promise<void>;
  removePlayer(input: { roomId: string; userId: string }): Promise<void>;
  setPlayerReady(input: { roomId: string; userId: string; isReady: boolean }): Promise<void>;
  setRoomStatus(input: { roomId: string; status: RoomStatus }): Promise<void>;
  setRoomHost(input: { roomId: string; hostUserId: string }): Promise<void>;
  createGameSession(input: {
    roomId: string;
    gameDbId: string;
    rngSeed: string;
  }): Promise<{ id: string }>;
  addGamePlayers(input: {
    gameSessionId: string;
    players: {
      userId: string;
      seatIndex: number;
      isAI: boolean;
      aiDifficulty?: AIDifficulty;
      aiPersonality?: AIPersonality;
    }[];
  }): Promise<void>;
  /** Creates a fresh synthetic guest User backing one AI seat — never reused across seats/games (see impl). */
  ensureAIUser(difficulty: AIDifficulty, personality: AIPersonality): Promise<{ userId: string; username: string }>;
}

/**
 * Handed to the (optional) `onGameStarted` hook so a game-session runner can
 * initialize a `GameEngine` without RoomManager needing to know that layer
 * exists — same decoupling as the `broadcast` callback.
 */
/**
 * `RoomManager` awaits this before telling clients the game has started, so
 * by the time a client emits `game:join` the session is guaranteed to
 * already exist — otherwise there's a window where `ROOM_STARTED` has been
 * broadcast but the game-session runner hasn't finished setting up yet.
 */
export interface GameStartedInfo {
  gameSessionId: string;
  gameKey: string;
  roomCode: string;
  rngSeed: number;
  /** Selected mode for games with modes (e.g. 4 Card) — undefined for games without any. */
  mode?: string;
  /** Who shuffled this game and is therefore exempt from the first turn — undefined for games without a shuffler concept. */
  shufflerUserId?: string;
  players: {
    userId: string;
    username: string;
    seatIndex: number;
    isAI: boolean;
    aiDifficulty?: AIDifficulty;
    aiPersonality?: AIPersonality;
  }[];
}
