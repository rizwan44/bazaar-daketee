import { describe, expect, it } from 'vitest';
import { InMemoryGamePersistence } from './InMemoryGamePersistence.js';

describe('InMemoryGamePersistence', () => {
  it('gives every player (human or AI) the same fixed starting balance, no DB lookup', async () => {
    const persistence = new InMemoryGamePersistence();
    const balances = await persistence.getPlayerBalances([
      { userId: 'u1', isAI: false },
      { userId: 'ai-1', isAI: true },
    ]);
    expect(balances).toEqual({ u1: 1000, 'ai-1': 1000 });
  });

  it('settleHand/recordGameResult/recordMove resolve without throwing (no-op, no DB)', async () => {
    const persistence = new InMemoryGamePersistence();
    await expect(
      persistence.settleHand({
        gameSessionId: 's1',
        results: [{ userId: 'u1', isAI: false, placement: 1, coinDelta: 10, finalBalance: 1010 }],
      }),
    ).resolves.toBeUndefined();
    await expect(
      persistence.recordGameResult({
        gameSessionId: 's1',
        results: [{ userId: 'u1', isAI: false, placement: 1, score: 40 }],
      }),
    ).resolves.toBeUndefined();
    await expect(
      persistence.recordMove({ gameSessionId: 's1', userId: 'u1', moveType: 'draw', payload: undefined, moveIndex: 0 }),
    ).resolves.toBeUndefined();
  });
});
