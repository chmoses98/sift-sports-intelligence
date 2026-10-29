// Projection-first v4 surfaces. The feed exists separately from Kalshi listings: no priced
// contract is required to show a forecast. CFB team points and the seven NBA player families (promoted 2026-10-23)
// use SIFT's approved projection authority: one projection per player and stat, or the approved established-model
// fallback (labelled as such), or a withheld reason. CFB player rows remain labelled research previews.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '../routing';
import { useAuthority, useProjections } from '../data/projections';
import { ageWords, ESTABLISHED_LABEL, ESTABLISHED_TEXT, NBA_ESTABLISHED_ROWS, NBA_STAT_LABEL, NBA_STATS, nbaGameProjections, withheldSentence, type EstablishedNbaRow, type NbaPlayer } from '../lib/nbaProjection';
import { RELIABILITY_WORDS } from '../lib/projectionAuthority';
import { cfbTeam } from '../lib/cfbTeams';
import { coherenceProblems, findTeamProjections, fmtWhen, MAX_AGE_H, type PlayerProjection, type ProjSport } from '../lib/projections';
import type { GameRow } from '../views/broadcast/games';
import { useSlate } from './slate';
import { Icon } from './Icon';
import { clock } from './model';

function teamsOf(g: GameRow) {
  const away = g.away?.short_name ?? '';
  const home = g.home?.short_name ?? '';
  return {
    away, home, startUtc: g.item.start_time_utc,
    awayId: g.sport === 'CFB' ? cfbTeam(away)?.e ?? null : null,
    homeId: g.sport === 'CFB' ? cfbTeam(home)?.e ?? null : null,
  };
}

const decimal = (n: number) => n.toFixed(1);
const range = (lo: number | null, hi: number | null) => lo != null && hi != null ? `${Math.round(lo)}–${Math.round(hi)}` : 'Not published';

/**
 * What a published range that starts below zero means. The range is always shown exactly as published. Only rushing yards can be negative
 * (NEGATIVE_FLOOR in lib/projections.ts): NCAA counts sacks against rushing, so 17.7% of 93,347 ESPN player-game rushing lines 2016–2025 were
 * below 0 (28% for quarterbacks). Every other stat is withheld before it gets here if its range starts below zero.
 */
export function rangeNote(family: string, p10: number | null): string | null {
  if (p10 == null || p10 >= 0 || family !== 'rushing_yards') return null;
  return 'Rushing yards can be negative: NCAA counts sacks against rushing, and about 1 in 6 college rushing lines is below 0.';
}
/** The distinct notes for a player's published rows, in the order the rows are listed. */
export const rangeNotes = (rows: { family: string; p10: number | null }[]): string[] =>
  [...new Set(rows.map((r) => rangeNote(r.family, r.p10)).filter((n): n is string => n != null))];

export function CfbTeamProjections({ g }: { g: GameRow }) {
  const { authority, ready } = useAuthority('CFB');
  const r = ready && authority ? authority.resolveTeams({ ...teamsOf(g), family: 'team_points' }) : null;
  if (!ready) return <div className="v4-card"><div className="v4-skel" style={{ height: 94 }} role="status" aria-label="Loading CFB projections" /></div>;
  return (
    <section aria-label="College football projected points">
      <header className="v4-sechead"><h2>Projected points</h2><span className="v4-spacer" /><span className="meta">SIFT model</span></header>
      {r?.kind === 'authoritative' ? (
        <div className="v4-card">
          {r.teams.map(({ team, value }) => (
            <div className="v4-kv" key={team}>
              <span className="v4-kv__k">{team}</span>
              <span className="v4-kv__v num">{decimal(value.mean)}<em>80% range {range(value.p10, value.p90)}</em></span>
            </div>
          ))}
          <p className="meta" style={{ marginTop: 12 }}>Opponent-adjusted pregame forecasts · updated {fmtWhen(r.teams[0]?.value.updatedAt) ?? 'time unavailable'}{g.phase === 'PREGAME' || g.phase === 'NO_START' ? '' : ' · frozen after kickoff'}. A model score is not a validated betting edge.</p>
        </div>
      ) : <div className="v4-note"><Icon name="info" /><div><b>Team projection unavailable</b>{r?.kind === 'withheld' ? r.reason : 'The projection has not been published for this game.'}</div></div>}
    </section>
  );
}

/** The most cautious reliability among a player's shown projections (HIGH only when every shown stat is HIGH), with the reasons that lower it. */
function playerReliability(p: NbaPlayer): { word: string; why: string[]; level: 'HIGH' | 'MODERATE' | 'LOW' } | null {
  const vals = p.shown.flatMap((x) => (x.kind === 'projection' ? [x.value] : []));
  if (!vals.length) return null;
  const rank = { HIGH: 0, MODERATE: 1, LOW: 2 } as const;
  const worst = vals.reduce((m, v) => (rank[v.reliability] > rank[m.reliability] ? v : m));
  return { word: RELIABILITY_WORDS[worst.reliability], why: [...new Set(vals.flatMap((v) => v.reliabilityWhy))], level: worst.reliability };
}

/**
 * One game's NBA player projections, through SIFT's approved authority: the approved projection, or the approved established-model fallback (labelled), or
 * nothing with the reason. Raw feed rows never reach the screen. `established` is the established model's rows for this game; none are published today.
 */
export function NbaPlayerProjections({ g, established = NBA_ESTABLISHED_ROWS }: { g: GameRow; established?: readonly EstablishedNbaRow[] }) {
  const { doc, loading } = useProjections('NBA');
  const { authority, ready } = useAuthority('NBA');
  const [limit, setLimit] = useState(12);
  const match = useMemo(() => findTeamProjections(doc, teamsOf(g)), [doc, g]);
  const gameId = match?.[0]?.gameId ?? '';
  const nowMs = Date.now();
  const game = useMemo(() => nbaGameProjections(authority, doc, gameId, established), [authority, doc, gameId, established]);
  const shown = game.listed.slice(0, limit);
  const sentence = withheldSentence(game);
  const anyEstablished = game.listed.some((p) => p.shown.some((x) => x.kind === 'established'));
  return (
    <section aria-label="NBA player projections">
      <header className="v4-sechead"><h2>NBA player projections</h2><span className="v4-spacer" /><span className="meta">{game.listed.length} players</span></header>
      <div className="v4-note" style={{ marginBottom: 12 }}><Icon name="info" /><div><b>SIFT projection · approved for production</b>One projection for each player and stat, from SIFT's approved NBA model. How close projections come to results is not betting value: a projection is not a bet recommendation, and a gap to a market price is not an edge. Availability is checked before the game; a player who is ruled out has no projection.</div></div>
      {anyEstablished && <div className="v4-note" style={{ marginBottom: 12 }} data-testid="nba-established-note"><Icon name="info" /><div><b>{ESTABLISHED_LABEL}</b>{ESTABLISHED_TEXT}</div></div>}
      {loading || !ready ? <div className="v4-card"><div className="v4-skel" style={{ height: 80 }} role="status" aria-label="Loading NBA projections" /></div>
        : !game.players.length ? <div className="v4-note"><Icon name="info" /><div><b>{doc ? 'No forecast for this matchup' : 'NBA projections unavailable'}</b>{doc ? 'The feed may not have reached this game yet, or its team identity and start time do not match.' : 'The current SIFT forecast is unavailable right now, and no established projection is published for NBA players.'}</div></div>
        : !game.listed.length ? <div className="v4-note"><Icon name="info" /><div><b>No usable NBA player projections</b>{sentence ?? 'Every published row was withheld.'}</div></div>
        : <>
          <ul className="v4-grp" aria-label="NBA player projections">
            {shown.map((p) => {
              const by = new Map(p.shown.map((x) => [x.family, x]));
              const lead = by.get('points') ?? p.shown[0];
              const rel = playerReliability(p);
              const avail = p.shown.flatMap((x) => (x.kind === 'projection' && x.value.availability ? [x.value.availability] : []))[0];
              const est = p.shown.some((x) => x.kind === 'established');
              const leadMean = lead.kind === 'projection' ? lead.value.mean : lead.kind === 'established' ? lead.mean : null;
              return <li key={p.playerId}>
                <details style={{ padding: '12px 16px' }}>
                  <summary style={{ cursor: 'pointer', listStyle: 'revert' }}>
                    <span style={{ display: 'inline-flex', justifyContent: 'space-between', gap: 8, width: 'calc(100% - 20px)', verticalAlign: 'middle', alignItems: 'center' }}>
                      <span style={{ minWidth: 0 }}><b style={{ display: 'block' }}>{p.name}</b><span className="meta">{p.team} · {est ? ESTABLISHED_LABEL : rel?.level === 'HIGH' ? 'SIFT projection' : rel ? `SIFT projection · ${rel.word}` : 'SIFT projection'}</span></span>
                      <span className="num" style={{ whiteSpace: 'nowrap', textAlign: 'right' }}><b>{leadMean != null ? decimal(leadMean) : '—'}</b><span className="meta" style={{ display: 'block' }}>{NBA_STAT_LABEL[lead.family]}</span></span>
                    </span>
                  </summary>
                  <div style={{ marginTop: 12 }}>
                    {NBA_STATS.map((f) => {
                      const x = by.get(f);
                      if (!x || x.kind === 'withheld') return null;
                      const lo = x.kind === 'projection' ? x.value.p10 : x.p10;
                      const hi = x.kind === 'projection' ? x.value.p90 : x.p90;
                      return <div className="v4-kv" key={f}><span className="v4-kv__k">{NBA_STAT_LABEL[f]}</span><span className="v4-kv__v num">{decimal(x.kind === 'projection' ? x.value.mean : x.mean)}<em>80% range {range(lo, hi)}{x.kind === 'established' ? ` · ${ESTABLISHED_LABEL.toLowerCase()}` : ''}</em></span></div>;
                    })}
                    {est && <p className="meta" style={{ marginTop: 9 }}><b>{ESTABLISHED_LABEL}</b> — {ESTABLISHED_TEXT}</p>}
                    {rel && rel.level !== 'HIGH' && rel.why.map((w) => <p key={w} className="meta" style={{ marginTop: 9 }}>{rel.word}: {w}.</p>)}
                    <p className="meta" style={{ marginTop: 9 }}>
                      {avail ? `${avail.words}${avail.source ? ` (${avail.source.replace(/_/g, ' ')})` : ''}` : 'Availability not shown for the established model'} · updated {(() => { const u = lead.kind === 'projection' ? lead.value.updatedAt : lead.kind === 'established' ? lead.updatedAt : null; return fmtWhen(u) ?? 'unknown'; })()}
                      {(() => { const u = lead.kind === 'projection' ? lead.value.updatedAt : lead.kind === 'established' ? lead.updatedAt : null; const a = ageWords(u, nowMs); return a ? ` (${a})` : ''; })()}.
                    </p>
                  </div>
                </details>
              </li>;
            })}
          </ul>
          {game.listed.length > limit && <button type="button" className="v4-btn v4-btn--sec" style={{ width: '100%', marginTop: 12 }} onClick={() => setLimit((n) => n + 12)}>Show more players ({game.listed.length - limit} remaining)</button>}
          {sentence && <p className="meta" style={{ marginTop: 12 }} data-testid="nba-withheld">{sentence}</p>}
        </>}
    </section>
  );
}

const CFB_FAMILIES = ['passing_yards', 'rushing_yards', 'receiving_yards', 'passing_attempts', 'carries', 'receptions'] as const;
const CFB_LABEL: Record<string, string> = {
  passing_yards: 'Pass yds', rushing_yards: 'Rush yds', receiving_yards: 'Rec yds',
  passing_attempts: 'Pass att', carries: 'Carries', receptions: 'Catches',
};

/** One game's college player research rows, grouped by player and ordered by lead yardage. Rows that are stale, out, blocked or incoherent never
 *  appear; the incoherent ones are counted so the screen can say how many were withheld, and how many of them are receiving-yards ranges that
 *  start below 0 (a model artifact for that stat, see NEGATIVE_FLOOR) instead of dropping them silently. */
export function cfbPlayerRows(doc: { players: PlayerProjection[] } | null, gameId: string, nowMs: number) {
  const families = new Set<string>(CFB_FAMILIES);
  const by = new Map<string, PlayerProjection[]>();
  let withheld = 0;
  let withheldNegativeReceiving = 0;
  for (const p of doc?.players ?? []) {
    if (p.gameId !== gameId || !families.has(p.family) || p.readiness !== 'SHADOW VALIDATION' || p.gate.status === 'BLOCK') continue;
    if (p.participation?.status === 'LIKELY_OUT' || p.participation?.status === 'CONFIRMED_OUT') continue;
    if (!p.dataAsOf || !Number.isFinite(Date.parse(p.dataAsOf)) || Math.abs(nowMs - Date.parse(p.dataAsOf)) > MAX_AGE_H.CFB * 3600_000) continue;
    const problems = coherenceProblems(p);
    if (problems.length) {
      withheld += 1;
      if (p.family === 'receiving_yards' && problems.every((x) => x === 'a projected value is negative')) withheldNegativeReceiving += 1;
      continue;
    }
    by.set(p.playerId, [...(by.get(p.playerId) ?? []), p]);
  }
  const priority = (rows: PlayerProjection[]) => Math.max(0, ...rows.filter((p) => p.family.endsWith('_yards')).map((p) => p.mean));
  return { items: [...by.values()].sort((a, b) => priority(b) - priority(a)), withheld, withheldNegativeReceiving };
}

/** The college player models are archived shadows. Do not promote them implicitly: no verified
 *  point-in-time participation feed exists, so every figure is conditional on playing. */
export function CfbPlayerProjections({ g }: { g: GameRow }) {
  const { doc, loading } = useProjections('CFB');
  const [limit, setLimit] = useState(12);
  const match = useMemo(() => findTeamProjections(doc, teamsOf(g)), [doc, g]);
  const id = match?.[0]?.gameId ?? '';
  const { items, withheld, withheldNegativeReceiving } = useMemo(() => cfbPlayerRows(doc, id, Date.now()), [doc, id]);
  return <section aria-label="College player projection research">
    <header className="v4-sechead"><h2>College player research</h2><span className="v4-spacer" /><span className="meta">{items.length} players</span></header>
    <div className="v4-note" style={{ marginBottom: 12 }}><Icon name="info" /><div><b>Research preview · player availability unverified</b>These are published shadow forecasts, conditional on the player participating. They are not approved SIFT player projections, validated edges, or recommendations.</div></div>
    {loading ? <div className="v4-card"><div className="v4-skel" style={{ height: 80 }} role="status" aria-label="Loading CFB player research" /></div>
      : !id || !items.length ? <div className="v4-note"><Icon name="info" /><div><b>No current college player research</b>No matching, coherent, recent player rows are published for this matchup.</div></div>
      : <>
        <ul className="v4-grp" aria-label="Conditional CFB research previews">
          {items.slice(0, limit).map((rows) => {
            const p = rows[0];
            const lead = rows.find((v) => v.family.endsWith('_yards')) ?? p;
            return <li key={p.playerId}>
              <details style={{ padding: '12px 16px' }}>
                <summary style={{ cursor: 'pointer' }}>
                  <span style={{ display: 'inline-flex', justifyContent: 'space-between', gap: 8, width: 'calc(100% - 20px)', verticalAlign: 'middle', alignItems: 'center' }}>
                    <span><b style={{ display: 'block' }}>{p.name}</b><span className="meta">{p.team} · participation unconfirmed</span></span>
                    <span className="num" style={{ whiteSpace: 'nowrap', textAlign: 'right' }}><b>{decimal(lead.mean)}</b><span className="meta" style={{ display: 'block' }}>{CFB_LABEL[lead.family]}</span></span>
                  </span>
                </summary>
                <div style={{ marginTop: 12 }}>
                  {CFB_FAMILIES.map((f) => {
                    const v = rows.find((x) => x.family === f);
                    return v ? <div key={f} className="v4-kv"><span className="v4-kv__k">{CFB_LABEL[f]}</span><span className="v4-kv__v num">{decimal(v.mean)}<em>80% range {range(v.p10, v.p90)}</em></span></div> : null;
                  })}
                  {rangeNotes(rows).map((n) => <p key={n} className="meta" style={{ marginTop: 9 }}>{n}</p>)}
                  <p className="meta" style={{ marginTop: 9 }}>Shadow · assumes participation · updated {fmtWhen(p.dataAsOf) ?? 'unknown'}. Do not equate a market gap with an edge.</p>
                </div>
              </details>
            </li>;
          })}
        </ul>
        {items.length > limit && <button className="v4-btn v4-btn--sec" style={{ marginTop: 12, width: '100%' }} type="button" onClick={() => setLimit((n) => n + 12)}>Show more players ({items.length - limit} remaining)</button>}
      </>}
    {!loading && id && withheld > 0 && <p className="meta" style={{ marginTop: 12 }}>
      {withheld} stat forecast{withheld === 1 ? '' : 's'} withheld because the published range failed a coherence check
      {withheldNegativeReceiving > 0 ? `, ${withheldNegativeReceiving} of them receiving-yards ranges that start below 0: negative receiving games are only about 2% of the total, so that bound is a model artifact` : ''}.
    </p>}
  </section>;
}

/** The v4 Props tab is projection-first for CFB/NBA; it must not vanish when Kalshi has no prop listing. */
export function ProjectionBrowser({ sport }: { sport: 'cfb' | 'nba' }) {
  const { doc, loading } = useProjections(sport.toUpperCase() as ProjSport);
  const slate = useSlate();
  const [chosen, setChosen] = useState<string | null>(null);
  // The list can run to 30 games, so the chosen game's forecasts are below the fold on a phone: bring them into view after the person picks one
  // (never on the first paint, so the screen still opens at the top).
  const detail = useRef<HTMLDivElement>(null);
  const picked = useRef(false);
  useEffect(() => {
    if (!picked.current) return;
    picked.current = false;
    const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    detail.current?.scrollIntoView?.({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
  }, [chosen]);
  const games = useMemo(() => slate.rows.filter((g) => g.sport === sport.toUpperCase()
    && Number.isFinite(g.startMs) && g.startMs >= slate.now - 2 * 3600_000
    && findTeamProjections(doc, teamsOf(g)) != null).sort((a, b) => a.startMs - b.startMs), [doc, slate.rows, slate.now, sport]);
  const selected = games.find((g) => g.item.event_id === chosen) ?? games[0];
  return <div className="v4-body">
    <div className="v4-note"><Icon name="info" /><div><b>{sport === 'cfb' ? 'CFB team projections' : 'NBA player projections'}</b>{sport === 'cfb' ? 'Opponent-adjusted, approved team projected points. College player props are still held because participation is unverified.' : 'Seven player-stat families (points, rebounds, assists, threes, minutes, PRA, FGA), approved for production: one projection per player and stat, or none with the reason. A projection is not a bet recommendation.'} No Kalshi market is required to browse.</div></div>
    {loading || slate.loading ? <div className="v4-card" style={{ marginTop: 12 }}><div className="v4-skel" style={{ height: 80 }} role="status" aria-label="Loading projection games" /></div>
      : games.length === 0 ? <div className="v4-note" style={{ marginTop: 12 }}><Icon name="calendar-dots" /><div><b>No matched upcoming forecasts</b>The feed is missing, outside the publication window, or could not be safely matched to SIFT's game list. No estimates are substituted.</div></div>
      : <>
        <header className="v4-sechead" style={{ marginTop: 16 }}><h2>Games with forecasts</h2><span className="v4-spacer" /><span className="meta">{games.length}</span></header>
        <ul className="v4-grp" aria-label="Choose a projected game">
          {games.slice(0, 30).map((g) => <li key={g.item.event_id}>
            <button type="button" className="v4-link" style={{ width: '100%', margin: 0, borderRadius: 0, boxShadow: 'none' }} aria-pressed={selected?.item.event_id === g.item.event_id} onClick={() => { picked.current = true; setChosen(g.item.event_id); }}>
              <span className="v4-link__t"><b>{g.away?.display_name ?? g.away?.short_name} @ {g.home?.display_name ?? g.home?.short_name}</b><span>{new Date(g.startMs).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {clock(g.startMs)}{selected?.item.event_id === g.item.event_id ? ' · Selected' : ''}</span></span><Icon name="caret-right" size="s" />
            </button>
          </li>)}
        </ul>
        {selected && <div ref={detail} style={{ marginTop: 18, scrollMarginTop: 12 }} key={selected.item.event_id}>
          {sport === 'cfb' ? <><CfbTeamProjections g={selected} /><div style={{ marginTop: 18 }}><CfbPlayerProjections g={selected} /></div></> : <NbaPlayerProjections g={selected} />}
          <Link className="v4-btn v4-btn--sec" style={{ display: 'block', textAlign: 'center', marginTop: 14 }} to={`/v4/game/${sport}/${encodeURIComponent(selected.item.event_id)}?tab=${sport === 'cfb' ? 'matchups' : 'players'}`}>Open game research</Link>
        </div>}
      </>}
  </div>;
}
