import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { LadderChart, type Rung } from '../charts/LadderChart';
import { RangeStrip, type RangeRow } from '../charts/RangeStrip';
import type { Observation, ResearchMarket } from '../contract/types';
import { useAsync } from '../data/hooks';
import { Icon } from '../components/Icon';
import { EntityLink, ErrorState, Notice, QualityBadge, RankPill, SaveButton, Skeleton, Stratum, TeamMark } from '../components/ui';
import { kickoff, metricFormatter, pct } from '../lib/format';
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
  const shares = p.metrics.filter((o) => o.metric_id.startsWith('met_nfl.proj_'));
  const qbObs = [...p.metrics.filter((o) => o.metric_id.startsWith('met_nfl.qb_')), ...Object.values(p.splits ?? {}).flat()];
  const stats = [...byStat.keys()].sort((a, b) => (byStat.get(b)!.length - byStat.get(a)!.length));
  const prefer: Record<string, string[]> = { QB: ['passing_yards', 'attempts'], RB: ['rushing_yards', 'carries'], WR: ['receiving_yards', 'receptions'], TE: ['receiving_yards', 'receptions'] };
  const activeStat = stat && byStat.has(stat) ? stat : (prefer[pos] ?? []).find((s) => byStat.has(s)) ?? stats.find((s) => STAT_TO_SIM[s]) ?? stats[0];
  const ladderMarkets = (byStat.get(activeStat ?? '') ?? []).filter((m) => m.threshold != null || m.line != null).sort((a, b) => Number(a.threshold ?? a.line) - Number(b.threshold ?? b.line));
  const simObs = activeStat && STAT_TO_SIM[activeStat] ? sims.find((o) => o.metric_id === STAT_TO_SIM[activeStat]) : undefined;
  const rungs: Rung[] = ladderMarkets.map((m) => ({
    x: Number(m.threshold ?? m.line), bid: m.yes_bid, ask: m.yes_ask, fair: fair.get(m.market_id)?.fair_probability ?? null,
    href: routes.market(slug, m.market_id, m.event_id ?? ''), ticker: m.kalshi_ticker,
  }));
  const distRows: RangeRow[] = sims
    .filter((o) => quantilesOf(o))
    .map((o) => {
      const q = quantilesOf(o)!;
      const x = (o.extensions ?? {}) as Record<string, number>;
      const f = metricFormatter(metrics.get(o.metric_id));
      return { label: metrics.get(o.metric_id)?.name.replace('Simulated ', '') ?? o.metric_id, mean: o.value, r50: [q.p25, q.p75], r90: [q.p05, q.p95], market: x.market_mean ?? null, format: (v: number) => f(v) };
    });
  const others = (dir.data?.index.players_by_team[p.team?.participant_id ?? ''] ?? []).filter((id) => id !== playerId);
  const samePos = (dir.data ? Object.values(dir.data.index.players_by_team).flat() : []).filter((id) => id !== playerId && dir.data!.player(id)?.context?.position === pos);
  const rival = game ? samePos.find((id) => dir.data!.player(id)?.context?.team === dir.data!.team(oppId)?.abbr) : undefined;

  return (
    <div className="page player">
      <header className="ehead">
        <TeamMark sport={sport.code} abbr={teamAbbr} size="lg" />
        <div className="ehead__t">
          <div className="eyebrow">
            <EntityLink to={routes.sport(slug)} kind="sport" quiet>{sport.label}</EntityLink> · Player · {pos}
            {p.team && <> · <EntityLink to={routes.team(slug, p.team.participant_id)} kind="team" quiet>{p.team.display_name}</EntityLink></>}
          </div>
          <h1 className="h-display">{p.entity.display_name}</h1>
          <div className="ehead__meta">
            {game && (
              <EntityLink to={routes.game(slug, game.event_id)} kind="game">
                {game.home_away === 'AWAY' ? '@' : 'vs'} {game.opponent_name} · {kickoff(game.start_time_utc)}
              </EntityLink>
            )}
            {ext.p_active != null && <span className="chip">P(active) <b className="num">{pct(ext.p_active, 1)}</b></span>}
            {p.availability[0] && <span className={`pl__inj pl__inj--${p.availability[0].status.toLowerCase()}`}>{p.availability[0].status}</span>}
            <QualityBadge quality={p.quality} />
          </div>
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

      {p.markets.length > 0 && capShown(caps, 'player_props') && (
        <Stratum n="01" title="Markets vs projection" sub="Each ladder as a curve: the market's YES price at every line, the model's fair price, and the simulated distribution underneath. Tap a rung for the full contract." actions={<QuoteSummaryChip views={quoteViews} now={now} />}>
          <div className="seg" role="tablist" aria-label="Stat">
            {stats.map((s) => (
              <button key={s} type="button" role="tab" aria-selected={activeStat === s} className={`seg__b${activeStat === s ? ' is-on' : ''}`} onClick={() => setStat(s)}>
                {STAT_LABEL[s] ?? s.replace(/_/g, ' ')} <span className="seg__n">{byStat.get(s)!.length}</span>
              </button>
            ))}
          </div>
          {rungs.length >= 2 ? (
            <LadderChart rungs={rungs} quantiles={quantilesOf(simObs)} unit={STAT_LABEL[activeStat ?? ''] ?? activeStat ?? ''} title={`${p.entity.display_name} ${STAT_LABEL[activeStat ?? ''] ?? activeStat}`} />
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
          <p className="muted small">
            Model prices here are {capStatus(caps, 'raw_projections')} research evidence (authority RESEARCH_ONLY); the repository notes its model has been shown redundant to the closing market on player props.
          </p>
        </Stratum>
      )}

      {distRows.length > 0 && capShown(caps, 'projection_distributions') && (
        <Stratum n="02" title="Projected distribution" sub="The coherent simulation for this game: 90% and 50% ranges, mean, and the market's own implied mean where the repository reconciled it. RESEARCH.">
          <RangeStrip rows={distRows} caption={`${p.entity.display_name} simulated stat distributions`} />
          {sims[0] && (
            <p className="muted small">
              Support state: {String((sims[0].extensions as any)?.support_state ?? '—').replace(/_/g, ' ').toLowerCase()} · source {sims[0].source} · as of {sims[0].as_of}.
            </p>
          )}
        </Stratum>
      )}

      {(shares.length > 0 || ext.quarterback) && capShown(caps, 'usage') && (
        <Stratum n="03" title="Usage" sub={`Projected shares (${capStatus(caps, 'usage')}: projected, not observed usage).`}>
          <div className="usage">
            {shares.map((o) => (
              <div key={o.metric_id} className="usage__item">
                <span className="usage__k">{metrics.get(o.metric_id)?.name}</span>
                <span className="usage__bar"><span style={{ width: `${Math.min(100, (o.value ?? 0) * 100)}%` }} /></span>
                <span className="num">{pct(o.value, 1)}</span>
              </div>
            ))}
            {ext.quarterback && (
              <p className="muted small">
                Depth chart: {ext.quarterback.depth_chart_order === 1 ? 'starter' : `QB${ext.quarterback.depth_chart_order}`} · {ext.quarterback.dropbacks} dropbacks this season
                {ext.quarterback.note ? ` · ${ext.quarterback.note}` : ''} · availability confidence {ext.quarterback.availability_confidence}.
              </p>
            )}
          </div>
          {qbObs.length > 0 && (
            <table className="dtable">
              <caption>QB profile (RESEARCH)</caption>
              <thead><tr><th>Metric</th><th>Split</th><th className="r">Value</th></tr></thead>
              <tbody>
                {qbObs.map((o) => (
                  <tr key={o.observation_id}><td>{metrics.get(o.metric_id)?.name}</td><td>{o.split?.value.replace(/_/g, ' ') ?? o.window.label}</td><td className="r num">{metricFormatter(metrics.get(o.metric_id))(o.value)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Stratum>
      )}

      {opp.data && MATCHUP_FOR_POS[pos] && (
        <Stratum n="04" title={`Matchup: ${opp.data.entity.display_name} defense`} sub={`The defensive units a ${pos} faces this week, ranked.`}>
          <ul className="mrow2__list">
            {MATCHUP_FOR_POS[pos].map((mid) => {
              const o = opp.data!.metrics.find((x) => x.metric_id === mid);
              if (!o) return null;
              const f = metricFormatter(metrics.get(mid), Math.max(Math.abs(o.context?.best_value ?? 0), Math.abs(o.context?.worst_value ?? 0)));
              return (
                <li key={mid} className="mrow2">
                  <Link className="mrow2__main" to={routes.metric(slug, mid, { team: oppId, opp: p.team?.participant_id, event: game?.event_id })}>
                    <span className="mrow2__name">{metrics.get(mid)?.name}<span className="mrow2__win">{o.window.label}</span></span>
                    <span className="mrow2__val num">{f(o.value)}</span>
                    <span />
                    <span className="mrow2__rank"><RankPill rank={o.context?.rank} size={o.context?.universe_size} hib={o.context?.higher_is_better} /></span>
                    <span className="mrow2__q"><QualityBadge status={o.quality_status} compact /></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Stratum>
      )}

      <Stratum n="05" title="Game log" sub="Per-game history for this player.">
        <Notice tone="research" title={`Player game logs are ${capStatus(caps, 'player_game_logs')} for ${sport.label}`}>
          {caps.get('player_game_logs')?.limitations?.[0] ?? 'Not published.'} Sift does not reconstruct a log it cannot source.
        </Notice>
      </Stratum>

      {others.length > 0 && (
        <Stratum title={`More ${teamAbbr}`}>
          <div className="chips">
            {others.map((id) => (
              <EntityLink key={id} to={routes.player(slug, id)} kind="player">{dir.data?.player(id)?.label ?? id} <span className="muted">{dir.data?.player(id)?.context?.position}</span></EntityLink>
            ))}
          </div>
        </Stratum>
      )}
    </div>
  );
}
