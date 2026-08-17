import { useI18n } from '../../i18n/i18nContext';

export function FriendsScreen() {
  const { t } = useI18n();
  return (
    <div className="px-4 pt-4">
      <h1 className="text-xl font-display font-bold text-white mb-4">{t('friends.title')}</h1>
      <div className="rounded-xl border border-dashed border-gold/20 p-8 text-center text-sm text-gray-400">
        Friends list, requests, and invites arrive with the multiplayer room engine phase.
      </div>
    </div>
  );
}
