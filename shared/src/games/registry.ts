import { fourCardEngine } from './four-card/FourCardEngine.js';
import type { GameEngine } from './GameEngine.js';
import { teenPattiEngine } from './teen-patti/TeenPattiEngine.js';

/**
 * Maps a catalog `gameKey` to its rule engine. Only games whose rules have
 * actually shipped are registered here — everything else in the catalog
 * intentionally has no entry yet, so a room can't be started for a game
 * nobody has implemented.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GAME_ENGINES = new Map<string, GameEngine<any>>([
  [teenPattiEngine.gameKey, teenPattiEngine],
  [fourCardEngine.gameKey, fourCardEngine],
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getGameEngine(gameKey: string): GameEngine<any> | undefined {
  return GAME_ENGINES.get(gameKey);
}
