// GAMES — every game the publications list, as a premium grid instead of an endless list: a day window
// (today / tomorrow / next seven days), a sport filter, and one section per sport with venue art on each tile.
// Tiles read the board only (no per-game document is downloaded to draw the grid).
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { NAV_SPORTS, navSport } from '../../data/nav';
import { HeroArt, heroVars } from '../../components/HeroArt';
import { Icon } from '../../components/Icon';
import { SportMark } from '../../components/SportMark';
import { Skeleton } from '../../components/ui';
import { resolveHero } from '../../lib/hero/resolve';
import { heroInputFor } from '../../lib/hero/input';
import { useInView } from '../../lib/useImage';
import { routes } from '../../lib/routes';
import { useNow } from '../../live/hooks';
import { useAllOpportunities } from '../../opportunity/load';
import { useVisit } from '../../state/trail';
import { DAY_WORD, gameRows, inDay, phaseWord, slateOrder, type DayWindow, type GameRow } from './games';
import { PMark } from './parts';

const nameOf = (g: GameRow, p: GameRow['home']) => (!p ? '' : g.sport === 'SOCCER' || g.sport === 'TENNIS' || g.sport === 'CBB' ? p.display_name : p.short_name ?? p.display_name);

function SlateTile({ g }: { g: GameRow }) {
  const spec = useMemo(() => resolveHero(heroInputFor(g.item, null, g.sport)), [g.item, g.sport]);
  const [ref, inView] = useInView<HTMLLIElement>();
  const first = g.sport === 'SOCCER' ? g.home : g.away;
  const second = g.sport === 'SOCCER' ? g.away : g.home;
  const day = Number.isFinite(g.startMs) ? new Date(g.startMs).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  return (
    <li ref={ref} className={`stile stile--${g.phase.toLowerCase()}${spec.photo ? '' : ' stile--nophoto'}`} style={heroVars(spec)}>
      <div className="stile__img" aria-hidden="true"><HeroArt spec={spec} variant="tile" load={inView} /></div>
      <Link to={routes.game(g.slug, g.item.event_id)} className="stile__a" aria-label={`${g.label}, ${day} ${phaseWord(g)}${g.candidates ? `, ${g.candidates} research candidates` : ''}`}>
        <span className="stile__top">
          <span className="stile__comp">{g.item.competition ?? navSport(g.slug)?.label}</span>
          <span className={`stile__clock${g.phase === 'STARTED' && !g.stale ? ' is-live' : ''}`}>{g.phase === 'PREGAME' ? `${day} · ${phaseWord(g)}` : phaseWord(g)}</span>
        </span>
        <span className="stile__teams">
          <span className="stile__team"><PMark sport={g.sport} p={first} size="md" /><span>{nameOf(g, first)}</span></span>
          <span className="stile__vs">{g.sport === 'SOCCER' || g.sport === 'TENNIS' ? 'v' : '@'}</span>
          <span className="stile__team"><PMark sport={g.sport} p={second} size="md" /><span>{nameOf(g, second)}</span></span>
        </span>
        <span className="stile__foot">
          {g.candidates > 0 ? <span className="dword dword--research">{g.candidates} to review</span> : <span className="stile__mk">{g.item.markets_available ? `${g.item.markets_available} markets` : 'Research only'}</span>}
          <Icon name="chevronRight" size={16} className="chev" />
        </span>
      </Link>
    </li>
  );
}

export function GamesView() {
  useVisit('Games', 'slate');
  const now = useNow(30_000);
  const all = useAllOpportunities(now);
  const [sp, setSp] = useSearchParams();
  const sport = sp.get('sport');
  const day = (['today', 'tomorrow', 'week'].includes(sp.get('day') ?? '') ? sp.get('day') : 'today') as DayWindow;
  const set = (k: string, v: string | null) => setSp((prev) => { const n = new URLSearchParams(prev); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const rows = useMemo(() => gameRows(all.bundles, all.opportunities, now).filter((g) => inDay(g.startMs, now, day)).sort(slateOrder), [all.bundles, all.opportunities, now, day]);
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const g of rows) m.set(g.slug, (m.get(g.slug) ?? 0) + 1); return m; }, [rows]);
  const shown = sport ? rows.filter((g) => g.slug === sport) : rows;
  const bySport = useMemo(() => NAV_SPORTS.map((s) => ({ s, games: shown.filter((g) => g.slug === s.slug) })).filter((x) => x.games.length), [shown]);
  const CAP = 12;
  const expanded = sp.get('all') === '1';
  return (
    <div className="page bgames">
      <header className="bhome__mast">
        <div>
          <span className="eyebrow2">{new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          <h1 className="bhome__h">Games</h1>
        </div>
        {!all.loading && <p className="bhome__sum"><b className="bnum">{rows.length}</b> games {DAY_WORD[day].toLowerCase()} across <b className="bnum">{counts.size}</b> sports</p>}
      </header>
      <div className="bboard__filters">
        <div className="gtabs2" role="group" aria-label="Day">
          {(['today', 'tomorrow', 'week'] as DayWindow[]).map((d) => <button key={d} type="button" className={`gtab${day === d ? ' is-on' : ''}`} aria-pressed={day === d} onClick={() => set('day', d === 'today' ? null : d)}>{DAY_WORD[d]}</button>)}
        </div>
        <div className="gtabs2" role="group" aria-label="Sport">
          <button type="button" className={`gtab${!sport ? ' is-on' : ''}`} aria-pressed={!sport} onClick={() => set('sport', null)}>All <small>{rows.length}</small></button>
          {NAV_SPORTS.filter((s) => s.status !== 'planned').map((s) => (
            <button key={s.slug} type="button" className={`gtab${sport === s.slug ? ' is-on' : ''}`} aria-pressed={sport === s.slug} onClick={() => set('sport', sport === s.slug ? null : s.slug)}>
              <SportMark slug={s.slug} icon={s.icon} size={14} />{s.label}{counts.get(s.slug) ? <small>{counts.get(s.slug)}</small> : null}
            </button>
          ))}
        </div>
      </div>
      {all.loading && <Skeleton lines={6} tall />}
      {!all.loading && !bySport.length && <div className="bempty"><h3>No games {DAY_WORD[day].toLowerCase()}{sport ? ` in ${navSport(sport)?.label}` : ''}</h3><p>Widen the window to the next seven days or pick another sport.</p></div>}
      {bySport.map(({ s, games }) => {
        const capped = expanded || sport ? games : games.slice(0, CAP);
        return (
          <section key={s.slug} className="bsec" aria-labelledby={`gs-${s.slug}`}>
            <div className="bsec__h">
              <h2 className="bsec__t" id={`gs-${s.slug}`}><SportMark slug={s.slug} icon={s.icon} size={22} /> {s.label} <small className="bsec__n">{games.length}</small></h2>
              <span className="bsec__links">
                {s.slug === 'nfl' && <Link to={routes.season('nfl')} className="bsec__more">Season navigator</Link>}
                <Link to={routes.sport(s.slug)} className="bsec__more">{s.label} home <Icon name="arrowRight" size={14} /></Link>
              </span>
            </div>
            <ul className="sgrid">{capped.map((g) => <SlateTile key={g.item.event_id} g={g} />)}</ul>
            {capped.length < games.length && <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('sport', s.slug)}>Show all {games.length} {s.label} games</button>}
          </section>
        );
      })}
    </div>
  );
}
