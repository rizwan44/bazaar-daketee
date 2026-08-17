import { describe, expect, it } from 'vitest';
import { buildStandardDeck } from '../../card-engine/Deck.js';
import { cardValue, handValue } from './scoring.js';

describe('cardValue', () => {
  it('scores each tier correctly', () => {
    expect(cardValue('A')).toBe(20);
    for (const rank of ['10', 'J', 'Q', 'K'] as const) {
      expect(cardValue(rank)).toBe(10);
    }
    for (const rank of ['2', '3', '4', '5', '6', '7', '8', '9'] as const) {
      expect(cardValue(rank)).toBe(5);
    }
  });
});

describe('handValue', () => {
  it('sums to exactly 400 across a full 52-card deck', () => {
    const deck = buildStandardDeck('test');
    expect(deck).toHaveLength(52);
    expect(handValue(deck)).toBe(400);
  });

  it('sums an arbitrary hand correctly', () => {
    const deck = buildStandardDeck('test');
    const aces = deck.filter((c) => c.rank === 'A').slice(0, 2); // 2 aces = 40
    const kings = deck.filter((c) => c.rank === 'K').slice(0, 2); // 2 kings = 20
    const fives = deck.filter((c) => c.rank === '5'); // 4 fives = 20
    expect(handValue([...aces, ...kings, ...fives])).toBe(80);
  });
});
