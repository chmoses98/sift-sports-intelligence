import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { NAV_SPORTS, navSport, STATUS_WORD, type NavSport } from '../data/nav';
import { routes } from '../lib/routes';
import { useSearch } from '../search/useSearch';
import { useTrail, type TrailStep } from '../state/trail';
import { useTray } from '../state/tray';
import { Icon, SiftWordmark } from './Icon';
import { SearchResults } from './SearchResults';
import { TrayDrawer } from './TrayDrawer';

function SearchBox() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const state = useSearch(open ? q : '');
  const nav = useNavigate();
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    const onDoc = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc);
    };
  }, []);
  return (
    <div className="searchbox" ref={wrap}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(false);
          nav(routes.search(q));
        }}
      >
        <Icon name="search" size={16} className="searchbox__icon" />
        <input
          ref={input}
          type="search"
          value={q}
          placeholder="Search teams, players, games, markets"
          aria-label="Search Sift"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        />
        <kbd className="searchbox__kbd" aria-hidden="true">/</kbd>
      </form>
      {open && q.trim() && (
        <div className="searchbox__pop">
          <SearchResults state={state} query={q} compact onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** The sport whose screens are on view, from the address (#/nfl/…). */
function useSportContext(): NavSport | undefined {
  const loc = useLocation();
  return navSport(loc.pathname.split('/')[1]);
}

/**
 * The breadcrumb: the sport (when inside one) then the research path since its home. Steps from another
 * sport are left out so the crumb always reads as one coherent path.
 */
function TrailBar({ sport }: { sport: NavSport | undefined }) {
  const { steps } = useTrail();
  const loc = useLocation();
  const here = loc.pathname + loc.search;
  const inSport = (s: TrailStep) => !sport || s.href === `/${sport.slug}` || s.href.startsWith(`/${sport.slug}/`) || s.href.startsWith(`/${sport.slug}?`);
  const shown = steps.filter((s) => s.kind !== 'home' && s.kind !== 'sport' && inSport(s)).slice(-5);
  if (!sport && !shown.length) return null;
  const atRoot = sport && loc.pathname === `/${sport.slug}`;
  return (
    <nav className="trail" aria-label="Research path">
      <ol>
        {sport && (
          <li className={atRoot ? 'is-here' : undefined}>
            {atRoot ? (
              <span aria-current="page" className="trail__root"><Icon name={sport.icon} size={15} /> {sport.label}</span>
            ) : (
              <Link to={routes.sport(sport.slug)} className="trail__root"><Icon name={sport.icon} size={15} /> {sport.label}</Link>
            )}
          </li>
        )}
        {shown.map((s) => (
          <li key={s.href} className={s.href === here ? 'is-here' : undefined}>
            {s.href === here ? <span aria-current="page">{s.label}</span> : <Link to={s.href}>{s.label}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Toast() {
  const tray = useTray();
  const [show, setShow] = useState<string | null>(null);
  useEffect(() => {
    if (!tray.lastAdded) return;
    setShow(tray.lastAdded);
    const t = setTimeout(() => setShow(null), 3200);
    return () => clearTimeout(t);
  }, [tray.lastAdded]);
  const label = show ? tray.labels[show]?.label : null;
  // Never over the open tray sheet: it would cover the sheet's build-packet button on phones.
  if (!show || !label || tray.open) return null;
  return (
    <div className="toast" role="status">
      <Icon name="check" size={16} />
      <span>
        Saved <b>{label}</b> to the research tray
      </span>
      <button type="button" className="toast__btn" onClick={() => tray.setOpen(true)}>Open</button>
      <button type="button" className="toast__btn" onClick={() => { tray.remove(show); setShow(null); }}>Undo</button>
    </div>
  );
}

function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true);
    const b = () => setOn(false);
    window.addEventListener('online', a);
    window.addEventListener('offline', b);
    return () => {
      window.removeEventListener('online', a);
      window.removeEventListener('offline', b);
    };
  }, []);
  return on;
}

const WORKSPACE: { to: string; label: string; icon: string }[] = [
  { to: routes.tray(), label: 'Research', icon: 'research' },
  { to: routes.parlays('nfl'), label: 'Parlays', icon: 'parlays' },
  { to: routes.news(), label: 'News', icon: 'news' },
  { to: routes.search(), label: 'Search', icon: 'search' },
];

function SportLink({ s, onPick }: { s: NavSport; onPick?: () => void }) {
  return (
    <NavLink to={routes.sport(s.slug)} className="side__a" style={{ ['--accent' as string]: s.accent }} onClick={onPick}>
      <span className="side__ic"><Icon name={s.icon} size={19} /></span>
      <span className="side__t">{s.label}</span>
      {s.status !== 'live' && <span className={`side__tag side__tag--${s.status}`}>{s.status === 'beta' ? 'beta' : s.status === 'planned' ? 'soon' : ''}</span>}
    </NavLink>
  );
}

/** Desktop and tablet navigation: every sport, then the workspace. */
function Sidebar({ count }: { count: number }) {
  return (
    <aside className="side">
      <Link to={routes.home()} className="side__brand" aria-label="Sift home">
        <SiftWordmark />
      </Link>
      <nav className="side__nav" aria-label="Sports">
        <NavLink to={routes.home()} end className="side__a">
          <span className="side__ic"><Icon name="home" size={19} /></span>
          <span className="side__t">Home</span>
        </NavLink>
        {NAV_SPORTS.map((s) => <SportLink key={s.slug} s={s} />)}
        <NavLink to={routes.sports()} className="side__a">
          <span className="side__ic"><Icon name="more" size={19} /></span>
          <span className="side__t">More</span>
        </NavLink>
      </nav>
      <nav className="side__nav side__nav--work" aria-label="Workspace">
        {WORKSPACE.map((w) => (
          <NavLink key={w.label} to={w.to} className="side__a">
            <span className="side__ic"><Icon name={w.icon} size={19} /></span>
            <span className="side__t">{w.label}</span>
            {w.label === 'Research' && count > 0 && <span className="side__n" aria-label={`${count} in tray`}>{count}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="side__foot">
        <NavLink to={routes.settings()} className="side__a">
          <span className="side__ic"><Icon name="settings" size={19} /></span>
          <span className="side__t">Settings</span>
        </NavLink>
      </div>
    </aside>
  );
}

/** Phones: every sport and section one tap away, as a sheet above the tab bar. */
function SportsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <>
      <div className={`scrim scrim--sheet${open ? ' is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <div className={`sheet${open ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Sports and sections" aria-hidden={!open} inert={!open} tabIndex={-1} ref={ref}>
        <div className="sheet__grip" aria-hidden="true" />
        <div className="sheet__h">
          <span className="eyebrow">Sports</span>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <ul className="sheet__sports">
          {NAV_SPORTS.map((s) => (
            <li key={s.slug}>
              <NavLink to={routes.sport(s.slug)} className="sheet__sport" style={{ ['--accent' as string]: s.accent }} onClick={onClose}>
                <Icon name={s.icon} size={22} />
                <span className="sheet__l">{s.label}</span>
                <span className="sheet__st">{STATUS_WORD[s.status]}</span>
              </NavLink>
            </li>
          ))}
          <li>
            <NavLink to={routes.sports()} className="sheet__sport" onClick={onClose}>
              <Icon name="more" size={22} />
              <span className="sheet__l">More</span>
              <span className="sheet__st">All sports</span>
            </NavLink>
          </li>
        </ul>
        <div className="sheet__h"><span className="eyebrow">Workspace</span></div>
        <ul className="sheet__work">
          {[...WORKSPACE.filter((w) => w.label !== 'Search'), { to: routes.settings(), label: 'Settings', icon: 'settings' }].map((w) => (
            <li key={w.label}>
              <NavLink to={w.to} className="sheet__wa" onClick={onClose}><Icon name={w.icon} size={18} /> {w.label}</NavLink>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const tray = useTray();
  const loc = useLocation();
  const online = useOnline();
  const sport = useSportContext();
  const [sheet, setSheet] = useState(false);
  const closeSheet = useCallback(() => setSheet(false), []);
  const count = tray.tray.items.length;
  useEffect(() => {
    tray.setOpen(false);
    setSheet(false);
  }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const tabSport = sport ?? NAV_SPORTS[0];
  return (
    <div className="app">
      <a href="#main" className="skip" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <Sidebar count={count} />
      <div className="app__col">
        <header className="topbar">
          <div className="topbar__in">
            <Link to={routes.home()} className="topbar__brand" aria-label="Sift home">
              <SiftWordmark compact />
            </Link>
            <TrailBar sport={sport} />
            <SearchBox />
            <button type="button" className={`traybtn${count ? ' has-items' : ''}`} onClick={() => tray.setOpen(!tray.open)} aria-expanded={tray.open} aria-controls="tray-drawer">
              <Icon name="research" size={17} />
              <span className="traybtn__label">Research tray</span>
              <span className="traybtn__n" aria-hidden="true">{count}</span>
              <span className="sr-only">{count === 1 ? '1 item' : `${count} items`}</span>
            </button>
            <Link to={routes.search()} className="topbar__search iconbtn" aria-label="Search"><Icon name="search" /></Link>
          </div>
        </header>
        {!online && <div className="offline" role="status">Offline — showing research you already opened. Market quotes are not refreshing; each keeps its real age.</div>}
        <main id="main" tabIndex={-1} className="main">
          {children}
        </main>
        <footer className="foot">
          <span className="foot__brand">SIFT</span>
          <span>Reads the published <code>edge_finder.app.v1</code> contract. Projections and model prices are research evidence, not bets.</span>
          <Link to={routes.status()}>Data & provenance</Link>
          <Link to={routes.design()}>Design system</Link>
        </footer>
      </div>
      <nav className="bottombar" aria-label="Primary">
        <NavLink to={routes.home()} end className="bottombar__a"><Icon name="home" /><span>Home</span></NavLink>
        <NavLink to={routes.sport(tabSport.slug)} className="bottombar__a"><Icon name={tabSport.icon} /><span>{tabSport.label}</span></NavLink>
        <button type="button" className={`bottombar__a bottombar__sports${sheet ? ' active' : ''}`} onClick={() => setSheet(!sheet)} aria-expanded={sheet} aria-haspopup="dialog">
          <Icon name="grid" /><span>Sports</span>
        </button>
        <NavLink to={routes.search()} className="bottombar__a"><Icon name="search" /><span>Search</span></NavLink>
        <button type="button" className={`bottombar__a bottombar__tray${tray.open ? ' active' : ''}`} onClick={() => tray.setOpen(!tray.open)} aria-expanded={tray.open} aria-controls="tray-drawer">
          <span className="bottombar__ic"><Icon name="research" />{count > 0 && <span className="bottombar__n" aria-hidden="true">{count}</span>}</span>
          <span>Tray</span>
          {count > 0 && <span className="sr-only">{count === 1 ? '1 item' : `${count} items`}</span>}
        </button>
      </nav>
      <SportsSheet open={sheet} onClose={closeSheet} />
      <TrayDrawer />
      <Toast />
    </div>
  );
}
