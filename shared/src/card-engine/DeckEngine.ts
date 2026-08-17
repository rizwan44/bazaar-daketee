import { buildStandardDeck } from './Deck.js';
import type { Rng } from './rng.js';
import { RANKS, SUITS, type Card } from './types.js';

const RANK_ORDER = new Map(RANKS.map((rank, index) => [rank, index]));
const SUIT_ORDER = new Map(SUITS.map((suit, index) => [suit, index]));

function defaultCardComparator(a: Card, b: Card): number {
  const suitDiff = (SUIT_ORDER.get(a.suit) ?? 0) - (SUIT_ORDER.get(b.suit) ?? 0);
  if (suitDiff !== 0) return suitDiff;
  return (RANK_ORDER.get(a.rank) ?? 0) - (RANK_ORDER.get(b.rank) ?? 0);
}

/**
 * Server-authoritative deck/hand tracker used by every game module.
 * The RNG is injected so the server can supply a cryptographically secure
 * shuffle while tests supply a deterministic seeded one — this class never
 * decides *how* randomness is generated, only how it's applied.
 */
export class DeckEngine {
  private readonly deckId: string;
  private readonly rng: Rng;
  private drawPile: Card[];
  private readonly discardPile: Card[] = [];
  private readonly playedCards: Card[] = [];
  private readonly hands = new Map<string, Card[]>();

  constructor(deckId: string, rng: Rng) {
    this.deckId = deckId;
    this.rng = rng;
    this.drawPile = buildStandardDeck(deckId);
  }

  /** Fisher-Yates shuffle of the current draw pile, in place. */
  shuffle(): void {
    for (let i = this.drawPile.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.drawPile[i], this.drawPile[j]] = [this.drawPile[j], this.drawPile[i]];
    }
  }

  /** Deals `countPerPlayer` cards to each player, one card at a time round-robin. */
  deal(playerIds: string[], countPerPlayer: number): void {
    for (const playerId of playerIds) {
      if (!this.hands.has(playerId)) this.hands.set(playerId, []);
    }
    for (let round = 0; round < countPerPlayer; round++) {
      for (const playerId of playerIds) {
        const card = this.drawPile.shift();
        if (!card) {
          throw new Error('DeckEngine: draw pile exhausted while dealing');
        }
        card.owner = playerId;
        card.position = 'hand';
        this.hands.get(playerId)!.push(card);
      }
    }
  }

  /** Draws a single card from the top of the draw pile into a player's hand. */
  draw(playerId: string): Card {
    const card = this.drawPile.shift();
    if (!card) {
      throw new Error('DeckEngine: draw pile is empty');
    }
    card.owner = playerId;
    card.position = 'hand';
    if (!this.hands.has(playerId)) this.hands.set(playerId, []);
    this.hands.get(playerId)!.push(card);
    return card;
  }

  /** Moves a card from a player's hand onto the table (played this turn). */
  playCard(playerId: string, cardId: string): Card {
    const card = this.takeFromHand(playerId, cardId);
    card.owner = null;
    card.position = 'table';
    this.playedCards.push(card);
    return card;
  }

  /** Moves a card from a player's hand to the discard pile. */
  discardCard(playerId: string, cardId: string): Card {
    const card = this.takeFromHand(playerId, cardId);
    card.owner = null;
    card.position = 'discard';
    this.discardPile.push(card);
    return card;
  }

  /** Removes a card from wherever it currently is and returns it (e.g. rule-specific removal). */
  removeCard(cardId: string): Card | null {
    return this.stripFromAllLocations(cardId);
  }

  /** Returns a card to the bottom of the draw pile (e.g. undo, deck replenishment). */
  returnCard(card: Card): void {
    this.stripFromAllLocations(card.cardId);
    card.owner = null;
    card.position = 'deck';
    card.faceUp = false;
    this.drawPile.push(card);
  }

  /** Finds and removes a card by id from whichever hand/pile currently holds it. */
  private stripFromAllLocations(cardId: string): Card | null {
    for (const hand of this.hands.values()) {
      const idx = hand.findIndex((c) => c.cardId === cardId);
      if (idx !== -1) return hand.splice(idx, 1)[0];
    }
    const drawIdx = this.drawPile.findIndex((c) => c.cardId === cardId);
    if (drawIdx !== -1) return this.drawPile.splice(drawIdx, 1)[0];
    const discardIdx = this.discardPile.findIndex((c) => c.cardId === cardId);
    if (discardIdx !== -1) return this.discardPile.splice(discardIdx, 1)[0];
    const playedIdx = this.playedCards.findIndex((c) => c.cardId === cardId);
    if (playedIdx !== -1) return this.playedCards.splice(playedIdx, 1)[0];
    return null;
  }

  /** Reclaims the discard pile back into the draw pile (keeps the top card aside if requested). */
  reshuffleDiscardIntoDrawPile(keepTopCard = true): void {
    const keep = keepTopCard ? this.discardPile.pop() : undefined;
    while (this.discardPile.length > 0) {
      const card = this.discardPile.pop()!;
      card.owner = null;
      card.position = 'deck';
      card.faceUp = false;
      this.drawPile.push(card);
    }
    if (keep) this.discardPile.push(keep);
  }

  getDeckId(): string {
    return this.deckId;
  }

  getHand(playerId: string): Card[] {
    return this.hands.get(playerId) ?? [];
  }

  /** Sorts a player's hand in place. Defaults to suit-then-rank; games may pass their own comparator. */
  sortHand(playerId: string, comparator: (a: Card, b: Card) => number = defaultCardComparator): void {
    this.hands.get(playerId)?.sort(comparator);
  }

  /** True only if the given card is currently in that player's hand. */
  validateOwnership(cardId: string, playerId: string): boolean {
    return this.getHand(playerId).some((c) => c.cardId === cardId);
  }

  getDrawPileCount(): number {
    return this.drawPile.length;
  }

  /** The actual remaining cards, for games (like Four Card) that keep drawing from a live pile all game long. */
  getDrawPile(): readonly Card[] {
    return this.drawPile;
  }

  getDiscardPile(): readonly Card[] {
    return this.discardPile;
  }

  getTopOfDiscard(): Card | undefined {
    return this.discardPile[this.discardPile.length - 1];
  }

  getPlayedCards(): readonly Card[] {
    return this.playedCards;
  }

  /** All 52 cards currently tracked by this engine, wherever they are — for integrity checks/tests. */
  getAllCards(): Card[] {
    return [
      ...this.drawPile,
      ...this.discardPile,
      ...this.playedCards,
      ...Array.from(this.hands.values()).flat(),
    ];
  }

  private takeFromHand(playerId: string, cardId: string): Card {
    const hand = this.hands.get(playerId) ?? [];
    const idx = hand.findIndex((c) => c.cardId === cardId);
    if (idx === -1) {
      throw new Error(`DeckEngine: player ${playerId} does not own card ${cardId}`);
    }
    return hand.splice(idx, 1)[0];
  }
}
