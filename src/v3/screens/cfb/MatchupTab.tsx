// Game Detail, Matchup tab for a Script Engine game: the engine's whole opponent-adjusted matchup profile. Each offense against the defense it faces by dimension (the
// adjusted gap in standard deviations across FBS), every matchup finding with the metrics it cites, then every metric the engine published, raw and adjusted kept
// apart, with rank, sample and quality. A description of the two units, not a forecast. A trimmed event restores its tables from the verified sidecar; until then,
// or if that fails, the notice says which and the rest stays usable.
import { DIMENSION_WORD, EDGE_DIMENSIONS, metricAt, type Engine, type MetricRow } from '../../../lib/scriptEngine';
import { isHavoc, usableFinding, usableMetric } from '../../model/havoc';
import { tugDims } from '../../model/scriptStory';
import { formatUnitValue, sportUnit, unitText } from '../../../insights/sportUnits';
import { DIMENSION_WHY, findingLabel, gapText } from '../../model/scriptRead';
import { Icon } from '../../ui/Icon';
import type { GameCtx } from '../GameShared';
import { DetailNotice, FindingNote, ResearchOnly } from './parts';

const unitOf = (engine: Engine, id: string) => sportUnit(id, engine.registry[id], 'CFB');

function Bar({ v }: { v: number | null | undefined }) {
  const w = v == null ? 0 : Math.min(Math.abs(v) / 3, 1) * 50;
  return <span className="cs-bar" aria-hidden="true"><i /><b className={v != null && v < 0 ? 'neg' : 'pos'} style={v == null ? undefined : v >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} /></span>;
}

const maxAbs = (...v: (number | null | undefined)[]) => Math.max(0, ...v.map((x) => (x == null ? 0 : Math.abs(x))));

/** "Nebraska has the edge" when one direction clearly leads, else "Too close to call": from the engine's two published directional gaps. */
function verdict(engine: Engine, away: number | null, home: number | null, noise: boolean): string {
  if (away == null && home == null) return 'No gap published';
  if (noise) return 'Within its own uncertainty';
  const a = away ?? -Infinity, h = home ?? -Infinity;
  if (Math.abs(a - h) < 0.25) return 'Too close to call';
  return `${engine.teams[a > h ? 'away' : 'home'].name} has the edge`;
}

function DirRows({ engine, away, home, noise }: { engine: Engine; away: number | null; home: number | null; noise: boolean }) {
  const a = engine.teams.away.name, h = engine.teams.home.name;
  const rows = [[`${a} offense vs ${h} defense`, away], [`${h} offense vs ${a} defense`, home]] as const;
  return <>{rows.map(([label, x]) => <div key={label} className={`cs-dim__r${noise ? ' is-noise' : ''}`}><span>{label}</span><Bar v={x} /><b className="num">{gapText(x)}</b></div>)}</>;
}

function Edges({ engine }: { engine: Engine }) {
  if (!EDGE_DIMENSIONS.some((d) => engine.dimensions[d])) {
    return <p className="cs-empty">{engine.detail.state === 'loading' ? 'Loading the unit-by-unit matchup.' : engine.detail.state === 'unavailable' ? `The unit-by-unit matchup is not available for this game: ${engine.detail.reason ?? 'not published'}.` : 'No unit-by-unit matchup is published for this game.'}</p>;
  }
  // The biggest gap first, so the advantages that matter are the top of the list.
  const dims = tugDims(engine, EDGE_DIMENSIONS).sort((x, y) => maxAbs(y.away, y.home, ...(y.components ?? []).flatMap((c) => [c.away, c.home])) - maxAbs(x.away, x.home, ...(x.components ?? []).flatMap((c) => [c.away, c.home])));
  return (
    <ul className="cs-dims">
      {dims.map((d) => (
        <li key={d.dimension} className="cs-dim" data-testid="cfb-dim">
          <div className="cs-dim__h"><h3>{DIMENSION_WORD[d.dimension] ?? d.dimension}</h3>{!d.components && <span className="cs-verd">{verdict(engine, d.away, d.home, d.noise)}</span>}</div>
          {d.components ? d.components.map((c) => <div key={c.name} className="cs-dim__c"><small>{c.name}</small><DirRows engine={engine} away={c.away} home={c.home} noise={false} /></div>) : <DirRows engine={engine} away={d.away} home={d.home} noise={d.noise} />}
          {DIMENSION_WHY[d.dimension] && <p className="cs-plain">{DIMENSION_WHY[d.dimension]}</p>}
        </li>
      ))}
    </ul>
  );
}

function Mini({ engine, refs }: { engine: Engine; refs: string[] }) {
  return (
    <ul className="cs-mini">
      {[...new Set(refs)].slice(0, 6).map((ref) => {
        const row = metricAt(engine, ref);
        if (!row || !usableMetric(row)) return null;
        const reg = engine.registry[row.metric_id];
        const u = unitOf(engine, row.metric_id);
        return <li key={ref}><span>{row.team} {row.unit}, {reg?.name ?? row.metric_id} <em>({unitText(u)})</em></span><b className="num">{formatUnitValue(row.raw, u)} raw{row.adjusted_available ? `, ${formatUnitValue(row.adjusted, u)} adjusted` : ', no adjusted value'}</b><small>{row.rank ? `#${row.rank} of ${row.universe_size}` : 'unranked'} · {row.games} games{row.quality !== 'OK' ? ` · ${row.quality.toLowerCase().replace(/_/g, ' ')}` : ''}</small></li>;
      })}
    </ul>
  );
}

function MetricList({ engine, dimension }: { engine: Engine; dimension: string }) {
  const ids = Object.values(engine.registry).filter((r) => r.dimension === dimension && !isHavoc(r.metric_id)).map((r) => r.metric_id);
  if (!ids.length) return null;
  const pairs: ['home' | 'away', 'offense' | 'defense'][] = [['home', 'offense'], ['away', 'defense'], ['away', 'offense'], ['home', 'defense']];
  return (
    <ul className="cs-metrics">
      {ids.map((id) => {
        const reg = engine.registry[id];
        return (
          <li key={id}>
            <b>{reg.name}{reg.secondary_evidence ? <em> · secondary</em> : null}{reg.regression_prone ? <em> · regression-prone</em> : null}</b>
            {reg.description && <small>{reg.description}</small>}
            {pairs.map(([side, unit]) => {
              const row: MetricRow | undefined = engine.teams[side].metrics[`${unit}.${id}`];
              const u = unitOf(engine, id);
              return (
                <div key={`${side}${unit}`} className="cs-metrics__r">
                  <span>{engine.teams[side].name} {unit}</span>
                  {row ? <><b className="num">{formatUnitValue(row.adjusted_available ? row.adjusted : row.raw, u)}</b><small>{row.adjusted_available ? 'adjusted' : 'raw, not adjusted'} · {row.rank ? `#${row.rank} of ${row.universe_size}` : 'unranked'}{row.quality !== 'OK' ? ` · ${row.quality.toLowerCase().replace(/_/g, ' ')}` : ''}</small></> : <b>—</b>}
                </div>
              );
            })}
          </li>
        );
      })}
    </ul>
  );
}

export function CfbMatchupTab({ engine }: { ctx: GameCtx; engine: Engine }) {
  const t = engine.teams.home;
  const hasTables = Object.keys(engine.registry).length > 0 && Object.keys(engine.teams.home.metrics).length > 0;
  return (
    <section className="cs" aria-label="Team matchup" data-testid="cfb-matchup-tab">
      <DetailNotice engine={engine} />
      <div className="x-card cs-sec">
        <div className="cs-sh"><h2>Unit by unit</h2><ResearchOnly /></div>
        <p className="cs-sub">Each offense against the defense it faces, on opponent-adjusted values standardised across FBS. Positive favours the offense; a gap of +2 is roughly a one-standard-deviation-better offense meeting a one-standard-deviation-worse defense. A description of the two units, not a forecast. Muted rows are within their own uncertainty.</p>
        <Edges engine={engine} />
        <p className="cs-foot">Possession environment {gapText(engine.dimensions.pace?.possession_environment)}.</p>
      </div>
      <div className="x-card cs-sec">
        <div className="cs-sh"><h2>Matchup findings</h2></div>
        <p className="cs-sub">Deterministic findings from the opponent-adjusted profile. Each names the metrics that produced it.</p>
        {engine.findings.filter(usableFinding).length ? engine.findings.filter(usableFinding).map((f) => (
          <div key={f.code}>
            <FindingNote label={findingLabel(engine, f.code)} statement={f.statement} strength={f.strength} />
            {f.metric_refs.length > 0 && hasTables && <details className="cs-more cs-more--in"><summary>Metrics behind it<Icon name="chevD" size={16} /></summary><Mini engine={engine} refs={f.metric_refs} /></details>}
          </div>
        )) : <p className="cs-empty">No finding clears its threshold and its own uncertainty.</p>}
      </div>
      <div className="x-card cs-sec">
        <div className="cs-sh"><h2>Every metric</h2></div>
        {hasTables ? ['sustained_efficiency', 'rushing', 'passing', 'explosiveness', 'disruption', 'finishing', 'scoring', 'pace', 'volatility'].map((d) => (
          <details key={d} className="cs-more cs-more--dim">
            <summary>{DIMENSION_WORD[d] ?? d}<Icon name="chevD" size={16} /></summary>
            {d === 'pace' || d === 'volatility' ? <p className="cs-sub">Descriptive tendencies and variance; some are not opponent-adjusted, and say so.</p> : null}
            <MetricList engine={engine} dimension={d} />
          </details>
        )) : <p className="cs-empty">{engine.detail.state === 'loading' ? 'Loading the opponent-adjusted metric tables.' : engine.detail.state === 'unavailable' ? `The metric tables are not available for this game: ${engine.detail.reason ?? 'not published'}.` : 'No metric tables are published for this game.'}</p>}
        <p className="cs-foot">Season {t.season ?? '—'}, {t.window?.type?.replace(/_/g, ' ') ?? 'window not stated'} through {t.window?.through_exclusive ?? '—'} (exclusive). Ranks are within FBS; a team outside FBS is unranked. Adjustment {engine.adjustment.stable ? 'stable' : 'not yet stable'} ({engine.adjustment.games_in_window} games, median FBS sample {engine.adjustment.median_fbs_games}).</p>
      </div>
    </section>
  );
}

