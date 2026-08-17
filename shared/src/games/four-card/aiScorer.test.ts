import { describe, expect, it } from 'vitest';
import type { Card } from '../../card-engine/types.js';
import { fourCardMoveScorer } from './aiScorer.js';
import type { CaptureMovePayload, FourCardState } from './types.js';

function card(rank: Card['rank'], suit: Card['suit']): Card {
  return { cardId: `${suit}-${rank}`, rank, suit, deckId: 'test', faceUp: true, owner: null, position: 'hand' };
}

function capture(cardId: string, targetType: 'table' | 'stack', targetCardId: string) {
  const payload: CaptureMovePayload = { targetType, targetCardId };
  return { type: 'capture', cardId, payload };
}

function baseState(overrides: {
  handA?: Card[];
  stackA?: Card[];
  stackB?: Card[];
  tableCards?: Card[];
}): FourCardState {
  return {
    mode: 'two-player',
    deckId: 'test',
    rngSeed: 1,
    drawPile: [],
    tableCards: overrides.tableCards ?? [],
    turnOrder: ['A', 'B'],
    currentTurnIndex: 0,
    shufflerUserId: 'A',
    turnPhase: 'awaiting-action',
    phase: 'playing',
    winnerIds: [],
    players: [
      { userId: 'A', hand: overrides.handA ?? [], collectorId: 'A' },
      { userId: 'B', hand: [], collectorId: 'B' },
    ],
    collectors: [
      { collectorId: 'A', capturedStack: overrides.stackA ?? [], finalizedCards: [], lockedGroups: [] },
      { collectorId: 'B', capturedStack: overrides.stackB ?? [], finalizedCards: [], lockedGroups: [] },
    ],
  };
}

describe('fourCardMoveScorer', () => {
  it('scores any legal capture higher than a discard', () => {
    const state = baseState({
      handA: [card('4', 'hearts'), card('9', 'clubs')],
      tableCards: [card('4', 'spades')],
    });

    const captureScore = fourCardMoveScorer(state, 'A', capture('hearts-4', 'table', 'spades-4'));
    const discardScore = fourCardMoveScorer(state, 'A', { type: 'discard', cardId: 'clubs-9' });
    expect(captureScore).toBeGreaterThan(discardScore);
  });

  it('prefers capturing the opponent stack over an equivalent table capture', () => {
    const state = baseState({ handA: [card('7', 'hearts')], stackB: [card('7', 'spades')] });

    const tableScore = fourCardMoveScorer(state, 'A', capture('hearts-7', 'table', 'spades-7'));
    const opponentScore = fourCardMoveScorer(state, 'A', capture('hearts-7', 'stack', 'spades-7'));
    expect(opponentScore).toBeGreaterThan(tableScore);
  });

  it('prefers capturing a bigger group over a smaller one', () => {
    const singleState = baseState({ handA: [card('7', 'hearts')], stackB: [card('7', 'spades')] });
    const groupState = baseState({
      handA: [card('7', 'hearts')],
      stackB: [card('K', 'clubs'), card('7', 'spades'), card('7', 'diamonds')],
    });

    const singleScore = fourCardMoveScorer(singleState, 'A', capture('hearts-7', 'stack', 'spades-7'));
    const groupScore = fourCardMoveScorer(groupState, 'A', capture('hearts-7', 'stack', 'diamonds-7'));
    expect(groupScore).toBeGreaterThan(singleScore);
  });

  it('heavily prefers a capture that completes a lock over one that does not', () => {
    const state = baseState({
      handA: [card('K', 'hearts')],
      stackA: [card('K', 'clubs'), card('K', 'diamonds'), card('K', 'spades')], // one more K locks
      tableCards: [card('K', 'diamonds'), card('9', 'clubs')],
    });

    const lockingScore = fourCardMoveScorer(state, 'A', capture('hearts-K', 'table', 'diamonds-K'));
    // A different, non-locking capture for comparison (hypothetical, same player, different rank).
    const otherState = baseState({
      handA: [card('9', 'hearts')],
      tableCards: [card('9', 'clubs')],
    });
    const nonLockingScore = fourCardMoveScorer(otherState, 'A', capture('hearts-9', 'table', 'clubs-9'));

    expect(lockingScore).toBeGreaterThan(nonLockingScore);
  });

  it('prefers discarding the lowest-value hand card', () => {
    const state = baseState({ handA: [card('A', 'hearts'), card('5', 'clubs')], tableCards: [card('Q', 'spades')] });

    const discardAce = fourCardMoveScorer(state, 'A', { type: 'discard', cardId: 'hearts-A' });
    const discardFive = fourCardMoveScorer(state, 'A', { type: 'discard', cardId: 'clubs-5' });
    expect(discardFive).toBeGreaterThan(discardAce);
  });
});
