import { lazy, Suspense, useMemo } from 'react';
import { buildDiscoveries } from '../intelligence/discoveries';
import { Link, useSearchParams } from '../routing';
import { NAV_SPORTS } from '../data/nav';
import { useNow } from '../live/hooks';
import { useAllOpportunities } from '../opportunity/load';
import { useNflResearch } from '../intelligence/useNflResearch';
import { gameRows, inDay, featuredGame, previewGames, slateOrder } from './broadcast/games';
import { gameKey as scheduleKey, scopeDiscoveries, comingUpWhen, type ScopedDiscovery } from '../intelligence/schedule';
import { GameRowItem } from '../components/sift2/GameList';
import { Sift2FeaturedGame } from '../components/sift2/FeaturedGame';
import '../styles/sift2-tokens.css';
import '../styles/sift2-home.css';
import '../styles/sift2-games-list.css';

const HomeTopProps = lazy(() => import('./home/HomeTopProps'));

/** Isolated design study using the real published slate; never fabricates odds or projections. */
export function Sift2HomePreview() {
  const now = useNow(30_000);
  const all = useAllOpportunities(now);
  const failedFeeds = all.bundles.filter((b) => b.error != null);
  const unavailable = !!all.error || (!all.loading && all.bundles.length > 0 && failedFeeds.length === all.bundles.length);
  const partial = !unavailable && failedFeeds.length > 0;
  const rows = useMemo(() => gameRows(all.bundles, all.opportunities, now), [all.bundles, all.opportunities, now]);
  const [sp, setSp] = useSearchParams();
  const sportFilter = sp.get('sport');
  const todayAll = useMemo(() => rows.filter((g) => inDay(g.startMs, now, 'today')).sort(slateOrder), [rows, now]);
  const today = useMemo(() => (sportFilter ? todayAll.filter((g) => g.slug === sportFilter) : todayAll), [todayAll, sportFilter]);
  const tomorrow = useMemo(() => rows.filter((g) => inDay(g.startMs, now, 'tomorrow')), [rows, now]);
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const g of todayAll) m.set(g.slug, (m.get(g.slug) ?? 0) + 1); return m; }, [todayAll]);
  const setSport = (v: string | null) => setSp((prev) => { const n = new URLSearchParams(prev); if (v) n.set('sport', v); else n.delete('sport'); return n; }, { replace: true });
  const tomorrowKey = (() => { const d = new Date(now); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const featured = useMemo(() => featuredGame(rows, now), [rows, now]);
  const nflIds = useMemo(() => {
    const b = all.bundles.find((x) => x.sport.code === 'NFL');
    return (b?.board ?? []).filter((i) => Date.parse(i.start_time_utc) > now - 3 * 3600_000 && Date.parse(i.start_time_utc) < now + 8 * 86_400_000).map((i) => i.event_id).sort();
  }, [all.bundles, now]);
  const nfl = useNflResearch(nflIds);
  // Research findings only: publication failures are already shown in the coverage notice and listed on Intelligence.
  // Each finding is placed by its game's scheduled local day: today's, or "Coming up" (see intelligence/schedule.ts).
  const schedule = useMemo(() => new Map(rows.map((g) => [scheduleKey(g.slug, g.item.event_id), { startMs: g.startMs, phase: g.phase }])), [rows]);
  const scoped = useMemo(() => scopeDiscoveries(buildDiscoveries({ opportunities: all.opportunities, verdicts: all.verdicts, research: (nfl.data ?? []).map((r) => ({ r, slug: 'nfl' })), now }), schedule, now), [all.opportunities, all.verdicts, nfl.data, schedule, now]);
  const findingsToday = scoped.today.slice(0, 3);
  const findingsLater = scoped.comingUp.slice(0, 3);
  const preview = useMemo(() => previewGames(today, { exclude: featured }), [today, featured]);
  const sports = useMemo(() => new Set(todayAll.map((g) => g.sport)).size, [todayAll]);
  const gamesHref = `/design/sift2/games${sportFilter ? `?sport=${sportFilter}` : ''}`;
  const shortDate = new Date(now).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  const dateLabel = new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <div className="sift2-home page">
      <header className="sift2-home__header">
        <div><span className="sift2-home__eyebrow">SIFT 2.0 · COMMAND CENTER</span><h1>Today</h1>
          <p>{dateLabel} · {unavailable ? 'Published feed unavailable' : all.loading ? 'Loading published games…' : `${todayAll.length} games across ${sports} sport${sports === 1 ? '' : 's'}`}</p></div>
        <span className="sift2-home__preview">DESIGN PREVIEW · PUBLISHED SLATE</span>
      </header>
      {unavailable ? <p role="alert" className="sift2-surface sift2-home__status">Published research is temporarily unavailable. Do not interpret missing games or findings as a no-edge verdict.</p> : null}
      {partial ? <details className="sift2-surface sift2-home__coverage" data-testid="feed-coverage"><summary>{failedFeeds.length} sport feeds unavailable · Showing available research</summary><p role="status">Partial publication coverage: {failedFeeds.map((b) => b.sport.label).join(', ')} unavailable. Games and findings below cover available feeds only; missing research is not a no-edge verdict.</p></details> : null}
      <div className="sift2-home__layout">
        <div className="sift2-home__main">
          {unavailable ? <div className="sift2-surface sift2-home__status" role="status">Featured game unavailable while the publication is offline.</div> : all.loading ? <div className="sift2-surface sift2-home__status" role="status">Loading published slate…</div> : featured ? (
            <Sift2FeaturedGame game={featured} />
          ) : <div className="sift2-surface sift2-home__status">No eligible featured matchup in the published slate. <Link to="/design/sift2/games">Browse games →</Link></div>}
          <section aria-labelledby="sift2-games-title" className="sift2-home__section sift2-home__slate">
            <div className="sift2-home__section-head"><div><span className="sift2-home__eyebrow">THE SLATE</span><h2 id="sift2-games-title">Today's games</h2></div><Link to={gamesHref}>View all games →</Link></div>
            {!unavailable && !all.loading && todayAll.length > 0 ? <div className="sift2-home__chips" role="group" aria-label="Filter today's games by sport">
              <button type="button" aria-pressed={!sportFilter} onClick={() => setSport(null)}>All <small>{todayAll.length}</small></button>
              {NAV_SPORTS.filter((x) => x.status !== 'planned' && counts.get(x.slug)).map((x) => <button key={x.slug} type="button" aria-pressed={sportFilter === x.slug} onClick={() => setSport(sportFilter === x.slug ? null : x.slug)}>{x.label} <small>{counts.get(x.slug)}</small></button>)}
            </div> : null}
            {unavailable ? <p role="status">Today's slate cannot be verified until the feed recovers.</p> : all.loading ? <p role="status">Loading today's games…</p> : preview.length ? <>
              <ul className="s2-gr-list" aria-label="Today's games preview">{preview.map((g) => <GameRowItem key={`${g.slug}:${g.item.event_id}`} game={g} art showSport={!sportFilter} />)}</ul>
              {today.length > preview.length + (featured && today.includes(featured) ? 1 : 0) ? <Link className="s2-gr-more" to={gamesHref}>View all {today.length} games{sportFilter ? ` in ${NAV_SPORTS.find((x) => x.slug === sportFilter)?.label ?? 'this sport'}` : ''} →</Link> : null}
            </> : today.length ? <div className="sift2-surface sift2-home__status">The featured matchup is the only game {sportFilter ? 'in this sport ' : ''}today. <Link to={gamesHref}>See the full schedule →</Link></div>
              : <div className="sift2-surface sift2-home__status">No games published for today{sportFilter ? ' in this sport' : ''}. <Link to="/design/sift2/games">See other days →</Link></div>}
            {!unavailable && !all.loading && tomorrow.length > 0 ? <p className="sift2-home__next"><Link to={`/design/sift2/games?date=${tomorrowKey}`}>Tomorrow · {tomorrow.length} game{tomorrow.length === 1 ? '' : 's'} →</Link></p> : null}
          </section>
          <section aria-labelledby="sift2-explorer-title" className="sift2-home__section sift2-home__props">
            <div className="sift2-home__section-head"><div><span className="sift2-home__eyebrow">PLAYER RESEARCH</span><h2 id="sift2-explorer-title">Player Prop Explorer</h2></div><Link to="/design/sift2/props">Open current prop board →</Link></div>
            <div className="sift2-surface sift2-home__explorer"><div><h3>Find the player. Understand the matchup. Compare the markets.</h3><p>Ranked props below come from the existing evidence-gated SIFT board, not invented sample selections.</p></div><Link to="/design/sift2/props">Explore props →</Link></div>
            {unavailable ? <p role="status">Player research is unavailable while the publication is offline.</p> : all.loading ? <p role="status">Loading published player research…</p> : <Suspense fallback={<p role="status">Loading player research…</p>}><HomeTopProps opportunities={all.opportunities} now={now} phoneRows /></Suspense>}
          </section>
        </div>
        <aside className="sift2-home__aside" aria-label="Intelligence and saved research">
          <section className="sift2-surface sift2-home__intel" aria-labelledby="sift2-today-findings"><span className="sift2-home__eyebrow">INTELLIGENCE</span><h2 id="sift2-today-findings">What matters today</h2>
            {unavailable ? <p role="status">Intelligence findings are unavailable until the publication recovers.</p> : all.loading ? <p role="status">Loading published findings…</p> : <>
              {findingsToday.length ? <ul className="sift2-home__findings">{findingsToday.map((f) => <Finding key={f.d.id} f={f} />)}</ul>
                : <p>{nfl.loading ? 'Reading matchup research…' : partial ? 'No research findings for today’s games from the feeds that loaded. Unavailable feeds are listed above; they are not a no-findings verdict.' : `No research findings for games on ${shortDate}. ${findingsLater.length ? 'Findings for upcoming games are under Coming up.' : 'SIFT does not manufacture signals.'}`}</p>}
              {findingsLater.length ? <div className="sift2-home__coming"><h3>Coming up</h3><ul className="sift2-home__findings">{findingsLater.map((f) => <Finding key={f.d.id} f={f} when={comingUpWhen(f.startMs)} />)}</ul></div> : null}
            </>}
            <Link to="/design/sift2/intelligence">Open intelligence →</Link></section>
          <section className="sift2-surface sift2-home__more"><span className="sift2-home__eyebrow">MY BOARD</span><h2>Your research, organized</h2><p>Keep interesting games and markets in one place.</p><Link to="/board">Open My Board →</Link></section>
          <section className="sift2-surface sift2-home__more"><span className="sift2-home__eyebrow">RESEARCH LAB</span><h2>Go deeper</h2><p>Explore matchup drivers, evidence and historical context.</p><Link to="/design/sift2/lab">Explore research →</Link></section>
        </aside>
      </div>
    </div>
  );
}

/** One finding. A coming-up finding names its game's day and time instead of the evidence word, and never says "today". */
function Finding({ f, when }: { f: ScopedDiscovery; when?: string }) {
  const d = f.d;
  return (
    <li>
      <span className="sift2-home__eyebrow">{d.sport} · {when ?? (d.kind === 'market' ? (d.evidence?.word ?? 'Research only') : 'Matchup significance')}</span>
      <strong>{d.title}</strong><p>{d.why}</p>
      {when && d.kind === 'market' ? <p className="sift2-home__finding-note">{d.evidence?.word ?? 'Research only'} · pregame research for a later game</p> : null}
      {d.href || d.gameHref ? <Link to={(d.href ?? d.gameHref)!}>View evidence →</Link> : null}
    </li>
  );
}
