import type { FourCardPlayerView } from '@card-games/shared';
import { createSeededRng } from '@card-games/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as socketService from '../services/socket';
import { useGameStore } from '../store/gameStore';
import { useRoomStore } from '../store/roomStore';
import { isLocalSessionActive, leaveLocalGame, requestLocalRematch, sendLocalMove, startLocalGame } from './LocalGameSession';

/** Always makes a legal move using only what's on the public wire view — draws when required, otherwise discards the first hand card (always legal per the engine's own "matching is optional" rule). Mirrors how a real (if unambitious) human would play. */
function playOneHumanTurnIfPossible(): boolean {
  const view = useGameStore.getState().view as FourCardPlayerView | null;
  if (!view || view.phase !== 'playing' || view.currentTurnUserId !== view.yourUserId) return false;

  if (view.turnPhase === 'awaiting-draw' && view.drawPileCount > 0) {
    sendLocalMove('draw');
  } else if (view.yourHand.length > 0) {
    sendLocalMove('discard', { cardId: view.yourHand[0].cardId });
  } else {
    return false;
  }
  return true;
}

describe('LocalGameSession', () => {
  beforeEach(() => {
    leaveLocalGame();
    vi.useFakeTimers();
  });

  afterEach(() => {
    leaveLocalGame();
    vi.useRealTimers();
  });

  it('runs a full offline 2-player game against AI to completion, never touching the network', () => {
    const getSocketSpy = vi.spyOn(socketService, 'getSocket');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    startLocalGame({
      mode: 'two-player',
      difficulty: 'expert',
      personality: 'smart',
      rng: createSeededRng(42),
      aiDelayMs: () => 0,
    });

    expect(isLocalSessionActive()).toBe(true);
    expect(useGameStore.getState().view).not.toBeNull();
    expect(useRoomStore.getState().room?.code).toBe('LOCAL');

    let guard = 0;
    while (useGameStore.getState().view?.phase !== 'complete' && guard < 1000) {
      guard++;
      vi.runAllTimers(); // flush any pending AI move
      playOneHumanTurnIfPossible();
    }

    expect(guard).toBeLessThan(1000); // sanity: the game actually finished, this isn't silently looping forever
    expect(useGameStore.getState().view?.phase).toBe('complete');
    expect(useGameStore.getState().ended).not.toBeNull();
    expect(useRoomStore.getState().room?.status).toBe('finished');
    expect(getSocketSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('runs a full 4-player-team offline game to completion', () => {
    startLocalGame({
      mode: 'four-team',
      difficulty: 'expert',
      personality: 'smart',
      rng: createSeededRng(7),
      aiDelayMs: () => 0,
    });

    let guard = 0;
    while (useGameStore.getState().view?.phase !== 'complete' && guard < 1000) {
      guard++;
      vi.runAllTimers();
      playOneHumanTurnIfPossible();
    }

    expect(guard).toBeLessThan(1000);
    expect(useGameStore.getState().view?.phase).toBe('complete');
    expect(useGameStore.getState().ended).not.toBeNull();
  });

  it('requestLocalRematch starts a fresh game reusing the same seats, without touching the network', () => {
    const getSocketSpy = vi.spyOn(socketService, 'getSocket');

    startLocalGame({
      mode: 'two-player',
      difficulty: 'expert',
      personality: 'smart',
      rng: createSeededRng(1),
      aiDelayMs: () => 0,
    });
    const firstRoomPlayers = useRoomStore.getState().room?.players.map((p) => p.userId).sort();

    let guard = 0;
    while (useGameStore.getState().view?.phase !== 'complete' && guard < 1000) {
      guard++;
      vi.runAllTimers();
      playOneHumanTurnIfPossible();
    }
    expect(useGameStore.getState().view?.phase).toBe('complete');

    requestLocalRematch();

    expect(useGameStore.getState().view?.phase).toBe('playing');
    expect(useRoomStore.getState().room?.status).toBe('in_progress');
    expect(useRoomStore.getState().room?.players.map((p) => p.userId).sort()).toEqual(firstRoomPlayers);
    expect(getSocketSpy).not.toHaveBeenCalled();
  });

  it('leaveLocalGame tears the session down and clears the stores', () => {
    startLocalGame({ mode: 'two-player', difficulty: 'expert', personality: 'smart', aiDelayMs: () => 0 });
    expect(isLocalSessionActive()).toBe(true);

    leaveLocalGame();

    expect(isLocalSessionActive()).toBe(false);
    expect(useGameStore.getState().view).toBeNull();
    expect(useRoomStore.getState().room).toBeNull();
  });
});
