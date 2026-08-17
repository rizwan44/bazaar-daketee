import { describe, expect, it } from 'vitest';
import type { GamePlayerRef } from '../GameEngine.js';
import { buildFourCardView, type FourCardViewContext, type FourCardViewPlayerInfo } from './buildView.js';
import { fourCardEngine } from './FourCardEngine.js';
import type { FourCardState } from './types.js';

function players(...ids: string[]): GamePlayerRef[] {
  return ids.map((playerId) => ({ playerId, isAI: false }));
}

function playerInfo(username: string): FourCardViewPlayerInfo {
  return { username, isAI: false, isConnected: true };
}

function ctxFor(userIds: string[]): FourCardViewContext {
  const map = new Map<string, FourCardViewPlayerInfo>();
  for (const id of userIds) map.set(id, playerInfo(id));
  return { gameSessionId: 'session-1', players: map };
}

describe('buildFourCardView', () => {
  it('exposes your own hand, but only handCount for opponents (2-player)', () => {
    const state = fourCardEngine.dealCards(fourCardEngine.initializeGame(players('A', 'B'), 1)) as FourCardState;
    const view = buildFourCardView(state, 'A', ctxFor(['A', 'B']));

    expect(view.yourHand).toHaveLength(4);
    expect(view.opponents).toHaveLength(1);
    expect(view.opponents[0]).toMatchObject({ userId: 'B', handCount: 4 });
    expect(view.opponents[0]).not.toHaveProperty('hand');
    expect(view.teammate).toBeNull();
  });

  it('4-player individual: every OTHER player is a full opponent, none of their hands are ever included', () => {
    const state = fourCardEngine.dealCards(
      fourCardEngine.initializeGame(players('A', 'B', 'C', 'D'), 1),
    ) as FourCardState;
    const view = buildFourCardView(state, 'A', ctxFor(['A', 'B', 'C', 'D']));

    expect(view.opponents.map((o) => o.userId).sort()).toEqual(['B', 'C', 'D']);
    for (const o of view.opponents) {
      expect(o.handCount).toBe(4);
      expect(o).not.toHaveProperty('hand');
    }
  });

  it('4-player team: the teammate is reported separately from opponents, hand hidden the same as any opponent', () => {
    const refs: GamePlayerRef[] = [
      { playerId: 'A', isAI: false, teamId: 'team-1' },
      { playerId: 'B', isAI: false, teamId: 'team-2' },
      { playerId: 'C', isAI: false, teamId: 'team-1' },
      { playerId: 'D', isAI: false, teamId: 'team-2' },
    ];
    const state = fourCardEngine.dealCards(fourCardEngine.initializeGame(refs, 1)) as FourCardState;
    const view = buildFourCardView(state, 'A', ctxFor(['A', 'B', 'C', 'D']));

    // A and C share team-1's collector — C is the teammate, not an opponent.
    expect(view.teammate?.userId).toBe('C');
    expect(view.teammate).not.toHaveProperty('hand');
    expect(view.opponents.map((o) => o.userId).sort()).toEqual(['B', 'D']);
  });

  it('every collector is always fully visible, regardless of whose view it is', () => {
    const state = fourCardEngine.dealCards(fourCardEngine.initializeGame(players('A', 'B'), 1)) as FourCardState;
    state.collectors[0].capturedStack = [state.tableCards[0]];

    const viewA = buildFourCardView(state, 'A', ctxFor(['A', 'B']));
    const viewB = buildFourCardView(state, 'B', ctxFor(['A', 'B']));

    // Both players see the identical, complete collector list — captured
    // cards are public information the instant they're captured.
    expect(viewA.collectors).toEqual(viewB.collectors);
    expect(viewA.collectors.find((c) => c.collectorId === state.collectors[0].collectorId)?.capturedStack).toEqual([
      state.tableCards[0],
    ]);
  });

  it('never includes hint data (no valid-moves list, no highlighting) — only the fields the type actually defines', () => {
    const state = fourCardEngine.dealCards(fourCardEngine.initializeGame(players('A', 'B'), 1)) as FourCardState;
    const view = buildFourCardView(state, 'A', ctxFor(['A', 'B']));

    expect(view).not.toHaveProperty('validMoves');
    expect(view).not.toHaveProperty('hints');
  });
});
