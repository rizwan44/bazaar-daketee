import type { Rng } from '../card-engine/rng.js';
import type { AIDifficulty } from './types.js';

const MIN_MS = 500;
const MAX_MS = 2000;

// Expert opponents "know what they want" a little faster; easy ones dawdle —
// small, honest touch that keeps AI turns from feeling robotic either way.
const DIFFICULTY_SPEED: Record<AIDifficulty, number> = {
  easy: 1,
  normal: 0.85,
  hard: 0.7,
  expert: 0.55,
};

/** A human-like randomized delay (ms) before the AI's move is applied. */
export function randomThinkingDelayMs(rng: Rng, difficulty: AIDifficulty = 'normal'): number {
  const base = MIN_MS + rng() * (MAX_MS - MIN_MS);
  return Math.round(base * DIFFICULTY_SPEED[difficulty]);
}
