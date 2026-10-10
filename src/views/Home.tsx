// HOME — the sports command center (2026-10-10 rebuild, Balanced Broadcast + Analytics).
//   A  the shell (destinations, sport strip, one search)
//   B  today's games rail, filterable by sport, with View all into the Games grid
//   C  the featured matchup hero (licensed venue photo, glass panels with only published numbers)
//   D  the SIFT Intelligence preview: the day's most significant discoveries, evidence shown separately
//   E  the Research Lab: visual shortcuts into Explore
//   F  My Board: saved research by game, or what can be saved
// Nothing here is invented activity: counts and numbers are the publications' own, read at load.
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { NAV_SPORTS } from '../data/nav';
import { Icon } from '../components/Icon';
import { SportMark } from '../components/SportMark';
import { Skeleton } from '../components/ui';
import { routes } from '../lib/routes';
import { useNow } from '../live/hooks';
import { useAllOpportunities } from '../opportunity/load';
import { useVisit } from '../state/trail';
import { buildDiscoveries } from '../intelligence/discoveries';
import { matchupInsights } from '../insights/matchups';
import { mismatchDiscovery } from '../intelligence/discoveries';
import { featuredGame, gameRows, inDay, slateOrder } from './broadcast/games';
import { DiscoveryCard, FeaturedHero, GameRail, useGameResearch } from './broadcast/parts';
import { BoardPreview } from './board/BoardPreview';
import type { EventResearchDoc } from '../contract/types';
import { FxCard, VsBar } from '../components/fx';
import { TeamMark } from '../components/ui';
import { gameSides } from '../insights/game';
import { teamColors } from '../lib/teams';
import { nflVsRows } from './game/Dashboard';

const LAB: { to: string; title: string; sub: string; icon: string; tone: string }[] = [
  { to: routes.ranking('nfl', 'met_nfl.adj_off_epa'), title: 'Team rankings', sub: 'Opponent-adjusted offense and defense, league-relative', icon: 'chart', tone: 'blue' },
  { to: routes.explore(), title: 'Player research', sub: 'Profiles, usage, game logs against today’s line', icon: 'star', tone: 'cyan' },
  { to: routes.props('nfl'), title: 'Prop explorer', sub: 'Projections, ranges and prices by player and stat', icon: 'sliders', tone: 'gold' },
  { to: routes.compare('nfl', ''), title: 'Matchup compare', sub: 'Two teams side by side, rank by rank', icon: 'compare', tone: 'violet' },
  { to: routes.season('nfl'), title: 'Season navigator', sub: 'Every week on one grid, scores and upcoming games', icon: 'grid', tone: 'green' },
  { to: routes.pulse(), title: 'Model Pulse', sub: 'How each model has actually performed against the market', icon: 'bolt', tone: 'red' },
];

/** The featured game's published unit ranks as rank-vs-rank bars: a graphic preview of the matchup, one tap from it. */
function FeaturedEdges({ r, slug }: { r: EventResearchDoc; slug: string }) {
  const g = useMemo(() => gameSides(r), [r]);
  const rows = useMemo(() => (g ? nflVsRows(r, g).slice(0, 4) : []), [r, g]);
  if (!g || !rows.length) return null;
  return (
    <FxCard title={`Matchup edges · ${g.away.abbr} @ ${g.home.abbr}`} icon="compare" className="bhome__edges" id="home-edges" action={{ to: routes.game(slug, r.event.event_id, { tab: 'matchup' }), label: 'Full matchup' }}>
      <div className="gvs">
        {rows.map((x) => (
          <div key={x.key} className="gvs__row" style={{ ['--fx-home' as string]: teamColors('NFL', x.off.abbr)[0], ['--fx-away' as string]: teamColors('NFL', x.def.abbr)[0] }}>
            <VsBar
              label={<><b>{x.off.abbr}</b> {x.label.toLowerCase()} O vs <b>{x.def.abbr}</b> D</>}
              left={{ rank: x.o.context?.rank ?? null, of: x.o.context?.universe_size ?? null, text: `${x.off.abbr} ${x.label.toLowerCase()} offense` }}
              right={{ rank: x.d.context?.rank ?? null, of: x.d.context?.universe_size ?? null, text: `${x.def.abbr} ${x.label.toLowerCase()} defense` }}
              leftMark={<TeamMark sport="NFL" abbr={x.off.abbr} size="sm" />}
              rightMark={<TeamMark sport="NFL" abbr={x.def.abbr} size="sm" />}
            />
          </div>
        ))}
      </div>
      <p className="gdash__fine">Opponent-adjusted league ranks, #1 best for the job. Context for reading the game, not a betting signal.</p>
    </FxCard>
  );
}

export function HomeView() {
  useVisit('Home', 'home');
  const now = useNow(30_000);
  const all = useAllOpportunities(now);
  const [sp, setSp] = useSearchParams();
  const sportFilter = sp.get('sport');
  const rows = useMemo(() => gameRows(all.bundles, all.opportunities, now), [all.bundles, all.opportunities, now]);
  const today = useMemo(() => rows.filter((g) => inDay(g.startMs, now, 'today')).sort(slateOrder), [rows, now]);
  const rail = useMemo(() => (sportFilter ? today.filter((g) => g.slug === sportFilter) : today), [today, sportFilter]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of today) m.set(g.slug, (m.get(g.slug) ?? 0) + 1);
    return m;
  }, [today]);
  const featured = useMemo(() => featuredGame(sportFilter ? rows.filter((g) => g.slug === sportFilter) : rows, now), [rows, sportFilter, now]);
  const featResearch = useGameResearch(featured?.slug ?? null, featured?.item.event_id ?? null);
  const discoveries = useMemo(() => {
    const ds = buildDiscoveries({ opportunities: all.opportunities, verdicts: all.verdicts, research: [], now });
    const mm = featResearch.data && featured?.sport === 'NFL' ? matchupInsights(featResearch.data).slice(0, 2).map((i) => mismatchDiscovery(i, featResearch.data!, featured.slug)) : [];
    const mk = ds.filter((d) => d.kind === 'market');
    const other = ds.filter((d) => d.kind === 'freshness');
    return [...mm.slice(0, 1), ...mk.slice(0, 2), ...mm.slice(1), ...other, ...mk.slice(2)].slice(0, 4);
  }, [all.opportunities, all.verdicts, featResearch.data, featured, now]);
  const set = (v: string | null) => setSp((prev) => { const n = new URLSearchParams(prev); if (v) n.set('sport', v); else n.delete('sport'); return n; }, { replace: true });
  const dateWord = new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const sportsToday = counts.size;

  return (
    <div className="page bhome bhome--fx">
      <header className="bhome__mast">
        <div>
          <span className="eyebrow2">{dateWord}</span>
          <h1 className="bhome__h">Today on SIFT</h1>
        </div>
        {!all.loading && <p className="bhome__sum"><b className="bnum">{today.length}</b> games across <b className="bnum">{sportsToday}</b> {sportsToday === 1 ? 'sport' : 'sports'} · <b className="bnum">{all.opportunities.filter((o) => o.status === 'RESEARCH_CANDIDATE' || o.status === 'ACTIONABLE').length}</b> contracts the publications flag for review</p>}
      </header>

      {/* The stage (approved references, Home): the featured matchup's venue dominates; today's games sit beside it on
          wide screens and above it as compact chips on phones, so the hero is above the fold everywhere. */}
      <div className="bhome__stage">
      <section className="bsec bhome__games" aria-labelledby="rail-h">
        <div className="bsec__h">
          <h2 className="bsec__t" id="rail-h"><Icon name="clock" size={20} /> Today’s games</h2>
          <Link to={routes.games({ sport: sportFilter })} className="bsec__more">View all games <Icon name="arrowRight" size={14} /></Link>
        </div>
        <div className="gtabs2" role="group" aria-label="Filter today’s games by sport">
          <button type="button" className={`gtab${!sportFilter ? ' is-on' : ''}`} aria-pressed={!sportFilter} onClick={() => set(null)}>All <small>{today.length}</small></button>
          {NAV_SPORTS.filter((s) => s.status !== 'planned').map((s) => (
            <button key={s.slug} type="button" className={`gtab${sportFilter === s.slug ? ' is-on' : ''}`} aria-pressed={sportFilter === s.slug} onClick={() => set(sportFilter === s.slug ? null : s.slug)} disabled={!counts.get(s.slug) && sportFilter !== s.slug}>
              <SportMark slug={s.slug} icon={s.icon} size={14} />{s.label}{counts.get(s.slug) ? <small>{counts.get(s.slug)}</small> : null}
            </button>
          ))}
        </div>
        {all.loading ? <Skeleton lines={2} tall /> : (
          <GameRail rows={rail} viewAll={routes.games({ sport: sportFilter })} empty={<div className="bempty"><h3>No games today{sportFilter ? ' in this sport' : ''}</h3><p>The publications list nothing starting today. <Link to={routes.games({ day: 'week' })}>See the next seven days</Link>.</p></div>} />
        )}
      </section>

      <section className="bsec bhome__feat" aria-label="Featured matchup">
        {all.loading ? <div className="fhero fhero--skel"><Skeleton lines={5} tall /></div> : featured ? <FeaturedHero g={featured} now={now} /> : <div className="bempty"><h3>No upcoming game to feature</h3><p>Every listed game has started or finished. Open <Link to={routes.games()}>Games</Link> for finals and reviews.</p></div>}
      </section>
      </div>

      <div className="bhome__grid">
        {featured?.sport === 'NFL' && featResearch.data && <FeaturedEdges r={featResearch.data} slug={featured.slug} />}
        <section className="bsec bhome__intel" aria-labelledby="intel-h">
          <div className="bsec__h">
            <div>
              <h2 className="bsec__t" id="intel-h"><Icon name="bolt" size={20} /> SIFT Intelligence</h2>
              <p className="bsec__s">The day’s most significant findings. How much a finding matters and how strong its betting evidence is are rated separately.</p>
            </div>
            <Link to={routes.intelligence()} className="bsec__more">Open the Terminal <Icon name="arrowRight" size={14} /></Link>
          </div>
          {all.loading ? <Skeleton lines={4} /> : discoveries.length ? (
            <div className="dgrid">{discoveries.map((d) => <DiscoveryCard key={d.id} d={d} />)}</div>
          ) : <div className="bempty"><h3>Nothing significant flagged yet</h3><p>No publication flags a candidate today and no tracked matchup crosses the edge threshold. That is a result, not a gap.</p></div>}
        </section>

        <section className="bsec bhome__lab" aria-labelledby="lab-h">
          <div className="bsec__h">
            <h2 className="bsec__t" id="lab-h"><Icon name="layers" size={20} /> Research Lab</h2>
            <Link to={routes.explore()} className="bsec__more">Explore <Icon name="arrowRight" size={14} /></Link>
          </div>
          <ul className="labgrid">
            {LAB.map((l) => (
              <li key={l.title}>
                <Link to={l.to} className={`labtile labtile--${l.tone}`}>
                  <span className="labtile__ic"><Icon name={l.icon} size={22} /></span>
                  <span className="labtile__t">{l.title}</span>
                  <span className="labtile__s">{l.sub}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="bsec" aria-labelledby="board-h">
        <div className="bsec__h">
          <h2 className="bsec__t" id="board-h"><Icon name="bookmark" size={20} /> My Board</h2>
          <Link to={routes.board()} className="bsec__more">Open My Board <Icon name="arrowRight" size={14} /></Link>
        </div>
        <BoardPreview />
      </section>
    </div>
  );
}
