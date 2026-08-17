import { describe, expect, it } from 'vitest';
import type { Card, FourCardState } from '@card-games/shared';
import { fourCardAdapter } from './fourCardAdapter.js';
import type { LiveGamePlayer } from '../types.js';

function card(rank: Card['rank'], suit: Card['suit']): Card {
  return { cardId: `${suit}-${rank}`, rank, suit, deckId: 'test', faceUp: true, owner: null, position: 'hand' };
}

function livePlayer(userId: string, overrides: Partial<LiveGamePlayer> = {}): LiveGamePlayer {
  return {
    userId,
    username: userId,
    seatIndex: 0,
    isAI: false,
    socketId: `sock-${userId}`,
    isConnected: true,
    ...overrides,
  };
}

function teamState(): FourCardState {
  return {
    mode: 'four-team',
    deckId: 'test',
    rngSeed: 1,
    drawPile: [],
    tableCards: [],
    turnOrder: ['A', 'B', 'C', 'D'],
    currentTurnIndex: 0,
    shufflerUserId: 'A',
    turnPhase: 'awaiting-action',
    phase: 'playing',
    winnerIds: [],
    players: [
      { userId: 'A', hand: [card('K', 'hearts')], collectorId: 'team-1' },
      { userId: 'B', hand: [card('Q', 'hearts')], collectorId: 'team-2' },
      { userId: 'C', hand: [card('J', 'hearts')], collectorId: 'team-1' },
      { userId: 'D', hand: [card('10', 'hearts')], collectorId: 'team-2' },
    ],
    collectors: [
      { collectorId: 'team-1', capturedStack: [card('5', 'clubs')], finalizedCards: [], lockedGroups: [] },
      { collectorId: 'team-2', capturedStack: [], finalizedCards: [], lockedGroups: [] },
    ],
  };
}

describe('fourCardAdapter.buildView — team mode hand privacy (Test Case #5)', () => {
  it("never includes a teammate's hand, only their handCount — same as any opponent", () => {
    const state = teamState();
    const players = new Map([
      ['A', livePlayer('A', { seatIndex: 0 })],
      ['B', livePlayer('B', { seatIndex: 1 })],
      ['C', livePlayer('C', { seatIndex: 2 })],
      ['D', livePlayer('D', { seatIndex: 3 })],
    ]);
    const ctx = { gameSessionId: 'session-1', players, turnExpiresAtMs: null };

    const viewForA = fourCardAdapter.buildView(state, 'A', ctx) as {
      yourHand: Card[];
      teammate: { userId: string; handCount: number } | null;
      opponents: { userId: string; handCount: number }[];
    };

    expect(viewForA.yourHand).toEqual([card('K', 'hearts')]);
    expect(viewForA.teammate?.userId).toBe('C');
    expect(viewForA.teammate?.handCount).toBe(1);
    expect('hand' in (viewForA.teammate as object)).toBe(false); // never serialized, not even redacted-to-empty

    // Opponents (B and D, the other team) are hand-hidden too, exactly like before.
    expect(viewForA.opponents.map((o) => o.userId).sort()).toEqual(['B', 'D']);
    expect(viewForA.opponents.every((o) => !('hand' in (o as object)))).toBe(true);
  });

  it('shares the SAME collector (team stack) for both teammates, opponents get the other team\'s', () => {
    const state = teamState();
    const players = new Map([
      ['A', livePlayer('A', { seatIndex: 0 })],
      ['B', livePlayer('B', { seatIndex: 1 })],
      ['C', livePlayer('C', { seatIndex: 2 })],
      ['D', livePlayer('D', { seatIndex: 3 })],
    ]);
    const ctx = { gameSessionId: 'session-1', players, turnExpiresAtMs: null };

    const viewForA = fourCardAdapter.buildView(state, 'A', ctx) as { yourCollectorId: string };
    const viewForC = fourCardAdapter.buildView(state, 'C', ctx) as { yourCollectorId: string };
    expect(viewForA.yourCollectorId).toBe('team-1');
    expect(viewForC.yourCollectorId).toBe('team-1'); // A and C share the same collector
  });

  it('never sends a valid-moves hint list (Test Case #7)', () => {
    const state = teamState();
    const players = new Map([['A', livePlayer('A')], ['B', livePlayer('B')], ['C', livePlayer('C')], ['D', livePlayer('D')]]);
    const ctx = { gameSessionId: 'session-1', players, turnExpiresAtMs: null };

    const view = fourCardAdapter.buildView(state, 'A', ctx) as Record<string, unknown>;
    expect('yourValidMoves' in view).toBe(false);
  });
});
