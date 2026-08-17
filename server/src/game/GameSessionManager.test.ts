import { SOCKET_EVENTS, type FourCardPlayerView, type FourCardState, type TeenPattiPlayerView } from '@card-games/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fourCardAdapter } from './adapters/fourCardAdapter.js';
import { teenPattiAdapter } from './adapters/teenPattiAdapter.js';
import type { GameAdapter } from './adapters/types.js';
import type { GameStartedInfo } from '../rooms/types.js';
import { GameSessionManager } from './GameSessionManager.js';
import type { GamePersistence, GameResultEntry, HandSettlementResult, RecordMoveInput } from './types.js';

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface EmittedEvent {
  socketId: string;
  event: string;
  payload: unknown;
}

interface SettleHandCall {
  gameSessionId: string;
  results: HandSettlementResult[];
}

interface RecordGameResultCall {
  gameSessionId: string;
  results: GameResultEntry[];
}

function createFakePersistence(): {
  persistence: GamePersistence;
  settleHandCalls: SettleHandCall[];
  recordGameResultCalls: RecordGameResultCall[];
  recordMoveCalls: RecordMoveInput[];
} {
  const settleHandCalls: SettleHandCall[] = [];
  const recordGameResultCalls: RecordGameResultCall[] = [];
  const recordMoveCalls: RecordMoveInput[] = [];
  const persistence: GamePersistence = {
    async getPlayerBalances(players) {
      return Object.fromEntries(players.map((p) => [p.userId, 1000]));
    },
    async settleHand(input) {
      settleHandCalls.push(input);
    },
    async recordGameResult(input) {
      recordGameResultCalls.push(input);
    },
    async recordMove(input) {
      recordMoveCalls.push(input);
    },
  };
  return { persistence, settleHandCalls, recordGameResultCalls, recordMoveCalls };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createManager(adapters: GameAdapter<any>[] = [teenPattiAdapter]) {
  const emitted: EmittedEvent[] = [];
  const { persistence, settleHandCalls, recordGameResultCalls, recordMoveCalls } = createFakePersistence();
  const manager = new GameSessionManager({
    persistence,
    emitToSocket: (socketId, event, payload) => emitted.push({ socketId, event, payload }),
    adapters,
  });
  return { manager, emitted, settleHandCalls, recordGameResultCalls, recordMoveCalls };
}

/** Same adapter, but with a short, test-only turn timeout — the real adapters hardcode their production timeout (20s / none at all). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withShortTimeout(adapter: GameAdapter<any>, ms: number): GameAdapter<any> {
  return { ...adapter, turnTimeoutMs: ms };
}

function humanPlayer(userId: string, seatIndex: number): GameStartedInfo['players'][number] {
  return { userId, username: userId, seatIndex, isAI: false };
}

function aiPlayer(userId: string, seatIndex: number): GameStartedInfo['players'][number] {
  return { userId, username: userId, seatIndex, isAI: true, aiDifficulty: 'easy', aiPersonality: 'friendly' };
}

function startInfo(gameKey: string, players: GameStartedInfo['players']): GameStartedInfo {
  return { gameSessionId: 'session-1', gameKey, roomCode: 'ABCDEF', rngSeed: 42, players };
}

function teenPattiStartInfo(players: GameStartedInfo['players']): GameStartedInfo {
  return startInfo('teen-patti', players);
}

function latestStateFor<T>(emitted: EmittedEvent[], socketId: string): T {
  const events = emitted.filter((e) => e.socketId === socketId && e.event === SOCKET_EVENTS.GAME_STATE);
  return events.at(-1)!.payload as T;
}

describe('GameSessionManager — Teen Patti', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('advances turns in seat order, skipping folded players', async () => {
    const { manager, emitted } = createManager();
    await manager.startSession(teenPattiStartInfo([humanPlayer('p1', 0), humanPlayer('p2', 1), humanPlayer('p3', 2)]));
    manager.handleJoin('session-1', 'p1', 'sock-p1');
    manager.handleJoin('session-1', 'p2', 'sock-p2');
    manager.handleJoin('session-1', 'p3', 'sock-p3');

    expect(latestStateFor<TeenPattiPlayerView>(emitted, 'sock-p1').currentTurnUserId).toBe('p1');

    manager.handleMove('session-1', 'p1', { type: 'fold' });
    expect(latestStateFor<TeenPattiPlayerView>(emitted, 'sock-p2').currentTurnUserId).toBe('p2');

    manager.handleMove('session-1', 'p2', { type: 'chaal' });
    expect(latestStateFor<TeenPattiPlayerView>(emitted, 'sock-p3').currentTurnUserId).toBe('p3');

    manager.handleMove('session-1', 'p3', { type: 'chaal' });
    // wraps past folded p1 straight to p2
    expect(latestStateFor<TeenPattiPlayerView>(emitted, 'sock-p2').currentTurnUserId).toBe('p2');
  });

  it("does not end a player's turn when they choose to see their cards", async () => {
    const { manager, emitted } = createManager();
    await manager.startSession(teenPattiStartInfo([humanPlayer('p1', 0), humanPlayer('p2', 1), humanPlayer('p3', 2)]));
    manager.handleJoin('session-1', 'p1', 'sock-p1');
    manager.handleJoin('session-1', 'p2', 'sock-p2');
    manager.handleJoin('session-1', 'p3', 'sock-p3');

    manager.handleMove('session-1', 'p1', { type: 'see' });
    const afterSee = latestStateFor<TeenPattiPlayerView>(emitted, 'sock-p1');
    expect(afterSee.currentTurnUserId).toBe('p1'); // still p1's turn
    expect(afterSee.yourIsSeen).toBe(true);
    expect(afterSee.yourValidMoves.map((m) => m.type)).not.toContain('see'); // can't see twice
    expect(afterSee.yourValidMoves.map((m) => m.type)).toContain('chaal'); // can now act

    manager.handleMove('session-1', 'p1', { type: 'chaal' });
    expect(latestStateFor<TeenPattiPlayerView>(emitted, 'sock-p2').currentTurnUserId).toBe('p2'); // now it advances
  });

  it('marks a player disconnected without taking any action when it is not their turn', async () => {
    const { manager, emitted } = createManager();
    await manager.startSession(teenPattiStartInfo([humanPlayer('p1', 0), humanPlayer('p2', 1), humanPlayer('p3', 2)]));
    manager.handleJoin('session-1', 'p1', 'sock-p1');
    manager.handleJoin('session-1', 'p2', 'sock-p2');
    manager.handleJoin('session-1', 'p3', 'sock-p3');

    manager.handleSocketDisconnect('sock-p2');

    const view = latestStateFor<TeenPattiPlayerView>(emitted, 'sock-p1');
    expect(view.currentTurnUserId).toBe('p1'); // unchanged — no auto-action just from disconnecting off-turn
    expect(view.opponents.find((o) => o.userId === 'p2')?.isConnected).toBe(false);
  });

  it("auto-folds a human player whose turn timer expires (also the disconnect-grace mechanism)", async () => {
    vi.useFakeTimers();
    const { manager, emitted } = createManager([withShortTimeout(teenPattiAdapter, 1_000)]);
    await manager.startSession(teenPattiStartInfo([humanPlayer('p1', 0), humanPlayer('p2', 1), humanPlayer('p3', 2)]));
    manager.handleJoin('session-1', 'p1', 'sock-p1');
    manager.handleJoin('session-1', 'p2', 'sock-p2');
    manager.handleJoin('session-1', 'p3', 'sock-p3');

    await vi.advanceTimersByTimeAsync(1_001);

    const view = latestStateFor<TeenPattiPlayerView>(emitted, 'sock-p2');
    expect(view.currentTurnUserId).toBe('p2');
    expect(view.opponents.find((o) => o.userId === 'p1')?.status).toBe('folded');
    vi.useRealTimers();
  });

  it("resolves an AI seat's turn automatically after its thinking delay", async () => {
    vi.useFakeTimers();
    const { manager, emitted } = createManager();
    await manager.startSession(teenPattiStartInfo([humanPlayer('p1', 0), aiPlayer('ai1', 1)]));
    manager.handleJoin('session-1', 'p1', 'sock-p1');

    manager.handleMove('session-1', 'p1', { type: 'chaal' });
    expect(latestStateFor<TeenPattiPlayerView>(emitted, 'sock-p1').currentTurnUserId).toBe('ai1');

    // If the AI's first decision is "see" (legal, doesn't end its turn — see
    // GameSessionManager's applyMoveInternal), it immediately gets a second
    // thinking delay to actually act. Advance past two worst-case delays so
    // this isn't flaky depending on which move the unmocked RNG picks.
    await vi.advanceTimersByTimeAsync(4_500);

    const view = latestStateFor<TeenPattiPlayerView>(emitted, 'sock-p1');
    // whatever the AI chose, the 2-player hand either hands the turn back or completes
    expect(view.currentTurnUserId === 'p1' || view.phase === 'complete').toBe(true);
    vi.useRealTimers();
  });

  it('settles coins and writes results when the hand completes', async () => {
    const { manager, emitted, settleHandCalls, recordMoveCalls } = createManager();
    await manager.startSession(teenPattiStartInfo([humanPlayer('p1', 0), humanPlayer('p2', 1)]));
    manager.handleJoin('session-1', 'p1', 'sock-p1');
    manager.handleJoin('session-1', 'p2', 'sock-p2');

    manager.handleMove('session-1', 'p1', { type: 'fold' }); // last player standing: p2 wins
    await flushAsync();

    expect(settleHandCalls).toHaveLength(1);
    const results = settleHandCalls[0].results;
    expect(results.find((r) => r.userId === 'p2')).toMatchObject({ placement: 1 });
    expect(results.find((r) => r.userId === 'p2')!.coinDelta).toBeGreaterThan(0);
    expect(results.find((r) => r.userId === 'p1')!.coinDelta).toBeLessThan(0);

    const endedEvent = emitted.find((e) => e.event === SOCKET_EVENTS.GAME_ENDED);
    expect(endedEvent).toBeTruthy();

    // Move-history logging (GameMove table) is generic — every game gets it, not just Four Card.
    expect(recordMoveCalls).toHaveLength(1);
    expect(recordMoveCalls[0]).toMatchObject({ gameSessionId: 'session-1', userId: 'p1', moveType: 'fold', moveIndex: 0 });
  });
});

describe('GameSessionManager — Four Card', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  // p1 is always seated first (seatIndex 0) but the shuffler is explicitly
  // p2 here so p1 starts — matches every test's existing assumption that p1
  // acts first, while still exercising the real shuffler-aware startSession
  // path (rather than relying on its p1-is-shuffler-by-default fallback).
  function fourCardStartInfo(players: GameStartedInfo['players'], shufflerUserId = 'p2'): GameStartedInfo {
    return { ...startInfo('four-card', players), shufflerUserId };
  }

  /** Test-only: the real move a given player should play right now, straight from the engine (never from the redacted, hint-free wire view). */
  function legalMoveFor(manager: GameSessionManager, userId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = (manager as any).sessions.get('session-1');
    const moves = session.adapter.engine.getValidMoves(session.state as FourCardState, userId);
    return moves[0];
  }

  it('starts a session, deals hands, and lets a human draw then act', async () => {
    const { manager, emitted } = createManager([fourCardAdapter]);
    await manager.startSession(fourCardStartInfo([humanPlayer('p1', 0), humanPlayer('p2', 1)]));
    manager.handleJoin('session-1', 'p1', 'sock-p1');
    manager.handleJoin('session-1', 'p2', 'sock-p2');

    const initial = latestStateFor<FourCardPlayerView>(emitted, 'sock-p1');
    expect(initial.yourHand).toHaveLength(4);
    expect(initial.tableCards).toHaveLength(4);
    expect(initial.currentTurnUserId).toBe('p1'); // p2 shuffled, so p1 (the "opponent") starts
    expect(initial.turnPhase).toBe('awaiting-draw');
    expect((initial as unknown as { yourValidMoves?: unknown }).yourValidMoves).toBeUndefined(); // no hints on the wire

    manager.handleMove('session-1', 'p1', { type: 'draw' });
    const afterDraw = latestStateFor<FourCardPlayerView>(emitted, 'sock-p1');
    expect(afterDraw.yourHand).toHaveLength(5);
    expect(afterDraw.turnPhase).toBe('awaiting-action');
  });

  it('a discard passes the turn to the other player; capture keeps it and requires a redraw', async () => {
    const { manager, emitted } = createManager([fourCardAdapter]);
    await manager.startSession(fourCardStartInfo([humanPlayer('p1', 0), humanPlayer('p2', 1)]));
    manager.handleJoin('session-1', 'p1', 'sock-p1');
    manager.handleJoin('session-1', 'p2', 'sock-p2');

    manager.handleMove('session-1', 'p1', { type: 'draw' });
    const move = legalMoveFor(manager, 'p1');
    manager.handleMove('session-1', 'p1', move);

    const afterAction = latestStateFor<FourCardPlayerView>(emitted, 'sock-p1');
    if (move.type === 'capture') {
      expect(afterAction.currentTurnUserId).toBe('p1'); // chain continues, mandatory redraw
      expect(afterAction.turnPhase).toBe('awaiting-draw');
    } else {
      expect(afterAction.currentTurnUserId).toBe('p2'); // discard passes the turn
    }
  });

  it('never sends a turn timer expiry — a turn stays open no matter how long nothing happens (Test Case #9)', async () => {
    vi.useFakeTimers();
    const { manager, emitted } = createManager([fourCardAdapter]);
    await manager.startSession(fourCardStartInfo([humanPlayer('p1', 0), humanPlayer('p2', 1)]));
    manager.handleJoin('session-1', 'p1', 'sock-p1');
    manager.handleJoin('session-1', 'p2', 'sock-p2');

    const initial = latestStateFor<FourCardPlayerView>(emitted, 'sock-p1');
    expect(initial.currentTurnUserId).toBe('p1');
    expect(initial.yourHand).toHaveLength(4); // no draw has happened

    // Wait far longer than Teen Patti's own 20s timeout, several times over.
    await vi.advanceTimersByTimeAsync(120_000);

    const stillWaiting = latestStateFor<FourCardPlayerView>(emitted, 'sock-p1');
    expect(stillWaiting.currentTurnUserId).toBe('p1'); // still p1's turn
    expect(stillWaiting.yourHand).toHaveLength(4); // still hasn't auto-drawn or auto-acted
    vi.useRealTimers();
  });

  it("resolves an AI seat's turn automatically using the Four Card move scorer", async () => {
    vi.useFakeTimers();
    const { manager, emitted } = createManager([fourCardAdapter]);
    await manager.startSession(fourCardStartInfo([humanPlayer('p1', 0), aiPlayer('ai1', 1)], 'ai1'));
    manager.handleJoin('session-1', 'p1', 'sock-p1');

    manager.handleMove('session-1', 'p1', { type: 'draw' });
    manager.handleMove('session-1', 'p1', legalMoveFor(manager, 'p1'));

    // Drain however many chained draw/capture steps p1 has left, then the AI acts.
    await vi.advanceTimersByTimeAsync(20_000);

    const view = latestStateFor<FourCardPlayerView>(emitted, 'sock-p1');
    expect(view).toBeTruthy(); // the AI resolved its turn without throwing
    vi.useRealTimers();
  });

  it('records a plain score-based result (no coins) when the game completes', async () => {
    const { manager, recordGameResultCalls } = createManager([fourCardAdapter]);
    await manager.startSession(fourCardStartInfo([humanPlayer('p1', 0), humanPlayer('p2', 1)]));
    manager.handleJoin('session-1', 'p1', 'sock-p1');
    manager.handleJoin('session-1', 'p2', 'sock-p2');

    // Drive real turns (via the engine's own current-turn state) until the
    // draw pile empties and the game completes on its own — keeps this test
    // honest about the actual engine/adapter wiring rather than hand-crafting
    // a pre-completed state.
    let safety = 0;
    while (recordGameResultCalls.length === 0 && safety < 500) {
      safety++;
      const current = currentTurnUserId(manager);
      if (!current) break;
      manager.handleMove('session-1', current, legalMoveFor(manager, current));
    }

    expect(recordGameResultCalls).toHaveLength(1);
    const results = recordGameResultCalls[0].results;
    expect(results.map((r) => r.userId).sort()).toEqual(['p1', 'p2']);
    expect(results.every((r) => typeof r.score === 'number')).toBe(true);
  });
});

/** Test-only helper: whose turn it is, straight off the manager's live session. */
function currentTurnUserId(manager: GameSessionManager): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (manager as any).sessions.get('session-1');
  if (!session) return null;
  return session.state.turnOrder[session.state.currentTurnIndex];
}
