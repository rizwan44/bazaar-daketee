import { NavLink } from 'react-router-dom';
import { useI18n } from '../../i18n/i18nContext';

interface NavItem {
  to: string;
  labelKey: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.home', icon: '🏠' },
  { to: '/games', labelKey: 'nav.games', icon: '🃏' },
  { to: '/friends', labelKey: 'nav.friends', icon: '👥' },
  { to: '/profile', labelKey: 'nav.profile', icon: '👤' },
];

export function BottomNav() {
  const { t } = useI18n();

  return (
    <nav
      className={[
        'fixed bottom-0 left-0 right-0 z-40',
        'bg-felt-dark/95 backdrop-blur border-t border-gold/20',
        'pb-safe-bottom',
      ].join(' ')}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              [
                'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs',
                isActive ? 'text-gold' : 'text-gray-400',
              ].join(' ')
            }
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
