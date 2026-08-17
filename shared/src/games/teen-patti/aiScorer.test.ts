import { describe, expect, it } from 'vitest';
import type { Card } from '../../card-engine/types.js';
import { teenPattiMoveScorer } from './aiScorer.js';
import type { TeenPattiState } from './types.js';

function card(rank: Card['rank'], suit: Card['suit']): Card {
  return { cardId: `${suit}-${rank}`, rank, suit, deckId: 'test', faceUp: true, owner: null, position: 'hand' };
}

function stateWithHand(hand: Card[]): TeenPattiState {
  return {
    deckId: 'test',
    rngSeed: 1,
    pot: 100,
    currentStake: 10,
    bootAmount: 10,
    turnOrder: ['p1', 'p2'],
    currentTurnIndex: 0,
    phase: 'betting',
    winnerId: null,
    revealedHands: null,
    players: [
      { userId: 'p1', hand, status: 'active', isSeen: true, totalBet: 10, remainingCoins: 990 },
      { userId: 'p2', hand: [], status: 'active', isSeen: false, totalBet: 10, remainingCoins: 990 },
    ],
  };
}

const strongHand = [card('A', 'hearts'), card('A', 'clubs'), card('A', 'spades')]; // trail
const weakHand = [card('K', 'hearts'), card('9', 'clubs'), card('2', 'spades')]; // high card

describe('teenPattiMoveScorer', () => {
  it('scores raise/chaal/show higher for a strong hand than a weak one', () => {
    const strong = stateWithHand(strongHand);
    const weak = stateWithHand(weakHand);

    for (const type of ['raise', 'chaal', 'show'] as const) {
      const strongScore = teenPattiMoveScorer(strong, 'p1', { type });
      const weakScore = teenPattiMoveScorer(weak, 'p1', { type });
      expect(strongScore).toBeGreaterThan(weakScore);
    }
  });

  it('scores fold higher for a weak hand than a strong one', () => {
    const strong = stateWithHand(strongHand);
    const weak = stateWithHand(weakHand);

    expect(teenPattiMoveScorer(weak, 'p1', { type: 'fold' })).toBeGreaterThan(
      teenPattiMoveScorer(strong, 'p1', { type: 'fold' }),
    );
  });

  it('with a strong hand, raise outscores fold; with a weak hand, fold outscores raise', () => {
    const strong = stateWithHand(strongHand);
    const weak = stateWithHand(weakHand);

    expect(teenPattiMoveScorer(strong, 'p1', { type: 'raise' })).toBeGreaterThan(
      teenPattiMoveScorer(strong, 'p1', { type: 'fold' }),
    );
    expect(teenPattiMoveScorer(weak, 'p1', { type: 'fold' })).toBeGreaterThan(
      teenPattiMoveScorer(weak, 'p1', { type: 'raise' }),
    );
  });
});
