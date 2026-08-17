import type { Card } from '../card-engine/types.js';

export interface GamePlayerRef {
  playerId: string;
  isAI: boolean;
  /** Buy-in chip balance for games with betting (Teen Patti, Poker, ...). Undefined for games without one. */
  startingBalance?: number;
  /** Team assignment for team-based game modes (4 Card's 4-player team mode, ...). Undefined for games/modes without teams. */
  teamId?: string;
  /** Marks whoever shuffled this game — some games (4 Card) exempt this player from the first turn. Undefined for games without a shuffler concept. */
  isShuffler?: boolean;
}

/** A move proposed by a player. Shape of `payload` is game-specific. */
export interface GameMove {
  type: string;
  cardId?: string;
  payload?: Record<string, unknown>;
}

export interface MoveValidationResult {
  valid: boolean;
  reason?: string;
}

export interface GameResult {
  winnerIds: string[];
  scores: Record<string, number>;
}

/**
 * Contract every per-game rule module implements (Teen Patti, Rummy, ...).
 * This is the seam that lets the room engine, AI framework, and
 * move-validation server code stay generic across all 52 games instead of
 * special-casing each one.
 */
export interface GameEngine<TState = unknown> {
  readonly gameKey: string;

  initializeGame(players: GamePlayerRef[], rngSeed: number): TState;
  dealCards(state: TState): TState;
  getValidMoves(state: TState, playerId: string): GameMove[];
  validateMove(state: TState, playerId: string, move: GameMove): MoveValidationResult;
  applyMove(state: TState, playerId: string, move: GameMove): TState;
  nextTurn(state: TState): TState;
  calculateScore(state: TState): Record<string, number>;
  checkWinner(state: TState): GameResult | null;
  finishGame(state: TState): GameResult;
}

/** Convenience type for cards attached to a generic game state shape. */
export interface HandsByPlayer {
  [playerId: string]: Card[];
}
