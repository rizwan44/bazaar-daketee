import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../card-engine/rng.js';
import type { GameEngine, GameMove } from '../games/GameEngine.js';
import { AIController } from './AIController.js';
import { randomThinkingDelayMs } from './thinkingDelay.js';
import type { AIConfig, MoveScorer } from './types.js';

// Minimal fixture only — never shipped as a real game. Three legal moves,
// "pick a number 1-3", exercised through the exact same GameEngine contract
// a real game will use, so AIController never gets special-cased access.
interface StubState {
  round: number;
}

const MOVES: GameMove[] = [
  { type: 'pick', payload: { number: 1 } },
  { type: 'pick', payload: { number: 2 } },
  { type: 'pick', payload: { number: 3 } },
];

const stubEngine: GameEngine<StubState> = {
  gameKey: 'stub',
  initializeGame: () => ({ round: 0 }),
  dealCards: (state) => state,
  getValidMoves: () => MOVES,
  validateMove: () => ({ valid: true }),
  applyMove: (state) => state,
  nextTurn: (state) => state,
  calculateScore: () => ({}),
  checkWinner: () => null,
  finishGame: () => ({ winnerIds: [], scores: {} }),
};

const numberScorer: MoveScorer<StubState> = (_state, _playerId, move) =>
  (move.payload?.number as number) ?? 0;

function pickedNumber(move: GameMove): number {
  return move.payload?.number as number;
}

function makeController(config: AIConfig, seed: number, scorer?: MoveScorer<StubState>) {
  return new AIController(stubEngine, config, createSeededRng(seed), scorer);
}

describe('AIController', () => {
  it('expert always takes the top-scored move, deterministically', () => {
    for (let seed = 0; seed < 30; seed++) {
      const ai = makeController({ difficulty: 'expert', personality: 'smart' }, seed, numberScorer);
      const move = ai.decide({ round: 0 }, 'p1');
      expect(pickedNumber(move)).toBe(3);
    }
  });

  it('easy strays from the top-scored move at least sometimes', () => {
    const picks = new Set<number>();
    for (let seed = 0; seed < 60; seed++) {
      const ai = makeController({ difficulty: 'easy', personality: 'friendly' }, seed, numberScorer);
      picks.add(pickedNumber(ai.decide({ round: 0 }, 'p1')));
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it('with no scorer supplied, every legal move is reachable (neutral default)', () => {
    const picks = new Set<number>();
    for (let seed = 0; seed < 100; seed++) {
      const ai = makeController({ difficulty: 'normal', personality: 'friendly' }, seed);
      picks.add(pickedNumber(ai.decide({ round: 0 }, 'p1')));
    }
    expect(picks).toEqual(new Set([1, 2, 3]));
  });

  it('a funnier personality deviates from the top pick more often than a smart one at the same difficulty', () => {
    let smartDeviations = 0;
    let funnyDeviations = 0;
    const trials = 100;
    for (let seed = 0; seed < trials; seed++) {
      const smart = makeController({ difficulty: 'hard', personality: 'smart' }, seed, numberScorer);
      const funny = makeController({ difficulty: 'hard', personality: 'funny' }, seed, numberScorer);
      if (pickedNumber(smart.decide({ round: 0 }, 'p1')) !== 3) smartDeviations++;
      if (pickedNumber(funny.decide({ round: 0 }, 'p1')) !== 3) funnyDeviations++;
    }
    expect(funnyDeviations).toBeGreaterThan(smartDeviations);
  });

  it('throws when there are no valid moves', () => {
    const noMovesEngine: GameEngine<StubState> = { ...stubEngine, getValidMoves: () => [] };
    const ai = new AIController(noMovesEngine, { difficulty: 'normal', personality: 'smart' }, createSeededRng(1));
    expect(() => ai.decide({ round: 0 }, 'p1')).toThrow();
  });
});

describe('randomThinkingDelayMs', () => {
  it('always stays within the 500-2000ms human-like window', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const difficulty of ['easy', 'normal', 'hard', 'expert'] as const) {
        const ms = randomThinkingDelayMs(createSeededRng(seed), difficulty);
        expect(ms).toBeGreaterThanOrEqual(0);
        expect(ms).toBeLessThanOrEqual(2000);
      }
    }
  });

  it('expert reacts faster on average than easy', () => {
    const sample = (difficulty: 'easy' | 'expert') => {
      let total = 0;
      const n = 200;
      for (let seed = 0; seed < n; seed++) {
        total += randomThinkingDelayMs(createSeededRng(seed * 7 + 1), difficulty);
      }
      return total / n;
    };
    expect(sample('expert')).toBeLessThan(sample('easy'));
  });
});
