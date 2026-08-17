import { cardValue, type Card as CardType } from '@card-games/shared';
import { useEffect, useState } from 'react';
import { PlayingCard } from '../card/PlayingCard';

export interface ScoreRevealGroup {
  collectorId: string;
  label: string;
  cards: CardType[];
}

interface SequentialScoreRevealProps {
  groups: ScoreRevealGroup[];
  onComplete: () => void;
}

const CARD_INTERVAL_MS = 320;
const GROUP_PAUSE_MS = 500;

/**
 * "COUNTING SCORE..." — reveals one collector's cards at a time, one card
 * per tick, with a running total, before moving to the next collector.
 * Scoped as a clean sequential number/text reveal rather than a full
 * physics-based flying-card animation (§21) — the entertaining part is the
 * running total ticking up, not card physics.
 */
export function SequentialScoreReveal({ groups, onComplete }: SequentialScoreRevealProps) {
  const [groupIndex, setGroupIndex] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [runningTotal, setRunningTotal] = useState(0);
  const [finishedTotals, setFinishedTotals] = useState<Record<string, number>>({});

  const group = groups[groupIndex];

  useEffect(() => {
    if (!group) {
      onComplete();
      return;
    }
    if (cardIndex >= group.cards.length) {
      const t = setTimeout(() => {
        setFinishedTotals((prev) => ({ ...prev, [group.collectorId]: runningTotal }));
        setGroupIndex((i) => i + 1);
        setCardIndex(0);
        setRunningTotal(0);
      }, GROUP_PAUSE_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setRunningTotal((total) => total + cardValue(group.cards[cardIndex].rank));
      setCardIndex((i) => i + 1);
    }, CARD_INTERVAL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIndex, cardIndex, group]);

  if (!group) return null;

  const revealedCard = cardIndex > 0 ? group.cards[cardIndex - 1] : null;

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <p className="text-xs text-gray-400 uppercase tracking-wide">Counting score…</p>
      <p className="text-sm text-gold font-semibold">{group.label}</p>
      <div className="h-16 flex items-center justify-center">
        {revealedCard ? (
          <div className="flex items-center gap-3">
            <PlayingCard card={revealedCard} faceUp size="sm" />
            <span className="text-emerald-300 text-sm">+{cardValue(revealedCard.rank)}</span>
          </div>
        ) : (
          <span className="text-gray-500 text-xs">
            {group.cards.length === 0 ? '(no cards captured)' : ''}
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-gold">{runningTotal}</p>
      {Object.keys(finishedTotals).length > 0 && (
        <div className="flex gap-3 text-[11px] text-gray-400">
          {Object.entries(finishedTotals).map(([id, total]) => (
            <span key={id}>
              {id}: {total}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
