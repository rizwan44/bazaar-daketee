export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const;
export type Rank = (typeof RANKS)[number];

export const RED_SUITS: readonly Suit[] = ['hearts', 'diamonds'];
export const BLACK_SUITS: readonly Suit[] = ['clubs', 'spades'];

export function isRedSuit(suit: Suit): boolean {
  return RED_SUITS.includes(suit);
}

/**
 * Where a card currently lives. `deck` and `discard` have no owner.
 * `hand` and `table` are owned by a specific player.
 */
export type CardPosition = 'deck' | 'hand' | 'table' | 'discard';

export interface Card {
  /** Stable unique id, e.g. `hearts-A` combined with deckId for multi-deck games: `d1-hearts-A` */
  cardId: string;
  rank: Rank;
  suit: Suit;
  /** Identifies which physical deck this card belongs to (supports multi-deck games) */
  deckId: string;
  faceUp: boolean;
  /** playerId of the current owner, or null if in the deck/discard pile */
  owner: string | null;
  position: CardPosition;
}
