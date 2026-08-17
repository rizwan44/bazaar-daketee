import type { Card } from '../../card-engine/types.js';

export type FourCardMoveType = 'draw' | 'capture' | 'discard';

export type FourCardGameMode = 'two-player' | 'four-individual' | 'four-team';

export type CaptureTargetType = 'table' | 'stack' | 'own-stack';

export interface CaptureMovePayload {
  targetType: CaptureTargetType;
  /** Uniquely identifies the card dropped on — the server resolves which stack/collector owns it. */
  targetCardId: string;
  // Index signature so this is structurally assignable to GameMove['payload'] (Record<string, unknown>).
  [key: string]: unknown;
}

export interface FourCardPlayerState {
  userId: string;
  /** 4 normally; 5 mid-turn after drawing, while capture/discard is being decided. */
  hand: Card[];
  /** Which collector this player's captures land in — own userId in 2P/4P-individual, a shared teamId in 4P-team. */
  collectorId: string;
}

/**
 * Whoever captures cards, they land here — one per player in individual
 * modes, one per TEAM in team mode (see FourCardPlayerState.collectorId).
 * Group-capture and lock detection both operate on this, never directly on
 * a player, so the same logic covers all 3 modes uniformly.
 */
export interface FourCardCollectorState {
  collectorId: string;
  /** Active stack — its top (contiguous same-rank run) is what an opponent collector can group-capture. Grows by (group size + 1) per capture: the whole matching run, then the capturing hand card on top. */
  capturedStack: Card[];
  /** Cards swept into permanence when a lock formed above them in this same stack — never the locked 4 themselves. */
  finalizedCards: Card[];
  /** Completed 4-of-a-kind groups, each exactly 4 cards, kept separately for the LOCKED badge. */
  lockedGroups: Card[][];
}

export type FourCardTurnPhase = 'awaiting-draw' | 'awaiting-action';
export type FourCardPhase = 'playing' | 'complete';

export interface FourCardState {
  mode: FourCardGameMode;
  deckId: string;
  rngSeed: number;
  /** Hidden from clients — only its length is ever sent over the wire. */
  drawPile: Card[];
  tableCards: Card[];
  players: FourCardPlayerState[];
  collectors: FourCardCollectorState[];
  turnOrder: string[];
  currentTurnIndex: number;
  /** Whoever shuffled this game — never takes the first turn (currentTurnIndex starts on the next seat). */
  shufflerUserId: string;
  /** 'awaiting-action' = the current player has 5 cards and must capture (if legal) or discard. */
  turnPhase: FourCardTurnPhase;
  phase: FourCardPhase;
  /** Winning userId(s) — a whole team's member userIds in team mode. Empty array on a tie — never forced to pick one. */
  winnerIds: string[];
}

// --- Wire DTOs: per-player view sent over the socket ---
// Unlike Teen Patti's hands, every card in a captured stack is already
// face-up public information by the time it's captured (it came from the
// table or from an opponent's already-face-up stack) — so a collector's
// FULL stack is always safe to send. Only hand contents stay private —
// including a TEAMMATE's hand, which this player never receives either.
// No hint data of any kind is ever included (see FourCardEngine's own doc
// comment on why `yourValidMoves` was deliberately removed from this view).

export interface FourCardCollectorView {
  collectorId: string;
  capturedStack: Card[];
  finalizedCards: Card[];
  lockedGroups: Card[][];
}

export interface FourCardOpponentView {
  userId: string;
  username: string;
  isAI: boolean;
  isConnected: boolean;
  /** Card-back count only — hand contents are hidden for every OTHER seat, teammate included. */
  handCount: number;
  collectorId: string;
}

export interface FourCardTeammateView {
  userId: string;
  username: string;
  isAI: boolean;
  isConnected: boolean;
  /** Card-back count only — see the view's own doc comment: a teammate's hand is hidden too. */
  handCount: number;
}

export interface FourCardPlayerView {
  gameSessionId: string;
  mode: FourCardGameMode;
  tableCards: Card[];
  /** Hidden pile — only its length is ever sent over the wire. */
  drawPileCount: number;
  yourUserId: string;
  yourHand: Card[];
  yourCollectorId: string;
  /** Every collector in the game (own + opponents'), keyed by collectorId — always fully visible, captures are public. */
  collectors: FourCardCollectorView[];
  currentTurnUserId: string | null;
  turnPhase: FourCardTurnPhase;
  shufflerUserId: string;
  /** Present only in 'two-player' and 'four-individual' modes. */
  opponents: FourCardOpponentView[];
  /** Present only in 'four-team' mode. */
  teammate: FourCardTeammateView | null;
  phase: FourCardPhase;
  /** Empty array on a tie — never forced to pick one. */
  winnerIds: string[];
}

export interface FourCardEndedPayload {
  gameSessionId: string;
  mode: FourCardGameMode;
  winnerIds: string[];
  /** Keyed by collectorId, not userId — sums to 400 across all collectors. */
  scores: Record<string, number>;
}
