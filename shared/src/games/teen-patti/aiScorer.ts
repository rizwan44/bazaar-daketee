import type { GameMove } from '../GameEngine.js';
import type { MoveScorer } from '../../ai/types.js';
import { evaluateHand } from './handRanking.js';
import type { TeenPattiState } from './types.js';

/** 0 (weakest possible) .. 1 (strongest possible), using hand category plus a small in-category nudge. */
function handStrength(state: TeenPattiState, playerId: string): number {
  const player = state.players.find((p) => p.userId === playerId);
  if (!player || player.hand.length !== 3) return 0.5;

  const rank = evaluateHand(player.hand);
  const categoryScore = (rank.category - 1) / 5;
  const tiebreakNudge = (rank.tiebreak[0] ?? 0) / 14 / 5;
  return Math.min(1, categoryScore + tiebreakNudge);
}

/**
 * First real per-game heuristic `AIController` (Phase 3) has ever received —
 * everything before this used the neutral fallback. Scores each legal move
 * by how much the AI's current hand strength favors it: strong hands prefer
 * chaal/raise/show, weak hands prefer folding.
 */
export const teenPattiMoveScorer: MoveScorer<TeenPattiState> = (
  state: TeenPattiState,
  playerId: string,
  move: GameMove,
): number => {
  const strength = handStrength(state, playerId);
  switch (move.type) {
    case 'fold':
      return 1 - strength;
    case 'see':
      return 0.4;
    case 'chaal':
      return strength * 0.9;
    case 'raise':
      return strength;
    case 'show':
      return strength;
    default:
      return 0;
  }
};
