// The live game on the Overview: score, period, clock and situation first, then the real plays, then the players' performances. Every item is a real value
// from a cleared source or an honest "not available" with the reason (data/live/view.ts); nothing here estimates, defaults or reconstructs.
// Pregame research stays on the page, lower down ("Pregame analysis", screens/intel/MatchupIntel.tsx), one tap away from the state block.
import { useState } from 'react';
import { isMissing, liveView, type LiveView } from '../../data/live/view';
import type { DetailLeaders, DetailPlay, DetailSituation, Freshness } from '../../data/live/types';
import type { LiveDetailState } from '../../data/live/useLiveDetail';
import type { V3Game } from '../../model/types';
import { Icon } from '../../ui/Icon';
import { TeamLogo } from '../../ui/TeamLogo';
import type { GameCtx } from '../GameShared';
import './live.css';

const SHOWN = 12;

function Unavailable({ title, children }: { title: string; children: string }) {
  return <div className="v3-state" data-testid="live-unavailable"><Icon name="clock" size={20} /><div><b>{title}</b>{children}</div></div>;
}

/** The one muted word beside a live value that is verified but a little old (the same word and class as the hero's DelayedMark). */
function Fresh({ f }: { f: Freshness | null }) {
  return f === 'delayed' ? <span className="v3-delayed" data-delayed>Delayed</span> : null;
}

function Bases({ bases }: { bases: [boolean, boolean, boolean] }) {
  const on = (b: boolean) => (b ? 'var(--sift-cyan)' : 'none');
  return (
    <svg className="lg-bases" viewBox="0 0 40 30" width="44" height="33" role="img" aria-label={`Runners on: ${bases.some(Boolean) ? bases.map((b, i) => (b ? ['first', 'second', 'third'][i] : null)).filter(Boolean).join(', ') : 'none'}`}>
      <rect x="26" y="14" width="9" height="9" transform="rotate(45 30.5 18.5)" fill={on(bases[0])} stroke="var(--sift-muted)" strokeWidth="1.5" />
      <rect x="15.5" y="3" width="9" height="9" transform="rotate(45 20 7.5)" fill={on(bases[1])} stroke="var(--sift-muted)" strokeWidth="1.5" />
      <rect x="5" y="14" width="9" height="9" transform="rotate(45 9.5 18.5)" fill={on(bases[2])} stroke="var(--sift-muted)" strokeWidth="1.5" />
    </svg>
  );
}

function Fact({ k, v, testid }: { k: string; v: React.ReactNode; testid: string }) {
  return <div className="lg-fact" data-testid={testid}><dt>{k}</dt><dd>{v}</dd></div>;
}

function Credit({ view }: { view: LiveView }) {
  if (!view.source) return null;
  return (
    <p className="v3-note v3-note--dim lg-src" data-testid="live-source">
      Live data: {view.source.label}.{' '}
      {view.source.attribution ? <a href="https://sportscore.com/" rel="dofollow" target="_blank" title="Sports data by SportScore">{view.source.attribution}</a> : null}
    </p>
  );
}

export function LiveStateBlock({ g, state, view, onPregame }: { g: V3Game; state: LiveDetailState; view: LiveView; onPregame: () => void }) {
  const score = view.score;
  const sit = view.situation;
  const base = !isMissing(sit) && sit.raw?.kind === 'baseball' ? (sit.raw as Extract<DetailSituation, { kind: 'baseball' }>) : null;
  return (
    <section className="v3-panel lg-state" aria-label="Live game state" data-testid="live-state">
      <header className="lg-head">
        <h2 className="v3-h3"><span className="v3-livebadge">LIVE</span>Game state</h2>
        <Fresh f={view.freshness} />
      </header>
      <dl className="lg-facts">
        <Fact testid="live-score" k="Score" v={isMissing(score) ? <span className="lg-na">{score.missing}</span> : <span className="num lg-score"><TeamLogo team={g.away} size={22} />{g.away.abbr} {score.away}<i>–</i>{score.home} {g.home.abbr}<TeamLogo team={g.home} size={22} /></span>} />
        <Fact testid="live-period" k="Period" v={isMissing(view.period) ? <span className="lg-na">{view.period.missing}</span> : view.period} />
        <Fact testid="live-clock" k="Clock" v={isMissing(view.clock) ? <span className="lg-na">{view.clock.missing}</span> : <span className="num">{view.clock}</span>} />
        <Fact testid="live-situation" k={g.sport === 'MLB' ? 'Count' : g.sport === 'NHL' ? 'Special teams' : 'Situation'} v={isMissing(sit) ? <span className="lg-na">{sit.missing}</span> : <span className="lg-sit">{base?.bases ? <Bases bases={base.bases} /> : null}<span>{sit.text}</span></span>} />
      </dl>
      {state.kind === 'ready' && state.error != null && <p className="v3-note lg-warn" role="status" data-testid="live-refresh-failed">The last refresh failed{view.mode === 'live' && state.detail ? '; this is the last answer received' : ''}. Trying again.</p>}
      {view.mode === 'withheld' && state.kind === 'ready' && <div className="lg-retry"><button type="button" className="v3-btn v3-btn--ghost" onClick={state.retry}>Try again</button></div>}
      <Credit view={view} />
      <button type="button" className="lg-jump" onClick={onPregame} data-testid="jump-pregame">Pregame analysis<Icon name="chevR" size={16} /></button>
    </section>
  );
}

function Plays({ plays, g }: { plays: DetailPlay[]; g: V3Game }) {
  const [all, setAll] = useState(false);
  const shown = all ? plays : plays.slice(0, SHOWN);
  if (!plays.length) return <p className="v3-note" data-testid="plays-empty">The feed has reported no plays yet.</p>;
  return (
    <div className="v3-panel v3-pbp lg-plays">
      <ul data-testid="live-plays">
        {shown.map((p) => (
          <li key={p.id} className={p.scoring ? 'is-scoring' : undefined}>
            <span className="v3-pbp__t">{p.periodLabel ?? ''}{p.clock ? ` ${p.clock}` : ''}</span>
            <span className="v3-pbp__d"><span>{p.text}</span></span>
            {p.score ? <em className="num" aria-label={`Score after the play: ${g.away.abbr} ${p.score.away}, ${g.home.abbr} ${p.score.home}`}>{p.score.away}–{p.score.home}</em> : <em />}
          </li>
        ))}
      </ul>
      {plays.length > shown.length && <button type="button" className="v3-more" onClick={() => setAll(true)}>Show all {plays.length} plays</button>}
    </div>
  );
}

function Leaders({ groups, g }: { groups: DetailLeaders[]; g: V3Game }) {
  if (!groups.length) return <p className="v3-note" data-testid="leaders-empty">The feed's box score has no standout lines yet.</p>;
  return (
    <div className="v3-panel lg-leaders" data-testid="live-leaders">
      {groups.map((grp) => (
        <div key={`${grp.side}-${grp.title}`} className="lg-lgrp">
          <h3><TeamLogo team={g[grp.side]} size={22} />{g[grp.side].abbr} {grp.title}</h3>
          <ul>{grp.rows.map((r) => <li key={r.name}><b>{r.name}</b><span className="num">{r.line}</span></li>)}</ul>
        </div>
      ))}
    </div>
  );
}

export function LiveGame({ ctx }: { ctx: GameCtx }) {
  const { g, live } = ctx;
  if (g.provenance !== 'publication' || g.phase !== 'live') return null;
  const jump = () => document.querySelector('[data-testid="pregame-analysis"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (live?.kind === 'disabled') {
    return <Unavailable title="Live updates are turned off">Live scores are switched off on this device, so the live state, plays and player performances are not requested. Nothing is estimated.</Unavailable>;
  }
  const state: LiveDetailState = live ?? { kind: 'none' };
  const view = liveView(g, state);
  return (
    <>
      <LiveStateBlock g={g} state={state} view={view} onPregame={jump} />
      <section aria-label="Play-by-play" data-testid="live-pbp">
        <h2 className="v3-h2">Play-by-Play</h2>
        {isMissing(view.plays) ? <Unavailable title="Play-by-play not available">{view.plays.missing}</Unavailable> : <Plays plays={view.plays} g={g} />}
      </section>
      <section aria-label="Player performances" data-testid="live-performances">
        <h2 className="v3-h2">Player Performances</h2>
        {isMissing(view.leaders) ? <Unavailable title="Player performances not available">{view.leaders.missing}</Unavailable> : <Leaders groups={view.leaders} g={g} />}
      </section>
    </>
  );
}
