import { usageFor } from '../lib/usage';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { LadderChart, type Rung } from '../charts/LadderChart';
import { RangeStrip, type RangeRow } from '../charts/RangeStrip';
import type { Observation, ResearchMarket } from '../contract/types';
import { useAsync } from '../data/hooks';
import { Icon } from '../components/Icon';
import { EntityLink, ErrorState, QualityBadge, SaveButton, Skeleton, Stratum, TeamMark } from '../components/ui';
import { MetricInfo, TermInfo } from '../components/Gloss';
import { Info } from './game/panels';
import { kickoff, metricFormatter, pct, signed } from '../lib/format';
import { STAT_LABEL, STAT_TO_SIM } from '../lib/nfl';
import { routes } from '../lib/routes';
import { useDirectory } from '../state/directory';
import { capShown, capStatus, useSport } from '../state/sport';
import { useVisit } from '../state/trail';
import { QuoteSummaryChip, useQuoteViews } from '../components/LiveQuote';
import { useLiveQuotes, useNow } from '../live/hooks';
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

export function PlayerView() {
  const { playerId = '' } = useParams();
  const { sport, repo, slug, caps, metrics } = useSport();
  const dir = useDirectory(repo);
  const prof = useAsync(`prof:${sport.code}:${playerId}`, () => repo.profile(playerId));
  const p = prof.data;
  useVisit(p?.entity.display_name, 'player');
  const game = p?.games[0];
  const oppId = game?.opponent_id ?? null;
  const opp = useAsync(oppId ? `prof:${sport.code}:${oppId}` : null, () => repo.profile(oppId!));
  const [stat, setStat] = useState<string | null>(null);

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
  const oppNick = opp.data?.entity.display_name ?? game?.opponent_name ?? 'opponent';
  const showMarkets = p.markets.length > 0 && capShown(caps, 'player_props');
  const showRange = distRows.length > 0 && capShown(caps, 'projection_distributions');
  const showUsage = (shares.length > 0 || ext.quarterback) && capShown(caps, 'usage');
  const shortShare = (id: string) => (id.endsWith('carry_share') ? 'Carry share' : id.endsWith('target_share') ? 'Target share' : metrics.get(id)?.name ?? id);

  return (
    <div className="page player">
      {/* PLAYER · THIS GAME: who, team, position, role, opponent, when, availability. */}
      <header className="ehead plhead">
        <TeamMark sport={sport.code} abbr={teamAbbr} size="lg" />
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
              <span className={`pl__inj pl__inj--${status.status.toLowerCase()}`} title={status.detail ?? undefined}>{STATUS_WORD[status.status] ?? status.status}</span>
            )}
            {ext.p_active != null && <span className="plhead__pa">Chance active <b className="num">{pct(ext.p_active, 0)}</b></span>}
          </div>
          {game && (
            <EntityLink to={routes.game(slug, game.event_id)} kind="game" quiet>
              <span className="plhead__game">
                <span className="plhead__vs">{game.home_away === 'AWAY' ? '@' : 'vs'}</span>
                {oppAbbr && <TeamMark sport={sport.code} abbr={oppAbbr} size="sm" />}
                <b>{game.opponent_name}</b>
                <span className="plhead__when">{kickoff(game.start_time_utc)}</span>
              </span>
            </EntityLink>
          )}
        </div>
        <div className="ehead__actions">
          <SaveButton ref_kind="PLAYER" sport={sport.code} id={playerId} label={{ label: p.entity.display_name, sub: `${pos} · ${teamAbbr}`, href: routes.player(slug, playerId) }} />
          {rival && (
            <Link className="btn btn--ghost" to={routes.compare(slug, playerId, rival)}>
              <Icon name="compare" size={16} /> Compare with {dir.data?.player(rival)?.label}
            </Link>
          )}
        </div>
      </header>

      {showMarkets && (
        <Stratum title="Market vs Projection" sub="The model’s projection, the market’s price and the gap, for each stat. Tap a line for the full contract." actions={<QuoteSummaryChip views={quoteViews} now={now} />}>
          <div className="seg seg--scroll" role="tablist" aria-label="Stat">
            {stats.map((s) => (
              <button key={s} type="button" role="tab" aria-selected={activeStat === s} className={`seg__b${activeStat === s ? ' is-on' : ''}`} onClick={() => setStat(s)}>
                {STAT_LABEL[s] ?? s.replace(/_/g, ' ')} <span className="seg__n">{byStat.get(s)!.length}</span>
              </button>
            ))}
          </div>
          <dl className="pvm" aria-label={`${statLabel}: model versus market`}>
            <div className="pvm__c">
              <dt>Model projection</dt>
              <dd><b className="num">{simObs ? fmtStat(simObs.value) : '—'}</b>{q && <span className="pvm__s">simulation average · typical {fmtStat(q.p25)}–{fmtStat(q.p75)}</span>}</dd>
            </div>
            <div className="pvm__c">
              <dt>Live market</dt>
              <dd>
                {main && mainLine != null ? <><b className="num">{mainLine}+ · {cents(mid(main)!)}</b><span className="pvm__s">main line, YES mid</span></> : <b>—</b>}
                {marketMean != null && <span className="pvm__s">implied average {fmtStat(marketMean)}</span>}
              </dd>
            </div>
            <div className="pvm__c">
              <dt>Model − Market</dt>
              <dd>
                {simObs?.value != null && marketMean != null ? <b className="num">{signed(simObs.value - marketMean, Math.abs(simObs.value) >= 10 ? 1 : 2)}</b> : <b>—</b>}
                {mainFair != null && main && <span className="pvm__s">at {mainLine}+: model price {cents(mainFair)} vs market {cents(mid(main)!)}</span>}
              </dd>
            </div>
            <div className="pvm__c pvm__c--go">
              <dt className="sr-only">Open market</dt>
              <dd>{main ? <Link className="btn btn--sm" to={routes.market(slug, main.market_id, main.event_id ?? '')}>Open market <Icon name="arrowRight" size={14} /></Link> : null}</dd>
            </div>
          </dl>
          {rungs.length >= 2 ? (
            <LadderChart rungs={rungs} quantiles={q} unit={statLabel} title={`${p.entity.display_name} ${statLabel}`} />
          ) : (
            <ul className="mrows">
              {(byStat.get(activeStat ?? '') ?? []).map((m) => (
                <li key={m.market_id}>
                  <Link className="mrow" to={routes.market(slug, m.market_id, m.event_id ?? '')}>
                    <span className="mrow__d">{m.yes_description.replace(/^YES iff /, '')}</span>
                    <span className="mrow__p num">{m.yes_bid != null ? Math.round(m.yes_bid * 100) : '—'} / {m.yes_ask != null ? Math.round(m.yes_ask * 100) : '—'}¢</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="plcav">
            Research evidence, not a betting signal.
            <Info label="About model prices on player props">
              <span>Model prices here are {capStatus(caps, 'raw_projections')} research evidence (authority RESEARCH_ONLY). The publication notes its model has been shown redundant to the closing market on player props; see the Model Scorecard on the {sport.label} home.</span>
              <span>The projection is the game simulation’s average; the model price is the pricing model’s fair probability for one line. They are separate published outputs and can disagree.</span>
            </Info>
          </p>
        </Stratum>
      )}

      {showRange && (
        <Stratum title="Projected Range" sub="What the model’s simulations of this game expect, from a low-end to a high-end outcome." actions={<TermInfo k="projected_range" align="end" />}>
          {q && simObs && (
            <dl className="prange" aria-label={`${statLabel} projected range`}>
              <div><dt>{statLabel}</dt><dd className="prange__stat">this game</dd></div>
              <div><dt>Low-end</dt><dd className="num">{fmtStat(q.p05)}</dd></div>
              <div><dt>Typical range</dt><dd className="num">{fmtStat(q.p25)}–{fmtStat(q.p75)}</dd></div>
              <div><dt>High-end</dt><dd className="num">{fmtStat(q.p95)}</dd></div>
              <div><dt>Model average</dt><dd className="num">{fmtStat(simObs.value)}</dd></div>
              {marketMean != null && <div><dt>Market-implied</dt><dd className="num">{fmtStat(marketMean)}</dd></div>}
            </dl>
          )}
          <RangeStrip rows={distRows} caption={`${p.entity.display_name} projected ranges`} />
          <p className="plcav">Low-end and high-end are the 5th and 95th of every 100 simulated games; the typical range is the middle half.</p>
        </Stratum>
      )}

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
                    <tr key={o.observation_id}><td>{metrics.get(o.metric_id)?.name.replace(/^QB /, '')}<MetricInfo metricId={o.metric_id} def={metrics.get(o.metric_id)} /></td><td>{o.split?.value.replace(/_/g, ' ') ?? o.window.label}</td><td className="r num">{metricFormatter(metrics.get(o.metric_id))(o.value)}</td></tr>
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

      <section className="plquiet" aria-label="History and availability">
        <h2 className="plquiet__h">History & Availability</h2>
        <div className="plquiet__grid">
          <div>
            <h3 className="plquiet__k">Game log <Info label="About player game logs"><span>Player game logs: {capStatus(caps, 'player_game_logs')} for {sport.label}. {caps.get('player_game_logs')?.limitations?.[0] ?? 'Not published.'} Sift does not reconstruct a log it cannot source.</span></Info></h3>
            <p>Not published for 2026 yet. Historical player game logs will appear here when the {sport.label} publication provides them.</p>
          </div>
          {p.availability.length > 0 && (
            <div>
              <h3 className="plquiet__k">Availability</h3>
              <ul className="plav">
                {p.availability.map((a, i) => (
                  <li key={i}><b>{STATUS_WORD[a.status] ?? a.status}</b> · {(a.detail ?? '').replace(/^.*?\):\s*/, '')}<span className="plav__src"> · {a.source}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

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
