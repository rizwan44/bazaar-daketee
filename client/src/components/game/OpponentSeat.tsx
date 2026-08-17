import type { TeenPattiOpponentView } from '@card-games/shared';

interface OpponentSeatProps {
  opponent: TeenPattiOpponentView;
  isCurrentTurn: boolean;
}

export function OpponentSeat({ opponent, isCurrentTurn }: OpponentSeatProps) {
  return (
    <div
      className={[
        'flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all',
        isCurrentTurn ? 'bg-gold/10 ring-2 ring-gold' : 'bg-felt-light/30',
        opponent.status === 'folded' ? 'opacity-40' : '',
      ].join(' ')}
    >
      <div className="relative">
        <div className="h-10 w-10 rounded-full bg-gold/20 flex items-center justify-center text-lg">
          {opponent.isAI ? '🤖' : '👤'}
        </div>
        <span
          className={[
            'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-felt-dark',
            opponent.isConnected ? 'bg-emerald-400' : 'bg-amber-400',
          ].join(' ')}
        />
      </div>
      <span className="text-[11px] text-gray-200 max-w-[64px] truncate">{opponent.username}</span>
      <div className="flex gap-0.5">
        {Array.from({ length: opponent.cardCount }).map((_, i) => (
          <div key={i} className="h-6 w-4 rounded-sm bg-card-back border border-gold/50" />
        ))}
      </div>
      <span className="text-[10px] text-gray-400">
        {opponent.status === 'folded' ? 'Folded' : opponent.isSeen ? 'Seen' : 'Blind'}
      </span>
    </div>
  );
}
