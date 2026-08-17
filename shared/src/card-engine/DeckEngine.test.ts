import { describe, expect, it } from 'vitest';
import { DeckEngine } from './DeckEngine.js';
import { createSeededRng } from './rng.js';

function newEngine(seed = 42): DeckEngine {
  return new DeckEngine('test-deck', createSeededRng(seed));
}

describe('DeckEngine', () => {
  it('starts with exactly 52 unique cards', () => {
    const engine = newEngine();
    const all = engine.getAllCards();
    expect(all).toHaveLength(52);
    expect(new Set(all.map((c) => c.cardId)).size).toBe(52);
  });

  it('shuffle is deterministic for a given seed and preserves the full card set', () => {
    const engineA = newEngine(7);
    const engineB = newEngine(7);
    engineA.shuffle();
    engineB.shuffle();

    const idsA = engineA.getAllCards().map((c) => c.cardId);
    const idsB = engineB.getAllCards().map((c) => c.cardId);
    expect(idsA).toEqual(idsB);

    const unshuffled = newEngine(7);
    const originalOrder = unshuffled.getAllCards().map((c) => c.cardId);
    expect(idsA).not.toEqual(originalOrder);
    expect(new Set(idsA)).toEqual(new Set(originalOrder));
  });

  it('deals the correct count to each player with no overlap', () => {
    const engine = newEngine();
    engine.shuffle();
    const players = ['p1', 'p2', 'p3'];
    engine.deal(players, 5);

    for (const playerId of players) {
      expect(engine.getHand(playerId)).toHaveLength(5);
    }
    expect(engine.getDrawPileCount()).toBe(52 - 15);

    const allDealtIds = players.flatMap((p) => engine.getHand(p).map((c) => c.cardId));
    expect(new Set(allDealtIds).size).toBe(15);
  });

  it('draw/removeCard/returnCard keep deck state consistent', () => {
    const engine = newEngine();
    const drawn = engine.draw('p1');
    expect(engine.getHand('p1')).toContainEqual(drawn);
    expect(engine.getDrawPileCount()).toBe(51);

    engine.returnCard(drawn);
    expect(engine.getDrawPileCount()).toBe(52);
    expect(engine.getHand('p1')).toHaveLength(0);

    const removed = engine.removeCard(drawn.cardId);
    expect(removed?.cardId).toBe(drawn.cardId);
    expect(engine.getAllCards()).toHaveLength(51);
  });

  it('validateOwnership only accepts cards actually in that player hand', () => {
    const engine = newEngine();
    engine.deal(['p1', 'p2'], 3);
    const [p1Card] = engine.getHand('p1');

    expect(engine.validateOwnership(p1Card.cardId, 'p1')).toBe(true);
    expect(engine.validateOwnership(p1Card.cardId, 'p2')).toBe(false);
    expect(engine.validateOwnership('nonexistent-card', 'p1')).toBe(false);
  });

  it('playCard and discardCard move cards out of the hand into the right pile', () => {
    const engine = newEngine();
    engine.deal(['p1'], 2);
    const [cardA, cardB] = engine.getHand('p1');

    engine.playCard('p1', cardA.cardId);
    expect(engine.getPlayedCards().map((c) => c.cardId)).toContain(cardA.cardId);
    expect(engine.validateOwnership(cardA.cardId, 'p1')).toBe(false);

    engine.discardCard('p1', cardB.cardId);
    expect(engine.getTopOfDiscard()?.cardId).toBe(cardB.cardId);
    expect(engine.getHand('p1')).toHaveLength(0);
  });
});
