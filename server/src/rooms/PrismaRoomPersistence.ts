import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { AIDifficulty, AIPersonality, RoomStatus } from '@card-games/shared';
import type { RoomPersistence } from './types.js';

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export class PrismaRoomPersistence implements RoomPersistence {
  constructor(private readonly prisma: PrismaClient) {}

  async getGameDbId(gameKey: string): Promise<string | null> {
    const game = await this.prisma.game.findUnique({ where: { key: gameKey }, select: { id: true } });
    return game?.id ?? null;
  }

  async createRoom(input: {
    code: string;
    gameDbId: string;
    hostUserId: string;
    isPrivate: boolean;
    maxPlayers: number;
  }): Promise<{ id: string }> {
    const room = await this.prisma.room.create({
      data: {
        code: input.code,
        gameId: input.gameDbId,
        hostUserId: input.hostUserId,
        isPrivate: input.isPrivate,
        maxPlayers: input.maxPlayers,
        status: 'waiting',
      },
      select: { id: true },
    });
    return room;
  }

  async addPlayer(input: { roomId: string; userId: string; seatIndex: number }): Promise<void> {
    await this.prisma.roomPlayer.create({
      data: { roomId: input.roomId, userId: input.userId, seatIndex: input.seatIndex },
    });
  }

  async removePlayer(input: { roomId: string; userId: string }): Promise<void> {
    await this.prisma.roomPlayer.deleteMany({
      where: { roomId: input.roomId, userId: input.userId },
    });
  }

  async setPlayerReady(input: { roomId: string; userId: string; isReady: boolean }): Promise<void> {
    await this.prisma.roomPlayer.updateMany({
      where: { roomId: input.roomId, userId: input.userId },
      data: { isReady: input.isReady },
    });
  }

  async setRoomStatus(input: { roomId: string; status: RoomStatus }): Promise<void> {
    await this.prisma.room.update({ where: { id: input.roomId }, data: { status: input.status } });
  }

  async setRoomHost(input: { roomId: string; hostUserId: string }): Promise<void> {
    await this.prisma.room.update({
      where: { id: input.roomId },
      data: { hostUserId: input.hostUserId },
    });
  }

  async createGameSession(input: {
    roomId: string;
    gameDbId: string;
    rngSeed: string;
  }): Promise<{ id: string }> {
    return this.prisma.gameSession.create({
      data: { roomId: input.roomId, gameId: input.gameDbId, rngSeed: input.rngSeed, status: 'active' },
      select: { id: true },
    });
  }

  async addGamePlayers(input: {
    gameSessionId: string;
    players: {
      userId: string;
      seatIndex: number;
      isAI: boolean;
      aiDifficulty?: AIDifficulty;
      aiPersonality?: AIPersonality;
    }[];
  }): Promise<void> {
    await this.prisma.gamePlayer.createMany({
      data: input.players.map((p) => ({
        gameSessionId: input.gameSessionId,
        userId: p.userId,
        seatIndex: p.seatIndex,
        isAI: p.isAI,
        aiDifficulty: p.aiDifficulty ?? null,
        aiPersonality: p.aiPersonality ?? null,
      })),
    });
  }

  async ensureAIUser(
    difficulty: AIDifficulty,
    personality: AIPersonality,
  ): Promise<{ userId: string; username: string }> {
    // A fresh User per call, not one shared/reused per difficulty+personality
    // combo: a single room can seat two AI opponents with the same settings
    // (Solo mode picks one difficulty/personality for every AI seat), and
    // RoomPlayer has a unique(roomId, userId) constraint — a shared identity
    // would collide the moment a second identically-configured seat is added
    // to the same room. The row is small and never cleaned up, same as any
    // other guest account.
    const userId = randomUUID();
    const username = `${capitalize(personality)} AI (${capitalize(difficulty)})`;

    await this.prisma.user.create({
      data: { id: userId, username: `ai_${userId.slice(0, 8)}`, isGuest: true },
    });
    await this.prisma.profile.create({ data: { userId, displayName: username } });

    return { userId, username };
  }
}
