// A metric is never a bare number: what it is, compared with whom, over what window, against what
// competition, how trustworthy it is, why it might matter, and where to go next.
import type { ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { DotStrip } from '../charts/DotStrip';
import { RankBars } from '../charts/RankBars';
import { TrendChart } from '../charts/TrendChart';
import type { EntityProfileDoc, Observation, RankingDoc } from '../contract/types';
import { useAsync } from '../data/hooks';
import { Icon } from '../components/Icon';
import { AdjustmentCompare } from '../components/AdjustmentCompare';
import { glossLine, metricGloss } from '../lib/glossary';
import { EntityLink, ErrorState, Notice, QualityBadge, RankPill, SaveButton, Skeleton, Stratum, TeamMark } from '../components/ui';
import { exactTime, metricFormatter, ordinal, unitLabel } from '../lib/format';
import { adjustedTwin, counterpartMetric, WINDOW_EXPLAIN } from '../lib/nfl';
import { routes } from '../lib/routes';
import { useDirectory } from '../state/directory';
import { useSport } from '../state/sport';
import { useVisit } from '../state/trail';
import { protocolForSport } from '../packet/protocols';

function obsFor(p: EntityProfileDoc | undefined, metricId: string): Observation | undefined {
  if (!p) return undefined;
  return p.metrics.find((o) => o.metric_id === metricId && !o.split) ?? p.metrics.find((o) => o.metric_id === metricId);
}

function Fact({ k, v, sub }: { k: string; v: ReactNode; sub?: ReactNode }) {
  return (
    <div className="fact">
      <dt>{k}</dt>
      <dd>{v}{sub && <span className="fact__sub">{sub}</span>}</dd>
    </div>
  );
}

export function MetricView() {
  const { metricId = '' } = useParams();
  const [sp] = useSearchParams();
  const teamId = sp.get('team');
  const oppId = sp.get('opp');
  const eventId = sp.get('event');
  const { sport, repo, slug, metrics } = useSport();
  const dir = useDirectory(repo);
  const def = metrics.get(metricId);
  const team = useAsync(teamId ? `prof:${sport.code}:${teamId}` : null, () => repo.profile(teamId!));
  const opp = useAsync(oppId ? `prof:${sport.code}:${oppId}` : null, () => repo.profile(oppId!));
  const o = obsFor(team.data, metricId);
  const rankingId = o?.context?.ranking_id ?? null;
  const ranking = useAsync(rankingId ? `rnk:${sport.code}:${rankingId}` : !teamId && def ? `rnkfind:${sport.code}:${metricId}` : null, async (): Promise<RankingDoc | null> => {
    if (rankingId) return repo.ranking(rankingId);
    const si = await repo.searchIndex();
    const hit = si.items.find((e) => e.kind === 'RANKING' && e.label.startsWith(def!.name + ' ranking'));
    return hit ? repo.ranking(hit.id) : null;
  });
  const sref = team.data?.series.find((s) => s.metric_id === metricId && !s.split);
  const series = useAsync(sref ? `ser:${sport.code}:${sref.series_id}` : null, () => repo.series(sref!.series_id));
  const cpId = counterpartMetric(metricId, metrics);
  const cpDef = cpId ? metrics.get(cpId) : undefined;
  const oppCp = cpId ? obsFor(opp.data, cpId) : undefined;
  const oppSame = obsFor(opp.data, metricId);
  const twin = adjustedTwin(metricId);
  const twinObs = twin ? obsFor(team.data, twin.id) : undefined;
  const label = def ? (team.data ? `${team.data.entity.short_name} ${def.short_name ?? def.name}` : def.name) : null;
  useVisit(label, 'metric');

  if (!def) return <div className="page"><Notice tone="error" title="Metric not in the registry">The metric registry has no {metricId}; the contract refuses unregistered metrics, so Sift does too.</Notice></div>;
  if (team.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  const rk = ranking.data;
  const scale = rk ? Math.max(Math.abs(rk.summary.min ?? 0), Math.abs(rk.summary.max ?? 0)) : o?.context ? Math.max(Math.abs(o.context.best_value ?? 0), Math.abs(o.context.worst_value ?? 0)) : null;
  const fmt = metricFormatter(def, scale);
  const ctx = o?.context ?? null;
  const name = (id: string | null | undefined) => dir.data?.team(id)?.name ?? id ?? '—';
  const tName = team.data?.entity.display_name;
  const oName = opp.data?.entity.display_name;
  const protocol = protocolForSport(sport.code);

  return (
    <div className="page metric">
      <header className="ehead ehead--metric">
        <div className="ehead__t">
          <div className="eyebrow">
            <EntityLink to={routes.sport(slug)} kind="sport" quiet>{sport.label}</EntityLink> · Metric · {def.category}{def.subcategory ? ` · ${def.subcategory}` : ''}
          </div>
          <h1 className="h-display h-display--md">
            {tName && <><Link to={routes.team(slug, teamId!)} className="h-team">{tName}</Link><span className="h-sep"> · </span></>}
            {def.name}
          </h1>
          <PlainEnglish metricId={metricId} def={def} />
          <div className="ehead__meta">
            <QualityBadge quality={def.quality} />
            <span className="chip">{unitLabel(def.unit) || def.stat_type}</span>
            <span className="chip">{def.higher_is_better === true ? 'higher is better' : def.higher_is_better === false ? 'lower is better' : 'no better direction'}</span>
          </div>
        </div>
        <div className="ehead__actions">
          <SaveButton ref_kind="METRIC" sport={sport.code} id={metricId} label={{ label: def.name, sub: 'metric', href: routes.metric(slug, metricId, { team: teamId, opp: oppId }) }} />
        </div>
      </header>

      {o && ctx && (
        <section className="answer" aria-label="The number in context">
          <div className="answer__big">
            <TeamMark sport={sport.code} abbr={team.data?.entity.short_name} size="lg" />
            <div>
              <div className="answer__rank"><span className="num">{ordinal(ctx.rank ?? 0)}</span><span className="answer__of">of {ctx.universe_size}</span></div>
              <div className="answer__val"><span className="num">{fmt(o.value)}</span> <span className="muted">{unitLabel(o.unit)}</span></div>
            </div>
          </div>
          <dl className="facts">
            <Fact k="League average" v={<span className="num">{fmt(ctx.league_average)}</span>} />
            <Fact k="League median" v={<span className="num">{fmt(ctx.league_median)}</span>} />
            <Fact k="Best" v={<EntityLink to={routes.team(slug, ctx.best_entity_id ?? '')} kind="team">{name(ctx.best_entity_id)}</EntityLink>} sub={<span className="num">{fmt(ctx.best_value)}</span>} />
            <Fact k="Worst" v={<EntityLink to={routes.team(slug, ctx.worst_entity_id ?? '')} kind="team">{name(ctx.worst_entity_id)}</EntityLink>} sub={<span className="num">{fmt(ctx.worst_value)}</span>} />
            <Fact k="Window" v={o.window.label} sub={WINDOW_EXPLAIN[o.window.label] ?? o.window.kind.toLowerCase()} />
            <Fact k="Compared with" v={ctx.universe_label ?? '—'} />
            <Fact k="Sample" v={o.sample_size != null ? <span className="num">{o.sample_size}</span> : 'not published'} />
            <Fact k="As of" v={exactTime(o.as_of)} />
            <Fact k="Trust" v={<QualityBadge status={o.quality_status} quality={def.quality} />} sub={o.source} />
          </dl>
        </section>
      )}
      {teamId && !o && <Notice title={`${tName ?? 'This team'} has no published value for ${def.name}`}>Nothing is shown in its place.</Notice>}

      {(oppCp || oppSame || twinObs) && (
        <Stratum n="01" title="Matchup Context" sub="The opponent unit this team faces, the same measure for that opponent, and how the number changes once the strength of opponents is accounted for.">
          <div className="vsgrid">
            {oppCp && cpDef && (
              <Link className="vscard vscard--opp" to={routes.metric(slug, cpId!, { team: oppId, opp: teamId, event: eventId })}>
                <span className="eyebrow">Opponent counterpart</span>
                <span className="vscard__t">{oName} · {cpDef.name}</span>
                <span className="vscard__v"><span className="num">{metricFormatter(cpDef, scale)(oppCp.value)}</span> <RankPill rank={oppCp.context?.rank} size={oppCp.context?.universe_size} hib={oppCp.context?.higher_is_better} /></span>
              </Link>
            )}
            {oppSame && (
              <Link className="vscard" to={routes.metric(slug, metricId, { team: oppId, opp: teamId, event: eventId })}>
                <span className="eyebrow">Same metric, opponent</span>
                <span className="vscard__t">{oName} · {def.short_name ?? def.name}</span>
                <span className="vscard__v"><span className="num">{fmt(oppSame.value)}</span> <RankPill rank={oppSame.context?.rank} size={oppSame.context?.universe_size} hib={oppSame.context?.higher_is_better} /></span>
              </Link>
            )}
          </div>
          {twin && twinObs && o && (
            twin.kind === 'adjusted'
              ? <AdjustmentCompare raw={o} adj={twinObs} rawDef={def} adjDef={metrics.get(twin.id)} team={team.data?.entity.short_name ?? null} rawHref={routes.metric(slug, metricId, { team: teamId, opp: oppId, event: eventId })} adjHref={routes.metric(slug, twin.id, { team: teamId, opp: oppId, event: eventId })} />
              : <AdjustmentCompare raw={twinObs} adj={o} rawDef={metrics.get(twin.id)} adjDef={def} team={team.data?.entity.short_name ?? null} rawHref={routes.metric(slug, twin.id, { team: teamId, opp: oppId, event: eventId })} adjHref={routes.metric(slug, metricId, { team: teamId, opp: oppId, event: eventId })} />
          )}
          {twin && !twinObs && <p className="muted small">The publication has no {twin.kind === 'adjusted' ? 'opponent-adjusted' : 'raw'} twin of this measure for this team, so no comparison is shown.</p>}
        </Stratum>
      )}

      {rk && (
        <Stratum n="02" title={`Across the ${rk.universe.label}`} sub={`All ${rk.universe.size} on one axis — best on the right.`}
          actions={<Link className="btn btn--primary btn--sm" to={routes.ranking(slug, rk.ranking_id, { focus: teamId, opp: oppId })}>Full {sport.label} ranking <Icon name="arrowRight" size={14} /></Link>}
        >
          <DotStrip
            entries={rk.entries} focusId={teamId} oppId={oppId} mean={rk.summary.mean} median={rk.summary.median} format={fmt}
            hrefFor={(e) => routes.metric(slug, metricId, { team: e.entity_id, opp: oppId === e.entity_id ? teamId : oppId })}
            higherIsBetter={rk.higher_is_better} caption={`${def.name} for all ${rk.universe.size} teams`}
          />
          {!teamId && (
            <RankBars entries={rk.entries} mean={rk.summary.mean} median={rk.summary.median} format={fmt}
              hrefFor={(e) => routes.metric(slug, metricId, { team: e.entity_id })} caption={`${def.name} ranking`} />
          )}
        </Stratum>
      )}

      {series.data && (
        <Stratum n="03" title={`${tName} by game`} sub="Each column is a game; tap one to open it.">
          <TrendChart
            points={series.data.points} format={fmt} unit={series.data.unit ?? ''} rollingWindow={series.data.rolling_window}
            title={`${tName} ${def.name} by game`} opponentLabel={(id) => dir.data?.team(id)?.abbr ?? '?'}
            outcome={(p) => (team.data?.games.find((g) => g.event_id === p.event_id)?.result?.outcome as 'W' | 'L' | 'T' | null) ?? null}
            renderDetail={(p) => (
              <div className="pointdetail__a">
                <Link className="btn btn--ghost btn--sm" to={routes.game(slug, p.event_id ?? '', { team: teamId })}>Open {p.x} <Icon name="arrowRight" size={14} /></Link>
                {p.opponent_id && <Link className="btn btn--ghost btn--sm" to={routes.team(slug, p.opponent_id)}>{dir.data?.team(p.opponent_id)?.abbr} profile</Link>}
                <SaveButton ref_kind="CHART_POINT" sport={sport.code} id={series.data!.series_id} extra={{ series_id: series.data!.series_id, x: p.x, metric_id: metricId, event_id: p.event_id }}
                  label={{ label: `${def.short_name} ${fmt(p.value)} · ${p.x}`, sub: 'chart point', href: routes.game(slug, p.event_id ?? '', { team: teamId }) }} />
              </div>
            )}
          />
          <p className="muted small">Trailing mean: the publication's own rolling value ({series.data.rolling_window} games). {series.data.quality.limitations[0]}</p>
        </Stratum>
      )}
      {!series.data && def.supports?.time_series === false && teamId && (
        <p className="muted small metric__nots">No per-game history is published for this metric ({def.known_limitations[0] ?? 'snapshot only'}).</p>
      )}

      <Stratum n="04" title="What it is and why it might matter" sub="From the metric registry and the sport's handicap protocol.">
        <div className="explain">
          <p className="explain__desc"><span className="explain__k">Technical definition (metric registry)</span> {def.description}</p>
          <dl className="facts facts--slim">
            <Fact k="Source" v={def.source ?? '—'} sub={def.source_version ? `version ${def.source_version}` : undefined} />
            <Fact k="Method" v={def.methodology_version ?? '—'} />
            <Fact k="Updates" v={def.update_frequency ?? '—'} />
            <Fact k="Supports" v={Object.entries(def.supports ?? {}).filter(([k, v]) => v && k !== 'percentile').map(([k]) => k.replace(/_/g, ' ')).join(', ') || '—'} />
          </dl>
          {def.known_limitations.length > 0 && (
            <div className="explain__lims">
              <div className="eyebrow">Known limitations</div>
              <ul>{def.known_limitations.map((l) => <li key={l}>{l}</li>)}</ul>
            </div>
          )}
          <div className="explain__lims">
            <div className="eyebrow">{protocol.title ?? 'Handicap protocol'} — sport notes</div>
            <ul>{(protocol.sport_notes ?? []).map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        </div>
      </Stratum>

      <Stratum n="05" title="Where next">
        <div className="chips">
          {rk && <EntityLink to={routes.ranking(slug, rk.ranking_id, { focus: teamId, opp: oppId })} kind="ranking">Full ranking</EntityLink>}
          {teamId && <EntityLink to={routes.team(slug, teamId, 'metrics')} kind="team">All {team.data?.entity.short_name} metrics</EntityLink>}
          {oppId && <EntityLink to={routes.team(slug, oppId, 'metrics')} kind="team">All {opp.data?.entity.short_name} metrics</EntityLink>}
          {eventId && <EntityLink to={routes.game(slug, eventId)} kind="game">Back to the game</EntityLink>}
          {[...metrics.values()].filter((m) => m.metric_id !== metricId && m.entity_type === def.entity_type && m.category === def.category && m.subcategory === def.subcategory).slice(0, 6).map((m) => (
            <EntityLink key={m.metric_id} to={routes.metric(slug, m.metric_id, { team: teamId, opp: oppId, event: eventId })} kind="metric">{m.short_name ?? m.name}</EntityLink>
          ))}
        </div>
      </Stratum>
      {ranking.error && <ErrorState error={ranking.error} what="the ranking" />}
    </div>
  );
}

/** The metric page's lead: one plain-English sentence from the glossary (lib/glossary.ts), or an honest
 *  pointer to the registry definition when the glossary has none. */
export function PlainEnglish({ metricId, def }: { metricId: string; def: Parameters<typeof metricGloss>[1] }) {
  const g = metricGloss(metricId, def);
  return (
    <p className="plain">
      <span className="plain__k">In plain English</span>
      {g ? glossLine(g) : 'No short definition yet. The publication’s technical definition is below, under “What it is”.'}
    </p>
  );
}
