import type { GameMove } from '../GameEngine.js';
import type { MoveScorer } from '../../ai/types.js';
import { cardValue } from './scoring.js';
import type { CaptureMovePayload, FourCardState } from './types.js';

function collectorOf(state: FourCardState, playerId: string) {
  const player = state.players.find((p) => p.userId === playerId);
  return state.collectors.find((c) => c.collectorId === player?.collectorId);
}

/** Would this capture complete a lock — i.e. does the AI's own collector stack already have 3 of this rank on top? */
function completesLock(state: FourCardState, playerId: string, rank: string): boolean {
  const collector = collectorOf(state, playerId);
  if (!collector) return false;
  const topThree = collector.capturedStack.slice(-3);
  return topThree.length === 3 && topThree.every((c) => c.rank === rank);
}

/** How many cards a stack-target capture would actually transfer — the whole contiguous same-rank run at the top of the target collector's stack (group-capture rule), or 1 for a table target. */
function captureSize(state: FourCardState, payload: CaptureMovePayload): number {
  if (payload.targetType === 'table') return 1;
  const targetCollector = state.collectors.find((c) =>
    c.capturedStack.some((card) => card.cardId === payload.targetCardId),
  );
  if (!targetCollector) return 1;
  const stack = targetCollector.capturedStack;
  const rank = stack.at(-1)?.rank;
  let count = 0;
  for (let i = stack.length - 1; i >= 0 && stack[i].rank === rank; i--) count++;
  return count;
}

/**
 * Four Card's first real per-game heuristic (previously every AI seat here
 * used the neutral fallback). Implements the spec's own AI priority order:
 * a legal capture always outranks a discard (capture is already mandatory
 * whenever one exists, so this only has to rank *among* captures); among
 * captures, targeting a stack denies material and is preferred over an
 * equivalent table capture, weighted further by how many cards the group
 * actually transfers; a capture that completes a lock is prioritized far
 * above any other; discards prefer shedding the lowest-value card, keeping
 * high-value ranks in hand for future captures.
 *
 * Team mode: this deliberately does NOT special-case a teammate's stack —
 * `getValidMoves` never offers a teammate's collector as a target in the
 * first place (see FourCardEngine's opponentCollectorsOf), so there is
 * nothing to protect/help here; the AI just plays its own hand well.
 *
 * Own-stack matching (§1-3): scored like a table capture (no denial bonus —
 * nothing is taken from anyone) plus a small edge over a bare table
 * capture, since it's risk-free progress toward the AI's own lock; the real
 * incentive is still the shared completesLock bonus below.
 */
export const fourCardMoveScorer: MoveScorer<FourCardState> = (
  state: FourCardState,
  playerId: string,
  move: GameMove,
): number => {
  switch (move.type) {
    case 'draw':
      return 0.5; // the only legal move in that phase — score is irrelevant

    case 'discard': {
      const player = state.players.find((p) => p.userId === playerId);
      const card = player?.hand.find((c) => c.cardId === move.cardId);
      // Lower-value cards score HIGHER so they're preferred to shed.
      return 1 - (card ? cardValue(card.rank) / 20 : 0.5);
    }

    case 'capture': {
      const payload = move.payload as CaptureMovePayload;
      const player = state.players.find((p) => p.userId === playerId);
      const handCard = player?.hand.find((c) => c.cardId === move.cardId);
      const rank = handCard?.rank;

      let score = 10; // base: any legal capture beats any discard
      if (payload.targetType === 'stack') {
        score += 2;
        score += (captureSize(state, payload) - 1) * 5; // bigger groups are worth much more
      } else if (payload.targetType === 'own-stack') {
        score += 1; // risk-free progress toward the AI's own lock, but denies nothing
      }
      if (rank && completesLock(state, playerId, rank)) score += 20;
      if (handCard) score += cardValue(handCard.rank) / 20; // small tiebreak toward higher value
      return score;
    }

    default:
      return 0;
  }
};
