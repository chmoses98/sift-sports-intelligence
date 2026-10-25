import { useMemo, useState, type ReactNode } from 'react';
import { Link } from '../../routing';
import type { EventDetailDoc, EventResearchDoc } from '../../contract/types';
import { deriveProps } from '../data/adapt';
import type { Lens } from '../data/lens';
import { demoPairs, pairsFromResearch, type StatPair } from '../data/matchup';
import { DEMO_LIVE, DEMO_PBP, DEMO_PROPS } from '../demo/fixtures';
import { ago, quoteState } from '../model/format';
import type { MarketLine, V3Game } from '../model/types';
import { Icon } from '../ui/Icon';
import { LensCard } from '../ui/Lens';
import { GameStories } from '../ui/Stories';
import { TeamLogo } from '../ui/TeamLogo';
import { PriceText, gameHref, useOpenLine } from '../ui/gamebits';
import { ordinal } from '../data/lens';
import type { TabKey } from './GameDetail';

// ------------------------------------------------------------------ markets row (Spread / Total / Moneyline)

function MarketCard({ g, label, line }: { g: V3Game; label: string; line: MarketLine | undefined }) {
  const open = useOpenLine();
  if (!line) {
    return <div className="v3-mc v3-mc--none" aria-label={`${label}: no line listed`}><span className="v3-mc__k">{label}</span><div className="v3-mc__v"><b>—</b><small>No line listed</small></div></div>;
  }
  const alt = line.kind === 'moneyline' && line.alternates && line.alternates.length === 2 ? line.alternates : null;
  return (
    <button type="button" className={`v3-mc${quoteState(line.price.observedAt) === 'stale' ? ' is-stale' : ''}`} aria-label={`${label}: ${line.label}, ${line.price.ask ?? 'no'} cents. Open market detail`} onClick={() => open(g, line)}>
      <span className="v3-mc__k">{label}</span>
      {alt ? (
        <span className="v3-mc__v v3-mc__v--ml">
          {alt.map((p, i) => <span key={p.ticker}><i>{i === 0 ? g.away.abbr : g.home.abbr}</i><b className="num">{p.ask != null ? `${p.ask}¢` : '—'}</b></span>)}
        </span>
      ) : (
        <span className="v3-mc__v"><b>{line.label}</b><small><PriceText p={line.price} compact /> · {Math.round(line.price.implied ?? line.price.ask ?? 0)}%{quoteState(line.price.observedAt) === 'stale' ? ' · last known' : ''}</small></span>
      )}
    </button>
  );
}

export function MarketsRow({ g }: { g: V3Game }) {
  const by = (k: MarketLine['kind']) => g.lines.find((l) => l.kind === k);
  return (
    <section aria-label="Market prices">
      <div className="v3-mcs">
        <MarketCard g={g} label="Spread" line={by('spread')} />
        <MarketCard g={g} label="Total" line={by('total')} />
        <MarketCard g={g} label="Moneyline" line={by('moneyline')} />
      </div>
      <p className="v3-mcs__src">{g.lines[0]?.price.source === 'Sample' ? 'Sample prices' : g.lines.length ? (quoteState(g.lines[0].price.observedAt) === 'stale' ? `Kalshi prices as last captured ${ago(g.lines[0].price.observedAt)}: last known, not current prices. ` : `Kalshi prediction-market prices · ${ago(g.lines[0].price.observedAt)}. `) + 'Market-implied %, not a SIFT model number.' : 'No Kalshi lines are listed for this game.'}</p>
    </section>
  );
}

// ------------------------------------------------------------------ live blocks

function DriveCard({ g }: { g: V3Game }) {
  const d = DEMO_LIVE[g.key]?.drive;
  if (!d) return null;
  const pos = (y: number) => `${Math.max(2, Math.min(98, y))}%`;
  return (
    <section className="v3-panel v3-drive" aria-label="Current drive">
      <header><h3>Current Drive</h3><span>{d.plays} plays · {d.yards} yards · {d.time}</span></header>
      <div className="v3-field" role="img" aria-label={`Sample drive from the ${d.fromYard} to the ${d.toYard} yard line`}>
        <i className="v3-field__ez v3-field__ez--l" /><i className="v3-field__ez v3-field__ez--r" />
        <i className="v3-field__path" style={{ left: pos(d.fromYard), width: `${d.toYard - d.fromYard}%` }} />
        <i className="v3-field__start" style={{ left: pos(d.fromYard) }} />
        <i className="v3-field__ball" style={{ left: pos(d.ball) }} />
        <b className="v3-field__dn">1st &amp; 10</b>
      </div>
      <p className="v3-drive__s">{d.down}</p>
    </section>
  );
}

function LastPlay({ g, onTab }: { g: V3Game; onTab: (t: TabKey) => void }) {
  const p = DEMO_LIVE[g.key]?.lastPlay;
  if (!p) return null;
  return (
    <section className="v3-panel v3-last" aria-label="Last play">
      <header><h3>Last Play</h3><span>{p.situation}</span></header>
      <div className="v3-last__r"><span className="v3-last__t">{p.clock}</span><p>{p.text}</p></div>
      <button type="button" className="v3-btn v3-btn--ghost" onClick={() => onTab('script')}>Full Play-by-Play<Icon name="chevR" size={18} /></button>
    </section>
  );
}

function Unavailable({ icon = 'info', title, children }: { icon?: 'info' | 'clock' | 'wifiOff'; title: string; children?: ReactNode }) {
  return <div className="v3-state"><Icon name={icon} size={20} /><div><b>{title}</b>{children}</div></div>;
}

function LiveNote({ g }: { g: V3Game }) {
  if (g.provenance === 'demo' || g.score?.source === 'score-feed') return null;
  return (
    <Unavailable icon="clock" title={g.phase === 'live' ? 'Live score and plays are not available' : 'Result not reported yet'}>
      The publication carries no live score, clock or play-by-play, and no licensed live feed covers {g.sport === 'CFB' ? 'college football' : g.sport} here. Nothing is estimated. The pregame research below is frozen at kickoff and is not a graded result.
    </Unavailable>
  );
}

// ------------------------------------------------------------------ matchup bars

function Bar({ rank, n }: { rank: number | null; n: number | null }) {
  if (rank == null || !n) return <i className="v3-bar v3-bar--none" />;
  const w = Math.max(6, Math.round(((n - rank + 1) / n) * 100));
  return <i className="v3-bar"><i style={{ width: `${w}%` }} /></i>;
}

function StatRow({ p, g }: { p: StatPair; g: V3Game }) {
  const inner = (
    <>
      <span className="v3-mx__n">{p.name}</span>
      <span className="v3-mx__r">
        <span className="v3-mx__s v3-mx__s--a"><b>{p.away.rank != null ? ordinal(p.away.rank) : '—'}</b><small>{p.away.value}</small></span>
        <span className="v3-mx__bars"><Bar rank={p.away.rank} n={p.away.n} /><Bar rank={p.home.rank} n={p.home.n} /></span>
        <span className="v3-mx__s v3-mx__s--h"><b>{p.home.rank != null ? ordinal(p.home.rank) : '—'}</b><small>{p.home.value}</small></span>
      </span>
    </>
  );
  const label = `${p.name}: ${g.away.abbr} ${p.away.rank != null ? ordinal(p.away.rank) : 'unranked'}, ${g.home.abbr} ${p.home.rank != null ? ordinal(p.home.rank) : 'unranked'}`;
  return <li>{p.route ? <Link to={p.route} className="v3-mx" aria-label={`${label}. Open statistic`}>{inner}</Link> : <div className="v3-mx" aria-label={label}>{inner}</div>}</li>;
}

function MatchupTab({ g, research, loading }: { g: V3Game; research: EventResearchDoc | null; loading: boolean }) {
  const pairs = useMemo(() => (g.provenance === 'demo' ? demoPairs(g) : pairsFromResearch(research, g)), [g, research]);
  const [all, setAll] = useState(false);
  if (loading && !pairs.length) return <div className="v3-skel" style={{ height: 220 }} role="status" aria-label="Loading matchup" />;
  if (!pairs.length) return <Unavailable title="No published matchup statistics">The publication has no paired team statistics for this game yet, so there is nothing to compare. Nothing is substituted.</Unavailable>;
  const shown = all ? pairs : pairs.slice(0, 8);
  return (
    <section aria-label="Team matchup">
      <h2 className="v3-h2">Team Matchup</h2>
      <div className="v3-mx__legend"><span><TeamLogo team={g.away} size={20} />{g.away.abbr}</span><small>League rank · raw season value</small><span>{g.home.abbr}<TeamLogo team={g.home} size={20} /></span></div>
      <ul className="v3-mxs">{shown.map((p) => <StatRow key={p.id} p={p} g={g} />)}</ul>
      {pairs.length > 8 && !all && <button type="button" className="v3-more" onClick={() => setAll(true)}>Show all {pairs.length} statistics</button>}
      <p className="v3-note v3-note--dim">{g.provenance === 'demo' ? 'Sample ranks, for the design preview only. ' : ''}Each row opens the statistic's full league ranking.</p>
    </section>
  );
}

function StatsTab({ g, research, loading }: { g: V3Game; research: EventResearchDoc | null; loading: boolean }) {
  const pairs = useMemo(() => (g.provenance === 'demo' ? demoPairs(g) : pairsFromResearch(research, g)), [g, research]);
  if (loading && !pairs.length) return <div className="v3-skel" style={{ height: 220 }} role="status" aria-label="Loading statistics" />;
  return (
    <section aria-label="Statistics">
      <h2 className="v3-h2">Team Statistics</h2>
      {pairs.length ? (
        <table className="v3-tbl">
          <thead><tr><th scope="col">Statistic</th><th scope="col">{g.away.abbr}</th><th scope="col">{g.home.abbr}</th></tr></thead>
          <tbody>
            {pairs.map((p) => (
              <tr key={p.id}>
                <th scope="row">{p.route ? <Link to={p.route}>{p.name}</Link> : p.name}</th>
                <td><b>{p.away.value}</b><small>{p.away.rank != null ? ordinal(p.away.rank) : ''}</small></td>
                <td><b>{p.home.value}</b><small>{p.home.rank != null ? ordinal(p.home.rank) : ''}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <Unavailable title="No published team statistics">The publication has none for this game.</Unavailable>}
      <Unavailable icon="clock" title="Box score unavailable">Live and final box scores need a licensed stats feed. None is connected, so no box score is shown or estimated.</Unavailable>
    </section>
  );
}

// ------------------------------------------------------------------ script, props

function ScriptTab({ g, detail }: { g: V3Game; detail: EventDetailDoc | null }) {
  if (g.provenance === 'demo') {
    return (
      <section aria-label="Play-by-play">
        <h2 className="v3-h2">Play-by-Play <small className="v3-tag">Sample</small></h2>
        <div className="v3-panel v3-pbp">
          <h3>3rd Quarter</h3>
          <ul>
            {DEMO_PBP.map((p) => (
              <li key={p.clock}>
                <span className="v3-pbp__t">{p.clock}</span>
                {p.side === 'none' ? <span className="v3-pbp__x"><Icon name="chevR" size={18} /></span> : <TeamLogo team={p.side === 'away' ? g.away : g.home} size={34} />}
                <span className="v3-pbp__d"><b>{p.kind}</b><span>{p.text}</span></span>
                <em>{p.down}</em>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }
  const t = detail?.theses?.[0];
  const has = !!(t && (t.summary || t.primary_game_script || t.supporting_factors?.length || t.opposing_factors?.length));
  if (!detail) return <div className="v3-skel" style={{ height: 160 }} role="status" aria-label="Loading game script" />;
  return (
    <section aria-label="Game script">
      <h2 className="v3-h2">Game Script</h2>
      {has ? (
        <>
          {(t!.primary_game_script || t!.summary) && <div className="v3-panel v3-pad"><h3 className="v3-h3">{t!.primary_game_script ? 'Most likely script' : 'Summary'}</h3><p>{t!.primary_game_script ?? t!.summary}</p></div>}
          {t!.supporting_factors.length > 0 && <div className="v3-panel v3-pad"><h3 className="v3-h3">Supporting factors</h3><ul className="v3-bul">{t!.supporting_factors.map((s) => <li key={s}>{s}</li>)}</ul></div>}
          {t!.opposing_factors.length > 0 && <div className="v3-panel v3-pad"><h3 className="v3-h3">Counter-case</h3><ul className="v3-bul">{t!.opposing_factors.map((s) => <li key={s}>{s}</li>)}</ul></div>}
          <p className="v3-note v3-note--dim">Published {ago(t!.generated_at)}. Research context, not a bet signal.</p>
        </>
      ) : <Unavailable title="No published game script yet">The publication has not stated a script for this game{g.sport === 'CFB' ? ' (the college football script engine is not connected to this view yet)' : ''}. Nothing is generated here.</Unavailable>}
    </section>
  );
}

function PropsTab({ g, detail }: { g: V3Game; detail: EventDetailDoc | null }) {
  const open = useOpenLine();
  const rows = useMemo(() => (detail ? deriveProps(detail.markets ?? []) : []), [detail]);
  const stats = useMemo(() => [...new Set(rows.map((r) => r.statLabel))], [rows]);
  const [stat, setStat] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  if (g.provenance === 'demo') {
    const nba = g.sport === 'NBA';
    const rows = nba
      ? [{ player: 'Sample Guard', stat: 'Points', line: 27.5, ask: 52, team: 'home', link: true }, { player: 'Sample Guard', stat: 'Assists', line: 6.5, ask: 49, team: 'home', link: true }, { player: 'Sample Guard', stat: 'Rebounds', line: 4.5, ask: 51, team: 'home', link: true }]
      : DEMO_PROPS.map((p) => ({ ...p, link: false }));
    return (
      <section aria-label="Player props">
        <h2 className="v3-h2">Player Props <small className="v3-tag">Sample</small></h2>
        <ul className="v3-props">
          {rows.map((p) => (
            <li key={p.player + p.stat}>
              {p.link ? <Link to={`/v3/player/${g.slug}/sample-guard?stat=${p.stat === 'Points' ? 'pts' : p.stat === 'Assists' ? 'ast' : 'reb'}`} className="v3-prop__who"><TeamLogo team={g[p.team as 'away' | 'home']} size={34} /><span><b>{p.player}</b><small>{p.stat} · over {p.line}</small></span></Link>
                : <div className="v3-prop__who"><TeamLogo team={g[p.team as 'away' | 'home']} size={34} /><span><b>{p.player}</b><small>{p.stat} · over {p.line}</small></span></div>}
              <span className="v3-prop__p num">{p.ask}¢</span>
            </li>
          ))}
        </ul>
        <p className="v3-note v3-note--dim">Sample players and prices. {nba ? 'Tap the sample guard to see player research.' : 'Only the sample NBA game links to a sample player page.'}</p>
      </section>
    );
  }
  if (!detail) return <div className="v3-skel" style={{ height: 180 }} role="status" aria-label="Loading props" />;
  const filtered = rows.filter((r) => !stat || r.statLabel === stat);
  const shown = all ? filtered : filtered.slice(0, 12);
  if (!rows.length) return <Unavailable title="No player props listed">Kalshi lists no player-stat contracts for this game. Team research is on the other tabs.</Unavailable>;
  return (
    <section aria-label="Player props">
      <h2 className="v3-h2">Player Props</h2>
      <div className="v3-chips" role="group" aria-label="Stat">
        <button type="button" className="v3-chip" aria-pressed={!stat} onClick={() => setStat(null)}>All</button>
        {stats.map((s) => <button key={s} type="button" className="v3-chip" aria-pressed={stat === s} onClick={() => setStat(s)}>{s}</button>)}
      </div>
      <ul className="v3-props">
        {shown.map((r) => (
          <li key={r.key}>
            {r.playerId ? <Link to={`/v3/player/${g.slug}/${encodeURIComponent(r.playerId)}?stat=${encodeURIComponent(r.stat)}&line=${r.line}`} className="v3-prop__who"><span><b>{r.player}</b><small>{r.statLabel} · over {r.line}</small></span></Link> : <div className="v3-prop__who"><span><b>{r.player}</b><small>{r.statLabel} · over {r.line}</small></span></div>}
            <button type="button" className="v3-prop__p num" aria-label={`${r.player} ${r.statLabel} over ${r.line}, ${r.price.ask ?? 'no'} cents. Open exact contract`}
              onClick={() => open(g, { kind: 'total', label: `${r.player} ${r.statLabel} o${r.line}`, price: r.price, line: r.line, alternates: r.ladder })}>{r.price.ask != null ? `${r.price.ask}¢` : '—'}</button>
          </li>
        ))}
      </ul>
      {filtered.length > shown.length && <button type="button" className="v3-more" onClick={() => setAll(true)}>Show all {filtered.length} props</button>}
      <p className="v3-note v3-note--dim">Kalshi prices, nearest-to-even line per player and stat. Tap a name for the player's history.</p>
    </section>
  );
}

// ------------------------------------------------------------------ the tab body

export function GameTabBody({ tab, g, lens, detail, research, researchLoading, onTab }: { tab: TabKey; g: V3Game; lens: Lens | null; detail: EventDetailDoc | null; research: EventResearchDoc | null; researchLoading: boolean; onTab: (t: TabKey) => void }) {
  if (tab === 'matchup') return <MatchupTab g={g} research={research} loading={researchLoading} />;
  if (tab === 'stats') return <StatsTab g={g} research={research} loading={researchLoading} />;
  if (tab === 'script') return <ScriptTab g={g} detail={detail} />;
  if (tab === 'props') return <PropsTab g={g} detail={detail} />;
  const demoStories = [{ t: 'Sample: starting running back listed probable', s: '2h ago', team: g.away }, { t: 'Sample: starting cornerback doubtful (shoulder)', s: '3h ago', team: g.home }];
  return (
    <>
      <MarketsRow g={g} />
      {lens && <LensCard lens={lens} to={`${gameHref(g)}?tab=matchup`} className="v3-gd__lens" />}
      {g.phase === 'live' && <><DriveCard g={g} /><LastPlay g={g} onTab={onTab} /></>}
      {(g.phase === 'live' || g.phase === 'final' || g.phase === 'other') && <LiveNote g={g} />}
      <section aria-label="Key storylines">
        <h2 className="v3-h2">Key Storylines</h2>
        <ul className="v3-stories">
          {g.provenance === 'demo' ? demoStories.map((s) => <li key={s.t}><Link to={`/v3/team/${s.team.slug}/${s.team.id}`} className="v3-story"><TeamLogo team={s.team} size={44} /><span className="v3-story__t"><b>{s.t}</b><small>{s.s}</small></span><Icon name="chevR" size={20} /></Link></li>)
            : <GameStories g={g} max={3} />}
          <li><button type="button" className="v3-story v3-story--btn" onClick={() => onTab('matchup')}><span className="v3-story__ic"><Icon name="trend" size={22} /></span><span className="v3-story__t"><b>Compare the two teams</b><small>League ranks on every published statistic</small></span><Icon name="chevR" size={20} /></button></li>
        </ul>
      </section>
    </>
  );
}
