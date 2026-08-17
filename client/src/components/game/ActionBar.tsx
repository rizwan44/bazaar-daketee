import type { GameMove } from '@card-games/shared';

interface ActionBarProps {
  validMoves: GameMove[];
  onAction: (type: string) => void;
}

const LABELS: Record<string, string> = {
  fold: 'Fold',
  see: 'See Cards',
  chaal: 'Chaal',
  raise: 'Raise',
  show: 'Show',
};

const STYLES: Record<string, string> = {
  fold: 'bg-red-500/20 text-red-300 border border-red-500/30',
  see: 'bg-felt-light/70 text-gray-100 border border-gold/20',
  chaal: 'bg-gold text-felt-dark',
  raise: 'bg-amber-500 text-felt-dark',
  show: 'bg-emerald-500 text-felt-dark',
};

export function ActionBar({ validMoves, onAction }: ActionBarProps) {
  if (validMoves.length === 0) {
    return <p className="text-center text-xs text-gray-500 py-3">Waiting for your turn…</p>;
  }

  return (
    <div className="flex flex-wrap justify-center gap-2.5 w-full max-w-sm mx-auto">
      {validMoves.map((move) => (
        <button
          key={move.type}
          onClick={() => onAction(move.type)}
          className={[
            'flex-1 basis-[45%] min-w-[110px] min-h-[48px] rounded-xl text-sm font-semibold',
            'shadow-card active:scale-[0.97] transition-transform',
            STYLES[move.type] ?? 'bg-felt-light text-gray-100',
          ].join(' ')}
        >
          {LABELS[move.type] ?? move.type}
        </button>
      ))}
    </div>
  );
}
