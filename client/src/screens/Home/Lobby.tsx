import { GAME_CATALOG } from '@card-games/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/i18nContext';
import { useSocketPing } from '../../services/socket';

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; to: string };
  children: ReactNode;
}) {
  return (
    <section className="px-4 mt-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gold/90 uppercase tracking-wide">{title}</h2>
        {action && (
          <Link to={action.to} className="text-xs text-gold">
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function GameChip({ name, gameKey }: { name: string; gameKey: string }) {
  return (
    <Link
      to={`/play/${gameKey}`}
      className="shrink-0 w-28 rounded-lg bg-felt-light/60 border border-gold/10 p-3 flex flex-col items-center gap-2 active:scale-95 transition-transform"
    >
      <div className="h-10 w-10 rounded-full bg-gold/20 flex items-center justify-center text-lg">🂡</div>
      <span className="text-xs text-center text-gray-200 line-clamp-2">{name}</span>
    </Link>
  );
}

export function Lobby() {
  const { t } = useI18n();
  const { status } = useSocketPing();
  const popular = GAME_CATALOG.slice(0, 8);
  const solo = GAME_CATALOG.filter((g) => g.isSolo).slice(0, 8);

  return (
    <div>
      <header className="px-4 pt-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400">{t('home.greeting')}</p>
          <h1 className="text-xl font-display font-bold text-white">52 Card Games</h1>
        </div>
        <span
          className={[
            'h-2.5 w-2.5 rounded-full',
            status === 'connected' ? 'bg-emerald-400' : status === 'connecting' ? 'bg-amber-400' : 'bg-red-500',
          ].join(' ')}
          title={`Server: ${status}`}
        />
      </header>

      <div className="px-4 mt-4">
        <Link
          to="/games"
          className="block w-full rounded-xl bg-gold text-felt-dark font-semibold text-center py-3 shadow-card active:scale-[0.98] transition-transform"
        >
          {t('home.quickPlay')}
        </Link>
      </div>

      <Section title={t('home.popularGames')}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {popular.map((g) => (
            <GameChip key={g.key} name={g.name} gameKey={g.key} />
          ))}
        </div>
      </Section>

      <Section title={t('home.soloGames')} action={{ label: 'Play vs AI →', to: '/solo' }}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {solo.map((g) => (
            <GameChip key={g.key} name={g.name} gameKey={g.key} />
          ))}
        </div>
      </Section>

      <Section title={t('home.playWithFriends')}>
        <Link
          to="/room"
          className="block rounded-lg border border-dashed border-gold/30 p-4 text-center text-sm text-gray-300"
        >
          {t('home.playWithFriends')} →
        </Link>
      </Section>

      <Section title={t('home.leaderboard')}>
        <div className="rounded-lg bg-felt-light/40 p-4 text-sm text-gray-400 text-center">
          {t('games.comingSoon')}
        </div>
      </Section>
    </div>
  );
}
