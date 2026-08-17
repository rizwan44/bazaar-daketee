import { isRedSuit, type Card as CardData } from '@card-games/shared';
import { motion, type PanInfo } from 'framer-motion';

const SUIT_GLYPH: Record<CardData['suit'], string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export type CardSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<CardSize, string> = {
  sm: 'w-12 h-[4.5rem] text-sm',
  md: 'w-16 h-24 text-base',
  lg: 'w-24 h-36 text-2xl',
  xl: 'w-32 h-48 text-3xl',
};

interface PlayingCardProps {
  card: Pick<CardData, 'rank' | 'suit'>;
  faceUp?: boolean;
  size?: CardSize;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  /** Lets the card be picked up and dragged (Framer Motion's native drag gesture, mouse and touch alike). Always snaps back to its hand position on release — see `onDragRelease` for reacting to where it was dropped. */
  draggable?: boolean;
  /** Fired with the release point in viewport (client) coordinates — the same space `getBoundingClientRect()` reports, so the caller can hit-test it against candidate drop targets. */
  onDragRelease?: (point: { x: number; y: number }) => void;
  /** Stable id (e.g. `card-${cardId}`) shared across every render of this SAME physical card, wherever it's rendered. When set, Framer Motion's shared-layout engine automatically animates this card sliding/resizing between its old and new position across a re-render — e.g. table → collection on a capture — instead of teleporting. Wrap the table in a `LayoutGroup` for this to resolve across sibling lists (hand/table/stacks). */
  layoutId?: string;
}

export function PlayingCard({
  card,
  faceUp = true,
  size = 'md',
  selected = false,
  onClick,
  className = '',
  draggable = false,
  onDragRelease,
  layoutId,
}: PlayingCardProps) {
  const isRed = isRedSuit(card.suit);
  const glyph = SUIT_GLYPH[card.suit];

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={`relative ${SIZE_CLASSES[size]} [perspective:800px] ${className}`}
      whileTap={onClick && !draggable ? { scale: 0.96 } : undefined}
      layout={!!layoutId}
      layoutId={layoutId}
      animate={{ y: selected ? -12 : 0 }}
      transition={{
        // A card actually changing position/size (table -> stack, hand ->
        // table, etc.) gets a slow, clearly-followable glide — deliberately
        // 700-1000ms, not a snappy UI micro-interaction. The lift-on-select
        // bounce is a different, quick gesture and keeps its own spring.
        layout: { duration: 0.85, ease: 'easeInOut' },
        default: { type: 'spring', stiffness: 400, damping: 28 },
      }}
      drag={draggable}
      dragSnapToOrigin
      dragElastic={0.15}
      whileDrag={draggable ? { scale: 1.1, zIndex: 50 } : undefined}
      onDragEnd={
        draggable ? (_event, info: PanInfo) => onDragRelease?.({ x: info.point.x, y: info.point.y }) : undefined
      }
      style={draggable ? { touchAction: 'none' } : undefined}
    >
      <motion.div
        className="absolute inset-0 [transform-style:preserve-3d]"
        animate={{ rotateY: faceUp ? 0 : 180 }}
        transition={{ duration: 0.35, ease: 'easeInOut' }}
      >
        {/* Front face */}
        <div
          className={[
            'absolute inset-0 rounded-lg bg-card-face shadow-card [backface-visibility:hidden]',
            'flex flex-col justify-between p-1.5 border border-black/5',
            selected ? 'ring-2 ring-gold shadow-card-lifted' : '',
          ].join(' ')}
        >
          <span className={`font-bold leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
            {card.rank}
            <br />
            {glyph}
          </span>
          <span
            className={`self-center text-2xl leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}
          >
            {glyph}
          </span>
          <span
            className={`self-end rotate-180 font-bold leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}
          >
            {card.rank}
            <br />
            {glyph}
          </span>
        </div>

        {/* Back face */}
        <div
          className={[
            'absolute inset-0 rounded-lg bg-card-back shadow-card [backface-visibility:hidden]',
            '[transform:rotateY(180deg)] border-2 border-gold/70',
            'bg-[repeating-linear-gradient(45deg,rgba(212,175,55,0.15)_0px,rgba(212,175,55,0.15)_4px,transparent_4px,transparent_10px)]',
            'flex items-center justify-center',
          ].join(' ')}
        >
          <div className="h-2/3 w-2/3 rounded-full border-2 border-gold/70 flex items-center justify-center">
            <span className="text-gold font-display font-bold text-xs tracking-widest">CG</span>
          </div>
        </div>
      </motion.div>
    </motion.button>
  );
}
