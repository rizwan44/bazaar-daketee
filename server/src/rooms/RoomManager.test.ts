import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomManager } from './RoomManager.js';
import type { RoomPersistence } from './types.js';

const RUMMY = 'rummy'; // catalog: 2-6 players

function createFakePersistence() {
  let roomCounter = 0;
  let sessionCounter = 0;
  let aiUserCounter = 0;
  const seatedUserIds = new Set<string>();
  const addGamePlayersCalls: Parameters<RoomPersistence['addGamePlayers']>[0][] = [];
  const persistence: RoomPersistence = {
    async getGameDbId(gameKey) {
      return gameKey === 'unknown-game' ? null : `db-${gameKey}`;
    },
    async createRoom() {
      roomCounter += 1;
      return { id: `room-${roomCounter}` };
    },
    async addPlayer(input) {
      // Mirrors the real unique(roomId, userId) constraint so a persistence
      // bug that reuses the same AI userId for two seats fails loudly here
      // too, instead of only in production against a real MySQL instance.
      const key = `${input.roomId}:${input.userId}`;
      if (seatedUserIds.has(key)) {
        throw new Error(`Unique constraint violation: ${key} already seated`);
      }
      seatedUserIds.add(key);
    },
    async removePlayer() {},
    async setPlayerReady() {},
    async setRoomStatus() {},
    async setRoomHost() {},
    async createGameSession() {
      sessionCounter += 1;
      return { id: `session-${sessionCounter}` };
    },
    async addGamePlayers(input) {
      addGamePlayersCalls.push(input);
    },
    async ensureAIUser(difficulty, personality) {
      // Real impl mints a fresh id every call — see PrismaRoomPersistence's
      // doc comment for why a shared id-per-config would be a bug.
      aiUserCounter += 1;
      return { userId: `ai-${aiUserCounter}`, username: `${personality} AI (${difficulty})` };
    },
  };
  return { persistence, addGamePlayersCalls };
}

interface BroadcastEvent {
  code: string;
  event: string;
  payload: unknown;
}

function createManager(graceMs = 60_000) {
  const events: BroadcastEvent[] = [];
  const { persistence, addGamePlayersCalls } = createFakePersistence();
  const manager = new RoomManager({
    persistence,
    broadcast: (code, event, payload) => events.push({ code, event, payload }),
    disconnectGraceMs: graceMs,
  });
  return { manager, events, addGamePlayersCalls };
}

async function createFilledRoom(manager: RoomManager, playerCount: number) {
  const host = { userId: 'u1', username: 'Host' };
  const state = await manager.createRoom(host, RUMMY, false, 'sock-u1');
  const code = state.code;
  for (let i = 2; i <= playerCount; i++) {
    await manager.joinRoom(code, { userId: `u${i}`, username: `Player${i}` }, `sock-u${i}`);
  }
  return code;
}

describe('RoomManager', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('generates well-formed, unique room codes', async () => {
    const { manager } = createManager();
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const state = await manager.createRoom({ userId: `host${i}`, username: 'H' }, RUMMY, false, `s${i}`);
      expect(state.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
      codes.add(state.code);
    }
    expect(codes.size).toBe(20);
  });

  it('rejects creating a room for an unknown game', async () => {
    const { manager } = createManager();
    await expect(
      manager.createRoom({ userId: 'u1', username: 'H' }, 'unknown-game', false, 's1'),
    ).rejects.toMatchObject({ code: 'UNKNOWN_GAME' });
  });

  it('joins assign the next free seat and reject invalid/full/started rooms', async () => {
    const { manager } = createManager();
    const code = await createFilledRoom(manager, 2);

    await expect(manager.joinRoom('ZZZZZZ', { userId: 'ux', username: 'X' }, 'sx')).rejects.toMatchObject({
      code: 'ROOM_NOT_FOUND',
    });

    const state = await manager.joinRoom(code, { userId: 'u3', username: 'P3' }, 'sock-u3');
    expect(state.players.map((p) => p.seatIndex)).toEqual([0, 1, 2]);

    // fill remaining seats to catalog max (6) then expect ROOM_FULL
    await manager.joinRoom(code, { userId: 'u4', username: 'P4' }, 'sock-u4');
    await manager.joinRoom(code, { userId: 'u5', username: 'P5' }, 'sock-u5');
    await manager.joinRoom(code, { userId: 'u6', username: 'P6' }, 'sock-u6');
    await expect(
      manager.joinRoom(code, { userId: 'u7', username: 'P7' }, 'sock-u7'),
    ).rejects.toMatchObject({ code: 'ROOM_FULL' });

    for (const userId of ['u1', 'u2', 'u3', 'u4', 'u5', 'u6']) {
      await manager.setReady(code, userId, true);
    }
    await manager.startGame(code, 'u1');

    await expect(
      manager.joinRoom(code, { userId: 'u8', username: 'P8' }, 'sock-u8'),
    ).rejects.toMatchObject({ code: 'ALREADY_STARTED' });
  });

  it('start requires host, all-ready, and a valid player count', async () => {
    const { manager } = createManager();
    const code = await createFilledRoom(manager, 2);

    await expect(manager.startGame(code, 'u2')).rejects.toMatchObject({ code: 'NOT_HOST' });
    await expect(manager.startGame(code, 'u1')).rejects.toMatchObject({ code: 'NOT_READY' });

    await manager.setReady(code, 'u1', true);
    await manager.setReady(code, 'u2', true);
    const result = await manager.startGame(code, 'u1');
    expect(result.roomCode).toBe(code);
    expect(result.gameSessionId).toBeTruthy();
  });

  it('rejects starting below the game minimum player count', async () => {
    const { manager } = createManager();
    const host = { userId: 'u1', username: 'Host' };
    const state = await manager.createRoom(host, RUMMY, false, 'sock-u1');
    await manager.setReady(state.code, 'u1', true);

    await expect(manager.startGame(state.code, 'u1')).rejects.toMatchObject({
      code: 'INVALID_PLAYER_COUNT',
    });
  });

  it('marks a disconnected player without removing them, then restores on reattach within the grace window', async () => {
    vi.useFakeTimers();
    const { manager, events } = createManager(60_000);
    const code = await createFilledRoom(manager, 2);

    manager.handleSocketDisconnect('sock-u2');
    let state = manager.getRoomState(code)!;
    expect(state.players.find((p) => p.userId === 'u2')?.isConnected).toBe(false);
    expect(state.players).toHaveLength(2); // not removed yet

    vi.advanceTimersByTime(30_000);
    const reattached = manager.reattachIfReturning('u2', 'sock-u2-new', 'Player2');
    expect(reattached?.players.find((p) => p.userId === 'u2')?.isConnected).toBe(true);

    vi.advanceTimersByTime(60_000); // past the original grace window — should NOT fire since it was cancelled
    state = manager.getRoomState(code)!;
    expect(state.players).toHaveLength(2);
    expect(events.some((e) => e.event === 'room:closed')).toBe(false);
    vi.useRealTimers();
  });

  it('releases the seat and reassigns host after the grace window expires', async () => {
    vi.useFakeTimers();
    const { manager } = createManager(60_000);
    const code = await createFilledRoom(manager, 2); // u1 = host, u2 = player

    manager.handleSocketDisconnect('sock-u1'); // host disconnects
    vi.advanceTimersByTime(60_001);
    await vi.runOnlyPendingTimersAsync();

    const state = manager.getRoomState(code)!;
    expect(state.players.map((p) => p.userId)).toEqual(['u2']);
    expect(state.hostUserId).toBe('u2');
    vi.useRealTimers();
  });

  it('closes the room once the last player leaves', async () => {
    const { manager, events } = createManager();
    const state = await manager.createRoom({ userId: 'u1', username: 'H' }, RUMMY, false, 'sock-u1');
    await manager.leaveRoom(state.code, 'u1');

    expect(manager.getRoomState(state.code)).toBeNull();
    expect(events.at(-1)).toMatchObject({ event: 'room:closed', payload: { reason: 'empty' } });
  });

  it('host can kick a non-host player, who cannot then act on the room', async () => {
    const { manager } = createManager();
    const code = await createFilledRoom(manager, 2);

    await expect(manager.kickPlayer(code, 'u2', 'u1')).rejects.toMatchObject({ code: 'NOT_HOST' });

    const kickedSocketId = await manager.kickPlayer(code, 'u1', 'u2');
    expect(kickedSocketId).toBe('sock-u2');

    const state = manager.getRoomState(code)!;
    expect(state.players.map((p) => p.userId)).toEqual(['u1']);
    await expect(manager.setReady(code, 'u2', true)).rejects.toMatchObject({ code: 'NOT_IN_ROOM' });
  });

  it('only the host can add an AI player, who lands ready and connected in the next free seat', async () => {
    const { manager } = createManager();
    const state = await manager.createRoom({ userId: 'u1', username: 'Host' }, RUMMY, false, 'sock-u1');
    await manager.joinRoom(state.code, { userId: 'u2', username: 'P2' }, 'sock-u2');

    await expect(
      manager.addAIPlayer(state.code, 'u2', { difficulty: 'hard', personality: 'aggressive' }),
    ).rejects.toMatchObject({ code: 'NOT_HOST' });

    const afterAI = await manager.addAIPlayer(state.code, 'u1', {
      difficulty: 'hard',
      personality: 'aggressive',
    });
    const aiPlayer = afterAI.players.find((p) => p.isAI);
    expect(aiPlayer).toMatchObject({
      seatIndex: 2,
      isReady: true,
      isConnected: true,
      aiDifficulty: 'hard',
      aiPersonality: 'aggressive',
    });
  });

  it('a solo room filled entirely with AI seats starts without the host touching their ready state', async () => {
    const { manager, addGamePlayersCalls } = createManager();
    const state = await manager.createRoom({ userId: 'u1', username: 'Host' }, RUMMY, false, 'sock-u1');
    await manager.addAIPlayer(state.code, 'u1', { difficulty: 'easy', personality: 'friendly' });

    // Rummy needs at least 2 players — human still has to ready up themselves.
    await expect(manager.startGame(state.code, 'u1')).rejects.toMatchObject({ code: 'NOT_READY' });
    await manager.setReady(state.code, 'u1', true);
    const result = await manager.startGame(state.code, 'u1');

    expect(result.gameSessionId).toBeTruthy();
    const call = addGamePlayersCalls.at(-1)!;
    const aiEntry = call.players.find((p) => p.isAI)!;
    expect(aiEntry).toMatchObject({ isAI: true, aiDifficulty: 'easy', aiPersonality: 'friendly' });
    const humanEntry = call.players.find((p) => !p.isAI)!;
    expect(humanEntry.aiDifficulty).toBeUndefined();
  });

  it('seats two AI players with identical difficulty and personality as distinct players', async () => {
    // Regression: Solo mode picks one difficulty/personality for every AI
    // seat, so a persistence layer that reused one synthetic user per
    // config (instead of minting a fresh one per seat) would violate the
    // unique(roomId, userId) constraint the moment the second identical
    // seat was added — see PrismaRoomPersistence.ensureAIUser.
    const { manager } = createManager();
    const state = await manager.createRoom({ userId: 'u1', username: 'Host' }, RUMMY, false, 'sock-u1');
    const config = { difficulty: 'normal', personality: 'friendly' } as const;

    const afterFirst = await manager.addAIPlayer(state.code, 'u1', config);
    const afterSecond = await manager.addAIPlayer(state.code, 'u1', config);

    const aiPlayers = afterSecond.players.filter((p) => p.isAI);
    expect(aiPlayers).toHaveLength(2);
    expect(aiPlayers[0].userId).not.toBe(aiPlayers[1].userId);
    expect(afterFirst.players.filter((p) => p.isAI)).toHaveLength(1);
  });

  it('closeRoomAfterGame frees a player to create or join a fresh room afterward, without disturbing anyone still viewing the result', async () => {
    // Regression #1: a finished hand never used to close its room, so the
    // room stayed 'in_progress' forever and the player stayed tracked as
    // seated in it — a fresh room/solo attempt for that same player later
    // would still resolve against the finished room and fail with
    // ALREADY_STARTED.
    // Regression #2: an earlier version of this fix broadcast ROOM_CLOSED
    // here, which yanked the Teen Patti end-of-hand screen away from
    // players still looking at it (see the doc comment on the method) — so
    // this must stay silent on the wire.
    const { manager, events } = createManager();
    const state = await manager.createRoom({ userId: 'u1', username: 'Host' }, RUMMY, false, 'sock-u1');
    await manager.addAIPlayer(state.code, 'u1', { difficulty: 'normal', personality: 'friendly' });
    await manager.setReady(state.code, 'u1', true);
    await manager.startGame(state.code, 'u1');
    const eventCountBeforeClose = events.length;

    await manager.closeRoomAfterGame(state.code);

    expect(manager.getRoomState(state.code)).toBeNull();
    expect(events).toHaveLength(eventCountBeforeClose); // no broadcast fired

    // u1 is no longer considered seated anywhere, so a brand new room works.
    const fresh = await manager.createRoom({ userId: 'u1', username: 'Host' }, RUMMY, false, 'sock-u1-new');
    expect(fresh.code).not.toBe(state.code);
    await expect(
      manager.addAIPlayer(fresh.code, 'u1', { difficulty: 'normal', personality: 'friendly' }),
    ).resolves.toBeTruthy();
  });

  describe('4 Card modes, shuffler assignment, and rematch', () => {
    const FOUR_CARD = 'four-card';

    it('resolves min/max players from the requested mode, not the catalog\'s top-level (2-player) values', async () => {
      const { manager } = createManager();
      const state = await manager.createRoom({ userId: 'u1', username: 'H' }, FOUR_CARD, false, 's1', 'four-individual');
      expect(state.maxPlayers).toBe(4);
      expect(state.minPlayers).toBe(4);
    });

    it('defaults to the first mode (2-player) when none is requested, unchanged from before modes existed', async () => {
      const { manager } = createManager();
      const state = await manager.createRoom({ userId: 'u1', username: 'H' }, FOUR_CARD, false, 's1');
      expect(state.maxPlayers).toBe(2);
      expect(state.minPlayers).toBe(2);
    });

    it("passes the room's mode and a shuffler (one of the seated players) into onGameStarted", async () => {
      const events: BroadcastEvent[] = [];
      const { persistence } = createFakePersistence();
      const started: unknown[] = [];
      const manager = new RoomManager({
        persistence,
        broadcast: (code, event, payload) => events.push({ code, event, payload }),
        onGameStarted: (info) => {
          started.push(info);
        },
      });

      const state = await manager.createRoom({ userId: 'u1', username: 'H' }, FOUR_CARD, false, 's1', 'two-player');
      await manager.joinRoom(state.code, { userId: 'u2', username: 'P2' }, 's2');
      await manager.setReady(state.code, 'u1', true);
      await manager.setReady(state.code, 'u2', true);
      await manager.startGame(state.code, 'u1');

      expect(started).toHaveLength(1);
      const info = started[0] as { mode?: string; shufflerUserId?: string };
      expect(info.mode).toBe('two-player');
      expect(['u1', 'u2']).toContain(info.shufflerUserId);
    });

    it('keeps a rematch-capable room alive as "finished" instead of tearing it down, and records it in gameHistory', async () => {
      const { manager, events } = createManager();
      const state = await manager.createRoom({ userId: 'u1', username: 'H' }, FOUR_CARD, false, 's1', 'two-player');
      await manager.joinRoom(state.code, { userId: 'u2', username: 'P2' }, 's2');

      await manager.closeRoomAfterGame(state.code, {
        gameSessionId: 'session-1',
        loserUserIds: ['u2'],
        resultSummary: { scores: { u1: 220, u2: 180 }, winnerIds: ['u1'] },
      });

      const finished = manager.getRoomState(state.code);
      expect(finished).not.toBeNull(); // still tracked, unlike the no-rematch teardown path
      expect(finished!.status).toBe('finished');
      expect(finished!.gameHistory).toEqual([
        expect.objectContaining({ gameSessionId: 'session-1', scores: { u1: 220, u2: 180 }, winnerIds: ['u1'] }),
      ]);
      expect(events.some((e) => e.event === 'room:state' && (e.payload as { status: string }).status === 'finished')).toBe(true);
    });

    it('requestRematch requires a seated player and a finished room', async () => {
      const { manager } = createManager();
      const state = await manager.createRoom({ userId: 'u1', username: 'H' }, FOUR_CARD, false, 's1', 'two-player');
      await manager.joinRoom(state.code, { userId: 'u2', username: 'P2' }, 's2');

      await expect(manager.requestRematch(state.code, 'u3')).rejects.toMatchObject({ code: 'NOT_IN_ROOM' });
      await expect(manager.requestRematch(state.code, 'u1')).rejects.toMatchObject({ code: 'NOT_FINISHED' });
    });

    it('auto-starts the new game the instant every seated human accepts — no separate Start Game click', async () => {
      const started: { gameSessionId: string }[] = [];
      const { persistence } = createFakePersistence();
      const manager = new RoomManager({
        persistence,
        broadcast: () => {},
        onGameStarted: (info) => {
          started.push(info);
        },
      });
      const state = await manager.createRoom({ userId: 'u1', username: 'H' }, FOUR_CARD, false, 's1', 'two-player');
      await manager.joinRoom(state.code, { userId: 'u2', username: 'P2' }, 's2');
      await manager.closeRoomAfterGame(state.code, { gameSessionId: 'session-1', loserUserIds: ['u2'] });

      const afterRequest = await manager.requestRematch(state.code, 'u1');
      expect(afterRequest.status).toBe('waiting'); // back to waiting, same seats
      expect(afterRequest.players.map((p) => p.userId).sort()).toEqual(['u1', 'u2']);
      expect(afterRequest.rematchRequestedBy).toBe('u1');
      expect(afterRequest.players.find((p) => p.userId === 'u1')?.isReady).toBe(true); // requester auto-accepts
      expect(afterRequest.players.find((p) => p.userId === 'u2')?.isReady).toBe(false);
      expect(started).toHaveLength(0); // not yet — u2 hasn't accepted

      const afterAccept = await manager.respondToRematch(state.code, 'u2', true);
      expect(started).toHaveLength(1); // auto-started, no explicit startGame call needed
      expect(afterAccept!.status).toBe('in_progress');
      expect(afterAccept!.rematchRequestedBy).toBeUndefined(); // cleared once the new game actually starts
    });

    it('AI seats always auto-accept a rematch request, same as they auto-ready today', async () => {
      const { manager } = createManager();
      const state = await manager.createRoom({ userId: 'u1', username: 'H' }, FOUR_CARD, false, 's1', 'two-player');
      await manager.addAIPlayer(state.code, 'u1', { difficulty: 'easy', personality: 'friendly' });
      const aiUserId = (await manager.getRoomState(state.code))!.players.find((p) => p.isAI)!.userId;
      await manager.closeRoomAfterGame(state.code, { gameSessionId: 'session-1', loserUserIds: [aiUserId] });

      const afterRequest = await manager.requestRematch(state.code, 'u1');
      expect(afterRequest.players.find((p) => p.isAI)?.isReady).toBe(true);
    });

    it('declining leaves the room (existing leave/host-reassignment logic), room reverts to a normal waiting room', async () => {
      const { manager } = createManager();
      const state = await manager.createRoom({ userId: 'u1', username: 'H' }, FOUR_CARD, false, 's1', 'two-player');
      await manager.joinRoom(state.code, { userId: 'u2', username: 'P2' }, 's2');
      await manager.closeRoomAfterGame(state.code, { gameSessionId: 'session-1', loserUserIds: ['u2'] });
      await manager.requestRematch(state.code, 'u1');

      const afterDecline = await manager.respondToRematch(state.code, 'u2', false);
      expect(afterDecline).toBeNull();

      const finalState = manager.getRoomState(state.code)!;
      expect(finalState.status).toBe('waiting');
      expect(finalState.players.map((p) => p.userId)).toEqual(['u1']);
    });

    it("the next game's shuffler is the previous loser (never the winner), and gameHistory accumulates across rematches without overwriting", async () => {
      const started: { shufflerUserId?: string }[] = [];
      const { persistence } = createFakePersistence();
      const manager = new RoomManager({
        persistence,
        broadcast: () => {},
        onGameStarted: (info) => {
          started.push(info);
        },
      });

      const state = await manager.createRoom({ userId: 'u1', username: 'H' }, FOUR_CARD, false, 's1', 'two-player');
      await manager.joinRoom(state.code, { userId: 'u2', username: 'P2' }, 's2');
      await manager.setReady(state.code, 'u1', true);
      await manager.setReady(state.code, 'u2', true);
      await manager.startGame(state.code, 'u1'); // first game — shuffler is random, not loser-driven yet

      await manager.closeRoomAfterGame(state.code, {
        gameSessionId: 'session-1',
        loserUserIds: ['u2'],
        resultSummary: { scores: { u1: 220, u2: 180 }, winnerIds: ['u1'] },
      });
      await manager.requestRematch(state.code, 'u1');
      await manager.respondToRematch(state.code, 'u2', true); // auto-starts game 2

      expect(started).toHaveLength(2);
      expect(started[1].shufflerUserId).toBe('u2'); // deterministic now — only one loser to pick from

      await manager.closeRoomAfterGame(state.code, {
        gameSessionId: 'session-2',
        loserUserIds: ['u1'],
        resultSummary: { scores: { u1: 160, u2: 240 }, winnerIds: ['u2'] },
      });

      const history = manager.getRoomState(state.code)!.gameHistory;
      expect(history).toHaveLength(2); // both games kept, neither overwritten
      expect(history[0]).toMatchObject({ gameSessionId: 'session-1', scores: { u1: 220, u2: 180 } });
      expect(history[1]).toMatchObject({ gameSessionId: 'session-2', scores: { u1: 160, u2: 240 } });
    });
  });
});
