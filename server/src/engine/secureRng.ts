import { randomInt } from 'node:crypto';
import type { Rng } from '@card-games/shared';

/**
 * Cryptographically secure RNG for DeckEngine, backed by Node's crypto module.
 * This is the ONLY place that should ever produce randomness for real shuffles —
 * the client has no equivalent and must never be trusted to shuffle or deal.
 */
export const secureRng: Rng = () => randomInt(0, 1_000_000_000) / 1_000_000_000;
