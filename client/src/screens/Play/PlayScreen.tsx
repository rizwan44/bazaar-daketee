import { getGameByKey } from '@card-games/shared';
import { Link, useParams } from 'react-router-dom';

export function PlayScreen() {
  const { gameKey } = useParams<{ gameKey: string }>();
  const game = gameKey ? getGameByKey(gameKey) : undefined;

  if (!game) {
    return (
      <div className="px-4 pt-4">
        <h1 className="text-xl font-display font-bold text-white mb-2">Game</h1>
        <div className="rounded-xl border border-dashed border-gold/20 p-8 text-center text-sm text-gray-400">
          Unknown game.
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4">
      <h1 className="text-xl font-display font-bold text-white mb-1">{game.name}</h1>
      <p className="text-xs text-gray-400 mb-6">
        {game.minPlayers === game.maxPlayers
          ? `${game.minPlayers} players`
          : `${game.minPlayers}-${game.maxPlayers} players`}
        {' · '}
        {game.description}
      </p>

      {game.isImplemented ? (
        <div className="flex flex-col gap-3">
          <Link
            to={`/solo?game=${game.key}`}
            className="rounded-xl bg-gold text-felt-dark font-semibold text-center py-4 shadow-card active:scale-[0.98] transition-transform"
          >
            Play Solo vs AI
          </Link>
          <Link
            to={`/room/create?game=${game.key}`}
            className="rounded-xl bg-felt-light/60 border border-gold/20 text-gray-100 font-semibold text-center py-4 active:scale-[0.98] transition-transform"
          >
            Play with Friends
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gold/20 p-8 text-center text-sm text-gray-400">
          {game.name} rules and table UI ship in a later phase — this screen just confirms
          routing works.
        </div>
      )}
    </div>
  );
}
