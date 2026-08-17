import type { AIDifficulty, AIPersonality } from '../ai/types.js';

/**
 * Client -> server event payloads for the room engine. Identity is carried
 * once by `identify` and then tracked server-side per-socket — these
 * payloads deliberately do NOT repeat a session token on every call.
 */

export interface RoomCreateRequest {
  gameKey: string;
  isPrivate: boolean;
  /** Selects a player-count/team variant for games with more than one mode (e.g. 4 Card's 2-player / 4-player-individual / 4-player-team). Ignored by games without modes. */
  mode?: string;
}

export interface RoomJoinRequest {
  code: string;
}

export interface RoomReadyRequest {
  code: string;
  isReady: boolean;
}

export interface RoomStartRequest {
  code: string;
}

export interface RoomLeaveRequest {
  code: string;
}

/** Requests a rematch on a `finished`, rematch-capable room — same seats, no re-creating the room. Other players respond via `RoomRematchRespondRequest`. */
export interface RoomRematchRequest {
  code: string;
}

export interface RoomRematchRespondRequest {
  code: string;
  accept: boolean;
}

export interface RoomKickRequest {
  code: string;
  targetUserId: string;
}

export interface RoomFillAiRequest {
  code: string;
  difficulty: AIDifficulty;
  personality: AIPersonality;
}

export interface GameJoinRequest {
  gameSessionId: string;
}

export interface GameMoveRequest {
  gameSessionId: string;
  moveType: string;
  /** Which card this move acts on, for games where a move targets a specific card (e.g. Four Card's capture/discard). */
  cardId?: string;
  /** Game-specific extra data — e.g. Four Card's capture target (see `CaptureMovePayload`). */
  payload?: Record<string, unknown>;
}
