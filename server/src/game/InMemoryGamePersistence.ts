import type { GamePersistence } from './types.js';

const STARTING_COIN_BALANCE = 1000;

/**
 * A real (non-test-only) implementation of `GamePersistence` backed by
 * nothing but a fixed constant — no Prisma, no MySQL. Used by
 * `localServer.ts` (the phone-as-host composition root). Four Card (the
 * only game `localServer.ts` registers — see the Android app plan's scope)
 * has no coin economy at all, so `settleHand`/coin balances are dead code
 * paths here in practice; they're still implemented so this is a real,
 * complete `GamePersistence`, not a partial one that would break if a
 * second game were ever registered.
 */
export class InMemoryGamePersistence implements GamePersistence {
  async getPlayerBalances(players: { userId: string; isAI: boolean }[]): Promise<Record<string, number>> {
    return Object.fromEntries(players.map((p) => [p.userId, STARTING_COIN_BALANCE]));
  }

  async settleHand(_input: Parameters<GamePersistence['settleHand']>[0]): Promise<void> {}

  async recordGameResult(_input: Parameters<GamePersistence['recordGameResult']>[0]): Promise<void> {}

  async recordMove(_input: Parameters<GamePersistence['recordMove']>[0]): Promise<void> {}
}
