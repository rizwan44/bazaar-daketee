import { describe, expect, it } from 'vitest';
import { DeckEngine } from '../../card-engine/DeckEngine.js';
import { createSeededRng } from '../../card-engine/rng.js';
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

function dealtState(seed = 1): FourCardState {
  const state = fourCardEngine.initializeGame(players('A', 'B'), seed);
  return fourCardEngine.dealCards(state);
}

/** Builds a fully custom 2-player state for scenarios the random deal can't target precisely. */
function customState(overrides: {
  handA: Card[];
  handB: Card[];
  table: Card[];
  drawPile?: Card[];
  turnPhase?: FourCardState['turnPhase'];
  currentTurnIndex?: number;
  stackA?: Card[];
  stackB?: Card[];
}): FourCardState {
  const base = fourCardEngine.initializeGame(players('A', 'B'), 1) as FourCardState;
  base.players[0].hand = overrides.handA;
  base.players[1].hand = overrides.handB;
  base.collectors[0].capturedStack = overrides.stackA ?? [];
  base.collectors[1].capturedStack = overrides.stackB ?? [];
  base.tableCards = overrides.table;
  base.drawPile = overrides.drawPile ?? [];
  base.turnPhase = overrides.turnPhase ?? 'awaiting-action';
  base.currentTurnIndex = overrides.currentTurnIndex ?? 0;
  return base;
}

function captureMove(cardId: string, targetType: 'table' | 'stack' | 'own-stack', targetCardId: string) {
  const payload: CaptureMovePayload = { targetType, targetCardId };
  return { type: 'capture', cardId, payload };
}

describe('dealCards', () => {
  it('deals 4 cards to each player and 4 to the table, with no overlap', () => {
    const state = dealtState();
    expect(state.players[0].hand).toHaveLength(4);
    expect(state.players[1].hand).toHaveLength(4);
    expect(state.tableCards).toHaveLength(4);
    expect(state.drawPile).toHaveLength(52 - 4 - 4 - 4);

    const allIds = [
      ...state.players[0].hand,
      ...state.players[1].hand,
      ...state.tableCards,
      ...state.drawPile,
    ].map((c) => c.cardId);
    expect(new Set(allIds).size).toBe(52);
  });

  it('the initial 4 table cards always have 4 unique ranks, across 1000 randomized deals — and the deck stays intact', () => {
    const TRIALS = 1000;
    let sawADuplicateInRawDealBeforeFix = false;

    for (let seed = 1; seed <= TRIALS; seed++) {
      const state = fourCardEngine.dealCards(
        fourCardEngine.initializeGame(players('A', 'B'), seed),
      ) as FourCardState;

      // 1 & 2: exactly 4 table cards, with 4 unique ranks.
      expect(state.tableCards).toHaveLength(4);
      expect(new Set(state.tableCards.map((c) => c.rank)).size).toBe(4);

      // 4, 5, 6: the deck is still exactly 52 real cards — nothing invented, duplicated, or lost.
      const allCards = [...state.players[0].hand, ...state.players[1].hand, ...state.tableCards, ...state.drawPile];
      expect(allCards).toHaveLength(52);
      const allIds = allCards.map((c) => c.cardId);
      expect(new Set(allIds).size).toBe(52); // no id repeated (no duplication)
      // 7: every one of the 52 canonical rank+suit combinations is present
      // exactly once (no card lost — every card ended up in a hand, on the
      // table, or still in the draw pile). Compared by suit+rank rather than
      // the raw cardId, since cardId is namespaced by this game's own deckId.
      const canonicalSuitRanks = new Set<string>();
      for (const suit of ['hearts', 'diamonds', 'clubs', 'spades'] as const) {
        for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const) {
          canonicalSuitRanks.add(`${suit}-${rank}`);
        }
      }
      expect(new Set(allCards.map((c) => `${c.suit}-${c.rank}`))).toEqual(canonicalSuitRanks);

      // Sanity check that this test would actually have caught the bug: a
      // PLAIN round-robin deal (no fix-up) really can produce a duplicate —
      // confirms the assertions above aren't vacuously true.
      const rawTable = new DeckEngine(`raw-${seed}`, createSeededRng(seed));
      rawTable.shuffle();
      rawTable.deal(['A', 'B', '__table__'], 4);
      if (new Set(rawTable.getHand('__table__').map((c) => c.rank)).size !== 4) {
        sawADuplicateInRawDealBeforeFix = true;
      }
    }

    expect(sawADuplicateInRawDealBeforeFix).toBe(true);
  });
});

describe('shuffler skips the first turn', () => {
  it('starts the turn on the seat right after the shuffler, never on the shuffler', () => {
    const refs: GamePlayerRef[] = [
      { playerId: 'A', isAI: false },
      { playerId: 'B', isAI: false, isShuffler: true },
      { playerId: 'C', isAI: false },
    ];
    const state = fourCardEngine.initializeGame(refs, 1) as FourCardState;
    expect(state.shufflerUserId).toBe('B');
    expect(state.turnOrder[state.currentTurnIndex]).toBe('C'); // seat right after B
  });
});

describe('capture — rank-only matching', () => {
  it('allows a capture when ranks match regardless of suit, and rejects a non-matching one', () => {
    const state = customState({
      handA: [card('4', 'hearts')],
      handB: [],
      table: [card('4', 'spades'), card('Q', 'clubs')],
    });

    expect(fourCardEngine.validateMove(state, 'A', captureMove('hearts-4', 'table', 'spades-4')).valid).toBe(true);
    expect(fourCardEngine.validateMove(state, 'A', captureMove('hearts-4', 'table', 'clubs-Q')).valid).toBe(false);
  });

  it('table capture pushes BOTH the hand card and the captured table card onto the stack (single card, table has no group concept)', () => {
    const state = customState({
      handA: [card('4', 'hearts')],
      handB: [],
      table: [card('4', 'spades')],
    });

    const next = fourCardEngine.applyMove(state, 'A', captureMove('hearts-4', 'table', 'spades-4'));
    const stack = collectorFor(next, 'A').capturedStack;
    expect(stack).toHaveLength(2);
    expect(stack.map((c) => c.cardId).sort()).toEqual(['hearts-4', 'spades-4']);
    expect(next.players[0].hand).toHaveLength(0);
    expect(next.tableCards).toHaveLength(0);
  });

  it('sets turnPhase back to awaiting-draw and nextTurn keeps the same player (chain continues)', () => {
    const state = customState({
      handA: [card('4', 'hearts')],
      handB: [],
      table: [card('4', 'spades')],
      drawPile: [card('9', 'clubs')],
    });

    const afterCapture = fourCardEngine.applyMove(state, 'A', captureMove('hearts-4', 'table', 'spades-4'));
    expect(afterCapture.turnPhase).toBe('awaiting-draw');

    const afterNextTurn = fourCardEngine.nextTurn(afterCapture);
    expect(afterNextTurn.currentTurnIndex).toBe(0); // still A's turn
    expect(afterNextTurn.phase).toBe('playing'); // draw pile wasn't empty, game continues
  });

  it('can capture the opponent unlocked stack top, but never targets one\'s own stack', () => {
    const state = customState({
      handA: [card('K', 'hearts')],
      handB: [],
      table: [],
      stackB: [card('K', 'clubs'), card('K', 'diamonds')], // B's top is K-diamonds
    });

    const moves = fourCardEngine.getValidMoves(state, 'A');
    // The stack capture, plus discarding the same K instead (matching is optional).
    expect(moves).toHaveLength(2);
    expect(moves).toContainEqual({ type: 'discard', cardId: 'hearts-K' });
    expect(moves.find((m) => m.type === 'capture')).toMatchObject({
      type: 'capture',
      cardId: 'hearts-K',
      payload: { targetType: 'stack', targetCardId: 'diamonds-K' },
    });
  });
});

describe('group capture — the mandatory bug fix (§20-22 / Test Case #2)', () => {
  it('captures the ENTIRE contiguous same-rank group at the top of the target stack, not just the touched card', () => {
    const state = customState({
      handA: [],
      handB: [card('5', 'hearts')],
      table: [],
      // A's stack, bottom-to-top: 7, K, 5, 5 — the top two 5s form a group.
      stackA: [card('7', 'hearts'), card('K', 'hearts'), card('5', 'spades'), card('5', 'diamonds')],
      currentTurnIndex: 1, // B's turn
    });

    const moves = fourCardEngine.getValidMoves(state, 'B');
    // The capture, plus discarding the same 5 instead (matching is optional).
    expect(moves).toContainEqual(captureMove('hearts-5', 'stack', 'diamonds-5'));
    expect(moves).toContainEqual({ type: 'discard', cardId: 'hearts-5' });
    expect(moves.filter((m) => m.type === 'capture')).toHaveLength(1);

    const next = fourCardEngine.applyMove(state, 'B', captureMove('hearts-5', 'stack', 'diamonds-5'));

    // Both existing 5s transferred to B, plus B's own capturing 5 — not just one.
    const bStack = collectorFor(next, 'B').capturedStack;
    expect(bStack.map((c) => c.cardId).sort()).toEqual(['diamonds-5', 'hearts-5', 'spades-5'].sort());

    // A's stack keeps the untouched 7 and K underneath — the group is gone, the rest stays.
    const aStack = collectorFor(next, 'A').capturedStack;
    expect(aStack.map((c) => c.cardId).sort()).toEqual(['hearts-K', 'hearts-7'].sort());
  });

  it('captures a 3-card group in one move, completing a lock immediately when the capturing card makes a 4th (§21)', () => {
    const state = customState({
      handA: [],
      handB: [card('5', 'clubs')],
      table: [],
      stackA: [
        card('7', 'hearts'),
        card('K', 'hearts'),
        card('5', 'spades'),
        card('5', 'diamonds'),
        card('5', 'hearts'),
      ],
      currentTurnIndex: 1,
    });

    const next = fourCardEngine.applyMove(state, 'B', captureMove('clubs-5', 'stack', 'hearts-5'));
    const bCollector = collectorFor(next, 'B');
    // 3 existing 5s + the capturing 5 = a full 4-of-a-kind landing in one move — locks immediately, resetting the stack.
    expect(bCollector.capturedStack).toHaveLength(0);
    expect(bCollector.lockedGroups).toHaveLength(1);
    expect(bCollector.lockedGroups[0]).toHaveLength(4);
    expect(bCollector.lockedGroups[0].every((c) => c.rank === '5')).toBe(true);
  });
});

describe('own active stack top matching (§1-3, Test Case #49-50)', () => {
  it('a matching hand card can capture the player\'s OWN stack top — the target stays, only the hand card joins', () => {
    const state = customState({
      handA: [card('10', 'hearts')],
      handB: [],
      table: [],
      stackA: [card('7', 'clubs'), card('K', 'diamonds'), card('10', 'spades')], // A's own top is 10
    });

    // Legal (and the only capture) — but matching is optional, so discarding the same 10 is also offered.
    expect(fourCardEngine.getValidMoves(state, 'A')).toContainEqual(
      captureMove('hearts-10', 'own-stack', 'spades-10'),
    );
    expect(fourCardEngine.getValidMoves(state, 'A')).toContainEqual({ type: 'discard', cardId: 'hearts-10' });

    const next = fourCardEngine.applyMove(state, 'A', captureMove('hearts-10', 'own-stack', 'spades-10'));
    const aStack = collectorFor(next, 'A').capturedStack;
    // The original 10 never left — the hand's 10 simply joined it on top.
    expect(aStack.map((c) => c.cardId)).toEqual(['clubs-7', 'diamonds-K', 'spades-10', 'hearts-10']);
    expect(next.players[0].hand).toHaveLength(0);
    expect(next.turnPhase).toBe('awaiting-draw'); // still mandates a redraw, like any other capture
  });

  it('rejects a drop on a non-matching own-stack card — no hint, card stays in hand (Test Case #50)', () => {
    const state = customState({
      handA: [card('K', 'hearts')],
      handB: [],
      table: [],
      stackA: [card('7', 'clubs'), card('K', 'diamonds'), card('10', 'spades')], // top is 10, not K
    });

    expect(
      fourCardEngine.validateMove(state, 'A', captureMove('hearts-K', 'own-stack', 'spades-10')).valid,
    ).toBe(false);
    expect(() => fourCardEngine.applyMove(state, 'A', captureMove('hearts-K', 'own-stack', 'spades-10'))).toThrow();
  });

  it('own-stack matching can complete a lock, and is offered alongside table/opponent-stack options when several are legal', () => {
    const state = customState({
      handA: [card('9', 'hearts')],
      handB: [],
      table: [card('9', 'spades')], // a table option also exists for the same 9
      stackA: [card('K', 'clubs'), card('9', 'diamonds'), card('9', 'clubs')], // 2 nines already on top
    });

    const moves = fourCardEngine.getValidMoves(state, 'A');
    // own-stack capture, table capture, AND discarding the same 9 instead — all legal, player's free choice.
    expect(moves).toHaveLength(3);
    expect(moves).toContainEqual(captureMove('hearts-9', 'own-stack', 'clubs-9'));
    expect(moves).toContainEqual(captureMove('hearts-9', 'table', 'spades-9'));
    expect(moves).toContainEqual({ type: 'discard', cardId: 'hearts-9' });

    const next = fourCardEngine.applyMove(state, 'A', captureMove('hearts-9', 'own-stack', 'clubs-9'));
    const aCollector = collectorFor(next, 'A');
    // K underneath, then 3 nines (2 existing + the hand card) — not a lock yet (only 3 nines, need 4).
    expect(aCollector.capturedStack).toHaveLength(4);
    expect(aCollector.lockedGroups).toHaveLength(0);
  });
});

describe('matching is optional, never mandatory (§6-9, §44-45 — a deliberate reversal of the earlier mandatory-capture rule)', () => {
  it('offers BOTH the legal capture and every discard together — capture is no longer exclusive', () => {
    const state = customState({
      handA: [card('4', 'hearts'), card('9', 'clubs')],
      handB: [],
      table: [card('4', 'spades')],
    });
    const moves = fourCardEngine.getValidMoves(state, 'A');
    expect(moves).toContainEqual({
      type: 'capture',
      cardId: 'hearts-4',
      payload: { targetType: 'table', targetCardId: 'spades-4' },
    });
    expect(moves).toContainEqual({ type: 'discard', cardId: 'hearts-4' });
    expect(moves).toContainEqual({ type: 'discard', cardId: 'clubs-9' });
  });

  it('a player may IGNORE an available match and discard a different card instead — no forced capture (Test Case #45)', () => {
    const state = customState({
      handA: [card('5', 'hearts'), card('8', 'clubs'), card('K', 'diamonds'), card('2', 'spades')],
      handB: [],
      table: [card('5', 'spades')], // A has a real match available (hearts-5 -> spades-5)
    });

    // The match is legal but NOT the only option.
    expect(fourCardEngine.validateMove(state, 'A', captureMove('hearts-5', 'table', 'spades-5')).valid).toBe(true);
    expect(fourCardEngine.validateMove(state, 'A', { type: 'discard', cardId: 'clubs-8' }).valid).toBe(true);

    // A chooses to discard the 8 instead of capturing the 5.
    const next = fourCardEngine.applyMove(state, 'A', { type: 'discard', cardId: 'clubs-8' });
    expect(next.tableCards.map((c) => c.cardId).sort()).toEqual(['clubs-8', 'spades-5'].sort()); // the 5 is untouched
    expect(next.players[0].hand.map((c) => c.cardId).sort()).toEqual(['diamonds-K', 'hearts-5', 'spades-2'].sort());
    expect(next.currentTurnIndex).toBe(1); // turn passes normally, exactly like any other discard
  });

  it('offers discard of any hand card when no capture is legal either (unaffected by the reversal — was already true)', () => {
    const state = customState({
      handA: [card('4', 'hearts'), card('9', 'clubs')],
      handB: [],
      table: [card('Q', 'spades')],
    });
    const moves = fourCardEngine.getValidMoves(state, 'A');
    expect(moves.map((m) => m.type)).toEqual(['discard', 'discard']);
  });

  it('discarding returns the card to the table, drops the hand to 4, and passes the turn', () => {
    const state = customState({
      handA: [card('4', 'hearts'), card('2', 'clubs'), card('3', 'diamonds'), card('5', 'spades'), card('9', 'hearts')],
      handB: [],
      table: [card('Q', 'spades')],
    });
    const next = fourCardEngine.applyMove(state, 'A', { type: 'discard', cardId: 'hearts-9' });
    expect(next.tableCards.map((c) => c.cardId)).toContain('hearts-9');
    expect(next.players[0].hand).toHaveLength(4);
    expect(next.currentTurnIndex).toBe(1);
    expect(next.turnPhase).toBe('awaiting-draw');
  });
});

describe('wrong-target drop fails silently (Test Case #8)', () => {
  it('a non-matching capture is rejected and changes nothing', () => {
    const state = customState({
      handA: [card('5', 'hearts')],
      handB: [],
      table: [card('Q', 'spades')],
    });
    expect(fourCardEngine.validateMove(state, 'A', captureMove('hearts-5', 'table', 'spades-Q')).valid).toBe(false);
    expect(() => fourCardEngine.applyMove(state, 'A', captureMove('hearts-5', 'table', 'spades-Q'))).toThrow();
  });
});

describe('locking', () => {
  it('two consecutive same-rank capture pairs lock, finalizing earlier cards and resetting the stack', () => {
    let state = customState({
      handA: [card('4', 'hearts'), card('K', 'diamonds')],
      handB: [],
      table: [card('4', 'spades'), card('K', 'clubs')],
      drawPile: [card('2', 'hearts'), card('3', 'clubs')],
    });

    state = fourCardEngine.applyMove(state, 'A', captureMove('hearts-4', 'table', 'spades-4'));
    expect(collectorFor(state, 'A').capturedStack).toHaveLength(2);
    expect(collectorFor(state, 'A').lockedGroups).toHaveLength(0);

    state = fourCardEngine.applyMove(state, 'A', { type: 'draw' });
    state = fourCardEngine.applyMove(state, 'A', captureMove('diamonds-K', 'table', 'clubs-K'));
    expect(collectorFor(state, 'A').capturedStack).toHaveLength(4);
    expect(collectorFor(state, 'A').lockedGroups).toHaveLength(0); // different ranks, no lock
  });

  it('locks exactly when the top 4 stack cards share a rank, and that stack is no longer a valid target', () => {
    const state = customState({
      handA: [card('K', 'hearts')],
      handB: [],
      table: [card('K', 'spades')],
      stackA: [card('K', 'clubs'), card('K', 'diamonds')],
    });

    const next = fourCardEngine.applyMove(state, 'A', captureMove('hearts-K', 'table', 'spades-K'));
    expect(collectorFor(next, 'A').capturedStack).toHaveLength(0);
    expect(collectorFor(next, 'A').lockedGroups).toHaveLength(1);
    expect(collectorFor(next, 'A').lockedGroups[0]).toHaveLength(4);
    expect(collectorFor(next, 'A').lockedGroups[0].every((c) => c.rank === 'K')).toBe(true);

    const bMoves = fourCardEngine.getValidMoves({ ...next, currentTurnIndex: 1, turnPhase: 'awaiting-action' }, 'B');
    expect(bMoves.some((m) => m.type === 'capture')).toBe(false);
  });

  it('finalizes cards captured earlier in the same stack when a lock forms above them', () => {
    const state = customState({
      handA: [card('K', 'hearts')],
      handB: [],
      table: [card('K', 'spades')],
      stackA: [card('5', 'hearts'), card('5', 'clubs'), card('K', 'clubs'), card('K', 'diamonds')],
    });

    const next = fourCardEngine.applyMove(state, 'A', captureMove('hearts-K', 'table', 'spades-K'));
    expect(collectorFor(next, 'A').finalizedCards.map((c) => c.cardId).sort()).toEqual(['clubs-5', 'hearts-5']);
    expect(collectorFor(next, 'A').lockedGroups[0].map((c) => c.cardId).sort()).toEqual([
      'clubs-K',
      'diamonds-K',
      'hearts-K',
      'spades-K',
    ]);
  });
});

describe('4-player individual — no merging (Test Case #6)', () => {
  it('keeps every player\'s collection fully separate', () => {
    const base = fourCardEngine.initializeGame(players('A', 'B', 'C', 'D'), 1) as FourCardState;
    expect(base.mode).toBe('four-individual');
    expect(base.collectors.map((c) => c.collectorId).sort()).toEqual(['A', 'B', 'C', 'D']);

    base.players[0].hand = [card('5', 'hearts')];
    base.tableCards = [card('5', 'spades')];
    base.turnPhase = 'awaiting-action';
    base.currentTurnIndex = 0;

    const next = fourCardEngine.applyMove(base, 'A', captureMove('hearts-5', 'table', 'spades-5'));
    expect(collectorFor(next, 'A').capturedStack).toHaveLength(2);
    expect(collectorFor(next, 'B').capturedStack).toHaveLength(0);
    expect(collectorFor(next, 'C').capturedStack).toHaveLength(0);
    expect(collectorFor(next, 'D').capturedStack).toHaveLength(0);
  });

  it('A can target any other player\'s stack (here C\'s), not just a fixed single opponent', () => {
    const base = fourCardEngine.initializeGame(players('A', 'B', 'C', 'D'), 1) as FourCardState;
    base.players[0].hand = [card('9', 'hearts')];
    base.collectors.find((c) => c.collectorId === 'C')!.capturedStack = [card('9', 'clubs')];
    base.turnPhase = 'awaiting-action';
    base.currentTurnIndex = 0;

    const moves = fourCardEngine.getValidMoves(base, 'A');
    // The capture, plus discarding the same 9 instead (matching is optional).
    expect(moves).toContainEqual(captureMove('hearts-9', 'stack', 'clubs-9'));
    expect(moves).toContainEqual({ type: 'discard', cardId: 'hearts-9' });
    expect(moves.filter((m) => m.type === 'capture')).toHaveLength(1);
  });
});

describe('4-player team — shared collection (Test Case #4)', () => {
  function teamState(): FourCardState {
    const refs: GamePlayerRef[] = [
      { playerId: 'A', isAI: false, teamId: 'team-1' },
      { playerId: 'B', isAI: false, teamId: 'team-2' },
      { playerId: 'C', isAI: false, teamId: 'team-1' },
      { playerId: 'D', isAI: false, teamId: 'team-2' },
    ];
    return fourCardEngine.initializeGame(refs, 1) as FourCardState;
  }

  it('assigns A+C to team-1 and B+D to team-2, with exactly 2 shared collectors', () => {
    const state = teamState();
    expect(state.mode).toBe('four-team');
    expect(state.collectors.map((c) => c.collectorId).sort()).toEqual(['team-1', 'team-2']);
    expect(state.players.find((p) => p.userId === 'A')!.collectorId).toBe('team-1');
    expect(state.players.find((p) => p.userId === 'C')!.collectorId).toBe('team-1');
    expect(state.players.find((p) => p.userId === 'B')!.collectorId).toBe('team-2');
  });

  it('captures by DIFFERENT teammates land in the same shared stack, and either one can complete the team lock', () => {
    const state = teamState();
    // team-1's shared stack already has 2 Ks (as if A captured them on an earlier
    // turn — not replayed move-by-move here, same style as the individual-mode
    // locking test above).
    state.collectors.find((c) => c.collectorId === 'team-1')!.capturedStack = [
      card('K', 'clubs'),
      card('K', 'diamonds'),
    ];
    state.tableCards = [card('K', 'spades')];
    state.turnPhase = 'awaiting-action';
    state.currentTurnIndex = 2; // C's turn — a DIFFERENT teammate than whoever captured the first 2
    state.players[2].hand = [card('K', 'hearts')];

    const next = fourCardEngine.applyMove(state, 'C', captureMove('hearts-K', 'table', 'spades-K'));

    const team1ViaA = collectorFor(next, 'A');
    const team1ViaC = collectorFor(next, 'C');
    expect(team1ViaA.collectorId).toBe(team1ViaC.collectorId); // same shared collector
    expect(team1ViaA.capturedStack).toHaveLength(0); // reset — the lock consumed the whole shared stack
    expect(team1ViaA.lockedGroups).toHaveLength(1);
    expect(team1ViaA.lockedGroups[0].every((c) => c.rank === 'K')).toBe(true);
  });

  it("own team's (own) collector is never offered as an opponent-style 'stack' target — only ever as 'own-stack' (§1-3's new mechanic)", () => {
    const state = teamState();
    state.players[0].hand = [card('5', 'hearts')];
    // C is A's teammate — team-1's shared collector IS A's own collector too.
    state.collectors.find((c) => c.collectorId === 'team-1')!.capturedStack = [card('5', 'clubs')];
    state.tableCards = [];
    state.turnPhase = 'awaiting-action';
    state.currentTurnIndex = 0;

    const moves = fourCardEngine.getValidMoves(state, 'A');
    // Legal — but ONLY via the new own-stack mechanic, never as a 'stack'
    // (opponent-style) capture, since team-1 is never in opponentCollectorsOf for A.
    // Matching is optional, so discarding the same 5 is legal too.
    expect(moves).toContainEqual({
      type: 'capture',
      cardId: 'hearts-5',
      payload: { targetType: 'own-stack', targetCardId: 'clubs-5' },
    });
    expect(moves.some((m) => (m.payload as CaptureMovePayload | undefined)?.targetType === 'stack')).toBe(false);
    expect(moves).toContainEqual({ type: 'discard', cardId: 'hearts-5' });
  });
});

describe('game end', () => {
  it('ends the game once the draw pile is empty at draw time, without a sweep bonus, and scores correctly', () => {
    const state = customState({
      handA: [],
      handB: [],
      table: [card('9', 'clubs'), card('J', 'diamonds')], // left unclaimed — should NOT count for anyone
      drawPile: [],
      turnPhase: 'awaiting-draw',
      stackA: [card('A', 'hearts'), card('A', 'clubs')], // 40 points
      stackB: [card('5', 'hearts'), card('5', 'clubs')], // 10 points
    });

    const ended = fourCardEngine.nextTurn(state);
    expect(ended.phase).toBe('complete');

    const result = fourCardEngine.finishGame(ended);
    expect(result.scores.A).toBe(40);
    expect(result.scores.B).toBe(10);
    expect(result.winnerIds).toEqual(['A']);
  });

  it('produces no winner on a tie', () => {
    const state = customState({
      handA: [],
      handB: [],
      table: [],
      drawPile: [],
      turnPhase: 'awaiting-draw',
      stackA: [card('K', 'hearts'), card('Q', 'clubs')], // 10 + 10 = 20
      stackB: [card('A', 'hearts')], // 20
    });

    const ended = fourCardEngine.nextTurn(state);
    const result = fourCardEngine.finishGame(ended);
    expect(result.scores.A).toBe(result.scores.B);
    expect(result.winnerIds).toEqual([]);
  });

  it('checkWinner returns null before the game is complete, and finishGame throws', () => {
    const state = dealtState();
    expect(fourCardEngine.checkWinner(state)).toBeNull();
    expect(() => fourCardEngine.finishGame(state)).toThrow();
  });

  it('team mode: winnerIds includes BOTH teammates of the winning team', () => {
    const refs: GamePlayerRef[] = [
      { playerId: 'A', isAI: false, teamId: 'team-1' },
      { playerId: 'B', isAI: false, teamId: 'team-2' },
      { playerId: 'C', isAI: false, teamId: 'team-1' },
      { playerId: 'D', isAI: false, teamId: 'team-2' },
    ];
    let state = fourCardEngine.initializeGame(refs, 1) as FourCardState;
    state.collectors.find((c) => c.collectorId === 'team-1')!.capturedStack = [card('A', 'hearts')]; // 20
    state.collectors.find((c) => c.collectorId === 'team-2')!.capturedStack = [card('5', 'hearts')]; // 5
    state.drawPile = [];
    state.turnPhase = 'awaiting-draw';

    state = fourCardEngine.nextTurn(state);
    const result = fourCardEngine.finishGame(state);
    expect(result.winnerIds.sort()).toEqual(['A', 'C']);
    expect(result.scores.A).toBe(20);
    expect(result.scores.C).toBe(20); // C shares A's team score even though C personally captured nothing
    expect(result.scores.B).toBe(5);
  });
});

describe('final resolution — draw pile empty does not instantly end the game (§14-20, Test Case #51-53)', () => {
  it('a player with a legal capture still in hand keeps playing once the pile empties, instead of the game ending immediately', () => {
    const state = customState({
      handA: [card('9', 'hearts')], // A still holds a card that can capture
      handB: [],
      table: [card('9', 'spades')],
      drawPile: [], // nothing left to draw
      turnPhase: 'awaiting-draw',
      currentTurnIndex: 0,
    });

    // Not over — A can still act with their existing hand.
    const afterCheck = fourCardEngine.nextTurn(state);
    expect(afterCheck.phase).toBe('playing');
    // The capture is legal, but (matching is optional — §6-9) so is discarding that same 9 — both offered.
    expect(fourCardEngine.getValidMoves(afterCheck, 'A')).toContainEqual(
      captureMove('hearts-9', 'table', 'spades-9'),
    );
    expect(fourCardEngine.getValidMoves(afterCheck, 'A')).toContainEqual({ type: 'discard', cardId: 'hearts-9' });

    // No 'draw' offered — there's nothing left to draw.
    expect(fourCardEngine.getValidMoves(afterCheck, 'A').some((m) => m.type === 'draw')).toBe(false);

    const afterCapture = fourCardEngine.applyMove(afterCheck, 'A', captureMove('hearts-9', 'table', 'spades-9'));
    expect(collectorFor(afterCapture, 'A').capturedStack.map((c) => c.cardId).sort()).toEqual(
      ['hearts-9', 'spades-9'].sort(),
    );

    // A's hand is now empty and B has nothing either — THIS is when it actually finishes.
    const trulyDone = fourCardEngine.nextTurn(afterCapture);
    expect(trulyDone.phase).toBe('complete');
  });

  it('skips a player with nothing left to play and lets the NEXT player act instead of ending early', () => {
    const refs: GamePlayerRef[] = [
      { playerId: 'A', isAI: false },
      { playerId: 'B', isAI: false },
      { playerId: 'C', isAI: false },
      { playerId: 'D', isAI: false },
    ];
    const state = fourCardEngine.initializeGame(refs, 1) as FourCardState;
    state.players[0].hand = []; // A: nothing to play
    state.players[1].hand = []; // B: nothing to play
    state.players[2].hand = [card('7', 'hearts')]; // C: CAN play
    state.players[3].hand = [];
    state.tableCards = [card('7', 'spades')];
    state.drawPile = [];
    state.turnPhase = 'awaiting-draw';
    state.currentTurnIndex = 0; // A's turn, but A can't do anything

    const resolved = fourCardEngine.nextTurn(state);
    expect(resolved.phase).toBe('playing'); // not over — C can still act
    expect(resolved.turnOrder[resolved.currentTurnIndex]).toBe('C'); // skipped straight past A and B
  });

  it('a player with cards but zero legal captures still gets a real turn (discards instead of being skipped)', () => {
    const state = customState({
      handA: [card('Q', 'hearts')], // no match anywhere, but non-empty — must still get a turn
      handB: [],
      table: [card('9', 'clubs')], // no match either
      drawPile: [],
      turnPhase: 'awaiting-draw',
      currentTurnIndex: 0,
    });

    const resolved = fourCardEngine.nextTurn(state);
    expect(resolved.phase).toBe('playing'); // NOT skipped — A can still discard the Q
    expect(resolved.turnOrder[resolved.currentTurnIndex]).toBe('A');
    expect(fourCardEngine.getValidMoves(resolved, 'A')).toEqual([{ type: 'discard', cardId: 'hearts-Q' }]);
  });

  it('finishes once a full lap finds every hand genuinely EMPTY, with cards left on the table not counted for anyone', () => {
    const state = customState({
      handA: [], // truly nothing left to play — empty, not just capture-less
      handB: [],
      table: [card('9', 'clubs'), card('Q', 'hearts')], // stranded — nobody has a hand card to touch them with
      drawPile: [],
      turnPhase: 'awaiting-draw',
      currentTurnIndex: 0,
      stackA: [card('5', 'hearts')], // 5 points
      stackB: [card('K', 'hearts')], // 10 points
    });

    const ended = fourCardEngine.nextTurn(state);
    expect(ended.phase).toBe('complete');
    const result = fourCardEngine.finishGame(ended);
    expect(result.scores.A).toBe(5); // the stranded table cards never count
    expect(result.scores.B).toBe(10);
  });

  it('continues NORMAL A→B→A→B rotation for multiple full round trips once the pile is empty — there is no "one final turn each" cutoff', () => {
    // Distinct ranks everywhere (hands, empty table, empty stacks) means no
    // capture is ever legal — every move in this test is a discard, so the
    // only thing driving whose turn it is next is the normal turn-passing
    // rule (§ applyMove's 'discard' case) plus nextTurn's empty-hand skip.
    let state = customState({
      handA: [card('2', 'clubs'), card('3', 'clubs'), card('4', 'clubs')],
      handB: [card('5', 'diamonds'), card('6', 'diamonds'), card('7', 'diamonds')],
      table: [],
      drawPile: [],
      turnPhase: 'awaiting-draw',
      currentTurnIndex: 0, // as if A just received the very last draw card
    });

    const order: string[] = [];
    while (state.phase === 'playing') {
      const current = state.turnOrder[state.currentTurnIndex];
      order.push(current);
      const discard = fourCardEngine.getValidMoves(state, current).find((m) => m.type === 'discard')!;
      state = fourCardEngine.applyMove(state, current, discard);
      state = fourCardEngine.nextTurn(state);
    }

    // 3 cards each → exactly 6 discards, alternating the whole way through —
    // NOT "A, B" and done (that would stop the array at length 2).
    expect(order).toEqual(['A', 'B', 'A', 'B', 'A', 'B']);
    expect(state.phase).toBe('complete');
  });

  it('4-player: continues A→B→C→D→A→B→C→D rotation for multiple full laps once the pile is empty', () => {
    const refs: GamePlayerRef[] = [
      { playerId: 'A', isAI: false },
      { playerId: 'B', isAI: false },
      { playerId: 'C', isAI: false },
      { playerId: 'D', isAI: false },
    ];
    let state = fourCardEngine.initializeGame(refs, 1) as FourCardState;
    state.players[0].hand = [card('2', 'clubs'), card('3', 'clubs')];
    state.players[1].hand = [card('4', 'clubs'), card('5', 'clubs')];
    state.players[2].hand = [card('6', 'clubs'), card('7', 'clubs')];
    state.players[3].hand = [card('8', 'clubs'), card('9', 'clubs')];
    state.tableCards = [];
    state.drawPile = [];
    state.turnPhase = 'awaiting-draw';
    state.currentTurnIndex = 0;

    const order: string[] = [];
    while (state.phase === 'playing') {
      const current = state.turnOrder[state.currentTurnIndex];
      order.push(current);
      const discard = fourCardEngine.getValidMoves(state, current).find((m) => m.type === 'discard')!;
      state = fourCardEngine.applyMove(state, current, discard);
      state = fourCardEngine.nextTurn(state);
    }

    // 2 cards each × 4 players = 8 discards = two full laps, not one.
    expect(order).toEqual(['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D']);
    expect(state.phase).toBe('complete');
  });
});

describe('last hand card ends the turn immediately, once the draw pile is empty', () => {
  it('Test Case 1 — a matching last hand card auto-resolves (no duplicate rank), empties the hand, and ends the turn', () => {
    let state = customState({
      handA: [card('K', 'spades')],
      handB: [card('9', 'hearts')],
      table: [card('K', 'hearts'), card('5', 'clubs'), card('9', 'clubs')],
      drawPile: [],
      turnPhase: 'awaiting-draw',
      currentTurnIndex: 0,
    });

    state = fourCardEngine.applyMove(state, 'A', { type: 'discard', cardId: 'spades-K' });
    expect(state.tableCards.some((c) => c.rank === 'K')).toBe(false); // no duplicate K left sitting on the table
    expect(collectorFor(state, 'A').capturedStack.map((c) => c.cardId).sort()).toEqual(
      ['hearts-K', 'spades-K'].sort(),
    );
    expect(state.players[0].hand).toHaveLength(0);

    // Post-draw phase (pile empty): a capture-semantics action ends the turn
    // immediately by itself — applyMove already advanced it to B before
    // nextTurn even runs (nextTurn is just a confirming no-op here, since B
    // has a card and isn't skipped).
    expect(state.turnOrder[state.currentTurnIndex]).toBe('B');
    state = fourCardEngine.nextTurn(state);
    expect(state.turnOrder[state.currentTurnIndex]).toBe('B');
  });

  it('Test Case 2 — a non-matching last hand card discards normally and still ends the turn', () => {
    let state = customState({
      handA: [card('8', 'diamonds')],
      handB: [card('9', 'hearts')],
      table: [card('K', 'hearts'), card('5', 'clubs'), card('9', 'clubs')],
      drawPile: [],
      turnPhase: 'awaiting-draw',
      currentTurnIndex: 0,
    });

    state = fourCardEngine.applyMove(state, 'A', { type: 'discard', cardId: 'diamonds-8' });
    expect(state.tableCards.map((c) => c.cardId).sort()).toEqual(
      ['hearts-K', 'clubs-5', 'clubs-9', 'diamonds-8'].sort(),
    );
    expect(state.players[0].hand).toHaveLength(0);
    // A genuine discard already advances currentTurnIndex immediately inside applyMove.
    expect(state.turnOrder[state.currentTurnIndex]).toBe('B');
  });

  it('Test Case 3 — ignoring an available match (discarding a different card) leaves the hand non-empty; normal discard-passes-turn rules apply, matching stays optional', () => {
    let state = customState({
      handA: [card('K', 'spades'), card('8', 'diamonds')],
      handB: [card('9', 'hearts')],
      table: [card('K', 'hearts'), card('5', 'clubs'), card('9', 'clubs')],
      drawPile: [],
      turnPhase: 'awaiting-draw',
      currentTurnIndex: 0,
    });

    state = fourCardEngine.applyMove(state, 'A', { type: 'discard', cardId: 'diamonds-8' });
    expect(state.tableCards.map((c) => c.cardId).sort()).toEqual(
      ['hearts-K', 'clubs-5', 'clubs-9', 'diamonds-8'].sort(),
    );
    expect(state.players[0].hand.map((c) => c.cardId)).toEqual(['spades-K']); // A still holds the K for later
    expect(state.turnOrder[state.currentTurnIndex]).toBe('B'); // unchanged existing rule: any real discard passes the turn
  });

  it('Test Case 4 — the duplicate-rank auto-resolve does not depend on drop precision: dropping "elsewhere" on the table still merges into the existing card, never creates a second K', () => {
    // The client always sends a plain {type:'discard'} for any drop that
    // doesn't land exactly on a registered capture target — this proves the
    // ENGINE (not pixel coordinates) is what prevents the duplicate.
    let state = customState({
      handA: [card('K', 'spades')],
      handB: [],
      table: [card('K', 'hearts'), card('5', 'clubs'), card('9', 'clubs')],
      drawPile: [],
      turnPhase: 'awaiting-draw',
      currentTurnIndex: 0,
    });

    state = fourCardEngine.applyMove(state, 'A', { type: 'discard', cardId: 'spades-K' });
    const ranks = state.tableCards.map((c) => c.rank);
    expect(new Set(ranks).size).toBe(ranks.length); // no duplicate rank, ever
    expect(state.tableCards.some((c) => c.rank === 'K')).toBe(false);
    expect(state.players[0].hand).toHaveLength(0);
  });

  it('Test Case 5 (4-player) — a last hand card ends A\'s turn immediately and normal A→B→C→D rotation continues, no fixed final-turn queue', () => {
    const refs: GamePlayerRef[] = [
      { playerId: 'A', isAI: false },
      { playerId: 'B', isAI: false },
      { playerId: 'C', isAI: false },
      { playerId: 'D', isAI: false },
    ];
    let state = fourCardEngine.initializeGame(refs, 1) as FourCardState;
    state.players[0].hand = [card('K', 'spades')]; // A's last card — matches the table K
    state.players[1].hand = [card('2', 'hearts')];
    state.players[2].hand = [card('3', 'hearts')];
    state.players[3].hand = [card('4', 'hearts')];
    state.tableCards = [card('K', 'hearts')];
    state.drawPile = [];
    state.turnPhase = 'awaiting-draw';
    state.currentTurnIndex = 0;

    state = fourCardEngine.applyMove(state, 'A', captureMove('spades-K', 'table', 'hearts-K'));
    expect(state.players[0].hand).toHaveLength(0);
    state = fourCardEngine.nextTurn(state); // A's hand is empty -> skip straight to B, not "one final turn queue"
    expect(state.turnOrder[state.currentTurnIndex]).toBe('B');
  });

  it('table ranks stay unique across a whole A→B→A→B sequence, including a duplicate-rank auto-merge — and every action, merge included, ends the turn on its own (post-draw one-action-per-turn rule)', () => {
    let state = customState({
      handA: [card('K', 'spades'), card('5', 'diamonds')],
      handB: [card('K', 'clubs'), card('9', 'hearts')],
      table: [card('K', 'hearts')],
      drawPile: [],
      turnPhase: 'awaiting-draw',
      currentTurnIndex: 0,
    });

    // A discards K — duplicates the table's K, auto-merges (capture
    // semantics) — and per the post-draw one-action-per-turn rule, THIS
    // ALONE ends A's turn immediately (no chaining a second A move).
    state = fourCardEngine.applyMove(state, 'A', { type: 'discard', cardId: 'spades-K' });
    expect(state.tableCards).toHaveLength(0); // the only table card just got captured away
    expect(state.players[0].hand).toHaveLength(1);
    expect(state.turnOrder[state.currentTurnIndex]).toBe('B');

    // B discards K — table is empty right now, so no duplicate; a genuine discard, passes the turn.
    state = fourCardEngine.applyMove(state, 'B', { type: 'discard', cardId: 'clubs-K' });
    expect(state.tableCards.map((c) => c.cardId)).toEqual(['clubs-K']);
    expect(state.turnOrder[state.currentTurnIndex]).toBe('A');

    // A discards their last card, 5 — no duplicate, genuine discard, passes the turn.
    state = fourCardEngine.applyMove(state, 'A', { type: 'discard', cardId: 'diamonds-5' });
    expect(state.tableCards.map((c) => c.cardId).sort()).toEqual(['clubs-K', 'diamonds-5'].sort());
    expect(state.players[0].hand).toHaveLength(0);
    expect(state.turnOrder[state.currentTurnIndex]).toBe('B');

    // B discards their last card, 9 — no duplicate, genuine discard, passes the turn.
    state = fourCardEngine.applyMove(state, 'B', { type: 'discard', cardId: 'hearts-9' });
    expect(state.players[1].hand).toHaveLength(0);

    const ranks = state.tableCards.map((c) => c.rank);
    expect(new Set(ranks).size).toBe(ranks.length); // still unique throughout

    // Both hands are now genuinely empty — the game actually finishes here.
    state = fourCardEngine.nextTurn(state);
    expect(state.phase).toBe('complete');
  });

  it('exact regression scenario: A draws the last card (post-draw phase begins), then A and B alternate exactly ONE hand-card action each — hand counts persist and evolve naturally, never resetting — until both hands are empty', () => {
    // B's own preceding turn (drew, found no match, discarded) isn't
    // simulated move-for-move — it's not needed to prove the rule this test
    // targets, which is everything from the moment A draws the pile's last
    // card onward. The state starts exactly where that moment leaves off.
    let state = customState({
      handA: [card('2', 'spades'), card('3', 'spades'), card('4', 'spades'), card('5', 'spades')],
      handB: [card('7', 'hearts'), card('8', 'hearts'), card('9', 'hearts'), card('10', 'hearts')],
      table: [card('A', 'clubs')], // a rank none of the below cards ever matches — keeps every action a plain discard
      drawPile: [card('6', 'spades')], // the single remaining draw card
      turnPhase: 'awaiting-draw',
      currentTurnIndex: 0, // A's turn
    });

    // A draws the LAST card — post-draw phase begins right here.
    state = fourCardEngine.applyMove(state, 'A', { type: 'draw' });
    expect(state.drawPile).toHaveLength(0);
    expect(state.players[0].hand).toHaveLength(5); // A = 5
    expect(state.players[1].hand).toHaveLength(4); // B = 4

    const sequence: string[] = [];
    const handCounts: Array<{ a: number; b: number }> = [];
    while (state.phase === 'playing') {
      const current = state.turnOrder[state.currentTurnIndex];
      sequence.push(current);
      const discard = fourCardEngine.getValidMoves(state, current).find((m) => m.type === 'discard')!;
      state = fourCardEngine.applyMove(state, current, discard); // exactly ONE hand card, then the turn already ended
      state = fourCardEngine.nextTurn(state);
      handCounts.push({ a: state.players[0].hand.length, b: state.players[1].hand.length });
    }

    expect(sequence).toEqual(['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A']);
    // Each player's OWN count only ever drops on their OWN turn — the other
    // player's count persists unchanged, never resets (the exact "CRITICAL
    // RULE" the spec calls out: A 5→4, B 4→3, A 4→3 — not A 5→4, B 4→3, A 5→4).
    expect(handCounts).toEqual([
      { a: 4, b: 4 },
      { a: 4, b: 3 },
      { a: 3, b: 3 },
      { a: 3, b: 2 },
      { a: 2, b: 2 },
      { a: 2, b: 1 },
      { a: 1, b: 1 },
      { a: 1, b: 0 },
      { a: 0, b: 0 },
    ]);
    expect(state.phase).toBe('complete');
  });
});
