import { RANKS, SUITS, type Card } from './types.js';

/**
 * Builds one canonical, ordered 52-card deck. Cards start face-down in the deck.
 * `deckId` distinguishes cards when a game engine needs multiple physical decks
 * (e.g. Canasta-style games later) — each card's cardId is namespaced by it.
 */
export function buildStandardDeck(deckId: string): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({
        cardId: `${deckId}-${suit}-${rank}`,
        rank,
        suit,
        deckId,
        faceUp: false,
        owner: null,
        position: 'deck',
      });
    }
  }
  return cards;
}
