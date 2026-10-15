import { lazy, Suspense, useMemo } from 'react';
import { buildDiscoveries } from '../intelligence/discoveries';
import { Link } from 'react-router';
import { useNow } from '../live/hooks';
import { useAllOpportunities } from '../opportunity/load';
import { gameRows, inDay, featuredGame, phaseWord, slateOrder } from './broadcast/games';
import { routes } from '../lib/routes';
import { Sift2FeaturedGame } from '../components/sift2/FeaturedGame';
import '../styles/sift2-tokens.css';
import '../styles/sift2-home.css';

const HomeTopProps = lazy(() => import('./home/HomeTopProps'));

/** Isolated design study using the real published slate; never fabricates odds or projections. */
export function Sift2HomePreview() {
  const now = useNow(30_000);
  const all = useAllOpportunities(now);
  const failedFeeds = all.bundles.filter((b) => b.error != null);
  const unavailable = !!all.error || (!all.loading && all.bundles.length > 0 && failedFeeds.length === all.bundles.length);
  const partial = !unavailable && failedFeeds.length > 0;
  const rows = useMemo(() => gameRows(all.bundles, all.opportunities, now), [all.bundles, all.opportunities, now]);
  const today = useMemo(() => rows.filter((g) => inDay(g.startMs, now, 'today')).sort(slateOrder), [rows, now]);
  const featured = useMemo(() => featuredGame(rows, now), [rows, now]);
  const discoveries = useMemo(() => buildDiscoveries({ opportunities: all.opportunities, verdicts: all.verdicts, research: [], now }).slice(0, 3), [all.opportunities, all.verdicts, now]);
  const sports = useMemo(() => new Set(today.map((g) => g.sport)).size, [today]);
  const dateLabel = new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <main className="sift2-home page">
      <header className="sift2-home__header">
        <div><span className="sift2-home__eyebrow">SIFT SPORTS INTELLIGENCE / 2.0</span><h1>Today's command center</h1>
          <p>{dateLabel} · {unavailable ? 'Published feed unavailable' : all.loading ? 'Loading published games…' : `${today.length} games across ${sports} sport${sports === 1 ? '' : 's'}`} · Your sports research, in focus.</p></div>
        <span className="sift2-home__preview">DESIGN PREVIEW · PUBLISHED SLATE</span>
      </header>
      {unavailable ? <p role="alert" className="sift2-surface sift2-home__status">Published research is temporarily unavailable. Do not interpret missing games or findings as a no-edge verdict.</p> : null}
      {partial ? <details className="sift2-surface sift2-home__coverage"><summary>{failedFeeds.length} sport feeds unavailable · Showing available research</summary><p role="status">Partial publication coverage: {failedFeeds.map((b) => b.sport.label).join(', ')} unavailable. Games and findings below cover available feeds only; missing research is not a no-edge verdict.</p></details> : null}
      <div className="sift2-home__layout">
        <div className="sift2-home__main">
          {unavailable ? <div className="sift2-surface sift2-home__status" role="status">Featured game unavailable while the publication is offline.</div> : all.loading ? <div className="sift2-surface sift2-home__status" role="status">Loading published slate…</div> : featured ? (
            <Sift2FeaturedGame game={featured} />
          ) : <div className="sift2-surface sift2-home__status">No eligible featured matchup in the published slate. <Link to="/games">Browse games →</Link></div>}
          <section aria-labelledby="sift2-games-title" className="sift2-home__section">
            <div className="sift2-home__section-head"><div><span className="sift2-home__eyebrow">THE SLATE</span><h2 id="sift2-games-title">Today's games</h2></div><Link to="/games">Open real games →</Link></div>
            <div className="sift2-home__cards">
              {unavailable ? <p role="status">Today's slate cannot be verified until the feed recovers.</p> : all.loading ? <p role="status">Loading today's games…</p> : today.length ? today.slice(0, 6).map((g) => (
                <article className="sift2-surface" key={`${g.slug}:${g.item.event_id}`}>
                  <span className="sift2-home__eyebrow">{g.sport} · {phaseWord(g)}</span>
                  <h3>{g.label}</h3>
                  <p>{g.candidates > 0 ? `${g.candidates} flagged for research review` : 'No flagged candidates'}</p>
                  <Link to={`/design/sift2${routes.game(g.slug, g.item.event_id)}`}>View game →</Link>
                </article>
              )) : <div className="sift2-surface sift2-home__status">No games published for today. <Link to="/games?day=week">See the next seven days →</Link></div>}
            </div>
          </section>
          <section aria-labelledby="sift2-explorer-title" className="sift2-home__section">
            <div className="sift2-home__section-head"><div><span className="sift2-home__eyebrow">PLAYER RESEARCH</span><h2 id="sift2-explorer-title">Player Prop Explorer</h2></div><Link to="/design/sift2/props">Open current prop board →</Link></div>
            <div className="sift2-surface sift2-home__explorer"><div><h3>Find the player. Understand the matchup. Compare the markets.</h3><p>Ranked props below come from the existing evidence-gated SIFT board, not invented sample selections.</p></div><Link to="/design/sift2/props">Explore props →</Link></div>
            {unavailable ? <p role="status">Player research is unavailable while the publication is offline.</p> : all.loading ? <p role="status">Loading published player research…</p> : <Suspense fallback={<p role="status">Loading player research…</p>}><HomeTopProps opportunities={all.opportunities} now={now} /></Suspense>}
          </section>
        </div>
        <aside className="sift2-home__aside" aria-label="Intelligence and saved research">
          <section className="sift2-surface"><span className="sift2-home__eyebrow">INTELLIGENCE</span><h2>What matters today</h2>
            {unavailable ? <p role="status">Intelligence findings are unavailable until the publication recovers.</p> : all.loading ? <p role="status">Loading published findings…</p> : discoveries.length ? (
              <ul className="sift2-home__findings">{discoveries.map((d) => (
                <li key={d.id}>
                  <span className="sift2-home__eyebrow">{d.sport} · {d.kind === 'market' ? (d.evidence?.word ?? 'Research only') : 'Research finding'}</span>
                  <strong>{d.title}</strong><p>{d.why}</p>
                  {d.href || d.gameHref ? <Link to={(d.href ?? d.gameHref)!}>View evidence →</Link> : null}
                </li>
              ))}</ul>
            ) : <p>No findings flagged in the current publications. SIFT does not manufacture signals.</p>}
            <Link to="/design/sift2/intelligence">Open intelligence →</Link></section>
          <section className="sift2-surface"><span className="sift2-home__eyebrow">MY BOARD</span><h2>Your research, organized</h2><p>Keep interesting games and markets in one place.</p><Link to="/board">Open My Board →</Link></section>
          <section className="sift2-surface"><span className="sift2-home__eyebrow">RESEARCH LAB</span><h2>Go deeper</h2><p>Explore matchup drivers, evidence and historical context.</p><Link to="/design/sift2/lab">Explore research →</Link></section>
        </aside>
      </div>
    </main>
  );
}
