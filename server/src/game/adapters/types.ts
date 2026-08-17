import type { GameEngine, GamePlayerRef, MoveScorer } from '@card-games/shared';
import type { GameStartedInfo } from '../../rooms/types.js';
import type { GamePersistence, LiveGamePlayer } from '../types.js';

export interface AdapterViewContext {
  gameSessionId: string;
  players: Map<string, LiveGamePlayer>;
  turnExpiresAtMs: number | null;
}

export interface AdapterSettleContext<TState> {
  gameSessionId: string;
  state: TState;
  players: Map<string, LiveGamePlayer>;
  /** Opaque per-adapter data returned from `preparePlayers` (e.g. Teen Patti's starting coin balances). */
  adapterData: unknown;
  persistence: GamePersistence;
}

export interface AdapterSettleResult {
  event: string;
  payload: unknown;
  /** Userid(s) of whoever lost — see `RoomManager.closeRoomAfterGame`'s rematch-shuffler use. Omit (or empty) for games that don't support rematch (Teen Patti). */
  loserUserIds?: string[];
  /** Compact result for the room's in-memory game history (see `RoomStatePayload.gameHistory`). Omit for games that don't keep in-room history. */
  resultSummary?: { scores: Record<string, number>; winnerIds: string[] };
}

/**
 * Per-game plug-in point for `GameSessionManager`. The turn-timer/AI-trigger/
 * disconnect machinery in `GameSessionManager` only calls generic
 * `GameEngine<TState>` methods and is fully shared across every game — this
 * interface captures the handful of things that genuinely differ per game
 * (player setup, wire view shape, and how a finished game gets persisted),
 * so adding a second (or third) game never requires touching the turn loop.
 */
export interface GameAdapter<TState = unknown> {
  gameKey: string;
  engine: GameEngine<TState>;
  /** Undefined = AIController falls back to its neutral scorer. */
  scorer?: MoveScorer<TState>;
  /** How long a human has to act before their first legal move is auto-played. `null` = no turn timer at all for this game — the turn stays open indefinitely (Four Card's explicit "no timer" rule). Always explicit, no implicit fallback. */
  turnTimeoutMs: number | null;
  preparePlayers(
    info: GameStartedInfo,
    persistence: GamePersistence,
  ): Promise<{ playerRefs: GamePlayerRef[]; adapterData?: unknown }>;
  /** Whether a just-applied move type should advance to the next player (call engine.nextTurn) or leave the turn where it is. */
  shouldAdvanceTurn(moveType: string): boolean;
  buildView(state: TState, userId: string, ctx: AdapterViewContext): unknown;
  /** Called once when the game completes. Return null to skip emitting/settling anything. */
  settle(ctx: AdapterSettleContext<TState>): Promise<AdapterSettleResult | null>;
}
