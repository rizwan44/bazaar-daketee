import type { Prisma, PrismaClient } from '@prisma/client';
import type { GamePersistence, GameResultEntry, HandSettlementResult, RecordMoveInput } from './types.js';

const AI_STARTING_BALANCE = 1000;
const DEFAULT_HUMAN_BALANCE = 1000;
const HAND_XP_REWARD = 10;
// Below this, a player can't meaningfully play a hand (can't even afford a
// couple of chaals) — auto-refilled rather than left stuck unable to ever
// play again once their starting balance is used up. There's no other way
// to top up yet (no shop/daily-bonus system), so this is the floor.
const MINIMUM_PLAYABLE_BALANCE = 100;

export class PrismaGamePersistence implements GamePersistence {
  constructor(private readonly prisma: PrismaClient) {}

  async getPlayerBalances(players: { userId: string; isAI: boolean }[]): Promise<Record<string, number>> {
    const balances: Record<string, number> = {};
    const humanIds = players.filter((p) => !p.isAI).map((p) => p.userId);

    if (humanIds.length > 0) {
      const profiles = await this.prisma.profile.findMany({
        where: { userId: { in: humanIds } },
        select: { userId: true, coins: true },
      });
      const byId = new Map(profiles.map((p) => [p.userId, p.coins]));

      for (const id of humanIds) {
        const current = byId.get(id) ?? DEFAULT_HUMAN_BALANCE;
        if (current < MINIMUM_PLAYABLE_BALANCE) {
          await this.prisma.profile.update({
            where: { userId: id },
            data: { coins: DEFAULT_HUMAN_BALANCE },
          });
          balances[id] = DEFAULT_HUMAN_BALANCE;
        } else {
          balances[id] = current;
        }
      }
    }

    for (const p of players) {
      // A fresh synthetic User backs every AI seat (see
      // RoomManager/PrismaRoomPersistence.ensureAIUser) rather than one
      // shared per difficulty+personality, so there's no persisted balance
      // to read for them — they always play with the same fixed stack.
      if (p.isAI) balances[p.userId] = AI_STARTING_BALANCE;
    }

    return balances;
  }

  async settleHand(input: { gameSessionId: string; results: HandSettlementResult[] }): Promise<void> {
    for (const result of input.results) {
      await this.prisma.gameResult.create({
        data: {
          gameSessionId: input.gameSessionId,
          userId: result.userId,
          xpEarned: HAND_XP_REWARD,
          coinsEarned: result.coinDelta,
          placement: result.placement,
        },
      });

      if (!result.isAI) {
        await this.prisma.profile.update({
          where: { userId: result.userId },
          data: { coins: result.finalBalance },
        });
      }
    }

    await this.prisma.gameSession.update({
      where: { id: input.gameSessionId },
      data: { status: 'completed', endedAt: new Date() },
    });
  }

  async recordGameResult(input: { gameSessionId: string; results: GameResultEntry[] }): Promise<void> {
    for (const result of input.results) {
      await this.prisma.gameResult.create({
        data: {
          gameSessionId: input.gameSessionId,
          userId: result.userId,
          xpEarned: HAND_XP_REWARD,
          coinsEarned: 0, // no coin economy for this game — score/placement only
          placement: result.placement,
        },
      });
    }

    await this.prisma.gameSession.update({
      where: { id: input.gameSessionId },
      data: { status: 'completed', endedAt: new Date() },
    });
  }

  async recordMove(input: RecordMoveInput): Promise<void> {
    const gamePlayer = await this.prisma.gamePlayer.findFirst({
      where: { gameSessionId: input.gameSessionId, userId: input.userId },
      select: { id: true },
    });
    if (!gamePlayer) return; // shouldn't happen for a seated player, but move-logging must never break gameplay

    await this.prisma.gameMove.create({
      data: {
        gameSessionId: input.gameSessionId,
        gamePlayerId: gamePlayer.id,
        moveType: input.moveType,
        payload: (input.payload as Prisma.InputJsonValue | undefined) ?? undefined,
        moveIndex: input.moveIndex,
      },
    });
  }
}
