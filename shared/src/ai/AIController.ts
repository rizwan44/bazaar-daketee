import type { Rng } from '../card-engine/rng.js';
import type { GameEngine, GameMove } from '../games/GameEngine.js';
import type { AIConfig, AIDifficulty, AIPersonality, MoveScorer, ScoredMove } from './types.js';

// Softmax "temperature": lower = more deterministically picks the top-scored
// move, higher = closer to uniform random among legal moves. `expert` skips
// this entirely (see decide()) and always takes the best move.
const DIFFICULTY_TEMPERATURE: Record<Exclude<AIDifficulty, 'expert'>, number> = {
  easy: 4,
  normal: 1.5,
  hard: 0.4,
};

// Personality only has one honest, game-agnostic lever available before any
// game supplies real move semantics: how much it varies from the top-scored
// pick. What "aggressive" or "defensive" *means* for a given move is up to
// that game's MoveScorer once it ships — this is deliberately not pretending
// to model strategy it has no way to understand yet.
const PERSONALITY_TEMPERATURE_MULTIPLIER: Record<AIPersonality, number> = {
  smart: 0.6,
  aggressive: 0.8,
  defensive: 1.1,
  friendly: 1.3,
  funny: 1.6,
};

function argmaxPick(scored: ScoredMove[]): GameMove {
  return scored.reduce((best, current) => (current.score > best.score ? current : best)).move;
}

function softmaxPick(scored: ScoredMove[], temperature: number, rng: Rng): GameMove {
  if (scored.length === 1) return scored[0].move;

  const maxScore = Math.max(...scored.map((s) => s.score));
  const weights = scored.map((s) => Math.exp((s.score - maxScore) / temperature));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  let roll = rng() * totalWeight;
  for (let i = 0; i < scored.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return scored[i].move;
  }
  return scored[scored.length - 1].move;
}

/**
 * Picks a move for an AI-controlled seat. Only ever sees what `GameEngine`
 * exposes through `getValidMoves` — it has no back-channel into hidden game
 * state, which is what makes "AI can't cheat" a structural guarantee rather
 * than a convention someone has to remember to uphold per game.
 */
export class AIController<TState> {
  constructor(
    private readonly engine: GameEngine<TState>,
    private readonly config: AIConfig,
    private readonly rng: Rng,
    private readonly scorer?: MoveScorer<TState>,
  ) {}

  decide(state: TState, playerId: string): GameMove {
    const validMoves = this.engine.getValidMoves(state, playerId);
    if (validMoves.length === 0) {
      throw new Error('AIController: no valid moves available for this player');
    }

    const scored: ScoredMove[] = validMoves.map((move) => ({
      move,
      // Neutral until a game supplies its own heuristic — every legal move
      // is equally likely rather than the AI inventing a preference.
      score: this.scorer ? this.scorer(state, playerId, move) : 0,
    }));

    if (this.config.difficulty === 'expert') {
      return argmaxPick(scored);
    }

    const temperature =
      DIFFICULTY_TEMPERATURE[this.config.difficulty] *
      PERSONALITY_TEMPERATURE_MULTIPLIER[this.config.personality];
    return softmaxPick(scored, temperature, this.rng);
  }
}
