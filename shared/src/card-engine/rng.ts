/**
 * Returns a float in [0, 1). Injected into DeckEngine so the shuffle source
 * can be swapped: crypto-secure on the server, seeded/deterministic in tests.
 * Never implement or call Math.random()-based RNG on the server for real games.
 */
export type Rng = () => number;

/**
 * Deterministic mulberry32 PRNG for tests — same seed always produces the
 * same shuffle order, which is what makes the DeckEngine tests reproducible.
 * NOT suitable for real money / real gameplay (predictable, not cryptographic).
 */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
