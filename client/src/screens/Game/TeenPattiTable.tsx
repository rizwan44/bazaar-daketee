import type { Card as CardType, GameEndedPayload, TeenPattiPlayerView } from '@card-games/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ActionBar } from '../../components/game/ActionBar';
import { OpponentSeat } from '../../components/game/OpponentSeat';
import { PlayingCard } from '../../components/card/PlayingCard';
import { ensureGameSocketReady, joinGame, sendMove } from '../../services/gameSocket';
import { useConnectionStore } from '../../store/connectionStore';
import { useGameStore } from '../../store/gameStore';

interface TeenPattiTableProps {
  gameSessionId: string;
}

function useCountdown(expiresAt: string | null): number {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(0);
      return;
    }
    const target = new Date(expiresAt).getTime();
    const tick = () => setRemaining(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

export function TeenPattiTable({ gameSessionId }: TeenPattiTableProps) {
  // This table only ever mounts for a teen-patti session (see RoomScreen's
  // gameKey branch), so the store's game-agnostic view is known to be this shape here.
  const view = useGameStore((s) => s.view) as TeenPattiPlayerView | null;
  const ended = useGameStore((s) => s.ended) as GameEndedPayload | null;
  const clear = useGameStore((s) => s.clear);
  const username = useConnectionStore((s) => s.username);
  const isYourTurn = view?.currentTurnUserId === view?.yourUserId;
  const secondsLeft = useCountdown(isYourTurn ? (view?.turnExpiresAt ?? null) : null);

  useEffect(() => {
    ensureGameSocketReady();
    joinGame(gameSessionId);
  }, [gameSessionId]);

  if (!view) {
    return <div className="px-4 pt-10 text-center text-sm text-gray-400">Joining table…</div>;
  }

  const handOver = view.phase === 'complete';

  return (
    <div className="flex-1 flex flex-col">
      {/* Top: opponents + pot, grouped together so they don't drift apart on tall screens */}
      <div className="px-4 pt-4">
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {view.opponents.map((o) => (
            <OpponentSeat key={o.userId} opponent={o} isCurrentTurn={o.userId === view.currentTurnUserId} />
          ))}
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="rounded-2xl bg-felt-light/40 border border-gold/20 px-8 py-4 text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Pot</p>
            <p className="text-3xl font-bold text-gold">{view.pot}</p>
            <p className="text-xs text-gray-400 mt-1">Stake: {view.currentStake}</p>
          </div>
          {isYourTurn && !handOver && (
            <p className="text-sm text-emerald-300">Your turn — {secondsLeft}s</p>
          )}
        </div>
      </div>

      {/* Absorbs whatever vertical space is left, so the hand/action tray below stays grounded at the bottom */}
      <div className="flex-1" />

      {/* Bottom: own hand + controls, a distinct panel rather than floating on bare felt */}
      <div className="bg-felt-light/20 border-t border-gold/10 rounded-t-3xl px-4 pt-5 pb-6 flex flex-col items-center gap-3">
        <div className="flex justify-center">
          {view.yourHand.map((c: CardType, index) => (
            <div key={c.cardId} className={index === 0 ? '' : '-ml-9'}>
              <PlayingCard
                card={c}
                faceUp={view.yourIsSeen}
                size="xl"
                onClick={
                  !view.yourIsSeen && view.yourValidMoves.some((m) => m.type === 'see')
                    ? () => sendMove(gameSessionId, 'see')
                    : undefined
                }
              />
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-gray-500">
          {username} · {view.yourRemainingCoins} coins
        </p>

        <ActionBar validMoves={view.yourValidMoves} onAction={(type) => sendMove(gameSessionId, type)} />
      </div>

      <AnimatePresence>
        {(ended || handOver) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-felt-dark flex items-center justify-center z-50 px-6"
          >
            <div className="bg-felt-dark border border-gold/30 rounded-2xl p-6 text-center max-w-sm w-full">
              <p className="text-2xl mb-2">
                {view.winnerId === view.yourUserId ? '🏆 You Win!' : 'Hand Over'}
              </p>
              <p className="text-sm text-gray-300 mb-4">
                {view.winnerId === view.yourUserId
                  ? `You won ${ended?.potWon ?? view.pot} coins`
                  : 'Better luck next hand'}
              </p>

              {view.revealedHands && (
                <div className="flex flex-wrap justify-center gap-4 mb-4">
                  {Object.entries(view.revealedHands).map(([userId, hand]) => (
                    <div key={userId} className="flex flex-col items-center gap-1">
                      <div className="flex gap-1">
                        {hand.map((c) => (
                          <PlayingCard key={c.cardId} card={c} faceUp size="sm" />
                        ))}
                      </div>
                      <span className="text-[10px] text-gray-400">
                        {userId === view.yourUserId
                          ? 'You'
                          : (view.opponents.find((o) => o.userId === userId)?.username ?? userId)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <Link
                to="/room"
                onClick={clear}
                className="inline-block rounded-lg bg-gold text-felt-dark font-semibold px-4 py-2 text-sm"
              >
                Back to Lobby
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
