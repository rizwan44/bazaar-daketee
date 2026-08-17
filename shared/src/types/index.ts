/**
 * Cross-cutting DTOs shared between client and server over REST/WebSocket.
 * Kept intentionally small in Phase 1 — grows as auth/rooms/matches ship.
 */
import type { AIDifficulty, AIPersonality } from '../ai/types.js';

export interface PublicUser {
  id: string;
  username: string;
  avatarUrl: string | null;
  level: number;
}

export type RoomStatus = 'waiting' | 'in_progress' | 'finished';

export interface RoomSummary {
  id: string;
  code: string;
  gameKey: string;
  hostUserId: string;
  isPrivate: boolean;
  maxPlayers: number;
  status: RoomStatus;
}

export type GameSessionStatus = 'active' | 'completed' | 'abandoned';

export interface GameSessionSummary {
  id: string;
  gameKey: string;
  roomId: string | null;
  status: GameSessionStatus;
  startedAt: string;
  endedAt: string | null;
}

// --- Room engine wire DTOs (Phase 2) ---

export interface RoomPlayerView {
  userId: string;
  username: string;
  seatIndex: number;
  isHost: boolean;
  isReady: boolean;
  /** False while the player's socket is in the reconnect grace window. Always true for AI seats. */
  isConnected: boolean;
  isAI: boolean;
  aiDifficulty?: AIDifficulty;
  aiPersonality?: AIPersonality;
}

/** One completed game's result, kept in-room across rematches — never overwritten, see `RoomStatePayload.gameHistory`. */
export interface GameHistoryEntry {
  gameSessionId: string;
  endedAt: string;
  /** Keyed however that game's adapter keys it (per-userId for most games, per-collectorId for 4 Card). */
  scores: Record<string, number>;
  winnerIds: string[];
}

export interface RoomStatePayload {
  id: string;
  code: string;
  gameKey: string;
  hostUserId: string;
  isPrivate: boolean;
  minPlayers: number;
  maxPlayers: number;
  status: RoomStatus;
  players: RoomPlayerView[];
  /** Set once a player requests a rematch on a `finished` room, cleared once the next game starts (or the request lapses). */
  rematchRequestedBy?: string;
  /** Past completed games in this room, oldest first — never overwritten by a rematch. */
  gameHistory: GameHistoryEntry[];
}

export interface RoomStartedPayload {
  gameSessionId: string;
  roomCode: string;
}

export interface RoomClosedPayload {
  code: string;
  reason: 'empty' | 'host_left' | 'kicked';
}

export interface IdentifyPayload {
  guestId: string;
  username: string;
  /** Present when reclaiming a prior identity after a page reload/reconnect. */
  sessionToken?: string;
}

export interface IdentifyResult {
  userId: string;
  username: string;
  sessionToken: string;
}

export interface RoomErrorPayload {
  code: string;
  message: string;
}
