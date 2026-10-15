import { Link } from 'react-router';
import { CinematicHero } from '../components/sift2/CinematicHero';
import '../styles/sift2-tokens.css';
import '../styles/sift2-home.css';

/** Isolated design study: content intentionally contains no fabricated odds or projections. */
export function Sift2HomePreview() {
  return (
    <main className="sift2-home page">
      <header className="sift2-home__header">
        <div><span className="sift2-home__eyebrow">SIFT SPORTS INTELLIGENCE / 2.0</span><h1>Today's command center</h1>
          <p>Explore the slate, discover evidence, and find the best market expression.</p></div>
        <span className="sift2-home__preview">DESIGN PREVIEW · NOT LIVE DATA</span>
      </header>
      <div className="sift2-home__layout">
        <div className="sift2-home__main">
          <CinematicHero eyebrow="FEATURED MATCHUP · ILLUSTRATIVE" title="Buffalo Bills at Kansas City Chiefs"
            subtitle="A premium broadcast experience backed by research—not invented betting signals."
            homeColor="#b51f36" awayColor="#16477d">
            <div className="sift2-home__hero-card sift2-surface">
              <span className="sift2-home__eyebrow">THE GAME READ</span>
              <strong>Evidence before conviction</strong>
              <p>Real game scripts, opponent-adjusted matchups and verified prices will appear here.</p>
              <Link to="/design/sift2/hero">Explore hero study →</Link>
            </div>
          </CinematicHero>
          <section aria-labelledby="sift2-games-title" className="sift2-home__section">
            <div className="sift2-home__section-head"><div><span className="sift2-home__eyebrow">THE SLATE</span><h2 id="sift2-games-title">Today's games</h2></div><Link to="/games">Open real games →</Link></div>
            <div className="sift2-home__cards">
              <article className="sift2-surface"><span className="sift2-home__eyebrow">NFL</span><h3>Matchup intelligence</h3><p>Game-by-game context, weather and verified research.</p><Link to="/games?sport=nfl">Browse NFL games →</Link></article>
              <article className="sift2-surface"><span className="sift2-home__eyebrow">CFB</span><h3>College football</h3><p>Schedule-strength-aware matchups and uncertainty.</p><Link to="/games?sport=cfb">Browse CFB games →</Link></article>
              <article className="sift2-surface"><span className="sift2-home__eyebrow">ALL SPORTS</span><h3>Across the slate</h3><p>One place for upcoming games across supported sports.</p><Link to="/games">Browse all games →</Link></article>
            </div>
          </section>
          <section aria-labelledby="sift2-explorer-title" className="sift2-home__section">
            <div className="sift2-home__section-head"><div><span className="sift2-home__eyebrow">PLAYER RESEARCH</span><h2 id="sift2-explorer-title">Player Prop Explorer</h2></div><Link to="/props">Open current prop board →</Link></div>
            <div className="sift2-surface sift2-home__explorer"><div><h3>Find the player. Understand the matchup. Compare the markets.</h3><p>Player-first discovery, alternate lines, game context and verified executable quotes. No hypothetical edges presented as picks.</p></div><Link to="/props">Explore props →</Link></div>
          </section>
        </div>
        <aside className="sift2-home__aside" aria-label="Intelligence and saved research">
          <section className="sift2-surface"><span className="sift2-home__eyebrow">INTELLIGENCE</span><h2>What matters today</h2><p>Evidence-backed findings, uncertainty and model-versus-market disagreements—clearly distinguished.</p><Link to="/intelligence">Open intelligence →</Link></section>
          <section className="sift2-surface"><span className="sift2-home__eyebrow">MY BOARD</span><h2>Your research, organized</h2><p>Keep interesting games and markets in one place.</p><Link to="/board">Open My Board →</Link></section>
          <section className="sift2-surface"><span className="sift2-home__eyebrow">RESEARCH LAB</span><h2>Go deeper</h2><p>Explore matchup drivers, evidence and historical context.</p><Link to="/explore">Explore research →</Link></section>
        </aside>
      </div>
    </main>
  );
}
