import { DeckEngine } from '../../card-engine/DeckEngine.js';
import { createSeededRng } from '../../card-engine/rng.js';
import type { Card } from '../../card-engine/types.js';
import type { GameEngine, GameMove, GamePlayerRef, GameResult } from '../GameEngine.js';
import { handValue } from './scoring.js';
import type {
  CaptureMovePayload,
  FourCardCollectorState,
  FourCardGameMode,
  FourCardPlayerState,
  FourCardState,
} from './types.js';

/** Not a real seat — just a bucket to deal the 4 face-up table cards through the same `DeckEngine.deal` call. */
const TABLE_PSEUDO_PLAYER = '__table__';
const HAND_SIZE = 4;

function findPlayer(state: FourCardState, userId: string): FourCardPlayerState {
  const player = state.players.find((p) => p.userId === userId);
  if (!player) throw new Error(`FourCardEngine: unknown player ${userId}`);
  return player;
}

function findCollector(state: FourCardState, collectorId: string): FourCardCollectorState {
  const collector = state.collectors.find((c) => c.collectorId === collectorId);
  if (!collector) throw new Error(`FourCardEngine: unknown collector ${collectorId}`);
  return collector;
}

function collectorOfPlayer(state: FourCardState, userId: string): FourCardCollectorState {
  return findCollector(state, findPlayer(state, userId).collectorId);
}

/**
 * Every collector a player can legally target — every OTHER collector in
 * the game. In 2P that's the 1 opponent; in 4P-individual it's the other 3
 * players; in 4P-team it's the 1 opposing team (a player's own teammate
 * shares their own collectorId, so it's excluded automatically here — no
 * special-case code needed to stop teammates "capturing" their own shared
 * stack, see the plan's Context section).
 */
function opponentCollectorsOf(state: FourCardState, player: FourCardPlayerState): FourCardCollectorState[] {
  return state.collectors.filter((c) => c.collectorId !== player.collectorId);
}

/** The contiguous run of same-rank cards at the top of a stack — what a single matching capture takes, per the group-capture rule (only applies to collector stacks, never the table — see computeLegalCaptures). */
function topSameRankGroup(stack: Card[]): Card[] {
  if (stack.length === 0) return [];
  const rank = stack.at(-1)!.rank;
  let i = stack.length - 1;
  while (i >= 0 && stack[i].rank === rank) i--;
  return stack.slice(i + 1);
}

function cloneState(state: FourCardState): FourCardState {
  return {
    ...state,
    drawPile: state.drawPile.map((c) => ({ ...c })),
    tableCards: state.tableCards.map((c) => ({ ...c })),
    turnOrder: [...state.turnOrder],
    winnerIds: [...state.winnerIds],
    players: state.players.map((p) => ({ ...p, hand: p.hand.map((c) => ({ ...c })) })),
    collectors: state.collectors.map((c) => ({
      ...c,
      capturedStack: c.capturedStack.map((card) => ({ ...card })),
      finalizedCards: c.finalizedCards.map((card) => ({ ...card })),
      lockedGroups: c.lockedGroups.map((group) => group.map((card) => ({ ...card }))),
    })),
  };
}

function initializeGame(players: GamePlayerRef[], rngSeed: number): FourCardState {
  const mode: FourCardGameMode = players.some((p) => p.teamId)
    ? 'four-team'
    : players.length === 4
      ? 'four-individual'
      : 'two-player';

  const collectorIdOf = (p: GamePlayerRef): string => (mode === 'four-team' ? p.teamId! : p.playerId);
  const collectorIds = [...new Set(players.map(collectorIdOf))];

  const shuffler = players.find((p) => p.isShuffler);
  const shufflerUserId = shuffler?.playerId ?? players[0].playerId;

  const turnOrder = players.map((p) => p.playerId);
  // The shuffler never takes the first turn — start on the seat right after them.
  const shufflerIdx = Math.max(0, turnOrder.indexOf(shufflerUserId));
  const currentTurnIndex = (shufflerIdx + 1) % turnOrder.length;

  return {
    mode,
    deckId: `four-card-${rngSeed}`,
    rngSeed,
    drawPile: [],
    tableCards: [],
    players: players.map((p) => ({ userId: p.playerId, hand: [], collectorId: collectorIdOf(p) })),
    collectors: collectorIds.map((id) => ({
      collectorId: id,
      capturedStack: [],
      finalizedCards: [],
      lockedGroups: [],
    })),
    turnOrder,
    currentTurnIndex,
    shufflerUserId,
    turnPhase: 'awaiting-draw',
    phase: 'playing',
    winnerIds: [],
  };
}

/**
 * The table can never hold two cards of the same rank (see the discard-time
 * rule in applyMove) — that invariant has to hold from the very first deal
 * too, but a plain round-robin deal can coincidentally hand the table two
 * same-rank cards (measured ~32% of deals). Fix any duplicate in place by
 * swapping it for the next not-yet-used-rank card still in the draw pile —
 * the rejected card goes back into the pile rather than vanishing, so the
 * deck stays exactly 52 real cards throughout; only the table's contents
 * change, player hands are never touched.
 */
function ensureUniqueTableRanks(state: FourCardState): void {
  const usedRanks = new Set<string>();
  for (let i = 0; i < state.tableCards.length; i++) {
    const card = state.tableCards[i];
    if (!usedRanks.has(card.rank)) {
      usedRanks.add(card.rank);
      continue;
    }
    const swapIdx = state.drawPile.findIndex((c) => !usedRanks.has(c.rank));
    if (swapIdx === -1) break; // no unused rank left undealt — can't happen with 13 ranks and a 4-card table, guard anyway
    const [replacement] = state.drawPile.splice(swapIdx, 1, card);
    replacement.owner = null;
    state.tableCards[i] = replacement;
    usedRanks.add(replacement.rank);
  }
}

function dealCards(state: FourCardState): FourCardState {
  const deck = new DeckEngine(state.deckId, createSeededRng(state.rngSeed));
  deck.shuffle();
  deck.deal([...state.turnOrder, TABLE_PSEUDO_PLAYER], HAND_SIZE);

  const next = cloneState(state);
  for (const player of next.players) {
    player.hand = deck.getHand(player.userId);
  }
  next.tableCards = deck.getHand(TABLE_PSEUDO_PLAYER).map((c) => ({ ...c, owner: null }));
  next.drawPile = [...deck.getDrawPile()];
  ensureUniqueTableRanks(next);
  return next;
}

/**
 * Every legal (handCardId -> target) capture available to this player
 * right now. Rank-only matching, no suit involved. Table targets are
 * single-card (the table is a loose pile, not a stack). Collector-stack
 * targets (opponent's OR the player's own — see §1-3) capture the WHOLE
 * contiguous same-rank group at the top of that stack, not just the one
 * card visually on top — this is the group-capture rule (a mandatory
 * correction of the previous single-card-only behavior). A player's own
 * top card is a legal target too: it doesn't move anywhere (it's already
 * theirs), the hand card just joins it on top — see applyMove's 'own-stack'
 * branch.
 */
function computeLegalCaptures(state: FourCardState, player: FourCardPlayerState): GameMove[] {
  const myCollector = collectorOfPlayer(state, player.userId);
  const opponentCollectors = opponentCollectorsOf(state, player);
  const moves: GameMove[] = [];

  for (const handCard of player.hand) {
    for (const tableCard of state.tableCards) {
      if (tableCard.rank === handCard.rank) {
        const payload: CaptureMovePayload = { targetType: 'table', targetCardId: tableCard.cardId };
        moves.push({ type: 'capture', cardId: handCard.cardId, payload });
      }
    }
    for (const collector of opponentCollectors) {
      const top = collector.capturedStack.at(-1);
      if (top && top.rank === handCard.rank) {
        const payload: CaptureMovePayload = { targetType: 'stack', targetCardId: top.cardId };
        moves.push({ type: 'capture', cardId: handCard.cardId, payload });
      }
    }
    const ownTop = myCollector.capturedStack.at(-1);
    if (ownTop && ownTop.rank === handCard.rank) {
      const payload: CaptureMovePayload = { targetType: 'own-stack', targetCardId: ownTop.cardId };
      moves.push({ type: 'capture', cardId: handCard.cardId, payload });
    }
  }
  return moves;
}

function getValidMoves(state: FourCardState, playerId: string): GameMove[] {
  if (state.phase !== 'playing') return [];
  if (state.turnOrder[state.currentTurnIndex] !== playerId) return [];

  const player = findPlayer(state, playerId);

  if (state.turnPhase === 'awaiting-draw' && state.drawPile.length > 0) {
    return [{ type: 'draw' }]; // the only thing possible before drawing, when a draw exists
  }

  // Either just-drawn (5 cards) or final resolution (no draw available, whatever's
  // left in hand) — same rule either way: matching is OPTIONAL, never mandatory.
  // Every legal capture AND every legal discard are offered together; the player
  // picks freely (§6-9/§44-45 — a deliberate reversal of the earlier
  // mandatory-capture rule). By the time it's actually this player's turn,
  // `nextTurn` has already guaranteed their hand isn't empty (see its own doc
  // comment) — this never returns empty for whoever the state says is up next.
  const captures = computeLegalCaptures(state, player);
  const discards = player.hand.map((c) => ({ type: 'discard', cardId: c.cardId }));
  return [...captures, ...discards];
}

function movesEqual(a: GameMove, b: GameMove): boolean {
  if (a.type !== b.type || a.cardId !== b.cardId) return false;
  if (a.type !== 'capture') return true;
  const ap = a.payload as CaptureMovePayload | undefined;
  const bp = b.payload as CaptureMovePayload | undefined;
  return ap?.targetType === bp?.targetType && ap?.targetCardId === bp?.targetCardId;
}

function validateMove(
  state: FourCardState,
  playerId: string,
  move: GameMove,
): { valid: boolean; reason?: string } {
  const valid = getValidMoves(state, playerId).some((m) => movesEqual(m, move));
  return valid ? { valid: true } : { valid: false, reason: `${move.type} is not a legal move right now` };
}

/** If the top 4 cards of this collector's stack share a rank, lock them (and finalize everything beneath them) and reset the stack. Still correct when a single capture pushes more than 2 cards at once (a 3-card group + the capturing hand card can complete a lock in one move) — `slice(-4)` catches it regardless of how many cards just landed. */
function applyLockDetection(collector: FourCardCollectorState): void {
  const stack = collector.capturedStack;
  if (stack.length < 4) return;

  const topFour = stack.slice(-4);
  const rank = topFour[0].rank;
  if (!topFour.every((c) => c.rank === rank)) return;

  const below = stack.slice(0, stack.length - 4);
  collector.finalizedCards.push(...below);
  collector.lockedGroups.push(topFour);
  collector.capturedStack = [];
}

/**
 * What happens to the turn after a capture-semantics action (a real
 * capture, an own-stack match, or a discard that auto-resolved into a
 * capture because its rank duplicated an existing table card) resolves.
 * Phase 1 (draw pile still has cards): capturing never ends the turn by
 * itself — the existing rules mandate an immediate redraw, so the same
 * player keeps their turn. Phase 2 / "post-draw phase" (draw pile empty):
 * there's nothing left to redraw, and the post-draw rule is stricter — every
 * hand-card action, capture or discard alike, consumes exactly ONE card and
 * ends the turn immediately. Without this, a player could chain multiple
 * captures in a single turn once the pile ran dry, which is the exact bug
 * this rule exists to prevent.
 */
function resolveTurnAfterCaptureLikeAction(next: FourCardState): void {
  if (next.drawPile.length === 0) {
    next.currentTurnIndex = (next.currentTurnIndex + 1) % next.turnOrder.length;
  }
  next.turnPhase = 'awaiting-draw';
}

function applyMove(state: FourCardState, playerId: string, move: GameMove): FourCardState {
  const { valid, reason } = validateMove(state, playerId, move);
  if (!valid) throw new Error(`FourCardEngine: invalid move - ${reason}`);

  const next = cloneState(state);
  const player = findPlayer(next, playerId);
  const myCollector = collectorOfPlayer(next, playerId);

  switch (move.type) {
    case 'draw': {
      const card = next.drawPile.shift();
      if (!card) throw new Error('FourCardEngine: draw pile is empty');
      card.owner = playerId;
      player.hand.push(card);
      next.turnPhase = 'awaiting-action';
      break;
    }

    case 'capture': {
      const handIdx = player.hand.findIndex((c) => c.cardId === move.cardId);
      const handCard = player.hand.splice(handIdx, 1)[0];

      const { targetType, targetCardId } = move.payload as CaptureMovePayload;

      if (targetType === 'own-stack') {
        // The target is already in the capturer's own stack — nothing to
        // move out of anywhere. Only the hand card joins, extending
        // whatever same-rank run was already on top.
        handCard.owner = playerId;
        myCollector.capturedStack.push(handCard);
        applyLockDetection(myCollector);
        resolveTurnAfterCaptureLikeAction(next);
        break;
      }

      let capturedCards: Card[];
      if (targetType === 'table') {
        const idx = next.tableCards.findIndex((c) => c.cardId === targetCardId);
        capturedCards = next.tableCards.splice(idx, 1);
      } else {
        const targetCollector = next.collectors.find((c) =>
          c.capturedStack.some((card) => card.cardId === targetCardId),
        )!;
        // Group capture: the WHOLE contiguous same-rank run at the top of
        // that stack transfers together, not just the touched card.
        const group = topSameRankGroup(targetCollector.capturedStack);
        targetCollector.capturedStack.splice(targetCollector.capturedStack.length - group.length, group.length);
        capturedCards = group;
      }

      capturedCards.forEach((c) => (c.owner = playerId));
      handCard.owner = playerId;
      // The captured group (existing rule) joins the capturer's stack
      // first, then the capturing hand card lands on top — this was
      // already confirmed for the single-card case ("dono cards player ke
      // stack mein jate hain") and is extended unchanged to groups: a card
      // can't simply vanish, so the hand card always joins alongside
      // whatever it captured.
      myCollector.capturedStack.push(...capturedCards, handCard);
      applyLockDetection(myCollector);

      resolveTurnAfterCaptureLikeAction(next);
      break;
    }

    case 'discard': {
      const idx = player.hand.findIndex((c) => c.cardId === move.cardId);
      const card = player.hand.splice(idx, 1)[0];

      // The table can never hold two cards of the same rank (rank-only
      // matching means a second same-rank card would be an unresolvable
      // duplicate, not a real table state). A "discard" whose rank already
      // sits on the table isn't a real discard at all — it silently
      // resolves as a capture of that existing card instead, exactly like
      // dragging straight onto it, regardless of where in the table zone it
      // was actually dropped (drop precision must never matter here).
      const duplicateIdx = next.tableCards.findIndex((c) => c.rank === card.rank);
      if (duplicateIdx !== -1) {
        const [existingCard] = next.tableCards.splice(duplicateIdx, 1);
        existingCard.owner = playerId;
        card.owner = playerId;
        myCollector.capturedStack.push(existingCard, card);
        applyLockDetection(myCollector);
        resolveTurnAfterCaptureLikeAction(next);
        break;
      }

      card.owner = null;
      next.tableCards.push(card);

      // A genuine discard is the only move that passes the turn.
      next.currentTurnIndex = (next.currentTurnIndex + 1) % next.turnOrder.length;
      next.turnPhase = 'awaiting-draw';
      break;
    }

    default:
      throw new Error(`FourCardEngine: unhandled move type ${move.type}`);
  }

  return next;
}

/** Collector-level totals — exported (beyond the standard GameEngine interface) so the server adapter can build a collector-keyed wire payload (e.g. one score per team, not duplicated per teammate) without recomputing this itself. */
export function computeCollectorScores(state: FourCardState): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const collector of state.collectors) {
    const lockedValue = collector.lockedGroups.reduce((sum, group) => sum + handValue(group), 0);
    scores[collector.collectorId] =
      handValue(collector.capturedStack) + handValue(collector.finalizedCards) + lockedValue;
  }
  return scores;
}

/** Per-user totals (GameEngine.calculateScore's contract) — every player's score is their collector's total, duplicated across teammates in team mode. */
function scoresFor(state: FourCardState): Record<string, number> {
  const collectorScores = computeCollectorScores(state);
  const scores: Record<string, number> = {};
  for (const player of state.players) {
    scores[player.userId] = collectorScores[player.collectorId] ?? 0;
  }
  return scores;
}

function finalizeGame(state: FourCardState): FourCardState {
  const next = cloneState(state);
  next.phase = 'complete';

  const collectorScores = computeCollectorScores(next);
  const entries = Object.entries(collectorScores);
  const maxScore = Math.max(...entries.map(([, s]) => s));
  const topCollectorIds = new Set(entries.filter(([, s]) => s === maxScore).map(([id]) => id));
  // A tie produces no winner rather than crediting everyone — see §32/§61.
  next.winnerIds =
    topCollectorIds.size === 1
      ? next.players.filter((p) => topCollectorIds.has(p.collectorId)).map((p) => p.userId)
      : [];

  return next;
}

/**
 * Turn-passing itself is decided entirely inside `applyMove`: a genuine
 * discard always advances `currentTurnIndex`, and — once the draw pile is
 * empty — so does every capture-semantics action, via
 * `resolveTurnAfterCaptureLikeAction` (the post-draw-phase rule: exactly one
 * hand-card action per turn, no chaining). `nextTurn`'s only remaining job
 * is skipping forward over any player(s) whose hand is already genuinely
 * empty — normal rotation (A→B→A→B..., or A→B→C→D→A→B→C→D...) keeps going
 * over anyone who still has cards. An empty draw pile does NOT mean the
 * game is over (§14): whoever's turn it is next simply can't draw, but they
 * may still have hand cards to play. This walks forward until it finds a
 * player who can act, or discovers a full lap with nobody able to — only
 * then does the game actually finish. Since matching is optional (§6-9), a
 * discard is always a legal move for any non-empty hand — the only way a
 * player is truly stuck is an EMPTY hand, not merely "no capture available".
 */
function nextTurn(state: FourCardState): FourCardState {
  if (state.phase !== 'playing') return state;
  if (state.turnPhase !== 'awaiting-draw' || state.drawPile.length > 0) return state;

  let next = state;
  for (let i = 0; i < next.turnOrder.length; i++) {
    const currentUserId = next.turnOrder[next.currentTurnIndex];
    const player = findPlayer(next, currentUserId);
    if (player.hand.length > 0) return next; // this player can still discard (at least) — stop here
    next = { ...next, currentTurnIndex: (next.currentTurnIndex + 1) % next.turnOrder.length };
  }
  return finalizeGame(next); // went all the way around — nobody has anything left to play
}

function calculateScore(state: FourCardState): Record<string, number> {
  return scoresFor(state);
}

function resultFor(state: FourCardState): GameResult | null {
  if (state.phase !== 'complete') return null;
  return { winnerIds: state.winnerIds, scores: scoresFor(state) };
}

function checkWinner(state: FourCardState): GameResult | null {
  return resultFor(state);
}

function finishGame(state: FourCardState): GameResult {
  const result = resultFor(state);
  if (!result) throw new Error('FourCardEngine: finishGame called before the game completed');
  return result;
}

export const fourCardEngine: GameEngine<FourCardState> = {
  gameKey: 'four-card',
  initializeGame,
  dealCards,
  getValidMoves,
  validateMove,
  applyMove,
  nextTurn,
  calculateScore,
  checkWinner,
  finishGame,
};
