import type {
  Card as CardType,
  CaptureMovePayload,
  FourCardCollectorView,
  FourCardEndedPayload,
  FourCardOpponentView,
  FourCardPlayerView,
} from '@card-games/shared';
import { AnimatePresence, LayoutGroup, motion, type Variants } from 'framer-motion';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { PlayingCard } from '../../components/card/PlayingCard';
import { SequentialScoreReveal, type ScoreRevealGroup } from '../../components/game/SequentialScoreReveal';
import { ensureGameSocketReady, joinGame, sendMove } from '../../services/gameSocket';
import { leaveRoom, requestRematch } from '../../services/roomSocket';
import { playSfx, vibrate } from '../../services/sfx';
import { useConnectionStore } from '../../store/connectionStore';
import { useGameStore } from '../../store/gameStore';
import { useRoomStore } from '../../store/roomStore';

interface FourCardTableProps {
  gameSessionId: string;
}

interface SeatInfo {
  userId: string;
  username: string;
  isAI: boolean;
  isConnected: boolean;
  handCount: number;
  role: 'teammate' | 'opponent';
}

const COMPACT_STACK_PX: Record<'sm' | 'md', { w: number; h: number }> = {
  sm: { w: 48, h: 72 },
  md: { w: 64, h: 96 },
};

/**
 * A fixed-size, non-expanding compact deck for a captured stack (active or
 * locked) — mirrors DrawPileVisual's own layered-deck look so every pile on
 * the table reads the same way. However many cards are actually in `cards`,
 * only the top 3 are ever rendered (each still a real `PlayingCard` with its
 * own `layoutId`, so a capture still animates smoothly into a real slot) —
 * anything deeper is represented purely by the count badge, never by more
 * DOM/layout height. This is the fix for the stack-height-explodes-with-many-
 * locked-groups bug: the container's width/height never depends on
 * `cards.length`.
 */
function CompactStack({
  cards,
  size = 'sm',
  locked = false,
  topRef,
}: {
  cards: CardType[];
  size?: 'sm' | 'md';
  locked?: boolean;
  topRef?: (el: HTMLDivElement | null) => void;
}) {
  if (cards.length === 0) {
    return <div className="h-8 w-11 rounded-md border border-dashed border-gold/20" />;
  }
  const { w, h } = COMPACT_STACK_PX[size];
  const visible = cards.slice(-3);

  return (
    <div className="relative" style={{ width: w, height: h }}>
      {visible.map((c, i) => {
        const isTop = i === visible.length - 1;
        const depthFromTop = visible.length - 1 - i;
        return (
          <div
            key={c.cardId}
            ref={isTop ? topRef : undefined}
            className="absolute"
            style={{ top: -depthFromTop * 2, left: -depthFromTop * 2, zIndex: i }}
          >
            <PlayingCard card={c} faceUp size={size} layoutId={`card-${c.cardId}`} />
          </div>
        );
      })}
      {locked && <span className="absolute -top-2 -right-1 z-20 text-xs">🔒</span>}
      {cards.length > 1 && (
        <span className="absolute -bottom-1.5 -right-1.5 z-20 min-w-[16px] rounded-full border border-gold/40 bg-felt-dark px-1 text-center text-[9px] leading-[15px] text-gold">
          {cards.length}
        </span>
      )}
    </div>
  );
}

/** Every card in a captured stack is already face-up public info — only the top card of the ACTIVE (unlocked) stack is ever a valid capture target (see registerTopRef below); once cards lock they seal into their own compact pile and stop being targetable. Both piles are fixed-size regardless of how many groups have locked over a long game — see CompactStack. */
function StackPile({
  collector,
  label,
  registerTopRef,
}: {
  collector: FourCardCollectorView;
  label: string;
  registerTopRef?: (el: HTMLDivElement | null) => void;
}) {
  const { capturedStack: cards, lockedGroups } = collector;
  const lockedFlat = lockedGroups.flat();

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</span>
      <div className="flex items-end gap-3">
        <CompactStack cards={cards} size="sm" topRef={registerTopRef} />
        {lockedFlat.length > 0 && <CompactStack cards={lockedFlat} size="sm" locked />}
      </div>
    </div>
  );
}

/**
 * A clear, tasteful "it's this seat's turn" cue, visible to every player at
 * the table (not just the local one) — driven purely by `isCurrentTurn`,
 * itself derived from `view.currentTurnUserId` (server state, never guessed
 * locally). The glow pulses via `opacity` on a separate absolutely-positioned
 * layer rather than animating `box-shadow` directly, and the badge's own
 * lift uses `scale`/`y` — both GPU-composited transforms, cheap on mobile.
 * The highlight itself cross-fades over ~350ms when the turn changes.
 */
function SeatBadge({ seat, isCurrentTurn }: { seat: SeatInfo; isCurrentTurn: boolean }) {
  return (
    <motion.div
      className="relative"
      animate={{ scale: isCurrentTurn ? 1.04 : 1 }}
      transition={{ duration: 0.35, ease: 'easeInOut' }}
    >
      {isCurrentTurn && (
        <motion.div
          className="absolute -inset-1.5 rounded-2xl bg-gold/50 blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.35, 0.65, 0.35] }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } }}
        />
      )}
      <div
        className={[
          'relative flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-colors duration-300',
          isCurrentTurn ? 'bg-gold/15 ring-2 ring-gold' : 'bg-felt-light/30 ring-1 ring-transparent',
          seat.role === 'teammate' ? 'border border-sky-400/30' : '',
        ].join(' ')}
      >
        <div className="relative">
          <div className="h-10 w-10 rounded-full bg-gold/20 flex items-center justify-center text-lg">
            {seat.isAI ? '🤖' : '👤'}
          </div>
          <span
            className={[
              'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-felt-dark',
              seat.isConnected ? 'bg-emerald-400' : 'bg-amber-400',
            ].join(' ')}
          />
        </div>
        <span className="text-[11px] text-gray-200">{seat.username}</span>
        {seat.role === 'teammate' && <span className="text-[9px] text-sky-300">Teammate</span>}
        <AnimatePresence mode="wait">
          {isCurrentTurn && (
            <motion.span
              key="turn-label"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
              className="text-[9px] font-semibold uppercase tracking-wide text-gold"
            >
              Their Turn
            </motion.span>
          )}
        </AnimatePresence>
        <div className="flex gap-0.5">
          {Array.from({ length: seat.handCount }).map((_, i) => (
            <div key={i} className="h-6 w-4 rounded-sm bg-card-back border border-gold/50" />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * A single, always-visible source of truth for whose turn it is — driven
 * purely by `isYourTurn` (itself from `view.currentTurnUserId`, server
 * state, never guessed locally — §14). Cross-fades over ~350ms whenever the
 * turn changes (§2), with a slow opacity pulse (not box-shadow, so it stays
 * cheap on mobile) only while it's actually your turn — a clear cue without
 * being distracting.
 */
function TurnBanner({ isYourTurn, otherLabel }: { isYourTurn: boolean; otherLabel: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={isYourTurn ? 'your-turn' : 'their-turn'}
        initial={{ opacity: 0, y: -6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.96 }}
        transition={{ duration: 0.35, ease: 'easeInOut' }}
        className={[
          'flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide',
          isYourTurn ? 'bg-gold/15 text-gold ring-1 ring-gold/60' : 'bg-felt-light/40 text-gray-400 ring-1 ring-transparent',
        ].join(' ')}
      >
        {isYourTurn && (
          <motion.span
            className="h-2 w-2 rounded-full bg-gold"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        {isYourTurn ? 'Your Turn' : otherLabel}
      </motion.div>
    </AnimatePresence>
  );
}

/** A clearly-readable, physical-looking face-down deck with a live count (§11-15, §54-55) — replaces a plain text counter. */
function DrawPileVisual({ count, pileRef }: { count: number; pileRef: RefObject<HTMLDivElement> }) {
  const depth = Math.min(3, count);
  const placeholderCard = { rank: 'A', suit: 'spades' } as const;

  return (
    <div ref={pileRef} className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: 64, height: 96 }}>
        {count === 0 ? (
          <div className="absolute inset-0 rounded-lg border-2 border-dashed border-gold/20 flex items-center justify-center">
            <span className="text-[9px] text-gray-500 uppercase tracking-wide">Empty</span>
          </div>
        ) : (
          Array.from({ length: depth }).map((_, i) => (
            <div key={i} className="absolute" style={{ top: -i * 2, left: -i * 2 }}>
              <PlayingCard card={placeholderCard} faceUp={false} size="md" />
            </div>
          ))
        )}
      </div>
      <AnimatePresence mode="wait">
        <motion.span
          key={count}
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 3 }}
          transition={{ duration: 0.2 }}
          className="text-xs font-semibold text-gold"
        >
          {count} {count === 1 ? 'card' : 'cards'}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function flattenCollectorCards(c: FourCardCollectorView): CardType[] {
  return [...c.capturedStack, ...c.finalizedCards, ...c.lockedGroups.flat()];
}

export function FourCardTable({ gameSessionId }: FourCardTableProps) {
  // This table only ever mounts for a four-card session (see RoomScreen's
  // gameKey branch), so the store's game-agnostic view is known to be this shape here.
  const view = useGameStore((s) => s.view) as FourCardPlayerView | null;
  const ended = useGameStore((s) => s.ended) as FourCardEndedPayload | null;
  const clear = useGameStore((s) => s.clear);
  const roomCode = useRoomStore((s) => s.room?.code);
  const username = useConnectionStore((s) => s.username);

  const targetRefs = useRef(new Map<string, HTMLDivElement>());
  const seatRefs = useRef(new Map<string, HTMLDivElement>());
  const tableZoneRef = useRef<HTMLDivElement | null>(null);
  const pileRef = useRef<HTMLDivElement>(null);
  const handZoneRef = useRef<HTMLDivElement | null>(null);
  const prevTurnRef = useRef<{ handLen: number; currentTurnUserId: string | null } | null>(null);
  const prevOpponentHandCountsRef = useRef(new Map<string, number>());
  const dealTriggeredRef = useRef(false);
  const flyingKeyRef = useRef(0);
  const [scoringRevealed, setScoringRevealed] = useState(false);
  const [dealAnimating, setDealAnimating] = useState(true);
  const [flyingCard, setFlyingCard] = useState<{ key: number; from: DOMRect; to: DOMRect } | null>(null);
  // Set the instant a move is sent, cleared once the resulting confirmed
  // state actually arrives — closes the round-trip window where a second
  // tap/drag could otherwise fire a conflicting action before the server's
  // answer to the first one lands (§13).
  const [actionInFlight, setActionInFlight] = useState(false);

  useEffect(() => {
    ensureGameSocketReady();
    joinGame(gameSessionId);
  }, [gameSessionId]);

  // Sound + animation cues, derived purely from watching state transitions
  // (no new server events needed, and never triggered ahead of a confirmed
  // state — §8/§18: the server-broadcast view IS the single source, there is
  // no separate optimistic local animation to reconcile). A hand-length
  // increase is always a draw. A decrease is either a capture of some kind
  // (table/opponent-stack/own-stack/group — always exactly -1 on YOUR hand
  // regardless, which naturally gives one clean sound per action per §9,
  // never one per captured card) if the turn stayed with you
  // (mandatory-redraw pattern), or a discard if the turn passed to someone
  // else in that same update. A change of whose turn it is covers the "turn
  // complete"/"turn start" cues. Every OTHER seat's `handCount` is watched
  // the same way, so an opponent's (or teammate's) draw is just as visible —
  // as a face-down flight into THEIR seat, never revealing the card itself.
  useEffect(() => {
    if (!view) return;
    setActionInFlight(false); // confirmed state just arrived — any in-flight action from this client is resolved

    const spawnFlyingCard = (fromEl: HTMLDivElement | null, toEl: HTMLDivElement | null) => {
      const fromRect = fromEl?.getBoundingClientRect();
      const toRect = toEl?.getBoundingClientRect();
      if (!fromRect || !toRect) return;
      flyingKeyRef.current += 1;
      setFlyingCard({ key: flyingKeyRef.current, from: fromRect, to: toRect });
    };

    const prev = prevTurnRef.current;
    if (prev) {
      if (view.yourHand.length > prev.handLen) {
        playSfx('draw');
        // The drawn card's identity is hidden until it's already in hand, so
        // there's no real element to shared-layout-match from the pile side
        // — approximate the flight with a face-down decoy animated between
        // the two containers' measured positions (§16-20).
        spawnFlyingCard(pileRef.current, handZoneRef.current);
      } else if (view.yourHand.length < prev.handLen) {
        if (view.currentTurnUserId === view.yourUserId) {
          playSfx('collect');
          vibrate(25);
        } else {
          playSfx('discard');
        }
      }
      if (prev.currentTurnUserId !== view.currentTurnUserId) {
        playSfx(view.currentTurnUserId === view.yourUserId ? 'turnStart' : 'turnComplete');
      }
    }
    prevTurnRef.current = { handLen: view.yourHand.length, currentTurnUserId: view.currentTurnUserId };

    // Opponent/teammate draws (§7-9): same face-down flight, this time
    // landing on their seat badge rather than the local hand — the card's
    // identity is never exposed, only that a draw happened and how many
    // cards they now hold (already public via handCount).
    const others = [...view.opponents, ...(view.teammate ? [view.teammate] : [])];
    const prevCounts = prevOpponentHandCountsRef.current;
    for (const o of others) {
      const prevCount = prevCounts.get(o.userId);
      if (prevCount !== undefined && o.handCount > prevCount) {
        playSfx('draw');
        spawnFlyingCard(pileRef.current, seatRefs.current.get(o.userId) ?? null);
      }
      prevCounts.set(o.userId, o.handCount);
    }
  }, [view]);

  // Resets the sequential score reveal for the NEXT game once a rematch
  // starts (view.phase goes back to 'playing') and fires the completion cue
  // the moment this game's result actually arrives.
  useEffect(() => {
    if (view?.phase === 'complete') {
      playSfx('gameComplete');
    } else {
      setScoringRevealed(false);
    }
  }, [view?.phase]);

  // The very first GAME_STATE this session receives jumps the hand/table
  // from empty to fully dealt in one update — instead of letting that pop in
  // instantly, play a brief staggered deal-in reveal (§23, §27). Gated on
  // `hasView` (a boolean, not the whole view object) so it fires exactly
  // once per session and never gets cancelled mid-animation by a later,
  // unrelated GAME_STATE update.
  const hasView = !!view;
  useEffect(() => {
    if (!hasView || dealTriggeredRef.current) return;
    dealTriggeredRef.current = true;
    const v = useGameStore.getState().view as FourCardPlayerView | null;
    const totalCards = (v?.yourHand.length ?? 0) + (v?.tableCards.length ?? 0);
    let dealt = 0;
    const interval = setInterval(() => {
      playSfx('deal', 0.15);
      dealt += 1;
      if (dealt >= totalCards) clearInterval(interval);
    }, 70);
    const timeout = setTimeout(() => setDealAnimating(false), 900);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [hasView]);

  if (!view) {
    return <div className="px-4 pt-10 text-center text-sm text-gray-400">Joining table…</div>;
  }

  const gameOver = view.phase === 'complete';
  const isYourTurn = view.currentTurnUserId === view.yourUserId;
  const drawPileEmpty = view.drawPileCount === 0;
  // turnPhase stays 'awaiting-draw' even once the pile is empty — that's how
  // the server signals "check your existing hand instead of drawing" (the
  // final-resolution phase, §1/§5). A real draw is only actually required
  // when the pile still has cards; once it's empty the hand/table/stacks
  // must stay fully interactive — this was the frozen-final-phase bug.
  const needsToDraw = view.turnPhase === 'awaiting-draw' && !drawPileEmpty;
  // actionInFlight closes the round-trip window between sending a move and
  // its confirmed state arriving — without it, a fast double-tap could fire
  // a second move before canAct/needsToDraw have even had a chance to
  // reflect the first one (§13).
  const canAct = isYourTurn && !gameOver && !needsToDraw && !actionInFlight;

  // Entrance transform for a hand/table card's own first mount. During the
  // opening deal-in window (`dealAnimating`) each card is staggered by its
  // index; any card that mounts fresh later (e.g. the real card fading in
  // underneath the flying-draw decoy) just fades in immediately instead —
  // only a genuinely new DOM element replays `initial`, a card that merely
  // MOVES (capture/discard) is matched by `layoutId` and never remounts.
  const dealCardVariants: Variants = {
    hidden: { opacity: 0, y: 20, scale: 0.85 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { delay: dealAnimating ? i * 0.05 : 0, duration: 0.28, ease: 'easeOut' },
    }),
  };

  const myCollector = view.collectors.find((c) => c.collectorId === view.yourCollectorId)!;
  const targetableCollectors = view.collectors.filter((c) => c.collectorId !== view.yourCollectorId);
  const tableCardIds = new Set(view.tableCards.map((c) => c.cardId));
  const myTopCardId = myCollector.capturedStack.at(-1)?.cardId;

  const otherSeats: SeatInfo[] = [
    ...(view.teammate
      ? [
          {
            userId: view.teammate.userId,
            username: view.teammate.username,
            isAI: view.teammate.isAI,
            isConnected: view.teammate.isConnected,
            handCount: view.teammate.handCount,
            role: 'teammate' as const,
          },
        ]
      : []),
    ...view.opponents.map((o: FourCardOpponentView) => ({
      userId: o.userId,
      username: o.username,
      isAI: o.isAI,
      isConnected: o.isConnected,
      handCount: o.handCount,
      role: 'opponent' as const,
    })),
  ];

  const registerTarget = (id: string) => (el: HTMLDivElement | null) => {
    if (el) targetRefs.current.set(id, el);
    else targetRefs.current.delete(id);
  };

  const registerSeat = (userId: string) => (el: HTMLDivElement | null) => {
    if (el) seatRefs.current.set(userId, el);
    else seatRefs.current.delete(userId);
  };

  const pointInRect = (x: number, y: number, rect: DOMRect) =>
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

  const resolveTargetType = (targetCardId: string): CaptureMovePayload['targetType'] => {
    if (tableCardIds.has(targetCardId)) return 'table';
    if (targetCardId === myTopCardId) return 'own-stack';
    return 'stack';
  };

  const handleDragRelease = (cardId: string, point: { x: number; y: number }) => {
    if (!canAct) return;

    for (const [targetCardId, el] of targetRefs.current) {
      if (pointInRect(point.x, point.y, el.getBoundingClientRect())) {
        const targetType = resolveTargetType(targetCardId);
        setActionInFlight(true);
        sendMove(gameSessionId, 'capture', { cardId, payload: { targetType, targetCardId } });
        return;
      }
    }

    const zoneRect = tableZoneRef.current?.getBoundingClientRect();
    if (zoneRect && pointInRect(point.x, point.y, zoneRect)) {
      setActionInFlight(true);
      sendMove(gameSessionId, 'discard', { cardId });
    }
    // Otherwise: dropped somewhere with no meaning — the card just snaps back (Framer's dragSnapToOrigin).
  };

  const teamOrOpponentLabel = view.mode === 'four-team' ? 'Opponent Team' : (view.opponents[0]?.username ?? 'Opponent');
  const yourLabel = view.mode === 'four-team' ? 'Your Team' : 'You';
  const currentTurnSeat = otherSeats.find((s) => s.userId === view.currentTurnUserId);
  const turnBannerOtherLabel = currentTurnSeat ? `${currentTurnSeat.username}'s Turn` : "Opponent's Turn";

  const scoreRevealGroups: ScoreRevealGroup[] =
    view.mode === 'four-individual'
      ? [
          { collectorId: view.yourCollectorId, label: 'You', cards: flattenCollectorCards(myCollector) },
          ...view.opponents.map((o) => ({
            collectorId: o.collectorId,
            label: o.username,
            cards: flattenCollectorCards(view.collectors.find((c) => c.collectorId === o.collectorId)!),
          })),
        ]
      : [
          { collectorId: view.yourCollectorId, label: yourLabel, cards: flattenCollectorCards(myCollector) },
          ...(targetableCollectors[0]
            ? [
                {
                  collectorId: targetableCollectors[0].collectorId,
                  label: teamOrOpponentLabel,
                  cards: flattenCollectorCards(targetableCollectors[0]),
                },
              ]
            : []),
        ];

  return (
    <LayoutGroup>
    <div className="flex-1 flex flex-col">
      {flyingCard && (
        <motion.div
          key={flyingCard.key}
          className="fixed z-40 pointer-events-none"
          style={{ left: 0, top: 0, width: flyingCard.from.width, height: flyingCard.from.height }}
          initial={{ x: flyingCard.from.left, y: flyingCard.from.top, opacity: 1 }}
          animate={{ x: flyingCard.to.left, y: flyingCard.to.top, opacity: 0.85 }}
          transition={{ duration: 0.85, ease: 'easeInOut' }}
          onAnimationComplete={() => setFlyingCard(null)}
        >
          <PlayingCard card={{ rank: 'A', suit: 'spades' }} faceUp={false} size="lg" />
        </motion.div>
      )}
      {/* Top: other seats + their (targetable) stacks */}
      <div className="px-4 pt-3 flex flex-col items-center gap-2">
        <div className="flex flex-wrap justify-center gap-2">
          {otherSeats.map((seat) => (
            <div key={seat.userId} ref={registerSeat(seat.userId)}>
              <SeatBadge seat={seat} isCurrentTurn={seat.userId === view.currentTurnUserId} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {targetableCollectors.map((collector) => (
            <StackPile
              key={collector.collectorId}
              collector={collector}
              label={
                view.mode === 'four-individual'
                  ? (view.opponents.find((o) => o.collectorId === collector.collectorId)?.username ?? 'Stack')
                  : "Opponent's stack"
              }
              registerTopRef={registerTarget(collector.capturedStack.at(-1)?.cardId ?? '__none__')}
            />
          ))}
        </div>
      </div>

      {/* Middle: table (a drop zone for discards, and each card is its own capture target) + draw pile */}
      <div ref={tableZoneRef} className="flex-1 flex flex-col items-center justify-center gap-2 px-4 py-2">
        <div className="flex flex-wrap justify-center gap-2">
          {view.tableCards.length === 0 && <p className="text-xs text-gray-500 py-4">Table is empty</p>}
          {view.tableCards.map((c: CardType, i: number) => (
            <motion.div
              key={c.cardId}
              ref={registerTarget(c.cardId)}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={dealCardVariants}
            >
              <PlayingCard card={c} faceUp size="md" layoutId={`card-${c.cardId}`} />
            </motion.div>
          ))}
        </div>
        <DrawPileVisual count={view.drawPileCount} pileRef={pileRef} />
        {!gameOver && <TurnBanner isYourTurn={isYourTurn} otherLabel={turnBannerOtherLabel} />}
      </div>

      {/* Bottom: your (shared, in team mode) stack + hand + controls */}
      <div className="bg-felt-light/20 border-t border-gold/10 rounded-t-3xl px-4 pt-3 pb-4 flex flex-col items-center gap-2">
        <StackPile
          collector={myCollector}
          label={view.mode === 'four-team' ? 'Your Team' : 'Your stack'}
          registerTopRef={registerTarget(myTopCardId ?? '__none__')}
        />

        <div ref={handZoneRef} className="flex justify-center">
          {view.yourHand.map((c: CardType, index: number) => (
            <motion.div
              key={c.cardId}
              className={index === 0 ? '' : '-ml-7'}
              custom={index}
              initial="hidden"
              animate="visible"
              variants={dealCardVariants}
            >
              <PlayingCard
                card={c}
                faceUp
                size="lg"
                draggable={canAct}
                onDragRelease={(point) => handleDragRelease(c.cardId, point)}
                layoutId={`card-${c.cardId}`}
              />
            </motion.div>
          ))}
        </div>
        <p className="text-center text-xs text-gray-500">{username}</p>

        {isYourTurn && needsToDraw && !gameOver && (
          <button
            onClick={() => {
              setActionInFlight(true);
              sendMove(gameSessionId, 'draw');
            }}
            disabled={actionInFlight}
            className="min-h-[44px] px-8 rounded-xl bg-gold text-felt-dark font-semibold shadow-card active:scale-[0.97] transition-transform disabled:opacity-60"
          >
            Draw
          </button>
        )}
        {canAct && (
          <p className="text-center text-xs text-gray-500">Drag a card onto a match, or onto the table to discard</p>
        )}
      </div>

      <AnimatePresence>
        {(ended || gameOver) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-felt-dark flex items-center justify-center z-50 px-6"
          >
            <div className="bg-felt-dark border border-gold/30 rounded-2xl p-6 text-center max-w-sm w-full">
              {ended && !scoringRevealed ? (
                <SequentialScoreReveal
                  groups={scoreRevealGroups}
                  onComplete={() => {
                    setScoringRevealed(true);
                    if (view.winnerIds.includes(view.yourUserId)) playSfx('win');
                  }}
                />
              ) : (
                <>
                  <p className="text-2xl mb-2">
                    {view.winnerIds.includes(view.yourUserId)
                      ? '🏆 You Win!'
                      : view.winnerIds.length === 0
                        ? "🤝 It's a Tie"
                        : 'Game Over'}
                  </p>

                  {ended && view.mode === 'four-individual' && (
                    <div className="flex flex-col gap-1 mb-4 text-sm text-gray-300">
                      {[
                        { userId: view.yourUserId, label: 'You' },
                        ...view.opponents.map((o) => ({ userId: o.userId, label: o.username })),
                      ]
                        .sort((a, b) => (ended.scores[b.userId] ?? 0) - (ended.scores[a.userId] ?? 0))
                        .map((p, i) => (
                          <div key={p.userId} className="flex justify-between gap-6">
                            <span>
                              {i + 1}. {p.label}
                            </span>
                            <span className="text-gold font-bold">{ended.scores[p.userId] ?? 0}</span>
                          </div>
                        ))}
                    </div>
                  )}
                  {ended && view.mode !== 'four-individual' && (
                    <div className="flex justify-center gap-6 mb-4 text-sm text-gray-300">
                      <div>
                        <p className="text-gray-400 text-xs">{yourLabel}</p>
                        <p className="text-xl font-bold text-gold">{ended.scores[view.yourCollectorId] ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">{teamOrOpponentLabel}</p>
                        <p className="text-xl font-bold text-gold">
                          {ended.scores[targetableCollectors[0]?.collectorId] ?? 0}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    {roomCode && (
                      <button
                        onClick={() => {
                          clear();
                          requestRematch(roomCode);
                        }}
                        className="inline-block rounded-lg bg-gold text-felt-dark font-semibold px-4 py-2 text-sm"
                      >
                        🔄 Request Rematch
                      </button>
                    )}
                    <Link
                      to="/room"
                      onClick={() => {
                        clear();
                        if (roomCode) leaveRoom(roomCode);
                      }}
                      className="inline-block rounded-lg bg-felt-light/60 border border-gold/20 text-gray-200 font-semibold px-4 py-2 text-sm"
                    >
                      🚪 Leave Room
                    </Link>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </LayoutGroup>
  );
}
