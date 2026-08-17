import { describe, expect, it } from 'vitest';
import type { Card } from '../../card-engine/types.js';
import type { GamePlayerRef } from '../GameEngine.js';
import { fourCardEngine } from './FourCardEngine.js';
import type { CaptureMovePayload, FourCardState } from './types.js';

function card(rank: Card['rank'], suit: Card['suit']): Card {
  return { cardId: `${suit}-${rank}`, rank, suit, deckId: 'test', faceUp: true, owner: null, position: 'hand' };
}

function players(...ids: string[]): GamePlayerRef[] {
  return ids.map((playerId) => ({ playerId, isAI: false }));
}

function collectorFor(state: FourCardState, userId: string) {
  const player = state.players.find((p) => p.userId === userId)!;
  return state.collectors.find((c) => c.collectorId === player.collectorId)!;
}

function capture(cardId: string, targetType: 'table' | 'stack', targetCardId: string) {
  const payload: CaptureMovePayload = { targetType, targetCardId };
  return { type: 'capture', cardId, payload };
}

/**
 * Direct replay of the original acceptance scenario from the first 4 Card
 * spec, kept as a regression test through the group-capture rewrite. Every
 * card is a real, distinct card (no rank+suit reused) so a real 52-card
 * deck could have produced this exact sequence. A's whole turn only ever
 * captures from the TABLE (never from B's stack), so it is completely
 * unaffected by the group-capture rule change and reproduces the original
 * worked example exactly. B's turn is where group-capture actually changes
 * behavior: A's stack ends with TWO consecutive Ks on top (from A's own
 * last capture), so B's single K now captures BOTH of them in one move —
 * this replaces the old single-card assertion with the new group-capture
 * one (dedicated, simpler group-capture/lock scenarios live in
 * FourCardEngine.test.ts; this test stops once that's demonstrated rather
 * than chasing the now-more-complex full game to its end).
 */
describe('§43-style acceptance scenario (group-capture rewrite)', () => {
  it('reproduces the original worked example, then captures A\'s exposed K-K group as ONE move (not one card)', () => {
    let state = fourCardEngine.initializeGame(players('A', 'B'), 1) as FourCardState;

    state.players[0].hand = [card('10', 'clubs'), card('2', 'diamonds'), card('4', 'hearts'), card('5', 'spades')];
    state.players[1].hand = [card('10', 'diamonds'), card('8', 'clubs'), card('J', 'spades'), card('K', 'diamonds')];
    state.tableCards = [card('K', 'spades'), card('10', 'hearts'), card('4', 'clubs'), card('Q', 'hearts')];
    state.drawPile = [
      card('K', 'hearts'),
      card('3', 'spades'),
      card('6', 'diamonds'),
      card('9', 'clubs'),
      card('10', 'spades'),
      card('K', 'clubs'),
    ];
    state.turnPhase = 'awaiting-draw';
    state.currentTurnIndex = 0;

    // --- A draws K, now has 5 cards ---
    state = fourCardEngine.applyMove(state, 'A', { type: 'draw' });
    expect(state.players[0].hand.map((c) => c.cardId).sort()).toEqual(
      ['clubs-10', 'diamonds-2', 'hearts-4', 'hearts-K', 'spades-5'].sort(),
    );

    // --- A captures 4 (hand) -> 4 (table), then must draw again ---
    expect(fourCardEngine.getValidMoves(state, 'A')).toContainEqual(capture('hearts-4', 'table', 'clubs-4'));
    state = fourCardEngine.applyMove(state, 'A', capture('hearts-4', 'table', 'clubs-4'));
    expect(collectorFor(state, 'A').capturedStack.map((c) => c.cardId)).toEqual(['clubs-4', 'hearts-4']);
    expect(state.turnPhase).toBe('awaiting-draw');
    state = fourCardEngine.applyMove(state, 'A', { type: 'draw' }); // draws the "3" filler

    // --- A captures 10 (hand) -> 10 (table), then must draw again ---
    expect(fourCardEngine.getValidMoves(state, 'A')).toContainEqual(capture('clubs-10', 'table', 'hearts-10'));
    state = fourCardEngine.applyMove(state, 'A', capture('clubs-10', 'table', 'hearts-10'));
    expect(collectorFor(state, 'A').capturedStack.map((c) => c.cardId)).toEqual([
      'clubs-4',
      'hearts-4',
      'hearts-10',
      'clubs-10',
    ]);
    state = fourCardEngine.applyMove(state, 'A', { type: 'draw' }); // draws the "6" filler

    // --- A captures K (hand, drawn earlier) -> K (table), then must draw again ---
    expect(fourCardEngine.getValidMoves(state, 'A')).toContainEqual(capture('hearts-K', 'table', 'spades-K'));
    state = fourCardEngine.applyMove(state, 'A', capture('hearts-K', 'table', 'spades-K'));
    expect(collectorFor(state, 'A').capturedStack.map((c) => c.cardId)).toEqual([
      'clubs-4',
      'hearts-4',
      'hearts-10',
      'clubs-10',
      'spades-K',
      'hearts-K',
    ]);
    expect(collectorFor(state, 'A').lockedGroups).toHaveLength(0); // three different ranks captured — no lock yet
    state = fourCardEngine.applyMove(state, 'A', { type: 'draw' }); // draws "9" — no match for it

    // --- No valid match remains; A must discard, and chooses the freshly-drawn 9 ---
    expect(state.tableCards.map((c) => c.cardId)).toEqual(['hearts-Q']); // only Q left on the table
    const movesAfterFinalDraw = fourCardEngine.getValidMoves(state, 'A');
    expect(movesAfterFinalDraw.every((m) => m.type === 'discard')).toBe(true);
    state = fourCardEngine.applyMove(state, 'A', { type: 'discard', cardId: 'clubs-9' });
    expect(state.players[0].hand).toHaveLength(4);
    expect(state.tableCards.map((c) => c.cardId).sort()).toEqual(['clubs-9', 'hearts-Q']);
    expect(state.currentTurnIndex).toBe(1); // B's turn now

    // --- B draws a 10 ---
    state = fourCardEngine.applyMove(state, 'B', { type: 'draw' });
    expect(state.players[1].hand.map((c) => c.cardId).sort()).toEqual(
      ['clubs-8', 'diamonds-10', 'diamonds-K', 'spades-10', 'spades-J'].sort(),
    );

    // --- A's exposed stack top is a TWO-card K group (spades-K then hearts-K, A's last two captures) ---
    expect(state.tableCards.some((c) => c.rank === '10')).toBe(false);
    const aStackBeforeCapture = collectorFor(state, 'A').capturedStack;
    expect(aStackBeforeCapture.slice(-2).map((c) => c.cardId)).toEqual(['spades-K', 'hearts-K']);

    // --- B's only legal CAPTURE is diamonds-K (matching is optional, so discards
    //     of B's other 4 hand cards are legal moves too, just not chosen here).
    //     Group-capture means BOTH exposed Ks transfer, not just the top one. ---
    const bMoves = fourCardEngine.getValidMoves(state, 'B');
    expect(bMoves).toContainEqual(capture('diamonds-K', 'stack', 'hearts-K'));
    expect(bMoves.filter((m) => m.type === 'capture')).toHaveLength(1); // the only capture, though not the only legal move
    state = fourCardEngine.applyMove(state, 'B', capture('diamonds-K', 'stack', 'hearts-K'));

    expect(collectorFor(state, 'B').capturedStack.map((c) => c.cardId).sort()).toEqual(
      ['spades-K', 'hearts-K', 'diamonds-K'].sort(),
    );
    // Both Ks left A's stack in one move — only the untouched 4s/10s remain.
    expect(collectorFor(state, 'A').capturedStack.map((c) => c.cardId)).toEqual([
      'clubs-4',
      'hearts-4',
      'hearts-10',
      'clubs-10',
    ]);
  });
});
