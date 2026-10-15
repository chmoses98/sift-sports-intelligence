import { lazy, Suspense, useMemo } from 'react';
import { buildDiscoveries } from '../intelligence/discoveries';
import { Link } from 'react-router';
import { useNow } from '../live/hooks';
import { useAllOpportunities } from '../opportunity/load';
import { gameRows, inDay, featuredGame, phaseWord, slateOrder } from './broadcast/games';
import { routes } from '../lib/routes';
import { CinematicHero } from '../components/sift2/CinematicHero';
import '../styles/sift2-tokens.css';
import '../styles/sift2-home.css';

const HomeTopProps = lazy(() => import('./home/HomeTopProps'));

/** Isolated design study using the real published slate; never fabricates odds or projections. */
export function Sift2HomePreview() {
  const now = useNow(30_000);
  const all = useAllOpportunities(now);
  const rows = useMemo(() => gameRows(all.bundles, all.opportunities, now), [all.bundles, all.opportunities, now]);
  const today = useMemo(() => rows.filter((g) => inDay(g.startMs, now, 'today')).sort(slateOrder), [rows, now]);
  const featured = useMemo(() => featuredGame(rows, now), [rows, now]);
  const discoveries = useMemo(() => buildDiscoveries({ opportunities: all.opportunities, verdicts: all.verdicts, research: [], now }).slice(0, 3), [all.opportunities, all.verdicts, now]);
  const sports = useMemo(() => new Set(today.map((g) => g.sport)).size, [today]);
  const dateLabel = new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <main className="sift2-home page">
      <header className="sift2-home__header">
        <div><span className="sift2-home__eyebrow">SIFT SPORTS INTELLIGENCE / 2.0</span><h2>Today's command center</h2>
          <p>{dateLabel} · {all.loading ? 'Loading published games…' : `${today.length} games across ${sports} sports`} · Explore evidence, not fabricated picks.</p></div>
        <span className="sift2-home__preview">DESIGN PREVIEW · PUBLISHED SLATE</span>
      </header>
      <div className="sift2-home__layout">
        <div className="sift2-home__main">
          {all.loading ? <div className="sift2-surface sift2-home__status" role="status">Loading published slate…</div> : featured ? (
            <CinematicHero eyebrow={`${featured.sport} / ${phaseWord(featured)} · PUBLISHED MATCHUP`} title={featured.label}
              subtitle="Published matchup identity. Open the game for current research, venue context and market evidence.">
              <div className="sift2-home__hero-card sift2-surface">
                <span className="sift2-home__eyebrow">GAME INTELLIGENCE</span>
                <strong>{featured.candidates > 0 ? `${featured.candidates} research candidate${featured.candidates === 1 ? '' : 's'}` : 'No flagged research candidates'}</strong>
                <p>Candidate status is not a validated betting edge. Prices and scripts belong in the game research view.</p>
                <Link to={routes.game(featured.slug, featured.item.event_id)}>Open game research →</Link>
              </div>
            </CinematicHero>
          ) : <div className="sift2-surface sift2-home__status">No eligible featured matchup in the published slate. <Link to="/games">Browse games →</Link></div>}
          <section aria-labelledby="sift2-games-title" className="sift2-home__section">
            <div className="sift2-home__section-head"><div><span className="sift2-home__eyebrow">THE SLATE</span><h2 id="sift2-games-title">Today's games</h2></div><Link to="/games">Open real games →</Link></div>
            <div className="sift2-home__cards">
              {all.loading ? <p role="status">Loading today's games…</p> : today.length ? today.slice(0, 6).map((g) => (
                <article className="sift2-surface" key={`${g.slug}:${g.item.event_id}`}>
                  <span className="sift2-home__eyebrow">{g.sport} · {phaseWord(g)}</span>
                  <h3>{g.label}</h3>
                  <p>{g.candidates > 0 ? `${g.candidates} flagged for research review` : 'No flagged candidates'}</p>
                  <Link to={routes.game(g.slug, g.item.event_id)}>View game →</Link>
                </article>
              )) : <div className="sift2-surface sift2-home__status">No games published for today. <Link to="/games?day=week">See the next seven days →</Link></div>}
            </div>
          </section>
          <section aria-labelledby="sift2-explorer-title" className="sift2-home__section">
            <div className="sift2-home__section-head"><div><span className="sift2-home__eyebrow">PLAYER RESEARCH</span><h2 id="sift2-explorer-title">Player Prop Explorer</h2></div><Link to="/props">Open current prop board →</Link></div>
            <div className="sift2-surface sift2-home__explorer"><div><h3>Find the player. Understand the matchup. Compare the markets.</h3><p>Ranked props below come from the existing evidence-gated SIFT board, not invented sample selections.</p></div><Link to="/props">Explore props →</Link></div>
            <Suspense fallback={<p role="status">Loading player research…</p>}><HomeTopProps opportunities={all.opportunities} now={now} /></Suspense>
          </section>
        </div>
        <aside className="sift2-home__aside" aria-label="Intelligence and saved research">
          <section className="sift2-surface"><span className="sift2-home__eyebrow">INTELLIGENCE</span><h2>What matters today</h2>
            {all.loading ? <p role="status">Loading published findings…</p> : discoveries.length ? (
              <ul className="sift2-home__findings">{discoveries.map((d) => (
                <li key={d.id}>
                  <span className="sift2-home__eyebrow">{d.sport} · {d.kind === 'market' ? (d.evidence?.word ?? 'Research only') : 'Research finding'}</span>
                  <strong>{d.title}</strong><p>{d.why}</p>
                  {d.href || d.gameHref ? <Link to={(d.href ?? d.gameHref)!}>View evidence →</Link> : null}
                </li>
              ))}</ul>
            ) : <p>No findings flagged in the current publications. SIFT does not manufacture signals.</p>}
            <Link to="/intelligence">Open intelligence →</Link></section>
          <section className="sift2-surface"><span className="sift2-home__eyebrow">MY BOARD</span><h2>Your research, organized</h2><p>Keep interesting games and markets in one place.</p><Link to="/board">Open My Board →</Link></section>
          <section className="sift2-surface"><span className="sift2-home__eyebrow">RESEARCH LAB</span><h2>Go deeper</h2><p>Explore matchup drivers, evidence and historical context.</p><Link to="/explore">Explore research →</Link></section>
        </aside>
      </div>
    </main>
  );
}
