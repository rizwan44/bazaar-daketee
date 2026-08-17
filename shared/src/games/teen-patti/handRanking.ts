import type { Card, Rank } from '../../card-engine/types.js';

const RANK_VALUE: Record<Rank, number> = {
  A: 14,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
};

/** Trail(6) > Pure Sequence(5) > Sequence(4) > Color(3) > Pair(2) > High Card(1). */
export type HandCategory = 1 | 2 | 3 | 4 | 5 | 6;

export interface HandRank {
  category: HandCategory;
  /** Descending-priority comparable values; compared lexicographically within the same category. */
  tiebreak: number[];
}

/**
 * Detects whether three cards form a valid consecutive run and, if so, its
 * rank among all 12 possible runs. A-2-3 is the highest run (common Indian
 * Teen Patti convention), then Q-K-A down to 2-3-4 lowest.
 */
function detectRun(cards: Card[]): { isRun: boolean; runIndex: number } {
  const values = cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => a - b);
  const [v0, v1, v2] = values;

  if (v0 === 2 && v1 === 3 && v2 === 14) {
    return { isRun: true, runIndex: 11 }; // A-2-3, highest
  }
  if (v1 === v0 + 1 && v2 === v1 + 1) {
    return { isRun: true, runIndex: v0 - 2 }; // 2-3-4 -> 0 ... Q-K-A -> 10
  }
  return { isRun: false, runIndex: -1 };
}

export function evaluateHand(cards: Card[]): HandRank {
  if (cards.length !== 3) {
    throw new Error('evaluateHand requires exactly 3 cards');
  }

  const values = cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const isFlush = cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;

  const rankCounts = new Map<Rank, number>();
  for (const card of cards) {
    rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
  }

  if (rankCounts.size === 1) {
    return { category: 6, tiebreak: [RANK_VALUE[cards[0].rank]] };
  }

  const { isRun, runIndex } = detectRun(cards);
  if (isRun && isFlush) {
    return { category: 5, tiebreak: [runIndex] };
  }
  if (isRun) {
    return { category: 4, tiebreak: [runIndex] };
  }
  if (isFlush) {
    return { category: 3, tiebreak: values };
  }

  if (rankCounts.size === 2) {
    let pairValue = -1;
    let kickerValue = -1;
    for (const [rank, count] of rankCounts) {
      if (count === 2) pairValue = RANK_VALUE[rank];
      else kickerValue = RANK_VALUE[rank];
    }
    return { category: 2, tiebreak: [pairValue, kickerValue] };
  }

  return { category: 1, tiebreak: values };
}

/** Returns 1 if `a` beats `b`, -1 if `b` beats `a`, 0 if they tie exactly. */
export function compareHands(a: HandRank, b: HandRank): -1 | 0 | 1 {
  if (a.category !== b.category) {
    return a.category > b.category ? 1 : -1;
  }
  const length = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < length; i++) {
    const av = a.tiebreak[i] ?? 0;
    const bv = b.tiebreak[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}
