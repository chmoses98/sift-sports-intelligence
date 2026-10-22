// Projection-first v4 surfaces. The feed exists separately from Kalshi listings: no priced
// contract is required to show a forecast. CFB team points use SIFT's promoted authority.
// NBA's seven challenger families are labelled research previews until the audited activation
// gate promotes them; preview values never claim betting authority or replace the incumbent.
import { useMemo, useState } from 'react';
import { Link } from '../routing';
import { useAuthority, useProjections } from '../data/projections';
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
 * Why a published 80% range may start below zero, by stat. The range itself is always shown exactly as published; this only says what the
 * negative bound means. Rushing yards are legitimately negative in college football (NCAA counts sacks against rushing: 17.7% of 93,347
 * player-game rushing lines in ESPN box scores 2016–2025 were below 0, 28% for quarterbacks). Receiving yards are rarely negative (2.4% of
 * 116,854 lines, 5.0% for one-catch lines), so a negative lower bound there is an artifact of the model's low-volume residuals, not a
 * calibrated outcome. Any other stat cannot be negative at all.
 */
export function rangeNote(family: string, p10: number | null): string | null {
  if (p10 == null || p10 >= 0) return null;
  if (family === 'rushing_yards') return 'A range starting below 0 is possible for rushing yards: NCAA counts sacks against rushing, and 1 in 6 college rushing lines is negative.';
  if (family === 'receiving_yards') return 'The lower bound below 0 is a model artifact: receiving yards are negative in only about 2% of games, and zero is the realistic floor.';
  return 'This stat cannot be negative: the lower bound below 0 is a model artifact.';
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

const NBA_FAMILIES = ['points', 'rebounds', 'assists', 'threes', 'minutes', 'pra', 'fga'] as const;
const NBA_LABEL: Record<string, string> = { points: 'PTS', rebounds: 'REB', assists: 'AST', threes: '3PM', minutes: 'MIN', pra: 'PRA', fga: 'FGA' };
const NBA_STATS = new Set<string>(NBA_FAMILIES);

/** One game's point-in-time research forecasts, never a production-promotion switch. */
export function eligibleNbaRows(doc: { players: PlayerProjection[]; families: Record<string, { readiness: string }> } | null, gameId: string, nowMs: number): PlayerProjection[] {
  if (!doc) return [];
  return doc.players.filter((p) => p.gameId === gameId && NBA_STATS.has(p.family)
    && p.readiness === 'READY' && doc.families[p.family]?.readiness === 'READY'
    && p.gate.status !== 'BLOCK'
    && p.participation?.status !== 'CONFIRMED_OUT' && p.participation?.status !== 'LIKELY_OUT'
    && coherenceProblems(p).length === 0
    && p.dataAsOf != null && Number.isFinite(Date.parse(p.dataAsOf))
    && nowMs - Date.parse(p.dataAsOf) >= -5 * 60_000
    && nowMs - Date.parse(p.dataAsOf) <= MAX_AGE_H.NBA * 3600_000);
}

export function NbaPlayerProjections({ g }: { g: GameRow }) {
  const { doc, loading } = useProjections('NBA');
  const [limit, setLimit] = useState(12);
  const match = useMemo(() => findTeamProjections(doc, teamsOf(g)), [doc, g]);
  const gameId = match?.[0]?.gameId ?? '';
  const rows = useMemo(() => eligibleNbaRows(doc, gameId, Date.now()), [doc, gameId]);
  const players = useMemo(() => {
    const grouped = new Map<string, PlayerProjection[]>();
    for (const p of rows) grouped.set(p.playerId, [...(grouped.get(p.playerId) ?? []), p]);
    return [...grouped.values()].sort((a, b) =>
      (b.find((p) => p.family === 'minutes')?.mean ?? 0) - (a.find((p) => p.family === 'minutes')?.mean ?? 0));
  }, [rows]);
  const shown = players.slice(0, limit);
  return (
    <section aria-label="NBA player projections">
      <header className="v4-sechead"><h2>NBA player forecasts</h2><span className="v4-spacer" /><span className="meta">{players.length} players</span></header>
      <div className="v4-note" style={{ marginBottom: 12 }}><Icon name="info" /><div><b>Research preview · pending production approval</b>Published Projection Foundation model, not yet SIFT's approved production projection or a betting signal. Availability and consistency are still being validated. No Kalshi listing is needed.</div></div>
      {loading ? <div className="v4-card"><div className="v4-skel" style={{ height: 80 }} role="status" aria-label="Loading NBA forecasts" /></div>
        : !gameId ? <div className="v4-note"><Icon name="info" /><div><b>No forecast for this matchup</b>The feed may not have reached this game yet, or its team identity and start time do not match.</div></div>
        : !players.length ? <div className="v4-note"><Icon name="info" /><div><b>No usable NBA player forecasts</b>All published rows were missing, blocked, not ready, or outside the {MAX_AGE_H.NBA}-hour freshness limit.</div></div>
        : <>
          <ul className="v4-grp" aria-label="Published NBA research projections">
            {shown.map((stats) => {
              const p = stats.find((x) => x.family === 'points') ?? stats[0];
              const by = new Map(stats.map((x) => [x.family, x]));
              const review = stats.some((x) => x.gate.status === 'REVIEW');
              const uncertain = stats.some((x) => !['LIKELY_ACTIVE', 'CONFIRMED_ACTIVE'].includes(x.participation?.status ?? 'UNVERIFIED'));
              return <li key={p.playerId}>
                <details style={{ padding: '12px 16px' }}>
                  <summary style={{ cursor: 'pointer', listStyle: 'revert' }}>
                    <span style={{ display: 'inline-flex', justifyContent: 'space-between', gap: 8, width: 'calc(100% - 20px)', verticalAlign: 'middle', alignItems: 'center' }}>
                      <span style={{ minWidth: 0 }}><b style={{ display: 'block' }}>{p.name}</b><span className="meta">{p.team} · {review || uncertain ? 'Verify role / availability' : 'Expected active'}</span></span>
                      <span className="num" style={{ whiteSpace: 'nowrap', textAlign: 'right' }}><b>{by.get('points') ? decimal(by.get('points')!.mean) : '—'}</b><span className="meta" style={{ display: 'block' }}>PTS</span></span>
                    </span>
                  </summary>
                  <div style={{ marginTop: 12 }}>
                    {NBA_FAMILIES.map((f) => {
                      const x = by.get(f);
                      return x ? <div className="v4-kv" key={f}><span className="v4-kv__k">{NBA_LABEL[f]}</span><span className="v4-kv__v num">{decimal(x.mean)}<em>80% range {range(x.p10, x.p90)}{x.gate.status === 'REVIEW' ? ' · model review' : ''}</em></span></div> : null;
                    })}
                    {rangeNotes(stats).map((n) => <p key={n} className="meta" style={{ marginTop: 9 }}>{n}</p>)}
                    <p className="meta" style={{ marginTop: 9 }}>Research only · participation {p.participation?.status?.toLowerCase().replace(/_/g, ' ') ?? 'unverified'} · updated {fmtWhen(p.dataAsOf) ?? 'unknown'}.</p>
                  </div>
                </details>
              </li>;
            })}
          </ul>
          {players.length > limit && <button type="button" className="v4-btn v4-btn--sec" style={{ width: '100%', marginTop: 12 }} onClick={() => setLimit((n) => n + 12)}>Show more players ({players.length - limit} remaining)</button>}
        </>}
    </section>
  );
}

const CFB_FAMILIES = ['passing_yards', 'rushing_yards', 'receiving_yards', 'passing_attempts', 'carries', 'receptions'] as const;
const CFB_LABEL: Record<string, string> = {
  passing_yards: 'Pass yds', rushing_yards: 'Rush yds', receiving_yards: 'Rec yds',
  passing_attempts: 'Pass att', carries: 'Carries', receptions: 'Catches',
};

/** The college player models are archived shadows. Do not promote them implicitly: no verified
 *  point-in-time participation feed exists, so every figure is conditional on playing. */
export function CfbPlayerProjections({ g }: { g: GameRow }) {
  const { doc, loading } = useProjections('CFB');
  const [limit, setLimit] = useState(12);
  const match = useMemo(() => findTeamProjections(doc, teamsOf(g)), [doc, g]);
  const id = match?.[0]?.gameId ?? '';
  const items = useMemo(() => {
    const now = Date.now();
    const families = new Set<string>(CFB_FAMILIES);
    const by = new Map<string, PlayerProjection[]>();
    for (const p of doc?.players ?? []) {
      if (p.gameId !== id || !families.has(p.family) || p.readiness !== 'SHADOW VALIDATION' || p.gate.status === 'BLOCK') continue;
      if (p.participation?.status === 'LIKELY_OUT' || p.participation?.status === 'CONFIRMED_OUT') continue;
      if (!p.dataAsOf || !Number.isFinite(Date.parse(p.dataAsOf)) || Math.abs(now - Date.parse(p.dataAsOf)) > MAX_AGE_H.CFB * 3600_000) continue;
      if (coherenceProblems(p).length) continue;
      by.set(p.playerId, [...(by.get(p.playerId) ?? []), p]);
    }
    return [...by.values()].sort((a, b) => {
      const priority = (rows: PlayerProjection[]) => Math.max(0, ...rows.filter((p) => p.family.endsWith('_yards')).map((p) => p.mean));
      return priority(b) - priority(a);
    });
  }, [doc, id]);
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
  </section>;
}

/** The v4 Props tab is projection-first for CFB/NBA; it must not vanish when Kalshi has no prop listing. */
export function ProjectionBrowser({ sport }: { sport: 'cfb' | 'nba' }) {
  const { doc, loading } = useProjections(sport.toUpperCase() as ProjSport);
  const slate = useSlate();
  const [chosen, setChosen] = useState<string | null>(null);
  const games = useMemo(() => slate.rows.filter((g) => g.sport === sport.toUpperCase()
    && Number.isFinite(g.startMs) && g.startMs >= slate.now - 2 * 3600_000
    && findTeamProjections(doc, teamsOf(g)) != null).sort((a, b) => a.startMs - b.startMs), [doc, slate.rows, slate.now, sport]);
  const selected = games.find((g) => g.item.event_id === chosen) ?? games[0];
  return <div className="v4-body">
    <div className="v4-note"><Icon name="info" /><div><b>{sport === 'cfb' ? 'CFB team projections' : 'NBA player projections'}</b>{sport === 'cfb' ? 'Opponent-adjusted, approved team projected points. College player props are still held because participation is unverified.' : 'Seven player-stat families published as research previews. Production activation remains gated by live injury and model checks.'} No Kalshi market is required to browse.</div></div>
    {loading || slate.loading ? <div className="v4-card" style={{ marginTop: 12 }}><div className="v4-skel" style={{ height: 80 }} role="status" aria-label="Loading projection games" /></div>
      : games.length === 0 ? <div className="v4-note" style={{ marginTop: 12 }}><Icon name="calendar-dots" /><div><b>No matched upcoming forecasts</b>The feed is missing, outside the publication window, or could not be safely matched to SIFT's game list. No estimates are substituted.</div></div>
      : <>
        <header className="v4-sechead" style={{ marginTop: 16 }}><h2>Games with forecasts</h2><span className="v4-spacer" /><span className="meta">{games.length}</span></header>
        <ul className="v4-grp" aria-label="Choose a projected game">
          {games.slice(0, 30).map((g) => <li key={g.item.event_id}>
            <button type="button" className="v4-link" style={{ width: '100%', margin: 0, borderRadius: 0, boxShadow: 'none' }} aria-pressed={selected?.item.event_id === g.item.event_id} onClick={() => setChosen(g.item.event_id)}>
              <span className="v4-link__t"><b>{g.away?.display_name ?? g.away?.short_name} @ {g.home?.display_name ?? g.home?.short_name}</b><span>{new Date(g.startMs).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {clock(g.startMs)}{selected?.item.event_id === g.item.event_id ? ' · Selected' : ''}</span></span><Icon name="caret-right" size="s" />
            </button>
          </li>)}
        </ul>
        {selected && <div style={{ marginTop: 18 }} key={selected.item.event_id}>
          {sport === 'cfb' ? <><CfbTeamProjections g={selected} /><div style={{ marginTop: 18 }}><CfbPlayerProjections g={selected} /></div></> : <NbaPlayerProjections g={selected} />}
          <Link className="v4-btn v4-btn--sec" style={{ display: 'block', textAlign: 'center', marginTop: 14 }} to={`/v4/game/${sport}/${encodeURIComponent(selected.item.event_id)}?tab=${sport === 'cfb' ? 'matchups' : 'players'}`}>Open game research</Link>
        </div>}
      </>}
  </div>;
}
