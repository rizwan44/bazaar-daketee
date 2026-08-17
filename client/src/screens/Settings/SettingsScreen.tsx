import { useI18n, type Language } from '../../i18n/i18nContext';
import { useSettingsStore } from '../../store/settingsStore';
import { useThemeStore } from '../../store/themeStore';

function ToggleRow({
  label,
  enabled,
  onToggle,
}: {
  label: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gold/10">
      <span className="text-sm text-gray-200">{label}</span>
      <button
        onClick={onToggle}
        className={[
          'w-12 h-7 rounded-full relative transition-colors',
          enabled ? 'bg-gold' : 'bg-gray-600',
        ].join(' ')}
        aria-pressed={enabled}
      >
        <span
          className={[
            'absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform',
            enabled ? 'translate-x-5' : 'translate-x-0.5',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

export function SettingsScreen() {
  const { t, language, setLanguage } = useI18n();
  const { theme, toggleTheme } = useThemeStore();
  const { soundEnabled, musicEnabled, vibrationEnabled, toggleSound, toggleMusic, toggleVibration } =
    useSettingsStore();

  return (
    <div className="px-4 pt-4">
      <h1 className="text-xl font-display font-bold text-white mb-4">{t('settings.title')}</h1>

      <div className="rounded-xl bg-felt-light/40 border border-gold/10 px-4">
        <ToggleRow label={t('settings.sound')} enabled={soundEnabled} onToggle={toggleSound} />
        <ToggleRow label={t('settings.music')} enabled={musicEnabled} onToggle={toggleMusic} />
        <ToggleRow label={t('settings.vibration')} enabled={vibrationEnabled} onToggle={toggleVibration} />

        <div className="flex items-center justify-between py-3">
          <span className="text-sm text-gray-200">{t('settings.theme')}</span>
          <button
            onClick={toggleTheme}
            className="rounded-full bg-felt-dark border border-gold/30 px-3 py-1.5 text-xs text-gold min-h-[44px]"
          >
            {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-felt-light/40 border border-gold/10 px-4 py-3">
        <p className="text-sm text-gray-200 mb-2">Language</p>
        <div className="flex gap-2">
          {(
            [
              ['en', 'English'],
              ['ur', 'اردو'],
              ['roman-ur', 'Roman Urdu'],
            ] as [Language, string][]
          ).map(([code, label]) => (
            <button
              key={code}
              onClick={() => setLanguage(code)}
              className={[
                'min-h-[44px] px-3 rounded-lg text-xs',
                language === code ? 'bg-gold text-felt-dark' : 'bg-felt-dark/60 text-gray-300',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
