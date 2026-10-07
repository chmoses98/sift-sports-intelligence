// The NHL player page, research first: who he is in this lineup (line, power-play unit, goalie start status),
// what he has done (season, current season, last 10, TOI by strength state, game log), then — only where the
// NHL joint simulation actually prices a contract — the model's probability and its script survival. A player
// without a priced market gets no invented projection.
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import type { EntityProfileDoc, EventResearchDoc, Observation } from '../../contract/types';
import { EntityLink, ErrorState, SaveButton, Skeleton, Stratum, TeamMark } from '../../components/ui';
import { useAsync } from '../../data/hooks';
import { kickoff } from '../../lib/format';
import { describeNhlMarket } from '../../lib/marketLabel';
import { evText, FAMILY_WORD, isNhlScripts, probText, readNhl, type NhlScripts } from '../../lib/nhl';
import { routes } from '../../lib/routes';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { ScriptDot, TierChip } from './parts';
import '../../styles/nhl.css';

/* eslint-disable @typescript-eslint/no-explicit-any */

const POS: Record<string, string> = { C: 'Center', L: 'Left wing', R: 'Right wing', D: 'Defense', G: 'Goalie' };
const UNIT: Record<string, string> = { f1: 'first line', f2: 'second line', f3: 'third line', f4: 'fourth line', d1: 'first pair', d2: 'second pair', d3: 'third pair', pp1: 'PP1', pp2: 'PP2', pk1: 'PK1', pk2: 'PK2', g: 'goalies' };

function obsOf(p: EntityProfileDoc, slug: string, window: string): Observation | undefined {
  return p.metrics.find((o) => o.metric_id === `met_nhl.${slug}` && o.window.label === window);
}

function roleIn(r: EventResearchDoc | undefined, name: string): { team: string; units: string[]; goalie: any | null } | null {
  if (!r) return null;
  let team = '';
  const units: string[] = [];
  let goalie: any = null;
  for (const l of (r.context?.lineups ?? []) as any[]) {
    if (l.kind === 'line_combinations') {
      for (const [k, ps] of Object.entries(l.units ?? {}) as [string, any[]][]) {
        if (ps.some((x) => x.name === name)) {
          team = l.team;
          const u = k.split(':')[1];
          if (u !== 'g' && u !== 'ir') units.push(UNIT[u] ?? u);
        }
      }
    }
    if (l.kind === 'goalie_status' && l.current?.player_name === name) goalie = { ...l.current, team: l.team, updates: (l.timeline ?? []).length };
  }
  return { team, units, goalie };
}

function SeasonTable({ p, goalie }: { p: EntityProfileDoc; goalie: boolean }) {
  const windows = [...new Set(p.metrics.map((o) => o.window.label))].sort((a, b) => (a === 'L10' ? 1 : b === 'L10' ? -1 : b.localeCompare(a)));
  const cols: [string, string, (v: number) => string][] = goalie
    ? [['goalie_starts', 'GS', (v) => v.toFixed(0)], ['save_pct', 'SV%', (v) => v.toFixed(3).replace(/^0/, '')], ['ev_save_pct', 'EV SV%', (v) => v.toFixed(3).replace(/^0/, '')], ['gaa', 'GAA', (v) => v.toFixed(2)]]
    : [['games_played', 'GP', (v) => v.toFixed(0)], ['goals', 'G', (v) => v.toFixed(0)], ['assists', 'A', (v) => v.toFixed(0)], ['points', 'P', (v) => v.toFixed(0)], ['shots_on_goal', 'SOG', (v) => v.toFixed(0)], ['toi_per_game', 'TOI/GP', (v) => v.toFixed(1)], ['points_per60', 'P/60', (v) => v.toFixed(2)]];
  return (
    <div className="tscroll" tabIndex={0} role="region" aria-label="Season numbers">
      <table className="nsc__t">
        <thead><tr><th scope="col">Window</th>{cols.map(([, l]) => <th key={l} scope="col" className="r">{l}</th>)}</tr></thead>
        <tbody>
          {windows.map((w) => (
            <tr key={w}>
              <th scope="row">{w === 'L10' ? 'Last 10 games' : w}</th>
              {cols.map(([k, l, f]) => {
                const o = obsOf(p, k, w);
                return <td key={l} className="r num">{o?.value != null ? f(o.value) : '—'}{o?.context?.rank != null && <small className="muted"> #{o.context.rank}</small>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GameLog({ p, goalie, n = 10 }: { p: EntityProfileDoc; goalie: boolean; n?: number }) {
  const gl = (p.extensions as any)?.game_log;
  const cols: string[] = gl?.columns ?? [];
  const ix = (c: string) => cols.indexOf(c);
  // goalies: only games he actually played (a dressed backup has 0 minutes)
  const rows: any[][] = (gl?.rows ?? []).filter((r: any[]) => !goalie || Number(r[ix('toi_s')] ?? 0) > 0).slice(-n).reverse();
  if (!rows.length) return <p className="muted small">No game log published.</p>;
  const show = goalie ? [['date', 'Date'], ['opp', 'Opp'], ['start', 'Start'], ['dec', 'Dec'], ['sa', 'SA'], ['sv', 'SV'], ['ga', 'GA']] : [['date', 'Date'], ['opp', 'Opp'], ['g', 'G'], ['a', 'A'], ['p', 'P'], ['sog', 'SOG'], ['toi_s', 'TOI'], ['toi_pp_s', 'PP TOI']];
  const fmt = (c: string, v: any) => (v == null ? '—' : c.startsWith('toi') ? `${Math.floor(Number(v) / 60)}:${String(Math.round(Number(v) % 60)).padStart(2, '0')}` : c === 'start' ? (v ? 'Yes' : 'Relief') : c === 'dec' ? ({ W: 'W', L: 'L', O: 'OTL' } as Record<string, string>)[v] ?? v : c === 'opp' ? v : String(v));
  return (
    <div className="tscroll" tabIndex={0} role="region" aria-label="Game log">
      <table className="nsc__t">
        <thead><tr>{show.map(([, l]) => <th key={l} scope="col" className={l === 'Date' || l === 'Opp' ? '' : 'r'}>{l}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{show.map(([c, l]) => <td key={l} className={l === 'Date' || l === 'Opp' ? '' : 'r num'}>{c === 'opp' ? `${r[ix('ha')] === 'A' ? '@' : 'vs'} ${r[ix('opp')]}` : fmt(c, r[ix(c)])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PricedMarkets({ s, r, pid, slug, eventId }: { s: NhlScripts; r: EventResearchDoc; pid: string; slug: string; eventId: string }) {
  const mine = r.markets.filter((m) => m.player_id === pid);
  const priced = mine.map((m) => ({ m, row: s.markets.get(m.kalshi_ticker) })).filter((x) => x.row);
  if (!mine.length) return <p className="muted small">No Kalshi market lists this player for the next game.</p>;
  return (
    <>
      <div className="tscroll" tabIndex={0} role="region" aria-label="Model-priced markets">
        <table className="nsc__t">
          <thead><tr><th scope="col">Market</th><th scope="col" className="r">Model P(YES)</th><th scope="col" className="r">Market P(YES)</th><th scope="col">Best side after fee</th></tr></thead>
          <tbody>
            {mine.map((m) => {
              const row = s.markets.get(m.kalshi_ticker);
              const best = row ? ([['YES', row.yes], ['NO', row.no]] as const).filter(([, sd]) => sd?.ev != null).sort((a, b) => (b[1]!.ev ?? -9) - (a[1]!.ev ?? -9))[0] : null;
              return (
                <tr key={m.kalshi_ticker}>
                  <th scope="row"><Link to={routes.market(slug, m.market_id, eventId)}>{describeNhlMarket(m as any)?.title ?? m.yes_description}</Link> <span className="muted small">{FAMILY_WORD[m.market_family] ?? ''}</span></th>
                  {row ? (
                    <>
                      <td className="r num">{probText(row.pYes, 1)}</td>
                      <td className="r num">{probText(row.pYesMid, 1)}</td>
                      <td>{best ? <><b className="num">{best[0]} {evText(best[1]!.ev)}</b> <TierChip tier={best[1]!.tier} /></> : '—'}</td>
                    </>
                  ) : <td colSpan={3} className="muted small">Model does not price this market</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">{priced.length ? 'Probabilities are the NHL joint simulation’s, conditional on him playing; they are not a guarantee of role or ice time.' : 'The model prices none of these contracts.'}</p>
    </>
  );
}

function GoalieScripts({ s, side }: { s: NhlScripts; side: 'home' | 'away' }) {
  return (
    <div className="tscroll" tabIndex={0} role="region" aria-label="Saves by game script">
      <table className="nsc__t">
        <thead><tr><th scope="col">Script</th><th scope="col" className="r">Share</th><th scope="col" className="r">Projected starter saves</th></tr></thead>
        <tbody>
          {s.scripts.map((x) => <tr key={x.id}><th scope="row"><ScriptDot tone={x.tone} />{x.label}</th><td className="r num">{probText(x.probability)}</td><td className="r num">{(side === 'home' ? x.homeSaves : x.awaySaves)?.toFixed(1) ?? '—'}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

export function NhlPlayerView() {
  const { playerId = '' } = useParams();
  const { sport, repo, slug } = useSport();
  const prof = useAsync(`prof:${sport.code}:${playerId}`, () => repo.profile(playerId));
  const p = prof.data;
  const next = p?.games.filter((g) => g.status !== 'FINAL' && !g.result).sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc))[0];
  const er = useAsync(next ? `er:${sport.code}:${next.event_id}` : null, () => repo.eventResearch(next!.event_id).catch(() => null as unknown as EventResearchDoc));
  const r = er.data ?? undefined;
  const s = useMemo(() => readNhl(r), [r]);
  useVisit(p?.entity.display_name, 'player');
  if (prof.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  if (!p) return <div className="page"><ErrorState error={prof.error} what="this player profile" /></div>;
  const pos = (p.extensions as any)?.position as string | undefined;
  const goalie = pos === 'G';
  const name = p.entity.display_name;
  const role = roleIn(r, name);
  const teamAbbr = p.team?.short_name ?? null;
  const homeAbbr = r?.event.participants.find((x) => x.participant_id === r?.participants.find((q) => q.home_away === 'HOME')?.participant_id)?.short_name;
  const toi = (p.splits?.strength_state ?? []).filter((o) => o.metric_id === 'met_nhl.toi_per_game');
  const toiWindows = [...new Set(toi.map((o) => o.window.label))].sort().reverse();
  const inj = p.availability.filter((a) => a.status !== 'ACTIVE');
  return (
    <div className="page player">
      <header className="ehead">
        <TeamMark sport="NHL" abbr={teamAbbr} size="lg" />
        <div className="ehead__t">
          <div className="eyebrow"><EntityLink to={routes.sport(slug)} kind="sport" quiet>NHL</EntityLink> · {p.team ? <EntityLink to={routes.team(slug, p.team.participant_id)} kind="team" quiet>{p.team.display_name}</EntityLink> : 'Player'}</div>
          <h1 className="h-display">{name}</h1>
          <div className="ehead__meta">
            <span>{POS[pos ?? ''] ?? pos ?? 'Player'}</span>
            {next && <EntityLink to={routes.game(slug, next.event_id)} kind="game">Next: {next.home_away === 'AWAY' ? '@' : 'vs'} {next.opponent_name} · {kickoff(next.start_time_utc)}</EntityLink>}
            {inj.map((a, i) => <span key={i} className="chip chip--warn">{a.status.replace(/_/g, ' ').toLowerCase()}</span>)}
          </div>
        </div>
        <div className="ehead__actions">
          <SaveButton ref_kind="PLAYER" sport={sport.code} id={playerId} label={{ label: name, sub: `NHL ${POS[pos ?? ''] ?? 'player'}`, href: routes.player(slug, playerId) }} />
        </div>
      </header>

      <Stratum n="01" title={goalie ? 'Start status' : 'Current role'} sub={next ? `For ${next.home_away === 'AWAY' ? '@' : 'vs'} ${next.opponent_name}, from the publication's newest lineup data` : 'No upcoming game in this publication'}>
        {er.loading ? <Skeleton lines={2} /> : goalie ? (
          role?.goalie ? (
            <p>Projected starter: <b>{String(role.goalie.status).toLowerCase()}</b>{role.goalie.confidence != null ? ` (${probText(role.goalie.confidence)} confidence)` : ''} · {role.goalie.source} · {role.goalie.updates} status updates. The model's saves probabilities are conditional on him starting.</p>
          ) : <p className="muted">Not the projected starter in the newest goalie report.</p>
        ) : role && role.units.length ? (
          <p>{name} is on the <b>{role.units.join(', ')}</b> in the newest line combinations ({role.team}).</p>
        ) : <p className="muted">Not listed in the newest line combinations for the next game.</p>}
        {inj.length > 0 && <ul className="avail">{inj.map((a, i) => <li key={i} className="avail__row"><span className="avail__d">{a.detail}</span></li>)}</ul>}
      </Stratum>

      <Stratum n="02" title={goalie ? 'Goaltending numbers' : 'Production'} sub="Official boxscore numbers by window; league rank where a ranked universe exists (raw, not opponent-adjusted).">
        <SeasonTable p={p} goalie={goalie} />
        {!goalie && toi.length > 0 && (
          <>
            <h3 className="nfsec__h">Ice time by strength state (minutes per game)</h3>
            <div className="tscroll" tabIndex={0} role="region" aria-label="Ice time by strength state">
              <table className="nsc__t">
                <thead><tr><th scope="col">Window</th><th scope="col" className="r">Even strength</th><th scope="col" className="r">Power play</th><th scope="col" className="r">Shorthanded</th></tr></thead>
                <tbody>{toiWindows.map((w) => <tr key={w}><th scope="row">{w}</th>{['EV', 'PP', 'SH'].map((k) => <td key={k} className="r num">{toi.find((o) => o.window.label === w && o.split?.value === k)?.value?.toFixed(1) ?? '—'}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </>
        )}
      </Stratum>

      <Stratum n="03" title="Recent games" sub={goalie ? 'Last 10 games he played, newest first.' : 'Last 10 games, newest first.'}>
        <GameLog p={p} goalie={goalie} />
      </Stratum>

      {next && (
        <Stratum n="04" title="Next game: what the model prices" sub="Only contracts the NHL joint simulation prices carry a model probability.">
          {er.loading ? <Skeleton lines={3} /> : r && isNhlScripts(s) ? (
            <>
              <PricedMarkets s={s} r={r} pid={playerId} slug={slug} eventId={r.event.event_id} />
              {goalie && role?.goalie && <><h3 className="nfsec__h">Saves by game script</h3><GoalieScripts s={s} side={role.goalie.team === homeAbbr ? 'home' : 'away'} /></>}
            </>
          ) : <p className="muted">{s && !isNhlScripts(s) ? `${s.reason}.` : 'No research published for the next game yet.'} No projection is shown in its place.</p>}
        </Stratum>
      )}
    </div>
  );
}
