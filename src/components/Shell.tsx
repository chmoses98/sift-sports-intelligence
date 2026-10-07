import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { NAV_SPORTS, navSport, STATUS_WORD, type NavSport } from '../data/nav';
import { routes } from '../lib/routes';
import { useSearch } from '../search/useSearch';
import { useTrail, type TrailStep } from '../state/trail';
import { useTray } from '../state/tray';
import { SportMark } from './SportMark';
import { Icon, SiftWordmark } from './Icon';
import { SearchResults } from './SearchResults';
import { TrayDrawer } from './TrayDrawer';

/**
 * THE search: one command-palette for the whole app, opened from the header field, the phone tab bar,
 * "/" or ⌘K / Ctrl-K. It never takes a row of the page; results appear in a dialog over it.
 */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const state = useSearch(open ? q : '');
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => input.current?.focus(), 10);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="palette" role="dialog" aria-modal="true" aria-label="Search Sift">
      <div className="palette__scrim" onClick={onClose} aria-hidden="true" />
      <div className="palette__box">
        <form
          role="search"
          className="palette__form"
          onSubmit={(e) => {
            e.preventDefault();
            onClose();
            nav(routes.search(q));
          }}
        >
          <Icon name="search" size={18} className="palette__icon" />
          <input
            ref={input}
            type="search"
            value={q}
            placeholder="Teams, players, games, stats, markets"
            aria-label="Search Sift"
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close search"><Icon name="close" size={18} /></button>
        </form>
        <div className="palette__body">
          {q.trim() ? (
            <SearchResults state={state} query={q} compact onPick={onClose} />
          ) : (
            <div className="palette__hint">
              <span className="eyebrow">Try</span>
              <div className="chips">
                {['Bijan Robinson', 'Bills', 'Baltimore pass defense', 'Josh Allen passing yards'].map((x) => (
                  <button key={x} type="button" className="chipbtn" onClick={() => setQ(x)}>{x}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Opens the palette from anywhere: "/" (outside inputs) and ⌘K / Ctrl-K. */
function usePaletteKeys(setOpen: (o: boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '');
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);
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
              <span aria-current="page" className="trail__root"><SportMark slug={sport.slug} icon={sport.icon} size={16} /> {sport.label}</span>
            ) : (
              <Link to={routes.sport(sport.slug)} className="trail__root"><SportMark slug={sport.slug} icon={sport.icon} size={16} /> {sport.label}</Link>
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
        Saved <b>{label}</b> to your research
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

/** Sports shown directly in the header; the rest live in "More". */
const HEADER_SPORTS = NAV_SPORTS.filter((s) => s.status !== 'planned');

/**
 * The one sports navigation on wide screens: compact tabs in the header. Phones use the tab bar and its
 * Sports sheet instead (never both on one screen).
 */
function SportsNav() {
  const [more, setMore] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const loc = useLocation();
  useEffect(() => setMore(false), [loc.pathname]);
  useEffect(() => {
    if (!more) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMore(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [more]);
  return (
    <nav className="snav" aria-label="Sports">
      <ul className="snav__list">
        {HEADER_SPORTS.map((s, i) => (
          <li key={s.slug} className={i >= 6 ? 'snav__extra snav__extra--wide' : i >= 4 ? 'snav__extra' : undefined}>
            <NavLink to={routes.sport(s.slug)} className="snav__a" style={{ ['--accent' as string]: s.accent }}>
              <SportMark slug={s.slug} icon={s.icon} size={18} />
              <span>{s.label}</span>
              {s.status === 'beta' && <span className="snav__tag">beta</span>}
            </NavLink>
          </li>
        ))}
        <li className="snav__morewrap" ref={ref as never}>
          <button type="button" className="snav__a snav__more" aria-expanded={more} aria-haspopup="true" onClick={() => setMore(!more)}>
            More <Icon name="chevronDown" size={14} />
          </button>
          {more && (
            <div className="snav__menu" role="menu">
              <div className="snav__group">
                {NAV_SPORTS.map((s) => (
                  <NavLink key={s.slug} role="menuitem" to={routes.sport(s.slug)} className="snav__mi" style={{ ['--accent' as string]: s.accent }}>
                    <SportMark slug={s.slug} icon={s.icon} size={18} /> {s.label} <span className="snav__st">{STATUS_WORD[s.status]}</span>
                  </NavLink>
                ))}
              </div>
              <div className="snav__group">
                {[...WORKSPACE.filter((w) => w.label !== 'Search'), { to: routes.settings(), label: 'Settings', icon: 'settings' }, { to: routes.status(), label: 'Data & provenance', icon: 'info' }].map((w) => (
                  <NavLink key={w.label} role="menuitem" to={w.to} className="snav__mi"><Icon name={w.icon} size={16} /> {w.label}</NavLink>
                ))}
              </div>
            </div>
          )}
        </li>
      </ul>
    </nav>
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
                <SportMark slug={s.slug} icon={s.icon} size={24} />
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
  const [search, setSearch] = useState(false);
  const closeSheet = useCallback(() => setSheet(false), []);
  const closeSearch = useCallback(() => setSearch(false), []);
  usePaletteKeys(setSearch);
  const count = tray.tray.items.length;
  useEffect(() => {
    tray.setOpen(false);
    setSheet(false);
    setSearch(false);
  }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const tabSport = sport ?? NAV_SPORTS[0];
  return (
    <div className="app">
      <a href="#main" className="skip" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <div className="app__col">
        <header className="topbar">
          <div className="topbar__in">
            <Link to={routes.home()} className="topbar__brand" aria-label="Sift home">
              <SiftWordmark compact />
            </Link>
            <SportsNav />
            <button type="button" className="searchbtn" onClick={() => setSearch(true)} aria-label="Search Sift" aria-haspopup="dialog">
              <Icon name="search" size={16} />
              <span className="searchbtn__t">Search teams, players, stats</span>
              <kbd className="searchbtn__kbd" aria-hidden="true">/</kbd>
            </button>
            <NavLink to={routes.news()} className="topbar__news"><Icon name="news" size={16} /><span>News</span></NavLink>
            <button type="button" className={`traybtn${count ? ' has-items' : ''}`} onClick={() => tray.setOpen(!tray.open)} aria-expanded={tray.open} aria-controls="tray-drawer">
              <Icon name="research" size={17} />
              <span className="traybtn__label">Research</span>
              <span className="traybtn__n" aria-hidden="true">{count}</span>
              <span className="sr-only">{count === 1 ? '1 item' : `${count} items`}</span>
            </button>
          </div>
        </header>
        {!online && <div className="offline" role="status">Offline — showing research you already opened. Market quotes are not refreshing; each keeps its real age.</div>}
        <main id="main" tabIndex={-1} className="main">
          {sport && <div className="crumbs"><TrailBar sport={sport} /></div>}
          {children}
        </main>
        <footer className="foot">
          <span className="foot__brand">SIFT</span>
          <span>Reads the published <code>edge_finder.app.v1</code> contract. Projections and model prices are research evidence, not bets.</span>
          <Link to={routes.status()}>Data & provenance</Link>
          <Link to={routes.design()}>Design system</Link>
          <Link to={routes.settings()}>Settings</Link>
        </footer>
      </div>
      <nav className="bottombar" aria-label="Primary">
        <NavLink to={routes.home()} end className="bottombar__a"><Icon name="home" /><span>Home</span></NavLink>
        <NavLink to={routes.sport(tabSport.slug)} className="bottombar__a"><SportMark slug={tabSport.slug} icon={tabSport.icon} size={22} /><span>{tabSport.label}</span></NavLink>
        <button type="button" className={`bottombar__a bottombar__sports${sheet ? ' active' : ''}`} onClick={() => setSheet(!sheet)} aria-expanded={sheet} aria-haspopup="dialog">
          <Icon name="grid" /><span>Sports</span>
        </button>
        <button type="button" className={`bottombar__a${search ? ' active' : ''}`} onClick={() => setSearch(true)} aria-haspopup="dialog"><Icon name="search" /><span>Search</span></button>
        <button type="button" className={`bottombar__a bottombar__tray${tray.open ? ' active' : ''}`} onClick={() => tray.setOpen(!tray.open)} aria-expanded={tray.open} aria-controls="tray-drawer">
          <span className="bottombar__ic"><Icon name="research" />{count > 0 && <span className="bottombar__n" aria-hidden="true">{count}</span>}</span>
          <span>Research</span>
          {count > 0 && <span className="sr-only">{count === 1 ? '1 item' : `${count} items`}</span>}
        </button>
      </nav>
      <SportsSheet open={sheet} onClose={closeSheet} />
      <SearchPalette open={search} onClose={closeSearch} />
      <TrayDrawer />
      <Toast />
    </div>
  );
}
