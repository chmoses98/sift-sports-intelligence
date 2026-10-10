import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { NAV_SPORTS, navSport, STATUS_WORD, type NavSport } from '../data/nav';
import { DESTINATIONS, destinationOf, type Destination } from '../lib/destinations';
import { routes } from '../lib/routes';
import { useSearch } from '../search/useSearch';
import { useTrail, type TrailStep } from '../state/trail';
import { useTray } from '../state/tray';
import { SportMark } from './SportMark';
import { Icon, SiftWordmark } from './Icon';
import { SearchResults } from './SearchResults';

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
  // A destination hub that is not sport-scoped (Explore, Intelligence) still names where a sport tool sits.
  const isHub = (s: TrailStep) => s.href === '/explore' || s.href === '/intelligence';
  const shown = steps.filter((s) => s.kind !== 'home' && s.kind !== 'sport' && (inSport(s) || isHub(s))).slice(-5);
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
  const nav = useNavigate();
  const [show, setShow] = useState<string | null>(null);
  useEffect(() => {
    if (!tray.lastAdded) return;
    setShow(tray.lastAdded);
    const t = setTimeout(() => setShow(null), 3200);
    return () => clearTimeout(t);
  }, [tray.lastAdded]);
  const label = show ? tray.labels[show]?.label : null;
  if (!show || !label) return null;
  return (
    <div className="toast" role="status">
      <Icon name="check" size={16} />
      <span>
        Saved <b>{label}</b> to My Board
      </span>
      <button type="button" className="toast__btn" onClick={() => { setShow(null); nav(routes.board()); }}>Open</button>
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

/** Sports with a publication (planned ones live on the Sports page, never advertised as implemented). */
const STRIP_SPORTS = NAV_SPORTS.filter((s) => s.status !== 'planned');

/**
 * The five destinations. Desktop: glass tabs in the header, the active one lit. Phones: the bottom tab bar.
 * Both read destinationOf() so they always agree with the address.
 */
function DestinationTabs({ active, count }: { active: Destination | null; count: number }) {
  return (
    <nav className="dnav" aria-label="Primary">
      <ul className="dnav__list">
        {DESTINATIONS.map((d) => (
          <li key={d.id}>
            <Link to={d.to} className={`dnav__a${active === d.id ? ' is-on' : ''}`} aria-current={active === d.id ? 'page' : undefined}>
              <Icon name={d.icon} size={16} />
              <span>{d.label}</span>
              {d.id === 'board' && count > 0 && <span className="dnav__n"><span aria-hidden="true">{count}</span><span className="sr-only">{count === 1 ? '1 saved item' : `${count} saved items`}</span></span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Direct sport navigation: one compact glass strip, every sport with a publication, the current one lit. */
function SportStrip({ sport }: { sport: NavSport | undefined }) {
  return (
    <nav className="sstrip" aria-label="Sports">
      <ul className="sstrip__list">
        {STRIP_SPORTS.map((s) => (
          <li key={s.slug}>
            <Link to={routes.sport(s.slug)} className={`sstrip__a${sport?.slug === s.slug ? ' is-on' : ''}`} aria-current={sport?.slug === s.slug ? 'page' : undefined} style={{ ['--accent' as string]: s.accent }}>
              <SportMark slug={s.slug} icon={s.icon} size={16} />
              <span>{s.label}</span>
            </Link>
          </li>
        ))}
        <li>
          <Link to={routes.sports()} className="sstrip__a sstrip__all"><Icon name="more" size={16} /><span>All sports</span></Link>
        </li>
      </ul>
    </nav>
  );
}

const SUBPAGES: Record<string, string> = {
  '/intelligence/pulse': 'Model Pulse',
  '/intelligence/lab': 'Advanced Model Lab',
  '/status': 'Data & provenance',
  '/news': 'News',
  '/tray': 'Packet items',
  '/packet': 'Analysis packet',
  '/search': 'Search',
};

/** Breadcrumb for screens outside a sport: the destination, then the screen (nothing on a destination's own root). */
function DestinationCrumb({ active }: { active: Destination | null }) {
  const loc = useLocation();
  if (!active || active === 'home') return null;
  const d = DESTINATIONS.find((x) => x.id === active)!;
  const sub = SUBPAGES[loc.pathname];
  if (!sub) return null;
  return (
    <nav className="trail" aria-label="Research path">
      <ol>
        <li><Link to={d.to} className="trail__root"><Icon name={d.icon} size={15} /> {d.label}</Link></li>
        <li className="is-here"><span aria-current="page">{sub}</span></li>
      </ol>
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
        <div className="sheet__h"><span className="eyebrow">More</span></div>
        <ul className="sheet__work">
          {[{ to: routes.pulse(), label: 'Model Pulse', icon: 'chart' }, { to: routes.news(), label: 'News', icon: 'news' }, { to: routes.status(), label: 'Data & provenance', icon: 'info' }, { to: routes.settings(), label: 'Settings', icon: 'settings' }].map((w) => (
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
  const active = destinationOf(loc.pathname);
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
  // Explore and Intelligence carry their own sport selectors; the strip would be a second one.
  const showStrip = active === 'home' || active === 'games' || !!sport;
  return (
    <div className="app">
      <a href="#main" className="skip" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <div className="app__col">
        <header className="topbar">
          <div className="topbar__in">
            <Link to={routes.home()} className="topbar__brand" aria-label="Sift home">
              <SiftWordmark compact />
            </Link>
            <DestinationTabs active={active} count={count} />
            <button type="button" className="searchbtn" onClick={() => setSearch(true)} aria-label="Search Sift" aria-haspopup="dialog">
              <Icon name="search" size={16} />
              <span className="searchbtn__t">Search teams, players, games, stats</span>
              <kbd className="searchbtn__kbd" aria-hidden="true">/</kbd>
            </button>
            <button type="button" className={`topbar__sport${sheet ? ' is-on' : ''}`} onClick={() => setSheet(!sheet)} aria-expanded={sheet} aria-haspopup="dialog" aria-label={sport ? `Sport: ${sport.label}. Change sport` : 'Choose a sport'}>
              {sport ? <SportMark slug={sport.slug} icon={sport.icon} size={18} /> : <Icon name="grid" size={18} />}
              <span>{sport?.label ?? 'Sports'}</span>
              <Icon name="chevronDown" size={14} />
            </button>
            <Link to={routes.settings()} className="topbar__icon" aria-label="Settings"><Icon name="settings" size={17} /></Link>
          </div>
        </header>
        {showStrip && <div className="sstrip__wrap"><SportStrip sport={sport} /></div>}
        {!online && <div className="offline" role="status">Offline — showing research you already opened. Market quotes are not refreshing; each keeps its real age.</div>}
        <main id="main" tabIndex={-1} className="main">
          <div className="crumbs">{sport ? <TrailBar sport={sport} /> : <DestinationCrumb active={active} />}</div>
          {children}
        </main>
        <footer className="foot">
          <span className="foot__brand">SIFT</span>
          <span>Reads the published <code>edge_finder.app.v1</code> contract. Projections and model prices are research evidence, not bets.</span>
          <Link to={routes.pulse()}>Model Pulse</Link>
          <Link to={routes.status()}>Data & provenance</Link>
          <Link to={routes.design()}>Design system</Link>
          <Link to={routes.settings()}>Settings</Link>
        </footer>
      </div>
      <nav className="bottombar" aria-label="Destinations">
        {DESTINATIONS.map((d) => (
          <Link key={d.id} to={d.to} className={`bottombar__a${active === d.id ? ' active' : ''}${d.id === 'board' ? ' bottombar__board' : ''}`} aria-current={active === d.id ? 'page' : undefined}>
            <span className="bottombar__ic"><Icon name={d.icon} />{d.id === 'board' && count > 0 && <span className="bottombar__n" aria-hidden="true">{count}</span>}</span>
            <span>{d.id === 'intelligence' ? 'Intel' : d.label}</span>
            {d.id === 'board' && count > 0 && <span className="sr-only">{count === 1 ? '1 saved item' : `${count} saved items`}</span>}
          </Link>
        ))}
      </nav>
      <SportsSheet open={sheet} onClose={closeSheet} />
      <SearchPalette open={search} onClose={closeSearch} />
      <Toast />
    </div>
  );
}
