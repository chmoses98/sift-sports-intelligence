// HOME — the sports command centre. One reading order, top to bottom (issue 20):
//   1  the featured matchup hero (lane A's visuals: licensed venue photo, glass panels with published numbers)
//   2  today's games: one rail of sport groups (richest research first, deep slates capped), each card with records,
//      ranks, the model's and the market's read, a contextual tag and the validated-market indicator
//   2a Top props: the Player Prop Explorer's slate ranking, at most ten props that qualify, one card per player,
//      multi-select to My Board (home/HomeTopProps.tsx; loaded on its own so Home's first paint stays light)
//   3  SIFT Intelligence: the day's most significant findings (each one opens in place and leads somewhere) beside
//      the featured game's matchup edges
//   4  the Research Lab: the same seven tools as the Research Lab hub
//   5  My Board
// Nothing here is invented activity: counts and numbers are the publications' own, read at load.
import { lazy, Suspense, useMemo, useRef } from 'react';
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
import { featuredKey, featuredScope, gameRows, inDay, inLater, keepFeatured, railGroups, slateOrder } from './broadcast/games';
import { DiscoveryCard, FeaturedHero, useGameResearch } from './broadcast/parts';
import { GameRail } from './broadcast/rail';
import { BoardPreview } from './board/BoardPreview';
import type { EventResearchDoc } from '../contract/types';
import { FxCard, VsBar } from '../components/fx';
import { TeamMark } from '../components/ui';
import { gameSides } from '../insights/game';
import { teamColors } from '../lib/teams';
import { nflVsRows } from './game/Dashboard';
import { LAB_TOOLS, labHref } from './explore/labTools';

const HomeTopProps = lazy(() => import('./home/HomeTopProps'));

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
      <p className="gdash__fine">Opponent-adjusted league ranks, #1 best for the job. A matchup read, not a betting signal.</p>
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
  const tomorrow = useMemo(() => rows.filter((g) => inDay(g.startMs, now, 'tomorrow')).sort(slateOrder), [rows, now]);
  const later = useMemo(() => rows.filter((g) => inLater(g.startMs, now)).sort(slateOrder), [rows, now]);
  const groups = useMemo(() => railGroups(today, sportFilter), [today, sportFilter]);
  const tomorrowGroups = useMemo(() => railGroups(tomorrow, sportFilter), [tomorrow, sportFilter]);
  const laterGroups = useMemo(() => railGroups(later, sportFilter), [later, sportFilter]);
  const tomorrowTotal = tomorrowGroups.reduce((n, x) => n + x.total, 0);
  const laterTotal = laterGroups.reduce((n, x) => n + x.total, 0);
  const tomorrowWord = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate() + 1).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of today) m.set(g.slug, (m.get(g.slug) ?? 0) + 1);
    return m;
  }, [today]);
  // The featured matchup stays put while the page is open (it moves on its own pregame → live → final); it is only
  // chosen again on a fresh visit, when the sport filter changes, or when it can no longer be featured.
  const featKept = useRef<{ filter: string; key: string | null }>({ filter: '', key: null });
  const featured = useMemo(() => {
    const filter = sportFilter ?? '';
    const prev = featKept.current.filter === filter ? featKept.current.key : null;
    const g = keepFeatured(prev, sportFilter ? rows.filter((r) => r.slug === sportFilter) : rows, now);
    featKept.current = { filter, key: g ? featuredKey(g) : null };
    return g;
  }, [rows, sportFilter, now]);
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
  const flagged = all.opportunities.filter((o) => o.status === 'RESEARCH_CANDIDATE' || o.status === 'ACTIONABLE').length;
  const edges = featured?.sport === 'NFL' && featResearch.data ? <FeaturedEdges r={featResearch.data} slug={featured.slug} /> : null;
  const labSport = sportFilter ?? featured?.slug ?? 'nfl';

  return (
    <div className="page bhome bhome--fx bhome--v3">
      <header className="bhome__mast">
        <div>
          <span className="eyebrow2">{dateWord}</span>
          <h1 className="bhome__h">Today on SIFT</h1>
        </div>
        {!all.loading && <p className="bhome__sum"><b className="bnum">{today.length}</b> games · <b className="bnum">{counts.size}</b> {counts.size === 1 ? 'sport' : 'sports'} · <b className="bnum">{flagged}</b> flagged for review</p>}
      </header>

      <section className="bsec bhome__feat" aria-label="Featured matchup">
        {all.loading ? <div className="fhero fhero--skel"><Skeleton lines={5} tall /></div> : featured ? <FeaturedHero g={featured} now={now} scope={featuredScope(featured, now)} /> : <div className="bempty"><h3>No upcoming game to feature</h3><p>Every listed game has started or finished. Open <Link to={routes.games()}>Games</Link> for finals.</p></div>}
      </section>

      <section className="bsec bhome__games" aria-labelledby="rail-h">
        <div className="bsec__h">
          <h2 className="bsec__t" id="rail-h"><Icon name="clock" size={20} /> Today’s games</h2>
          <Link to={routes.games({ sport: sportFilter })} className="bsec__more">All games <Icon name="arrowRight" size={14} /></Link>
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
          <GameRail groups={groups} viewAll={routes.games({ sport: sportFilter })} empty={<div className="bempty"><h3>No games today{sportFilter ? ' in this sport' : ''}</h3><p>The publications list nothing starting today. <Link to={routes.games({ day: 'week' })}>See the next seven days</Link>.</p></div>} />
        )}
      </section>

      {!all.loading && tomorrowTotal > 0 && (
        <section className="bsec bhome__games bhome__games--next" aria-labelledby="tomorrow-h">
          <div className="bsec__h">
            <h2 className="bsec__t" id="tomorrow-h"><Icon name="clock" size={20} /> Tomorrow · {tomorrowWord} <small className="bnum">{tomorrowTotal}</small></h2>
            <Link to={routes.games({ sport: sportFilter, day: 'tomorrow' })} className="bsec__more">All tomorrow <Icon name="arrowRight" size={14} /></Link>
          </div>
          <GameRail groups={tomorrowGroups} viewAll={routes.games({ sport: sportFilter, day: 'tomorrow' })} day="tomorrow" dayWord="tomorrow" />
        </section>
      )}
      {!all.loading && laterTotal > 0 && (
        <section className="bsec bhome__games bhome__games--next" aria-labelledby="later-h">
          <div className="bsec__h">
            <h2 className="bsec__t" id="later-h"><Icon name="clock" size={20} /> Later this week <small className="bnum">{laterTotal}</small></h2>
            <Link to={routes.games({ sport: sportFilter, day: 'week' })} className="bsec__more">Next 7 days <Icon name="arrowRight" size={14} /></Link>
          </div>
          <GameRail groups={laterGroups} viewAll={routes.games({ sport: sportFilter, day: 'week' })} day="week" dayWord="later this week" />
        </section>
      )}

      <Suspense fallback={<section className="bsec bhome__props" aria-label="Top props"><Skeleton lines={4} tall /></section>}>
        <HomeTopProps opportunities={all.opportunities} now={now} />
      </Suspense>

      <section className={`bsec bhome__intel${edges ? ' has-edges' : ''}`} aria-labelledby="intel-h">
        <div className="bsec__h">
          <h2 className="bsec__t" id="intel-h"><Icon name="bolt" size={20} /> SIFT Intelligence</h2>
          <Link to={routes.intelligence()} className="bsec__more">Open the Terminal <Icon name="arrowRight" size={14} /></Link>
        </div>
        <div className="bhome__intelgrid">
          {all.loading ? <Skeleton lines={4} /> : discoveries.length ? (
            <div className="dgrid">{discoveries.map((d) => <DiscoveryCard key={d.id} d={d} expandable />)}</div>
          ) : <div className="bempty"><h3>Nothing significant flagged yet</h3><p>No publication flags a candidate today and no tracked matchup crosses the edge threshold. That is a result, not a gap.</p></div>}
          {edges}
        </div>
      </section>

      <section className="bsec bhome__lab" aria-labelledby="lab-h">
        <div className="bsec__h">
          <h2 className="bsec__t" id="lab-h"><Icon name="layers" size={20} /> Research Lab</h2>
          <Link to={`${routes.explore()}?sport=${labSport}`} className="bsec__more">Open the Research Lab <Icon name="arrowRight" size={14} /></Link>
        </div>
        <ul className="labgrid">
          {LAB_TOOLS.map((l) => (
            <li key={l.key}>
              <Link to={labHref(l.key, labSport)} className={`labtile labtile--${l.tone}`}>
                <span className="labtile__ic"><Icon name={l.icon} size={22} /></span>
                <span className="labtile__t">{l.title}</span>
                <span className="labtile__s">{l.sub}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="bsec bhome__boardsec" aria-labelledby="board-h">
        <div className="bsec__h">
          <h2 className="bsec__t" id="board-h"><Icon name="bookmark" size={20} /> My Board</h2>
          <Link to={routes.board()} className="bsec__more">Open My Board <Icon name="arrowRight" size={14} /></Link>
        </div>
        <BoardPreview />
      </section>
    </div>
  );
}
