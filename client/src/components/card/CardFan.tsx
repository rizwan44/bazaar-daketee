import type { Card as CardData } from '@card-games/shared';
import { PlayingCard, type CardSize } from './PlayingCard';

interface CardFanProps {
  cards: CardData[];
  size?: CardSize;
  selectedCardId?: string | null;
  onSelectCard?: (cardId: string) => void;
}

/**
 * Renders a hand of cards with a slight horizontal overlap so a full hand
 * fits on narrow mobile screens without ever overflowing off-screen.
 */
export function CardFan({ cards, size = 'md', selectedCardId, onSelectCard }: CardFanProps) {
  const overlapClass = size === 'lg' ? '-ml-10' : size === 'md' ? '-ml-7' : '-ml-5';

  return (
    <div className="flex justify-center items-end overflow-x-auto py-2 px-4">
      {cards.map((card, index) => (
        <div key={card.cardId} className={index === 0 ? '' : overlapClass} style={{ zIndex: index }}>
          <PlayingCard
            card={card}
            faceUp={card.faceUp}
            size={size}
            selected={selectedCardId === card.cardId}
            onClick={onSelectCard ? () => onSelectCard(card.cardId) : undefined}
          />
        </div>
      ))}
    </div>
  );
}
