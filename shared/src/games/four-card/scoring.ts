import type { Card, Rank } from '../../card-engine/types.js';

/** A=20, 10/J/Q/K=10, 2-9=5 — sums to exactly 400 across a full 52-card deck. */
export function cardValue(rank: Rank): number {
  if (rank === 'A') return 20;
  if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return 5;
}

export function handValue(cards: readonly Card[]): number {
  return cards.reduce((sum, card) => sum + cardValue(card.rank), 0);
}
