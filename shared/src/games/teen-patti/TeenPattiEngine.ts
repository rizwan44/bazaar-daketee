import { DeckEngine } from '../../card-engine/DeckEngine.js';
import { createSeededRng } from '../../card-engine/rng.js';
import type { GameEngine, GameMove, GamePlayerRef, GameResult } from '../GameEngine.js';
import { compareHands, evaluateHand } from './handRanking.js';
import type { TeenPattiPlayerState, TeenPattiState } from './types.js';

const BOOT_AMOUNT = 10;
const DEFAULT_STARTING_BALANCE = 1000;

function chaalAmount(state: TeenPattiState, player: TeenPattiPlayerState): number {
  return player.isSeen ? state.currentStake * 2 : state.currentStake;
}

function raiseAmount(state: TeenPattiState, player: TeenPattiPlayerState): number {
  return player.isSeen ? state.currentStake * 4 : state.currentStake * 2;
}

function activePlayers(state: TeenPattiState): TeenPattiPlayerState[] {
  return state.players.filter((p) => p.status === 'active');
}

function findPlayer(state: TeenPattiState, userId: string): TeenPattiPlayerState {
  const player = state.players.find((p) => p.userId === userId);
  if (!player) throw new Error(`TeenPattiEngine: unknown player ${userId}`);
  return player;
}

function cloneState(state: TeenPattiState): TeenPattiState {
  return { ...state, players: state.players.map((p) => ({ ...p, hand: [...p.hand] })) };
}

function scoresFor(state: TeenPattiState): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const p of state.players) {
    scores[p.userId] = p.userId === state.winnerId ? state.pot - p.totalBet : -p.totalBet;
  }
  return scores;
}

function resultFor(state: TeenPattiState): GameResult | null {
  if (state.phase !== 'complete' || !state.winnerId) return null;
  return { winnerIds: [state.winnerId], scores: scoresFor(state) };
}

function initializeGame(players: GamePlayerRef[], rngSeed: number): TeenPattiState {
  const playerStates: TeenPattiPlayerState[] = players.map((p) => ({
    userId: p.playerId,
    hand: [],
    status: 'active',
    isSeen: false,
    totalBet: BOOT_AMOUNT,
    remainingCoins: (p.startingBalance ?? DEFAULT_STARTING_BALANCE) - BOOT_AMOUNT,
  }));

  return {
    deckId: `teen-patti-${rngSeed}`,
    rngSeed,
    pot: BOOT_AMOUNT * players.length,
    currentStake: BOOT_AMOUNT,
    bootAmount: BOOT_AMOUNT,
    players: playerStates,
    turnOrder: players.map((p) => p.playerId),
    currentTurnIndex: 0,
    phase: 'betting',
    winnerId: null,
    revealedHands: null,
  };
}

function dealCards(state: TeenPattiState): TeenPattiState {
  const deck = new DeckEngine(state.deckId, createSeededRng(state.rngSeed));
  deck.shuffle();
  deck.deal(state.turnOrder, 3);

  const next = cloneState(state);
  for (const player of next.players) {
    player.hand = deck.getHand(player.userId);
  }
  return next;
}

function getValidMoves(state: TeenPattiState, playerId: string): GameMove[] {
  if (state.phase !== 'betting') return [];
  if (state.turnOrder[state.currentTurnIndex] !== playerId) return [];

  const player = state.players.find((p) => p.userId === playerId);
  if (!player || player.status !== 'active') return [];

  const moves: GameMove[] = [{ type: 'fold' }];
  if (!player.isSeen) moves.push({ type: 'see' });

  const chaal = chaalAmount(state, player);
  const raise = raiseAmount(state, player);
  if (player.remainingCoins >= chaal) moves.push({ type: 'chaal' });
  if (player.remainingCoins >= raise) moves.push({ type: 'raise' });

  if (activePlayers(state).length === 2 && player.remainingCoins >= chaal) {
    moves.push({ type: 'show' });
  }

  return moves;
}

function validateMove(
  state: TeenPattiState,
  playerId: string,
  move: GameMove,
): { valid: boolean; reason?: string } {
  const valid = getValidMoves(state, playerId).some((m) => m.type === move.type);
  return valid ? { valid: true } : { valid: false, reason: `${move.type} is not a legal move right now` };
}

function applyMove(state: TeenPattiState, playerId: string, move: GameMove): TeenPattiState {
  const { valid, reason } = validateMove(state, playerId, move);
  if (!valid) throw new Error(`TeenPattiEngine: invalid move - ${reason}`);

  const next = cloneState(state);
  const player = findPlayer(next, playerId);

  switch (move.type) {
    case 'see': {
      player.isSeen = true;
      break;
    }
    case 'fold': {
      player.status = 'folded';
      break;
    }
    case 'chaal': {
      const amount = chaalAmount(state, player);
      player.remainingCoins -= amount;
      player.totalBet += amount;
      next.pot += amount;
      break;
    }
    case 'raise': {
      const amount = raiseAmount(state, player);
      player.remainingCoins -= amount;
      player.totalBet += amount;
      next.pot += amount;
      next.currentStake = state.currentStake * 2;
      break;
    }
    case 'show': {
      const amount = chaalAmount(state, player);
      player.remainingCoins -= amount;
      player.totalBet += amount;
      next.pot += amount;

      const [p1, p2] = activePlayers(next);
      const cmp = compareHands(evaluateHand(p1.hand), evaluateHand(p2.hand));
      next.winnerId = cmp >= 0 ? p1.userId : p2.userId;
      next.phase = 'complete';
      next.revealedHands = { [p1.userId]: p1.hand, [p2.userId]: p2.hand };
      break;
    }
    default:
      throw new Error(`TeenPattiEngine: unhandled move type ${move.type}`);
  }

  if (move.type === 'fold') {
    const remaining = activePlayers(next);
    if (remaining.length === 1) {
      const winner = remaining[0];
      next.winnerId = winner.userId;
      next.phase = 'complete';
      next.revealedHands = { [winner.userId]: winner.hand };
    }
  }

  return next;
}

function nextTurn(state: TeenPattiState): TeenPattiState {
  if (state.phase !== 'betting') return state;

  const seatCount = state.turnOrder.length;
  for (let step = 1; step <= seatCount; step++) {
    const idx = (state.currentTurnIndex + step) % seatCount;
    const candidate = findPlayer(state, state.turnOrder[idx]);
    if (candidate.status === 'active') {
      return { ...state, currentTurnIndex: idx };
    }
  }
  return state;
}

function calculateScore(state: TeenPattiState): Record<string, number> {
  return scoresFor(state);
}

function checkWinner(state: TeenPattiState): GameResult | null {
  return resultFor(state);
}

function finishGame(state: TeenPattiState): GameResult {
  const result = resultFor(state);
  if (!result) throw new Error('TeenPattiEngine: finishGame called before the hand completed');
  return result;
}

export const teenPattiEngine: GameEngine<TeenPattiState> = {
  gameKey: 'teen-patti',
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
