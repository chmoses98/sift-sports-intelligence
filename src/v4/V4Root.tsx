import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from '../routing';
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
import '@fontsource-variable/sora';
import './v4.css';
import { Icon, type IconName } from './Icon';
import { SheetHost } from './sheet';

const TABS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/v4', label: 'Home', icon: 'house', end: true },
  { to: '/v4/games', label: 'Games', icon: 'calendar-dots' },
  { to: '/v4/props', label: 'Props', icon: 'target' },
  { to: '/v4/signals', label: 'Signals', icon: 'pulse' },
  { to: '/v4/board', label: 'Board', icon: 'bookmark-simple' },
];

/** The v4 shell: one phone-width column, five tabs, safe areas, one sheet host. The classic chrome never renders here. */
export function V4Root() {
  const { pathname } = useLocation();
  // The page background is the app's: no classic body colour shows behind the column or in overscroll.
  useEffect(() => {
    const prev = document.body.style.background;
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevTheme = meta?.getAttribute('content') ?? null;
    document.body.style.background = '#07080B';
    meta?.setAttribute('content', '#07080B');
    return () => { document.body.style.background = prev; if (prevTheme) meta?.setAttribute('content', prevTheme); };
  }, []);
  // A new tab or game starts at the top; back/forward restore is the browser's.
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  const onGame = pathname.startsWith('/v4/game/');
  return (
    <div className="v4" data-v4-shell>
      <SheetHost>
        <div className="v4-col">
          <main className="v4-main" id="v4-main">
            <Suspense fallback={<div className="v4-hand"><div className="v4-skel" style={{ height: 120 }} role="status" aria-label="Loading" /></div>}>
              <Outlet />
            </Suspense>
          </main>
        </div>
        <nav className="v4-tabbar" aria-label="Primary">
          <div className="v4-tabbar__in">
            {TABS.map((t) => {
              // A game is opened from Home or Games: keep Games lit while one is open.
              const gamesTab = t.to === '/v4/games' && onGame;
              return (
                <NavLink key={t.to} to={t.to} end={t.end} className="v4-tab" aria-current={gamesTab ? 'page' : undefined}>
                  {({ isActive }) => {
                    const on = isActive || gamesTab;
                    return (<><Icon name={t.icon} filled={on} /><span>{t.label}</span></>);
                  }}
                </NavLink>
              );
            })}
          </div>
        </nav>
      </SheetHost>
    </div>
  );
}
