import { Suspense, useEffect, useLayoutEffect } from 'react';
import { NavLink, Outlet, useLocation, useSearchParams } from '../routing';
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
import '@fontsource-variable/sora';
import './v4.css';
import { Icon, type IconName } from './Icon';
import { SheetHost } from './sheet';
import { TrayProvider } from '../state/tray';
import { UndoProvider } from './undo';
import { EarlyAccessFooter } from './EarlyAccess';
import { disableFeed, enableFeed, feedEnabled } from '../live/scores/feed';
import { isStandalone, setInstallIdentity } from '../lib/installIdentity';

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
  const [sp, setSp] = useSearchParams();
  // Real live scores are on by default in v4; `?livescores=0` turns them off for this device and `?livescores=1` back on; the parameter is then dropped from the address.
  const ld = sp.get('livescores');
  useEffect(() => {
    if (ld !== '1' && ld !== '0') return;
    if (ld === '1' && !feedEnabled()) enableFeed();
    if (ld === '0') disableFeed();
    setSp((p) => { const n = new URLSearchParams(p); n.delete('livescores'); return n; }, { replace: true });
  }, [ld, setSp]);
  // The page background is the app's: no classic body colour shows behind the column or in overscroll.
  useEffect(() => {
    const prev = document.body.style.background;
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevTheme = meta?.getAttribute('content') ?? null;
    document.body.style.background = '#07080B';
    meta?.setAttribute('content', '#07080B');
    return () => { document.body.style.background = prev; if (prevTheme) meta?.setAttribute('content', prevTheme); };
  }, []);
  // On v4 the page installs as its own Home Screen app, "SIFT v4" (index.html does the same before the first paint); leaving v4 gives SIFT's own back.
  // A layout effect, so the identity is set and restored in the same commit as the screen, never a frame behind it (a passive effect runs after
  // paint, and a viewer or a test that reads the page the moment v4 is visible could see the old identity).
  useLayoutEffect(() => {
    setInstallIdentity('v4');
    return () => setInstallIdentity('default');
  }, []);
  // The Home Screen app: ask the phone to keep this app's saved Board (a no-op where unsupported; never a prompt, so never in a browser tab).
  useEffect(() => {
    if (isStandalone()) { try { navigator.storage?.persist?.()?.catch(() => {}); } catch { /* unsupported */ } }
  }, []);
  // A new tab or game starts at the top; back/forward restore is the browser's.
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  const onGame = pathname.startsWith('/v4/game/');
  return (
    <div className="v4" data-v4-shell>
      {/* The one research tray provider for v4 (this route sits outside the classic root that mounts its own); it reads and writes the same local store. */}
      <TrayProvider>
      <UndoProvider>
      <SheetHost>
        <div className="v4-col">
          <main className="v4-main" id="v4-main">
            <Suspense fallback={<div className="v4-hand"><div className="v4-skel" style={{ height: 120 }} role="status" aria-label="Loading" /></div>}>
              <Outlet />
            </Suspense>
            <EarlyAccessFooter />
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
      </UndoProvider>
      </TrayProvider>
    </div>
  );
}
