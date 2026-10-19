import { House, ScrollText, Boxes, CalendarDays, UserRound } from 'lucide-react';
import type { Page } from '../data/types';
import { useApp } from '../state/AppContext';
const tabs = [
  { page: 'home', label: '总览', Icon: House },
  { page: 'orders', label: '订单', Icon: ScrollText },
  { page: 'storage', label: '收纳', Icon: Boxes },
  { page: 'calendar', label: '日历', Icon: CalendarDays },
  { page: 'settings', label: '我的', Icon: UserRound },
] as const;
export function Navigation() {
  const { route, navigate } = useApp();
  return (
    <nav className="bottom-nav" aria-label="主导航">
      {tabs.map(({ page, label, Icon }) => (
        <button
          key={page}
          aria-current={route.page === page ? 'page' : undefined}
          className={route.page === page ? 'active' : ''}
          onClick={() => navigate({ page: page as Page })}
        >
          <Icon size={22} strokeWidth={route.page === page ? 2 : 1.6} />
          <span>{label}</span>
          {route.page === page && <i />}
        </button>
      ))}
    </nav>
  );
}
