import { describe, expect, it } from 'vitest';
import type { Card } from '../../card-engine/types.js';
import type { GamePlayerRef } from '../GameEngine.js';
import { teenPattiEngine } from './TeenPattiEngine.js';
import type { TeenPattiState } from './types.js';

function card(rank: Card['rank'], suit: Card['suit']): Card {
  return { cardId: `${suit}-${rank}`, rank, suit, deckId: 'test', faceUp: true, owner: null, position: 'hand' };
}

function players(...ids: string[]): GamePlayerRef[] {
  return ids.map((playerId) => ({ playerId, isAI: false }));
}

function dealtState(...ids: string[]): TeenPattiState {
  const state = teenPattiEngine.initializeGame(players(...ids), 42);
  return teenPattiEngine.dealCards(state);
}

describe('initializeGame + dealCards', () => {
  it('deals exactly 3 unique cards to each player and sets up the pot/boot', () => {
    const state = dealtState('p1', 'p2', 'p3');

    for (const p of state.players) {
      expect(p.hand).toHaveLength(3);
      expect(p.remainingCoins).toBe(990); // 1000 starting - 10 boot
      expect(p.totalBet).toBe(10);
    }
    expect(state.pot).toBe(30);
    expect(state.currentStake).toBe(10);

    const allCardIds = state.players.flatMap((p) => p.hand.map((c) => c.cardId));
    expect(new Set(allCardIds).size).toBe(9);
  });

  it('is deterministic for a given seed', () => {
    const a = dealtState('p1', 'p2', 'p3');
    const b = dealtState('p1', 'p2', 'p3');
    expect(a.players.map((p) => p.hand.map((c) => c.cardId))).toEqual(
      b.players.map((p) => p.hand.map((c) => c.cardId)),
    );
  });
});

describe('blind vs seen betting amounts', () => {
  it('blind chaal costs the current stake and does not change it', () => {
    const state = dealtState('p1', 'p2', 'p3');
    const next = teenPattiEngine.applyMove(state, 'p1', { type: 'chaal' });
    const p1 = next.players.find((p) => p.userId === 'p1')!;

    expect(p1.remainingCoins).toBe(980); // 990 - 10
    expect(p1.totalBet).toBe(20); // 10 boot + 10 chaal
    expect(next.pot).toBe(40); // 30 + 10
    expect(next.currentStake).toBe(10); // unchanged
  });

  it('blind raise costs 2x the stake and doubles it for everyone after', () => {
    const state = dealtState('p1', 'p2', 'p3');
    const next = teenPattiEngine.applyMove(state, 'p1', { type: 'raise' });
    const p1 = next.players.find((p) => p.userId === 'p1')!;

    expect(p1.remainingCoins).toBe(970); // 990 - 20
    expect(next.pot).toBe(50); // 30 + 20
    expect(next.currentStake).toBe(20); // doubled
  });

  it('seeing costs nothing, and seen chaal/raise are double the blind amounts', () => {
    let state = dealtState('p1', 'p2', 'p3');
    state = teenPattiEngine.applyMove(state, 'p1', { type: 'see' });
    let p1 = state.players.find((p) => p.userId === 'p1')!;
    expect(p1.isSeen).toBe(true);
    expect(p1.remainingCoins).toBe(990); // no cost

    const afterChaal = teenPattiEngine.applyMove(state, 'p1', { type: 'chaal' });
    p1 = afterChaal.players.find((p) => p.userId === 'p1')!;
    expect(p1.remainingCoins).toBe(970); // 990 - 20 (2x currentStake since seen)
    expect(afterChaal.currentStake).toBe(10); // chaal never changes the stake

    const afterRaise = teenPattiEngine.applyMove(state, 'p1', { type: 'raise' });
    const p1Raised = afterRaise.players.find((p) => p.userId === 'p1')!;
    expect(p1Raised.remainingCoins).toBe(950); // 990 - 40 (4x currentStake since seen)
    expect(afterRaise.currentStake).toBe(20); // still doubles to 2x old, same as blind raise
  });
});

describe('getValidMoves', () => {
  it('excludes chaal/raise/show a player cannot afford, but fold is always available', () => {
    const state = dealtState('p1', 'p2', 'p3');
    const poor = { ...state, players: state.players.map((p) => (p.userId === 'p1' ? { ...p, remainingCoins: 5 } : p)) };

    const moves = teenPattiEngine.getValidMoves(poor, 'p1').map((m) => m.type);
    expect(moves).toContain('fold');
    expect(moves).not.toContain('chaal');
    expect(moves).not.toContain('raise');
  });

  it('offers show only when exactly two players are active', () => {
    const threePlayers = dealtState('p1', 'p2', 'p3');
    expect(teenPattiEngine.getValidMoves(threePlayers, 'p1').map((m) => m.type)).not.toContain('show');

    const twoPlayers = dealtState('p1', 'p2');
    expect(teenPattiEngine.getValidMoves(twoPlayers, 'p1').map((m) => m.type)).toContain('show');
  });

  it('returns no moves for a player whose turn it is not', () => {
    const state = dealtState('p1', 'p2', 'p3');
    expect(teenPattiEngine.getValidMoves(state, 'p2')).toEqual([]);
  });
});

describe('turn rotation', () => {
  it('nextTurn skips folded players', () => {
    let state = dealtState('p1', 'p2', 'p3');
    state = teenPattiEngine.applyMove(state, 'p1', { type: 'fold' });
    state = teenPattiEngine.nextTurn(state);
    expect(state.turnOrder[state.currentTurnIndex]).toBe('p2');

    state = teenPattiEngine.applyMove(state, 'p2', { type: 'chaal' });
    state = teenPattiEngine.nextTurn(state);
    expect(state.turnOrder[state.currentTurnIndex]).toBe('p3');

    state = teenPattiEngine.applyMove(state, 'p3', { type: 'chaal' });
    state = teenPattiEngine.nextTurn(state);
    // wraps around past folded p1 straight to p2
    expect(state.turnOrder[state.currentTurnIndex]).toBe('p2');
  });
});

describe('hand completion', () => {
  it('declares the sole remaining player the winner once everyone else folds', () => {
    let state = dealtState('p1', 'p2', 'p3');
    state = teenPattiEngine.applyMove(state, 'p1', { type: 'fold' });
    state = teenPattiEngine.nextTurn(state);
    state = teenPattiEngine.applyMove(state, 'p2', { type: 'fold' });

    expect(state.phase).toBe('complete');
    expect(state.winnerId).toBe('p3');
    const result = teenPattiEngine.checkWinner(state);
    expect(result?.winnerIds).toEqual(['p3']);
    expect(result?.scores.p3).toBeGreaterThan(0);
  });

  it('resolves a show by comparing hands, the stronger hand wins the pot', () => {
    let state = dealtState('p1', 'p2');
    state = {
      ...state,
      players: state.players.map((p) =>
        p.userId === 'p1'
          ? { ...p, hand: [card('A', 'hearts'), card('A', 'clubs'), card('A', 'spades')] } // trail
          : { ...p, hand: [card('K', 'hearts'), card('9', 'clubs'), card('2', 'spades')] }, // high card
      ),
    };

    const result = teenPattiEngine.applyMove(state, 'p1', { type: 'show' });
    expect(result.phase).toBe('complete');
    expect(result.winnerId).toBe('p1');
    expect(result.revealedHands).toHaveProperty('p1');
    expect(result.revealedHands).toHaveProperty('p2');

    const finished = teenPattiEngine.finishGame(result);
    expect(finished.winnerIds).toEqual(['p1']);
  });
});
