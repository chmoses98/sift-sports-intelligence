import { useState } from 'react';
import { CinematicHero } from '../components/sift2/CinematicHero';
import '../styles/sift2-tokens.css';
import '../styles/sift2-preview.css';

/** Isolated visual review route. All displayed matchup content is illustrative. */
export function Sift2HeroPreview() {
  const [compact, setCompact] = useState(false);
  return (
    <main className="sift2-preview page">
      <header className="sift2-preview__head">
        <div>
          <p className="sift2-preview__kicker">SIFT 2.0 / DESIGN LAB</p>
          <h2>Game Command Center — Hero Study</h2>
          <p>Visual-only concept. Matchup, venue context and research below are illustrative, not live or verified.</p>
        </div>
        <button type="button" aria-pressed={compact} onClick={() => setCompact((v) => !v)}>
          {compact ? 'Show full width' : 'Preview phone width'}
        </button>
      </header>
      <div className={`sift2-preview__frame${compact ? ' sift2-preview__frame--phone' : ''}`}>
        <CinematicHero eyebrow="NFL / MATCHUP PREVIEW" title="Buffalo Bills at Kansas City Chiefs"
          subtitle="Game Command Center · Design preview only"
          homeColor="#b51f36" awayColor="#16477d">
          <div className="sift2-preview__glass sift2-surface">
            <span className="sift2-preview__label">GAME INTELLIGENCE</span>
            <strong>Research that survives scrutiny.</strong>
            <p>Matchups · Players · Markets · Game scripts</p>
          </div>
        </CinematicHero>
        <nav className="sift2-preview__tabs" aria-label="Design preview sections">
          <span aria-current="page">Overview</span><span>Matchups</span><span>Players</span><span>Markets</span>
        </nav>
        <div className="sift2-preview__grid">
          <article className="sift2-surface">
            <span className="sift2-preview__label">GAME READ</span>
            <h2>Game thesis</h2>
            <p>Real model evidence will populate this space. No projected result or betting edge is implied by this preview.</p>
          </article>
          <article className="sift2-surface">
            <span className="sift2-preview__label">SCRIPT SURVIVABILITY</span>
            <h2>Scenario explorer</h2>
            <p>Conditional prop probabilities appear only when independently validated.</p>
          </article>
        </div>
      </div>
    </main>
  );
}
