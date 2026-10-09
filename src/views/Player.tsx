import { usageFor } from '../lib/usage';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { LadderChart, type Rung } from '../charts/LadderChart';
import { RangeStrip, type RangeRow } from '../charts/RangeStrip';
import type { Observation, ResearchMarket } from '../contract/types';
import { useAsync } from '../data/hooks';
import { Icon } from '../components/Icon';
import { EntityLink, ErrorState, QualityBadge, SaveButton, Skeleton, Stratum, TeamMark } from '../components/ui';
import { MetricInfo, TermInfo } from '../components/Gloss';
import { Info } from './game/panels';
import { kickoff, metricFormatter, pct, displayName } from '../lib/format';
import { STAT_LABEL, STAT_TO_SIM, windowName, statusWord } from '../lib/nfl';
import { routes } from '../lib/routes';
import { useDirectory } from '../state/directory';
import { capShown, capStatus, useSport } from '../state/sport';
import { useVisit } from '../state/trail';
import { QuoteSummaryChip, useQuoteViews } from '../components/LiveQuote';
import { useLiveQuotes, useNow } from '../live/hooks';
import { PlayerFace, RangeBar, RankBadge, Layer } from '../components/insight';
import { DigDeeper } from '../components/ui';
import { playerPhoto } from '../lib/players';
import { rankView } from '../lib/rank';
import { describeMarket, overLine } from '../lib/marketLabel';
import { usePlayerHistory } from '../history/load';
import { hitRecord, playerTier, pregameRows, rankFor, statsForPosition, statDef, windowLabel, windowRows, windowsFor, type HistoryWindow } from '../history/stats';
import { mainLine as pickMainLine } from '../insights/props';
import type { Market } from '../contract/types';
import { GameBars, HistorySummary, LogTable, Splits, UsageRows } from './player/history';
import type { Finding } from '../research/findings';
import { overlayMarket } from '../live/overlay';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function statOf(m: ResearchMarket): string | null {
  const s = m.yes_description.match(/^YES iff .+? ([a-z_]+) \(/);
  return s ? s[1] : null;
}

export function quantilesOf(o: Observation | undefined) {
  const x = (o?.extensions ?? {}) as Record<string, number>;
  if (x.football_p50 == null) return null;
  return { p05: x.football_p05, p25: x.football_p25, p50: x.football_p50, p75: x.football_p75, p95: x.football_p95, mean: o?.value ?? null };
}

/** Plain names for the defensive units a position faces (the registry name stays on the metric page). */
const MATCHUP_LABEL: Record<string, string> = {
  'met_nfl.adj_def_db_epa': 'Pass defense', 'met_nfl.def_dropback_epa': 'Pass defense, raw', 'met_nfl.adj_def_sack_rate': 'Sack rate',
  'met_nfl.def_qb_hit_rate': 'Pressure (QB hits)', 'met_nfl.adj_def_to_rate': 'Takeaways', 'met_nfl.adj_def_rush_epa': 'Run defense',
  'met_nfl.def_rush_epa': 'Run defense, raw', 'met_nfl.adj_def_sr': 'Success rate allowed', 'met_nfl.adj_def_explosive': 'Explosive plays allowed',
  'met_nfl.def_rz_epa': 'Red-zone defense',
};

/** "QB1", "RB1", "WR2 · slot" from the published depth chart (QB extension or the depth-chart availability row). */
export function roleOf(pos: string, ext: any, availability: { detail?: string | null }[]): string | null {
  const qb = ext?.quarterback?.depth_chart_order;
  if (pos === 'QB' && typeof qb === 'number') return `QB${qb}`;
  for (const a of availability) {
    const m = a.detail?.match(/depth chart ([A-Z]+) #(\d+)/);
    if (!m) continue;
    const slot = m[1] === 'SWR';
    const p = /WR$/.test(m[1]) ? 'WR' : m[1];
    return `${p}${m[2]}${slot ? ' · slot' : ''}`;
  }
  return null;
}

const STATUS_WORD: Record<string, string> = { ACTIVE: 'Active', QUESTIONABLE: 'Questionable', DOUBTFUL: 'Doubtful', OUT: 'Out', INACTIVE: 'Inactive' };

const MATCHUP_FOR_POS: Record<string, string[]> = {
  QB: ['met_nfl.adj_def_db_epa', 'met_nfl.adj_def_sack_rate', 'met_nfl.def_qb_hit_rate', 'met_nfl.adj_def_to_rate'],
  RB: ['met_nfl.adj_def_rush_epa', 'met_nfl.def_rush_epa', 'met_nfl.adj_def_sr'],
  WR: ['met_nfl.adj_def_db_epa', 'met_nfl.adj_def_explosive', 'met_nfl.def_dropback_epa'],
  TE: ['met_nfl.adj_def_db_epa', 'met_nfl.adj_def_sr', 'met_nfl.def_rz_epa'],
};

/** The NHL player page (views/nhl): its own chunk. */
const NhlPlayerView = lazy(() => import('./nhl/NhlPlayer').then((m) => ({ default: m.NhlPlayerView })));
/** Tennis players are participants, not roster members: their own page (views/tennis). */
const TennisPlayerView = lazy(() => import('./tennis/TennisPlayer').then((m) => ({ default: m.TennisPlayerView })));

export function PlayerView() {
  const { sport } = useSport();
  if (sport.code === 'NHL') return <Suspense fallback={<div className="page"><Skeleton lines={8} tall /></div>}><NhlPlayerView /></Suspense>;
  if (sport.code === 'TENNIS') return <Suspense fallback={<div className="page"><Skeleton lines={8} tall /></div>}><TennisPlayerView /></Suspense>;
  return <GenericPlayerView />;
}

function GenericPlayerView() {
  const { playerId = '' } = useParams();
  const { sport, repo, slug, caps, metrics } = useSport();
  const dir = useDirectory(repo);
  const prof = useAsync(`prof:${sport.code}:${playerId}`, () => repo.profile(playerId));
  const p = prof.data;
  const game = p?.games[0];
  const oppId = game?.opponent_id ?? null;
  const opp = useAsync(oppId ? `prof:${sport.code}:${oppId}` : null, () => repo.profile(oppId!));
  // The breadcrumb's context is this player's own game (or team), never whichever game was open before.
  const selfAbbr = p?.team?.short_name ?? (p?.entity.metadata?.team as string | undefined) ?? null;
  const gameOppAbbr = opp.data?.entity.short_name ?? dir.data?.team(oppId)?.abbr ?? null;
  const parentStep = !p
    ? null
    : game
      ? (selfAbbr && gameOppAbbr ? { href: routes.game(slug, game.event_id), label: game.home_away === 'HOME' ? `${gameOppAbbr} @ ${selfAbbr}` : `${selfAbbr} @ ${gameOppAbbr}`, kind: 'game' as const } : undefined)
      : p.team ? { href: routes.team(slug, p.team.participant_id), label: p.team.display_name, kind: 'team' as const } : null;
  useVisit(parentStep === undefined ? null : p?.entity.display_name, 'player', parentStep);
  const [stat, setStat] = useState<string | null>(null);
  const [hs, setHs] = useState<string | null>(null);
  const [hw, setHw] = useState<HistoryWindow>('last5');
  const gsis = (p?.entity.source_ids?.gsis_id as string | undefined) ?? ((p?.extensions as any)?.gsis_id as string | undefined) ?? null;
  const hist = usePlayerHistory(sport.code, gsis);

  // Market clock: this player's contracts refresh at game cadence while the screen is open.
  const playerTickers = useMemo(() => (p?.markets ?? []).map((m) => m.kalshi_ticker), [p]);
  const live = useLiveQuotes(playerTickers, 'game');
  const quoteViews = useQuoteViews(p?.markets ?? []);
  const now = useNow(15_000);
  const fair = useMemo(() => new Map((p?.projections ?? []).filter((x) => x.market_id).map((x) => [x.market_id!, x])), [p]);
  const byStat = useMemo(() => {
    const m = new Map<string, ResearchMarket[]>();
    for (const mk of (p?.markets ?? []).map((x) => overlayMarket(x, live.quote(x.kalshi_ticker)))) {
      const s = statOf(mk) ?? mk.market_family;
      m.set(s, [...(m.get(s) ?? []), mk]);
    }
    return m;
  }, [p, live]);

  if (prof.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  if (!p) return <div className="page"><ErrorState error={prof.error} what="this player profile" /></div>;
  const pos = (p.entity.metadata?.position as string) ?? '';
  const teamAbbr = p.team?.short_name ?? (p.entity.metadata?.team as string) ?? '';
  const ext = (p.extensions ?? {}) as any;
  const sims = p.metrics.filter((o) => o.metric_id.startsWith('met_nfl.sim_'));
  // Usage that makes football sense for this position (lib/usage.ts): never receiving usage on a QB, etc.
  const shares = usageFor(pos, p.metrics.filter((o) => o.metric_id.startsWith('met_nfl.proj_')), (id) => metrics.get(id)?.name);
  const qbObs = [...p.metrics.filter((o) => o.metric_id.startsWith('met_nfl.qb_')), ...Object.values(p.splits ?? {}).flat()];
  const stats = [...byStat.keys()].sort((a, b) => (byStat.get(b)!.length - byStat.get(a)!.length));
  const prefer: Record<string, string[]> = { QB: ['passing_yards', 'attempts'], RB: ['rushing_yards', 'carries'], WR: ['receiving_yards', 'receptions'], TE: ['receiving_yards', 'receptions'] };
  const activeStat = stat && byStat.has(stat) ? stat : (prefer[pos] ?? []).find((s) => byStat.has(s)) ?? stats.find((s) => STAT_TO_SIM[s]) ?? stats[0];
  const statLabel = STAT_LABEL[activeStat ?? ''] ?? activeStat?.replace(/_/g, ' ') ?? '';
  const ladderMarkets = (byStat.get(activeStat ?? '') ?? []).filter((m) => m.threshold != null || m.line != null).sort((a, b) => Number(a.threshold ?? a.line) - Number(b.threshold ?? b.line));
  const simObs = activeStat && STAT_TO_SIM[activeStat] ? sims.find((o) => o.metric_id === STAT_TO_SIM[activeStat]) : undefined;
  const simDef = simObs ? metrics.get(simObs.metric_id) : undefined;
  const fmtStat = metricFormatter(simDef);
  const q = quantilesOf(simObs);
  const marketMean = (simObs?.extensions as any)?.market_mean as number | undefined;
  const rungs: Rung[] = ladderMarkets.map((m) => ({
    x: Number(m.threshold ?? m.line), bid: m.yes_bid, ask: m.yes_ask, fair: fair.get(m.market_id)?.fair_probability ?? null,
    href: routes.market(slug, m.market_id, m.event_id ?? ''), ticker: m.kalshi_ticker,
  }));
  // The main line: the rung the market prices closest to a coin flip (two-sided quotes only).
  const mid = (m: ResearchMarket) => (m.yes_bid != null && m.yes_ask != null ? (m.yes_bid + m.yes_ask) / 2 : null);
  const main = ladderMarkets.filter((m) => mid(m) != null).sort((a, b) => Math.abs(mid(a)! - 0.5) - Math.abs(mid(b)! - 0.5))[0];
  const mainFair = main ? fair.get(main.market_id)?.fair_probability ?? null : null;
  const mainLine = main ? Number(main.threshold ?? main.line) : null;
  const cents = (v: number) => `${Math.round(v * 100)}¢`;
  const distRows: RangeRow[] = sims
    .filter((o) => quantilesOf(o))
    .map((o) => {
      const qq = quantilesOf(o)!;
      const x = (o.extensions ?? {}) as Record<string, number>;
      const f = metricFormatter(metrics.get(o.metric_id));
      return { label: metrics.get(o.metric_id)?.name.replace('Simulated ', '') ?? o.metric_id, mean: o.value, r50: [qq.p25, qq.p75], r90: [qq.p05, qq.p95], market: x.market_mean ?? null, format: (v: number) => f(v) };
    });
  const others = (dir.data?.index.players_by_team[p.team?.participant_id ?? ''] ?? []).filter((id) => id !== playerId);
  const samePos = (dir.data ? Object.values(dir.data.index.players_by_team).flat() : []).filter((id) => id !== playerId && dir.data!.player(id)?.context?.position === pos);
  const rival = game ? samePos.find((id) => dir.data!.player(id)?.context?.team === dir.data!.team(oppId)?.abbr) : undefined;
  const role = roleOf(pos, ext, p.availability);
  const status = p.availability.find((a) => /impact|injur/i.test(a.detail ?? '')) ?? p.availability[0];
  const oppAbbr = opp.data?.entity.short_name ?? dir.data?.team(oppId)?.abbr ?? null;
  const oppNick = opp.data?.entity.display_name ?? (displayName(game?.opponent_name) || 'opponent');
  const showMarkets = p.markets.length > 0 && capShown(caps, 'player_props');
  const showRange = distRows.length > 0 && capShown(caps, 'projection_distributions');
  const showUsage = (shares.length > 0 || ext.quarterback) && capShown(caps, 'usage');
  const shortShare = (id: string) => (id.endsWith('carry_share') ? 'Carry share' : id.endsWith('target_share') ? 'Target share' : metrics.get(id)?.name ?? id);

  return (
    <div className="page player">
      {/* PLAYER · THIS GAME: who, team, position, role, opponent, when, availability. */}
      <header className="ehead plhead">
        <PlayerFace photo={playerPhoto(playerId, p.entity.display_name, teamAbbr)} team={teamAbbr} sport={sport.code} size="xl" name={p.entity.display_name} />
        <div className="ehead__t">
          <div className="eyebrow">
            <EntityLink to={routes.sport(slug)} kind="sport" quiet>{sport.label}</EntityLink>
            {p.team && <> · <EntityLink to={routes.team(slug, p.team.participant_id)} kind="team" quiet>{p.team.display_name}</EntityLink></>}
          </div>
          <h1 className="h-display">{p.entity.display_name}</h1>
          <div className="plhead__id">
            <span className="plhead__pos">{pos}</span>
            {role && <span className="plhead__role" title="From the published depth chart">{role}</span>}
            {status && (
              <span className={`pl__inj pl__inj--${status.status.toLowerCase()}`} title={status.detail ?? undefined}>{STATUS_WORD[status.status] ?? statusWord(status.status)}</span>
            )}
            {ext.p_active != null && <span className="plhead__pa">Chance active <b className="num">{pct(ext.p_active, 0)}</b></span>}
          </div>
          {game && (
            <EntityLink to={routes.game(slug, game.event_id)} kind="game" quiet>
              <span className="plhead__game">
                <span className="plhead__vs">{game.home_away === 'AWAY' ? '@' : 'vs'}</span>
                {oppAbbr && <TeamMark sport={sport.code} abbr={oppAbbr} size="sm" />}
                <b>{displayName(game.opponent_name)}</b>
                <span className="plhead__when">{kickoff(game.start_time_utc)}</span>
              </span>
            </EntityLink>
          )}
        </div>
        <div className="ehead__actions">
          <SaveButton ref_kind="PLAYER" sport={sport.code} id={playerId} text="Save player" label={{ label: p.entity.display_name, sub: `${pos} · ${teamAbbr}`, href: routes.player(slug, playerId) }} />
          {rival && (
            <Link className="btn btn--ghost" to={routes.compare(slug, playerId, rival)}>
              <Icon name="compare" size={16} /> Compare with {dir.data?.player(rival)?.label}
            </Link>
          )}
        </div>
      </header>

      {/* Wide screens: the research in the main column; role, matchup and availability beside it. */}
      <div className="pl2">
      <div className="pl2__main">
      {/* THIS GAME + GAME BY GAME: the projection with its range and line, then the season against that line. */}
      {(() => {
        const week = Number(/week\s*(\d+)/i.exec(game?.competition ?? '')?.[1] ?? NaN);
        const wk = Number.isFinite(week) ? week : null;
        const kicked = game ? Date.parse(game.start_time_utc) <= now : false;
        const all = hist.data?.games ?? [];
        const result = kicked && wk != null ? all.find((r) => r.week === wk) ?? null : null;
        // Every game a pregame view may use: last season, then this season before this game.
        const hrows = hist.data ? pregameRows(hist.data, game?.start_time_utc, wk) : { prior: [], current: [] };
        const wins = windowsFor(hrows);
        const win = wins.includes(hw) ? hw : wins[0] ?? 'last5';
        const wrows = windowRows(hrows, win);
        const season = hist.data?.season ?? new Date(now).getUTCFullYear();
        const winName = windowLabel(win, season, hist.data?.prior?.season ?? null);
        const options = statsForPosition(pos).filter((d) => (STAT_TO_SIM[d.key] && sims.some((o) => o.metric_id === STAT_TO_SIM[d.key])) || [...hrows.prior, ...all].some((r) => (d.get(r) ?? 0) > 0));
        const cur = statDef(hs && options.some((o) => o.key === hs) ? hs : options[0]?.key) ?? null;
        if (!cur) return null;
        const sObs = STAT_TO_SIM[cur.key] ? sims.find((o) => o.metric_id === STAT_TO_SIM[cur.key]) : undefined;
        const qq = quantilesOf(sObs);
        const ml = pickMainLine((byStat.get(cur.key) ?? []) as unknown as Market[]);
        const line = ml?.threshold != null ? Number(overLine(ml.threshold)) : null;
        const defId = /rush|carries/.test(cur.key) ? 'met_nfl.adj_def_rush_epa' : 'met_nfl.adj_def_db_epa';
        const defObs = opp.data?.metrics.find((x) => x.metric_id === defId);
        const defRank = rankView(defObs?.context);
        const rec = line != null ? hitRecord(windowRows(hrows, 'last5'), cur, line) : null;
        const rank = hist.data ? rankFor(hist.data, cur.key, wk, win === 'prior' ? 'prior' : 'current') : null;
        const f = (v: number) => (cur.unit === 'rec' || cur.unit === 'TD' || cur.unit === 'INT' ? (Math.round(v * 10) / 10).toString() : String(Math.round(v)));
        const finding: Finding | null = sObs?.value != null && qq ? {
          key: `proj:${playerId}:${cur.key}`, kind: 'projection', sport: sport.code, title: `${p.entity.display_name} ${cur.label.toLowerCase()}`,
          statement: `Projection ${f(sObs.value)} ${cur.unit} (typical ${f(qq.p25)}–${f(qq.p75)}, low ${f(qq.p05)}, high ${f(qq.p95)})${line != null ? `; line ${line}` : ''}${defRank ? `; ${oppAbbr} ${/rush|carries/.test(cur.key) ? 'run' : 'pass'} defense ${defRank.text}` : ''}${rec && rec.values.length ? `; ${rec.over} of his last ${rec.values.length} games above today's line of ${line}` : ''}.`,
          href: routes.player(slug, playerId), anchor: ml ? { ref_kind: 'MARKET', id: ml.market_id, extra: { market_id: ml.market_id, event_id: ml.event_id } } : { ref_kind: 'PLAYER', id: playerId },
          kickoff: game?.start_time_utc ?? null,
        } : null;
        return (
          <>
            <section className="pthis" aria-labelledby="pthis-h">
              <div className="pthis__h">
                <h2 id="pthis-h" className="gsec__t">{game ? `This game ${game.home_away === 'AWAY' ? 'at' : 'vs'} ${oppAbbr ?? displayName(game.opponent_name)}` : 'This season'}</h2>
                <div className="seg seg--scroll" role="tablist" aria-label="Stat for this game">
                  {options.map((o) => (
                    <button key={o.key} type="button" role="tab" aria-selected={o.key === cur.key} className={`seg__b${o.key === cur.key ? ' is-on' : ''}`} onClick={() => setHs(o.key)}>{o.label}</button>
                  ))}
                </div>
              </div>
              {sObs?.value != null && qq ? (
                <div className="pthis__card">
                  <dl className="pthis__nums">
                    <div><dt>Projection</dt><dd className="num">{f(sObs.value)} <small>{cur.unit}</small></dd></div>
                    <div><dt>Projected range</dt><dd className="num">{f(qq.p25)}–{f(qq.p75)} <small>{cur.unit}</small></dd><dd className="pthis__s">typical (middle half of simulations)</dd></div>
                    <div><dt>Line</dt><dd className="num">{line ?? '—'}</dd><dd className="pthis__s">{ml ? 'market rung nearest even' : 'no priced line'}</dd></div>
                    {defRank && <div><dt>Matchup</dt><dd><RankBadge rank={defRank} compact /></dd><dd className="pthis__s">{oppAbbr} {/rush|carries/.test(cur.key) ? 'run' : 'pass'} defense</dd></div>}
                  </dl>
                  <RangeBar typical={[qq.p25, qq.p75]} full={[qq.p05, qq.p95]} projection={sObs.value} line={line} format={f} label={`${p.entity.display_name} ${cur.label.toLowerCase()}`} />
                  <div className="pthis__x">
                    {rec && rec.values.length > 0 && <span className="pthis__rec"><b>{rec.over} of his last {rec.values.length}</b> games above today's line</span>}
                    {finding && <DigDeeper finding={finding} />}
                  </div>
                </div>
              ) : (
                <p className="muted small">No projection published for {cur.label.toLowerCase()} in this game.</p>
              )}
            </section>
            <section className="pgame" aria-labelledby="pgame-h">
              <div className="gsec__h pgame__h">
                <h2 id="pgame-h" className="gsec__t">Game by Game</h2>
                {wins.length > 1 && (
                  <div className="seg seg--sm seg--scroll" role="tablist" aria-label="Games shown">
                    {wins.map((w) => (
                      <button key={w} type="button" role="tab" aria-selected={w === win} className={`seg__b${w === win ? ' is-on' : ''}`} onClick={() => setHw(w)}>{windowLabel(w, season, hist.data?.prior?.season ?? null)}</button>
                    ))}
                  </div>
                )}
              </div>
              <p className="gsec__sub">{cur.label}, game by game{line != null ? `. The dashed line is today's line (${line}) — past games are measured against it; historical lines are not published` : ''}.{result ? ' This game has been played; its result is marked separately below.' : ''}</p>
              {hist.loading && <Skeleton lines={3} />}
              {!hist.loading && !hist.data && <p className="muted small">No {sport.label} game log for this player yet (rookie, no snaps, or not in the play-by-play).</p>}
              {hist.data && wrows.length > 0 && (
                <>
                  <HistorySummary rows={wrows} stat={cur} line={line} projection={!kicked && sObs?.value != null ? sObs.value : null} windowName={winName} unit={cur.unit} />
                  {rank && (
                    <p className="hsum__rank">
                      {cur.label} per game: <b className="num">#{rank.rank}</b> of {rank.of} {rank.position}s <span className="hsum__tier">{playerTier(rank.rank, rank.of)}</span>
                      <span className="muted"> · {rank.season}{rank.through_week != null ? `, through week ${rank.through_week}` : ', full season'} · {rank.per_game} per game, min {rank.min_games} games</span>
                    </p>
                  )}
                  <GameBars rows={wrows} stat={cur} line={line} season={win === 'prior' ? hist.data.prior?.season ?? season : season} upcoming={!kicked && win !== 'prior' && sObs?.value != null && qq ? { projection: sObs.value, typical: [qq.p25, qq.p75], label: 'Next game' } : null} sport={sport.code} />
                </>
              )}
              {hist.data && wrows.length === 0 && <p className="muted small">No games in this window.</p>}
              {result && <p className="pgame__res"><b>Result of this game:</b> {f(cur.get(result) ?? 0)} {cur.unit}{sObs?.value != null ? ` (projected ${f(sObs.value)})` : ''}.</p>}
              {hist.data && wrows.length > 0 && (
                <>
                  <Layer summary="Usage & role, game by game"><UsageRows rows={wrows} pos={pos} season={season} /></Layer>
                  <Layer summary="Splits"><Splits doc={hist.data} rows={wrows} stat={cur} /></Layer>
                  <Layer summary="Full game log"><LogTable rows={wrows} pos={pos} season={season} stat={cur} line={line} /><p className="muted small">Source: nflverse weekly player stats and play-by-play ({season}); {hist.data.prior ? `${hist.data.prior.season} from weekly box scores and the schedule; ` : ''}snap counts from Pro Football Reference via nflverse. Games before this one only. Longest plays are published for {season} only.</p></Layer>
                </>
              )}
              {showRange && distRows.length > 1 && <Layer summary="Projected ranges for every stat in this game"><RangeStrip rows={distRows} caption={`${p.entity.display_name} projected ranges`} /><p className="plcav">Low-end and high-end are the 5th and 95th of every 100 simulated games; the typical range is the middle half.</p></Layer>}
            </section>
          </>
        );
      })()}
      </div>
      <aside className="pl2__side" aria-label="Role, matchup and availability">

      {showUsage && (
        <Stratum title="Usage & Role" sub="Projected for this game, plus the published depth chart.">
          <ul className="plu">
            {role && <li><span className="plu__k">Depth chart</span><b className="plu__v">{role}</b></li>}
            {shares.map((o) => (
              <li key={o.metric_id}>
                <span className="plu__k">{shortShare(o.metric_id)}<MetricInfo metricId={o.metric_id} def={metrics.get(o.metric_id)} /></span>
                <span className="plu__bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (o.value ?? 0) * 100)}%` }} /></span>
                <b className="plu__v num">{pct(o.value, 1)}</b>
              </li>
            ))}
            {ext.quarterback?.dropbacks != null && (
              <li><span className="plu__k">Dropbacks this season<TermInfo k="dropbacks" /></span><b className="plu__v num">{ext.quarterback.dropbacks}</b></li>
            )}
          </ul>
          {qbObs.length > 0 && (
            <details className="pldet">
              <summary>QB profile · {qbObs.length} measures</summary>
              <table className="dtable">
                <caption className="sr-only">QB profile</caption>
                <thead><tr><th>Measure</th><th>Split</th><th className="r">Value</th></tr></thead>
                <tbody>
                  {qbObs.map((o) => (
                    <tr key={o.observation_id}><td>{metrics.get(o.metric_id)?.name.replace(/^QB /, '')}<MetricInfo metricId={o.metric_id} def={metrics.get(o.metric_id)} /></td><td>{o.split?.value.replace(/_/g, ' ') ?? windowName(o.window.label)}</td><td className="r num">{metricFormatter(metrics.get(o.metric_id))(o.value)}</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </Stratum>
      )}

      {opp.data && MATCHUP_FOR_POS[pos] && (
        <Stratum title={`Matchup vs ${oppNick}`} sub={`The defensive units a ${pos} faces. League rank of 32: #1 is the toughest for this matchup.`}>
          <ul className="plmu">
            {MATCHUP_FOR_POS[pos].map((mid2) => {
              const o = opp.data!.metrics.find((x) => x.metric_id === mid2);
              if (!o) return null;
              const def = metrics.get(mid2);
              const f = metricFormatter(def, Math.max(Math.abs(o.context?.best_value ?? 0), Math.abs(o.context?.worst_value ?? 0)));
              const unit = def?.unit === 'deviation from league mean' ? 'vs league avg' : def?.unit === 'share' ? '' : def?.unit ?? '';
              const r = o.context?.rank;
              const n = o.context?.universe_size;
              const tier = r != null && n ? (r <= Math.ceil(n / 4) ? 'top' : r > n - Math.ceil(n / 4) ? 'low' : 'mid') : 'none';
              return (
                <li key={mid2} className="plmu__row">
                  <Link className="plmu__a" to={routes.metric(slug, mid2, { team: oppId, opp: p.team?.participant_id, event: game?.event_id })}>
                    <span className="plmu__name">{MATCHUP_LABEL[mid2] ?? def?.name}</span>
                    <span className={`plmu__rank plmu__rank--${tier}`}>{r != null ? `#${r}` : '—'}<span> NFL</span></span>
                    <span className="plmu__val"><span className="num">{f(o.value)}</span> <span className="plmu__u">{unit}</span></span>
                  </Link>
                  <MetricInfo metricId={mid2} def={def} align="end" />
                </li>
              );
            })}
          </ul>
        </Stratum>
      )}

      <section className="plquiet" aria-label="Availability">
        <h2 className="plquiet__h">Availability</h2>
        <div className="plquiet__grid">
          {p.availability.length > 0 && (
            <div>
              <ul className="plav">
                {p.availability.map((a, i) => (
                  <li key={i}><b>{STATUS_WORD[a.status] ?? statusWord(a.status)}</b> · {(a.detail ?? '').replace(/^.*?\):\s*/, '')}<span className="plav__src"> · {a.source}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
      </aside>
      </div>


      {showMarkets && (
        <Stratum title="Market Context" sub="How Kalshi prices this player's lines, beside the projection. Supporting context for the research above." actions={<QuoteSummaryChip views={quoteViews} now={now} />}>
          <div className="seg seg--scroll" role="tablist" aria-label="Stat">
            {stats.map((s) => (
              <button key={s} type="button" role="tab" aria-selected={activeStat === s} className={`seg__b${activeStat === s ? ' is-on' : ''}`} onClick={() => setStat(s)}>
                {STAT_LABEL[s] ?? s.replace(/_/g, ' ')} <span className="seg__n">{byStat.get(s)!.length}</span>
              </button>
            ))}
          </div>
          <div className="mctx">
            <dl className="mctx__nums" aria-label={`${statLabel}: market context`}>
              <div><dt>Main line</dt><dd>{main && mainLine != null ? <><b>Over <span className="num">{overLine(mainLine)}</span></b> <span className="mctx__s">at {cents(mid(main)!)}</span></> : '—'}</dd></div>
              {marketMean != null && <div><dt>Market-implied average</dt><dd><b className="num">{fmtStat(marketMean)}</b>{simObs?.value != null && <span className="mctx__s"> · projection {fmtStat(simObs.value)}</span>}</dd></div>}
            </dl>
            {main && <Link className="btn btn--sm btn--ghost" to={routes.market(slug, main.market_id, main.event_id ?? '')}>Open this line <Icon name="arrowRight" size={14} /></Link>}
          </div>
          <Layer summary={rungs.length >= 2 ? `Every ${statLabel.toLowerCase()} line, with Sift's fair price` : `Every ${statLabel.toLowerCase()} contract`}>
            {rungs.length >= 2 ? (
              <LadderChart rungs={rungs} quantiles={q} unit={statLabel} title={`${p.entity.display_name} ${statLabel}`} />
            ) : (
              <ul className="mrows">
                {(byStat.get(activeStat ?? '') ?? []).map((m) => (
                  <li key={m.market_id}>
                    <Link className="mrow" to={routes.market(slug, m.market_id, m.event_id ?? '')}>
                      <span className="mrow__d">{describeMarket(m, { playerName: () => p.entity.display_name }).title}</span>
                      <span className="mrow__p num">{m.yes_bid != null ? Math.round(m.yes_bid * 100) : '—'} / {m.yes_ask != null ? Math.round(m.yes_ask * 100) : '—'}¢</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {mainFair != null && main && mainLine != null && <p className="muted small">On over {overLine(mainLine)}, Sift's fair price is {cents(mainFair)}; the market is at {cents(mid(main)!)}.</p>}
            <p className="plcav">
              Research evidence, not a betting signal.
              <Info label="About fair prices on player props">
                <span>Fair prices here are {capStatus(caps, 'raw_projections')} research evidence. The publication notes its pricing has been shown redundant to the closing market on player props; see the Model Scorecard on the {sport.label} home.</span>
                <span>The projection is the game simulation’s average; the fair price is the pricing model’s probability for one line. They are separate published outputs and can disagree.</span>
              </Info>
            </p>
          </Layer>
        </Stratum>
      )}

      <section className="plquiet" aria-label="Deeper research">
        <h2 className="plquiet__h">Deeper Research</h2>
        {others.length > 0 && (
          <div className="chips">
            {others.map((id) => (
              <EntityLink key={id} to={routes.player(slug, id)} kind="player">{dir.data?.player(id)?.label ?? id} <span className="muted">{dir.data?.player(id)?.context?.position}</span></EntityLink>
            ))}
          </div>
        )}
        <details className="pldet pldet--about">
          <summary>About this data: source, quality and support</summary>
          <dl className="facts facts--slim">
            <div className="fact"><dt>Profile quality</dt><dd><QualityBadge quality={p.quality} /></dd></div>
            <div className="fact"><dt>Player markets</dt><dd><QualityBadge status={capStatus(caps, 'player_props')} /></dd></div>
            <div className="fact"><dt>Model prices</dt><dd><QualityBadge status={capStatus(caps, 'raw_projections')} /> authority RESEARCH_ONLY</dd></div>
            <div className="fact"><dt>Projected ranges</dt><dd><QualityBadge status={capStatus(caps, 'projection_distributions')} /></dd></div>
            <div className="fact"><dt>Usage</dt><dd><QualityBadge status={capStatus(caps, 'usage')} /> projected, not observed usage</dd></div>
            <div className="fact"><dt>Game logs</dt><dd><QualityBadge status={capStatus(caps, 'player_game_logs')} /></dd></div>
            {sims[0] && <div className="fact"><dt>Simulation source</dt><dd>{sims[0].source} · as of {sims[0].as_of}</dd></div>}
          </dl>
          {sims.length > 0 && (
            <ul className="pldet__list" aria-label="Simulation support state by stat">
              {sims.map((o) => (
                <li key={o.metric_id}>{metrics.get(o.metric_id)?.name.replace('Simulated ', '') ?? o.metric_id}: support state {String((o.extensions as any)?.support_state ?? '—').replace(/_/g, ' ').toLowerCase()}</li>
              ))}
            </ul>
          )}
          {p.quality.limitations?.length > 0 && <ul className="pldet__list">{p.quality.limitations.map((l) => <li key={l}>{l}</li>)}</ul>}
        </details>
      </section>
    </div>
  );
}
