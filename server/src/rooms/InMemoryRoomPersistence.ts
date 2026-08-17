import { getGameByKey, type AIDifficulty, type AIPersonality } from '@card-games/shared';
import type { RoomPersistence } from './types.js';

/**
 * A real (non-test-only) implementation of `RoomPersistence` backed by
 * nothing but in-memory counters/sets — no Prisma, no MySQL. Used by
 * `localServer.ts` (the phone-as-host composition root, see the Android app
 * plan's Area C) where there's no database to talk to at all. Modeled
 * directly on the fake `RoomManager.test.ts` already uses — same shape,
 * promoted from test-only to a real, always-available implementation.
 */
export class InMemoryRoomPersistence implements RoomPersistence {
  private roomCounter = 0;
  private sessionCounter = 0;
  private aiUserCounter = 0;
  private readonly seatedUserIds = new Set<string>();

  async getGameDbId(gameKey: string): Promise<string | null> {
    return getGameByKey(gameKey) ? `local-${gameKey}` : null;
  }

  async createRoom(_input: Parameters<RoomPersistence['createRoom']>[0]): Promise<{ id: string }> {
    this.roomCounter += 1;
    return { id: `local-room-${this.roomCounter}` };
  }

  async addPlayer(input: Parameters<RoomPersistence['addPlayer']>[0]): Promise<void> {
    // Mirrors the real unique(roomId, userId) constraint, same as the test fake.
    const key = `${input.roomId}:${input.userId}`;
    if (this.seatedUserIds.has(key)) {
      throw new Error(`Unique constraint violation: ${key} already seated`);
    }
    this.seatedUserIds.add(key);
  }

  async removePlayer(input: Parameters<RoomPersistence['removePlayer']>[0]): Promise<void> {
    this.seatedUserIds.delete(`${input.roomId}:${input.userId}`);
  }

  async setPlayerReady(_input: Parameters<RoomPersistence['setPlayerReady']>[0]): Promise<void> {}

  async setRoomStatus(_input: Parameters<RoomPersistence['setRoomStatus']>[0]): Promise<void> {}

  async setRoomHost(_input: Parameters<RoomPersistence['setRoomHost']>[0]): Promise<void> {}

  async createGameSession(_input: Parameters<RoomPersistence['createGameSession']>[0]): Promise<{ id: string }> {
    this.sessionCounter += 1;
    return { id: `local-session-${this.sessionCounter}` };
  }

  async addGamePlayers(_input: Parameters<RoomPersistence['addGamePlayers']>[0]): Promise<void> {}

  async ensureAIUser(difficulty: AIDifficulty, personality: AIPersonality): Promise<{ userId: string; username: string }> {
    // A fresh id every call — never reused across seats/games, same rule
    // PrismaRoomPersistence's own doc comment calls out as load-bearing.
    this.aiUserCounter += 1;
    return { userId: `local-ai-${this.aiUserCounter}`, username: `${personality} AI (${difficulty})` };
  }
}
