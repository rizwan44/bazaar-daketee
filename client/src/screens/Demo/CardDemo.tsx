import { createSeededRng, DeckEngine, type Card } from '@card-games/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { PlayingCard } from '../../components/card/PlayingCard';
import { useI18n } from '../../i18n/i18nContext';

const DEMO_PLAYER = 'demo-player';

// NOTE: this RNG is for the UI demo only (proving the animation pipeline).
// Real games must always shuffle server-side with the crypto-secure RNG —
// the client never has shuffle authority.
function newDemoEngine(): DeckEngine {
  return new DeckEngine('demo', createSeededRng(Date.now()));
}

export function CardDemo() {
  const { t } = useI18n();
  const [engine, setEngine] = useState(newDemoEngine);
  const [drawCount, setDrawCount] = useState(52);
  const [hand, setHand] = useState<Card[]>([]);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [isShuffling, setIsShuffling] = useState(false);

  const handleShuffle = () => {
    setIsShuffling(true);
    engine.shuffle();
    setTimeout(() => setIsShuffling(false), 500);
  };

  const handleDeal = () => {
    const dealt: Card[] = [];
    for (let i = 0; i < 7 && engine.getDrawPileCount() > 0; i++) {
      dealt.push(engine.draw(DEMO_PLAYER));
    }
    setHand(dealt);
    setDrawCount(engine.getDrawPileCount());
    setRevealed({});
  };

  const handleReset = () => {
    setEngine(newDemoEngine());
    setDrawCount(52);
    setHand([]);
    setRevealed({});
  };

  const toggleReveal = (cardId: string) => {
    setRevealed((prev) => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  return (
    <div className="px-4 pt-4 pb-8">
      <h1 className="text-xl font-display font-bold text-white mb-1">{t('demo.title')}</h1>
      <p className="text-xs text-gray-400 mb-6">
        Proves the shuffle / deal / flip animation pipeline before any real game is built.
      </p>

      <div className="flex flex-col items-center gap-2">
        <motion.div
          className="relative h-36 w-24"
          animate={isShuffling ? { rotate: [0, -6, 6, -4, 4, 0] } : { rotate: 0 }}
          transition={{ duration: 0.5 }}
        >
          {[2, 1, 0].map((offset) => (
            <div
              key={offset}
              className="absolute inset-0"
              style={{ transform: `translate(${offset * 2}px, ${-offset * 2}px)` }}
            >
              <PlayingCard card={{ rank: 'A', suit: 'spades' }} faceUp={false} size="lg" />
            </div>
          ))}
        </motion.div>
        <span className="text-[11px] text-gray-400">{drawCount} cards left in deck</span>

        <div className="flex gap-3 mt-4">
          <button
            onClick={handleShuffle}
            className="min-h-[44px] px-4 rounded-lg bg-felt-light border border-gold/20 text-sm text-gray-100"
          >
            Shuffle
          </button>
          <button
            onClick={handleDeal}
            className="min-h-[44px] px-4 rounded-lg bg-gold text-felt-dark text-sm font-semibold"
          >
            Deal 7 Cards
          </button>
          <button
            onClick={handleReset}
            className="min-h-[44px] px-4 rounded-lg bg-felt-light border border-gold/20 text-sm text-gray-100"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="mt-10 flex justify-center flex-wrap gap-3">
        <AnimatePresence>
          {hand.map((card, index) => (
            <motion.div
              key={card.cardId}
              initial={{ y: -140, opacity: 0, scale: 0.85 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: index * 0.12, type: 'spring', stiffness: 260, damping: 22 }}
            >
              <PlayingCard
                card={card}
                faceUp={!!revealed[card.cardId]}
                size="lg"
                onClick={() => toggleReveal(card.cardId)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {hand.length > 0 && (
        <p className="text-center text-xs text-gray-500 mt-4">Tap a card to flip it face up.</p>
      )}
    </div>
  );
}
