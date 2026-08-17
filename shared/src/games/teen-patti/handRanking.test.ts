import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from '../../card-engine/types.js';
import { compareHands, evaluateHand } from './handRanking.js';

function card(rank: Rank, suit: Suit): Card {
  return { cardId: `${suit}-${rank}`, rank, suit, deckId: 'test', faceUp: true, owner: null, position: 'hand' };
}

function beats(winner: Card[], loser: Card[]) {
  const w = evaluateHand(winner);
  const l = evaluateHand(loser);
  expect(compareHands(w, l)).toBe(1);
  expect(compareHands(l, w)).toBe(-1);
}

describe('evaluateHand categories', () => {
  it('assigns the expected category to one example of each hand type', () => {
    expect(evaluateHand([card('A', 'hearts'), card('A', 'clubs'), card('A', 'spades')]).category).toBe(6); // trail
    expect(evaluateHand([card('A', 'hearts'), card('2', 'hearts'), card('3', 'hearts')]).category).toBe(5); // pure sequence
    expect(evaluateHand([card('4', 'hearts'), card('5', 'clubs'), card('6', 'spades')]).category).toBe(4); // sequence
    expect(evaluateHand([card('K', 'hearts'), card('9', 'hearts'), card('2', 'hearts')]).category).toBe(3); // color
    expect(evaluateHand([card('9', 'hearts'), card('9', 'clubs'), card('4', 'spades')]).category).toBe(2); // pair
    expect(evaluateHand([card('K', 'hearts'), card('9', 'clubs'), card('2', 'spades')]).category).toBe(1); // high card
  });
});

describe('evaluateHand category ordering', () => {
  it('trail beats pure sequence beats sequence beats color beats pair beats high card', () => {
    const trail = [card('2', 'hearts'), card('2', 'clubs'), card('2', 'spades')];
    const pureSeq = [card('K', 'hearts'), card('Q', 'hearts'), card('J', 'hearts')];
    const seq = [card('K', 'hearts'), card('Q', 'clubs'), card('J', 'spades')];
    const color = [card('K', 'hearts'), card('9', 'hearts'), card('2', 'hearts')];
    const pair = [card('9', 'hearts'), card('9', 'clubs'), card('K', 'spades')];
    const high = [card('K', 'hearts'), card('9', 'clubs'), card('2', 'spades')];

    beats(trail, pureSeq);
    beats(pureSeq, seq);
    beats(seq, color);
    beats(color, pair);
    beats(pair, high);
  });
});

describe('trail tie-breaks', () => {
  it('ranks higher trails above lower ones', () => {
    beats(
      [card('A', 'hearts'), card('A', 'clubs'), card('A', 'spades')],
      [card('K', 'hearts'), card('K', 'clubs'), card('K', 'spades')],
    );
    beats(
      [card('3', 'hearts'), card('3', 'clubs'), card('3', 'spades')],
      [card('2', 'hearts'), card('2', 'clubs'), card('2', 'spades')],
    );
  });
});

describe('sequence ordering (applies to both pure sequence and sequence)', () => {
  it('A-2-3 is the highest run, above Q-K-A', () => {
    beats(
      [card('A', 'hearts'), card('2', 'hearts'), card('3', 'hearts')],
      [card('Q', 'clubs'), card('K', 'clubs'), card('A', 'diamonds')],
    );
  });

  it('Q-K-A beats J-Q-K, which beats lower runs, down to 2-3-4', () => {
    const qka = [card('Q', 'clubs'), card('K', 'clubs'), card('A', 'diamonds')];
    const jqk = [card('J', 'clubs'), card('Q', 'diamonds'), card('K', 'spades')];
    const two34 = [card('2', 'clubs'), card('3', 'diamonds'), card('4', 'spades')];

    beats(qka, jqk);
    beats(jqk, two34);
  });

  it('a pure sequence beats a plain sequence of the same run', () => {
    beats(
      [card('9', 'hearts'), card('10', 'hearts'), card('J', 'hearts')],
      [card('9', 'hearts'), card('10', 'clubs'), card('J', 'spades')],
    );
  });
});

describe('color tie-breaks', () => {
  it('compares by highest card, then next, then next, all same suit', () => {
    beats(
      [card('K', 'hearts'), card('9', 'hearts'), card('2', 'hearts')],
      [card('Q', 'hearts'), card('J', 'hearts'), card('9', 'hearts')],
    );
    beats(
      [card('K', 'hearts'), card('9', 'hearts'), card('4', 'hearts')],
      [card('K', 'hearts'), card('8', 'hearts'), card('7', 'hearts')],
    );
  });
});

describe('pair tie-breaks', () => {
  it('a higher pair beats a lower pair regardless of kicker', () => {
    beats(
      [card('3', 'hearts'), card('3', 'clubs'), card('2', 'spades')],
      [card('2', 'hearts'), card('2', 'clubs'), card('A', 'spades')],
    );
  });
  it('same pair rank is decided by the kicker', () => {
    beats(
      [card('9', 'hearts'), card('9', 'clubs'), card('K', 'spades')],
      [card('9', 'diamonds'), card('9', 'spades'), card('Q', 'clubs')],
    );
  });
});

describe('high card tie-breaks', () => {
  it('compares highest, then next, then next', () => {
    beats(
      [card('A', 'hearts'), card('9', 'clubs'), card('2', 'spades')],
      [card('K', 'hearts'), card('Q', 'clubs'), card('8', 'spades')],
    );
    beats(
      [card('K', 'hearts'), card('9', 'clubs'), card('4', 'spades')],
      [card('K', 'diamonds'), card('8', 'clubs'), card('7', 'spades')],
    );
  });
});

describe('exact ties', () => {
  it('identical rank sets (different suits, no flush) compare equal', () => {
    const a = evaluateHand([card('K', 'hearts'), card('9', 'clubs'), card('4', 'spades')]);
    const b = evaluateHand([card('K', 'clubs'), card('9', 'spades'), card('4', 'hearts')]);
    expect(compareHands(a, b)).toBe(0);
  });
});
