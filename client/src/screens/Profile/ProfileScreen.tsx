import { useI18n } from '../../i18n/i18nContext';

export function ProfileScreen() {
  const { t } = useI18n();
  return (
    <div className="px-4 pt-4">
      <h1 className="text-xl font-display font-bold text-white mb-4">{t('profile.title')}</h1>
      <div className="rounded-xl bg-felt-light/50 border border-gold/10 p-5 flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-gold/20 flex items-center justify-center text-2xl">👤</div>
        <div>
          <p className="text-white font-semibold">Guest Player</p>
          <p className="text-xs text-gray-400">Level 1 · 0 XP</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4">
        {[
          ['Wins', '0'],
          ['Losses', '0'],
          ['Win Rate', '0%'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-felt-light/40 p-3 text-center">
            <p className="text-lg font-bold text-white">{value}</p>
            <p className="text-[11px] text-gray-400">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-gray-500">
        Accounts, XP, and match history connect once auth ships.
      </p>
    </div>
  );
}
