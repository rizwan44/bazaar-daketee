import { GAME_CATALOG, type GameCatalogEntry } from '@card-games/shared';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/i18nContext';

type Filter = 'all' | 'solo' | 'multiplayer';

function GameCard({ game }: { game: GameCatalogEntry }) {
  const { t } = useI18n();
  const body = (
    <div
      className={[
        'rounded-xl border border-gold/10 bg-felt-light/50 p-3 flex flex-col gap-2',
        game.isImplemented ? 'active:scale-95 transition-transform' : 'opacity-60',
      ].join(' ')}
    >
      <div className="h-16 rounded-lg bg-gold/10 flex items-center justify-center text-3xl">🂡</div>
      <div>
        <p className="text-sm font-semibold text-white line-clamp-1">{game.name}</p>
        <p className="text-[11px] text-gray-400">
          {game.minPlayers === game.maxPlayers
            ? `${game.minPlayers} players`
            : `${game.minPlayers}–${game.maxPlayers} players`}
        </p>
      </div>
      {!game.isImplemented && (
        <span className="self-start text-[10px] rounded-full bg-black/30 px-2 py-0.5 text-gray-300">
          {t('games.comingSoon')}
        </span>
      )}
    </div>
  );

  return game.isImplemented ? <Link to={`/play/${game.key}`}>{body}</Link> : <div>{body}</div>;
}

export function GamesList() {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    return GAME_CATALOG.filter((g) => {
      const matchesQuery = g.name.toLowerCase().includes(query.trim().toLowerCase());
      const matchesFilter =
        filter === 'all' ||
        (filter === 'solo' && g.isSolo) ||
        (filter === 'multiplayer' && g.maxPlayers > 1);
      return matchesQuery && matchesFilter;
    });
  }, [query, filter]);

  return (
    <div className="px-4 pt-4">
      <h1 className="text-xl font-display font-bold text-white mb-3">{t('games.title')}</h1>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('games.searchPlaceholder')}
        className="w-full rounded-lg bg-felt-light/50 border border-gold/10 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-gold/50"
      />

      <div className="flex gap-2 mt-3 mb-4">
        {(['all', 'solo', 'multiplayer'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={[
              'min-h-[44px] px-3 rounded-full text-xs font-medium',
              filter === f ? 'bg-gold text-felt-dark' : 'bg-felt-light/50 text-gray-300',
            ].join(' ')}
          >
            {f === 'all' ? 'All' : f === 'solo' ? 'Solo' : 'Multiplayer'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-4">
        {filtered.map((game) => (
          <GameCard key={game.key} game={game} />
        ))}
      </div>
    </div>
  );
}
