import { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from '../routing';
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
import '@fontsource-variable/sora';
import './v3.css';
import './screens/home.css';
import './screens/games.css';
import './screens/game.css';
import './screens/research.css';
import './ui/atoms.css';
import { Icon, type IconName } from './ui/Icon';
import { SheetHost } from './ui/Sheet';
import './ui/ContractSheet'; // registers the addressed `contract` sheet for every screen
import { SlateProvider, useSlate } from './data/useSlate';
import { applyDemoParam, demoOn, SAMPLE_ONLY, usePrefs } from './state/prefs';
import { useScrollMemory } from './state/scroll';
import { RESEARCH_FETCH_TIMEOUT_MS, setFetchTimeout } from '../data/fetcher';

const TABS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/v3', label: 'Home', icon: 'home', end: true },
  { to: '/v3/games', label: 'Games', icon: 'games' },
  { to: '/v3/props', label: 'Explore', icon: 'explore' },
  { to: '/v3/following', label: 'Following', icon: 'following' },
];

/** Which of the four tabs a route belongs to. Detail screens keep the tab they were opened from (the last primary tab visited). */
let lastTab = '/v3';
const tabOf = (path: string): string => {
  const p = path.replace(/\/+$/, '') || '/v3';
  if (p === '/v3') return (lastTab = '/v3');
  // Explore is Prop Discovery (the locked walkthrough roots it there); the older search screen stays at /v3/explore under the same tab.
  if (p === '/v3/explore' || p.startsWith('/v3/explore/')) return (lastTab = '/v3/props');
  const hit = TABS.find((t) => t.to !== '/v3' && (p === t.to || p.startsWith(`${t.to}/`)));
  if (hit) return (lastTab = hit.to);
  // The locked references light Games for the Team, Player and Game screens and Explore for Stat Detail and Prop Discovery.
  if (p.startsWith('/v3/game/') || p.startsWith('/v3/team/') || p.startsWith('/v3/player/')) return (lastTab = '/v3/games');
  if (p.startsWith('/v3/stat/')) return (lastTab = '/v3/props');
  return lastTab;
};

function OfflineStrip() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (online) return null;
  return <div className="v3-offline" role="status"><Icon name="wifiOff" size={16} /><span>You are offline. Showing the last data this device loaded; scores and prices are not live.</span><button type="button" onClick={() => location.reload()}>Retry</button></div>;
}

function DemoStrip() {
  const { demo } = useSlate();
  const nav = useNavigate();
  if (!demo) return null;
  return (
    <div className="v3-demo" role="note">
      <b>Sample data</b> <span>fictional scores &amp; prices</span>
      {!SAMPLE_ONLY && <a href="#/v3?demo=0" onClick={(e) => { e.preventDefault(); nav('/v3?demo=0', { replace: true }); }}>Use real data</a>}
    </div>
  );
}

/**
 * Research read from the copy saved with the app (the live publication could not be read) is never silent: Home and Games say so themselves;
 * every other screen of that sport gets this strip. It names the sport and says prices appear only with a current Kalshi quote.
 */
function SavedCopyStrip() {
  const { saved } = useSlate();
  const { pathname } = useLocation();
  if (!saved.length || pathname === '/v3' || pathname.startsWith('/v3/games')) return null;
  const slug = /^\/v3\/(?:player|team|stat|game)\/([a-z]+)\//.exec(pathname)?.[1];
  const mine = slug ? saved.filter((s) => s.slug === slug) : /^\/v3\/props/.test(pathname) ? saved : [];
  if (!mine.length) return null;
  return <div className="v3-state v3-state--warn" role="status" data-state="saved-copy" style={{ margin: '8px 16px 0' }}><Icon name="info" size={20} /><div><b>Saved copy in use</b>{mine.map((x) => x.label).join(', ')} {mine.length === 1 ? 'is' : 'are'} showing the research saved with this app because the live publication could not be read. Prices appear only when a current Kalshi quote is available.</div></div>;
}

function Shell() {
  const loc = useLocation();
  const active = tabOf(loc.pathname);
  const slate = useSlate();
  useScrollMemory(!slate.loading);
  return (
    <>
      <div className="v3-col">
        <DemoStrip />
        <OfflineStrip />
        <SavedCopyStrip />
        <main className="v3-main" id="v3-main">
          <Suspense fallback={<div className="v3-page"><div className="v3-skel" style={{ height: 160 }} role="status" aria-label="Loading" /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <nav className="v3-nav" aria-label="Primary">
        <div className="v3-nav__in">
          {TABS.map((t) => (
            <Link key={t.to} to={t.to} aria-current={active === t.to ? 'page' : undefined}>
              <Icon name={t.icon} size={24} fill={t.icon === 'following' && active === t.to} />
              <span>{t.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}

/** The v3 shell: one phone-width column, four tabs, safe areas, one sheet host. The classic chrome never renders here. */
export function V3Root() {
  const loc = useLocation();
  const nav = useNavigate();
  const prefs = usePrefs();
  // `?demo=1` / `?demo=0` switches sample-data mode for this tab; the parameter is then dropped from the address.
  applyDemoParam(loc.search);
  const [demo, setDemo] = useState(demoOn());
  useEffect(() => {
    const q = new URLSearchParams(loc.search);
    if (!q.has('demo')) return;
    q.delete('demo');
    setDemo(demoOn());
    nav({ pathname: loc.pathname, search: q.toString() ? `?${q}` : '' }, { replace: true });
  }, [loc.pathname, loc.search, nav]);
  // Every research document is read within a bound while SIFT 3.0 is open (a request that never answers becomes an honest state with a Retry, not an
  // endless skeleton). Layout effects run before any screen's data effect, so the first request is already bounded. `__SIFT_FETCH_TIMEOUT_MS__` is a
  // test seam for the unavailable-data harness (e2e/v3-unavailable.spec.ts); the app never sets it.
  useLayoutEffect(() => {
    const o = (window as unknown as { __SIFT_FETCH_TIMEOUT_MS__?: number }).__SIFT_FETCH_TIMEOUT_MS__;
    setFetchTimeout(typeof o === 'number' && o > 0 ? o : RESEARCH_FETCH_TIMEOUT_MS);
    return () => setFetchTimeout(null);
  }, []);
  // The page behind the column is the app's own colour, never the classic body.
  useLayoutEffect(() => {
    const prev = document.body.style.background;
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevTheme = meta?.getAttribute('content') ?? null;
    document.body.style.background = '#080b10';
    meta?.setAttribute('content', '#080b10');
    return () => { document.body.style.background = prev; if (prevTheme) meta?.setAttribute('content', prevTheme); };
  }, []);
  return (
    <div className="v3" data-v3-shell data-text={prefs.textScale === 'large' ? 'large' : undefined} data-motion={prefs.reduceMotion ? 'reduce' : undefined}>
      <SlateProvider key={demo ? 'demo' : 'real'} demo={demo}>
        <SheetHost>
          <Shell />
        </SheetHost>
      </SlateProvider>
    </div>
  );
}
