import type { Card } from '../../card-engine/types.js';
import type { GameMove } from '../GameEngine.js';

export type TeenPattiMoveType = 'see' | 'chaal' | 'raise' | 'fold' | 'show';

export type TeenPattiPlayerStatus = 'active' | 'folded';

export interface TeenPattiPlayerState {
  userId: string;
  /** Empty until `dealCards` runs. */
  hand: Card[];
  status: TeenPattiPlayerStatus;
  isSeen: boolean;
  totalBet: number;
  remainingCoins: number;
}

export type TeenPattiPhase = 'betting' | 'complete';

export interface TeenPattiState {
  deckId: string;
  /** Kept on state (not just passed to `initializeGame`) because `dealCards` needs it too. */
  rngSeed: number;
  pot: number;
  currentStake: number;
  bootAmount: number;
  players: TeenPattiPlayerState[];
  /** userIds in seat order; whose turn it is = `turnOrder[currentTurnIndex]`. */
  turnOrder: string[];
  currentTurnIndex: number;
  phase: TeenPattiPhase;
  winnerId: string | null;
  /** Populated once the hand completes — only players who reached showdown/last-standing, folded hands stay hidden. */
  revealedHands: Record<string, Card[]> | null;
}

// --- Wire DTOs: per-player redacted view sent over the socket ---
// (never the raw TeenPattiState — that would leak every player's hand)

export interface TeenPattiOpponentView {
  userId: string;
  username: string;
  seatIndex: number;
  status: TeenPattiPlayerStatus;
  isSeen: boolean;
  isConnected: boolean;
  isAI: boolean;
  /** Card-back count only — never the actual cards, unless revealed at showdown. */
  cardCount: number;
}

export interface TeenPattiPlayerView {
  gameSessionId: string;
  pot: number;
  currentStake: number;
  bootAmount: number;
  phase: TeenPattiPhase;
  yourUserId: string;
  yourSeatIndex: number;
  yourHand: Card[];
  yourIsSeen: boolean;
  yourRemainingCoins: number;
  /** Empty unless it's currently this player's turn. */
  yourValidMoves: GameMove[];
  currentTurnUserId: string | null;
  /** ISO timestamp the client counts down to; null once the hand is complete. */
  turnExpiresAt: string | null;
  opponents: TeenPattiOpponentView[];
  winnerId: string | null;
  revealedHands: Record<string, Card[]> | null;
}

export interface GameEndedPayload {
  gameSessionId: string;
  winnerId: string;
  revealedHands: Record<string, Card[]>;
  potWon: number;
  /** Net coin change per player (positive for the winner, negative for everyone else). */
  coinDeltas: Record<string, number>;
}
