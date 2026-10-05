// Raw vs opponent-adjusted for one team and metric: both values and ranks, what moved, and one plain line
// on what it means (lib/adjustment.ts does the arithmetic and respects higher_is_better).
import { Link } from 'react-router';
import type { MetricDef, Observation } from '../contract/types';
import { compareAdjustment, unitOf } from '../lib/adjustment';
import { metricFormatter } from '../lib/format';
import { WINDOW_EXPLAIN } from '../lib/nfl';

const signed = (fmt: (v: number | null) => string, v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v)).replace(/^[+−-]/, '')}`);

export function AdjustmentCompare({ raw, adj, rawDef, adjDef, team, rawHref, adjHref }: {
  raw: Observation; adj: Observation; rawDef?: MetricDef; adjDef?: MetricDef; team: string | null; rawHref: string; adjHref: string;
}) {
  const hib = adj.context?.higher_is_better ?? adjDef?.higher_is_better ?? raw.context?.higher_is_better ?? null;
  const c = compareAdjustment(
    { value: raw.value, rank: raw.context?.rank ?? null, size: raw.context?.universe_size ?? null, leagueAverage: raw.context?.league_average ?? null },
    { value: adj.value, rank: adj.context?.rank ?? null, size: adj.context?.universe_size ?? null },
    hib,
    { unit: unitOf(adj.metric_id), team },
  );
  const fRaw = metricFormatter(rawDef, null);
  const fDev = metricFormatter(adjDef, null);
  const rank = (o: Observation) => (o.context?.rank != null ? `#${o.context.rank}` : '—');
  const move = c.rankMove == null ? null : c.rankMove === 0 ? 'Same rank' : `${c.rankMove > 0 ? '↑' : '↓'} ${Math.abs(c.rankMove)} ${Math.abs(c.rankMove) === 1 ? 'rank' : 'ranks'}`;
  return (
    <div className={`adjcmp adjcmp--${c.direction ?? 'none'}`}>
      <Link to={rawHref} className="adjcmp__col">
        <span className="adjcmp__k">Raw</span>
        <span className="adjcmp__v"><b className="num">{rank(raw)}</b> <span className="num">{fRaw(raw.value)}</span></span>
        <span className="adjcmp__s">{c.rawVsAvg != null ? <>{signed(fDev, c.rawVsAvg)} vs league average · </> : null}{WINDOW_EXPLAIN[raw.window.label] ?? raw.window.label}</span>
      </Link>
      <Link to={adjHref} className="adjcmp__col">
        <span className="adjcmp__k">Opponent-adjusted</span>
        <span className="adjcmp__v"><b className="num">{rank(adj)}</b> <span className="num">{signed(fDev, adj.value)}</span></span>
        <span className="adjcmp__s">vs league average · {WINDOW_EXPLAIN[adj.window.label] ?? adj.window.label}</span>
      </Link>
      <div className="adjcmp__col adjcmp__col--move">
        <span className="adjcmp__k">Adjustment</span>
        <span className="adjcmp__v">{move && <b className="num">{move}</b>} <span className="num">{signed(fDev, c.delta)}</span></span>
        <span className="adjcmp__s">{hib === false ? 'lower is better' : hib === true ? 'higher is better' : 'no better direction'}</span>
      </div>
      {c.interpretation && <p className="adjcmp__read">{c.interpretation}</p>}
    </div>
  );
}
