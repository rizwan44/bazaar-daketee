import type { GameMove } from '../games/GameEngine.js';

export const AI_DIFFICULTIES = ['easy', 'normal', 'hard', 'expert'] as const;
export type AIDifficulty = (typeof AI_DIFFICULTIES)[number];

export const AI_PERSONALITIES = ['friendly', 'aggressive', 'defensive', 'smart', 'funny'] as const;
export type AIPersonality = (typeof AI_PERSONALITIES)[number];

export interface AIConfig {
  difficulty: AIDifficulty;
  personality: AIPersonality;
}

export interface ScoredMove {
  move: GameMove;
  score: number;
}

/**
 * Per-game move-scoring heuristic, supplied once that game's rules ship.
 * Until then `AIController` falls back to a neutral scorer (every legal
 * move equally likely) — it never invents strategy for a game it doesn't
 * understand.
 */
export type MoveScorer<TState> = (state: TState, playerId: string, move: GameMove) => number;
