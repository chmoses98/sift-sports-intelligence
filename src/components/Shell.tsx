import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { explorable, SPORTS } from '../data/sports';
import { routes } from '../lib/routes';
import { useSearch } from '../search/useSearch';
import { useTrail } from '../state/trail';
import { useTray } from '../state/tray';
import { Icon, SiftMark } from './Icon';
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
          placeholder="Search teams, players, games, metrics, markets"
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

function TrailBar() {
  const { steps } = useTrail();
  const loc = useLocation();
  const here = loc.pathname + loc.search;
  const shown = steps.slice(-6);
  if (shown.length < 2) return null;
  return (
    <nav className="trail" aria-label="Research path">
      <span className="trail__k">Path</span>
      <ol>
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

export function Shell({ children }: { children: ReactNode }) {
  const tray = useTray();
  const loc = useLocation();
  const online = useOnline();
  const count = tray.tray.items.length;
  useEffect(() => tray.setOpen(false), [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="app">
      <a href="#main" className="skip" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <header className="topbar">
        <div className="topbar__in">
          <Link to={routes.home()} className="brand" aria-label="Sift home">
            <SiftMark />
            <span className="brand__word">Sift</span>
            <span className="brand__sub">Sports Intelligence</span>
          </Link>
          <nav className="sportrail" aria-label="Sports">
            {SPORTS.filter(explorable).map((s) => (
              <NavLink key={s.code} to={routes.sport(s.slug)} className={({ isActive }) => `sportrail__a${isActive ? ' is-active' : ''}`}>
                {s.label}
                {s.tier === 'secondary' && <span className="sportrail__tag">beta</span>}
              </NavLink>
            ))}
            <NavLink to={routes.status()} className={({ isActive }) => `sportrail__a sportrail__a--more${isActive ? ' is-active' : ''}`}>All sports</NavLink>
          </nav>
          <SearchBox />
          <button type="button" className={`traybtn${count ? ' has-items' : ''}`} onClick={() => tray.setOpen(!tray.open)} aria-expanded={tray.open} aria-controls="tray-drawer">
            <Icon name="tray" size={18} />
            <span className="traybtn__label">Research tray</span>
            <span className="traybtn__n" aria-label={`${count} items`}>{count}</span>
          </button>
        </div>
      </header>
      {!online && <div className="offline" role="status">Offline — showing research you already opened. Market quotes are not refreshing; each keeps its real age.</div>}
      <TrailBar />
      <main id="main" tabIndex={-1} className="main">
        {children}
      </main>
      <footer className="foot">
        <SiftMark size={18} />
        <span>Sift Sports Intelligence reads the published <code>edge_finder.app.v1</code> contract. Projections and model prices are evidence, not bets.</span>
        <Link to={routes.status()}>Data & provenance</Link>
        <Link to={routes.design()}>Design system</Link>
      </footer>
      <nav className="bottombar" aria-label="Primary">
        <NavLink to={routes.home()} end className="bottombar__a"><Icon name="home" /><span>Home</span></NavLink>
        <NavLink to={routes.sport('nfl')} className="bottombar__a"><Icon name="layers" /><span>NFL</span></NavLink>
        <NavLink to={routes.search()} className="bottombar__a"><Icon name="search" /><span>Search</span></NavLink>
        <button type="button" className={`bottombar__a${tray.open ? ' active' : ''}`} onClick={() => tray.setOpen(!tray.open)} aria-expanded={tray.open} aria-controls="tray-drawer">
          <span className="bottombar__ic"><Icon name="tray" />{count > 0 && <span className="bottombar__n">{count}</span>}</span>
          <span>Tray</span>
        </button>
      </nav>
      <TrayDrawer />
      <Toast />
    </div>
  );
}
