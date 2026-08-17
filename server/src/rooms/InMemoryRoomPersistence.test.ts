import { describe, expect, it } from 'vitest';
import { InMemoryRoomPersistence } from './InMemoryRoomPersistence.js';

describe('InMemoryRoomPersistence', () => {
  it('resolves a real catalog game to a stable id, and an unknown key to null', async () => {
    const persistence = new InMemoryRoomPersistence();
    expect(await persistence.getGameDbId('four-card')).toBe('local-four-card');
    expect(await persistence.getGameDbId('not-a-real-game')).toBeNull();
  });

  it('mints a fresh room id per call', async () => {
    const persistence = new InMemoryRoomPersistence();
    const a = await persistence.createRoom({
      code: 'AAAAAA',
      gameDbId: 'local-four-card',
      hostUserId: 'u1',
      isPrivate: true,
      maxPlayers: 2,
    });
    const b = await persistence.createRoom({
      code: 'BBBBBB',
      gameDbId: 'local-four-card',
      hostUserId: 'u2',
      isPrivate: true,
      maxPlayers: 2,
    });
    expect(a.id).not.toBe(b.id);
  });

  it('rejects seating the same user twice in the same room, mirroring the real unique(roomId, userId) constraint', async () => {
    const persistence = new InMemoryRoomPersistence();
    await persistence.addPlayer({ roomId: 'room-1', userId: 'u1', seatIndex: 0 });
    await expect(persistence.addPlayer({ roomId: 'room-1', userId: 'u1', seatIndex: 1 })).rejects.toThrow();
  });

  it('allows re-adding a user after they were removed', async () => {
    const persistence = new InMemoryRoomPersistence();
    await persistence.addPlayer({ roomId: 'room-1', userId: 'u1', seatIndex: 0 });
    await persistence.removePlayer({ roomId: 'room-1', userId: 'u1' });
    await expect(persistence.addPlayer({ roomId: 'room-1', userId: 'u1', seatIndex: 0 })).resolves.toBeUndefined();
  });

  it('mints a distinct AI user every call, never reusing an id across seats', async () => {
    const persistence = new InMemoryRoomPersistence();
    const first = await persistence.ensureAIUser('normal', 'friendly');
    const second = await persistence.ensureAIUser('normal', 'friendly');
    expect(first.userId).not.toBe(second.userId);
    expect(second.username).toContain('friendly');
    expect(second.username).toContain('normal');
  });

  it('mints a fresh game session id per call', async () => {
    const persistence = new InMemoryRoomPersistence();
    const a = await persistence.createGameSession({ roomId: 'room-1', gameDbId: 'local-four-card', rngSeed: '1' });
    const b = await persistence.createGameSession({ roomId: 'room-1', gameDbId: 'local-four-card', rngSeed: '2' });
    expect(a.id).not.toBe(b.id);
  });
});
