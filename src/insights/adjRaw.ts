// RAW vs OPPONENT-ADJUSTED team strength for the NHL and the NBA (backlog 5.1, 5.2). Both publications carry the two
// footings, in different shapes:
//  - NHL: each `met_nhl.oa_*_5v5` observation is opponent-adjusted and carries the raw number on the same games and
//    weights in `extensions.raw_value` (and the published `schedule_effect`, raw − adjusted). The raw value has no
//    published rank.
//  - NBA: the raw efficiency ratings (`team_off/def/net_rtg`, points per 100 stored possessions, regular season) and
//    the model's opponent-adjusted inputs (`team_adj_off/def/net_ppp`, an EWM with each opponent removed) are separate
//    metrics, each ranked. Their windows differ, so Sift never subtracts one from the other.
// The reader's app-wide Adjusted / Raw choice (state/statMode.ts) picks the footing shown first; when one side is not
// published for a measure, the other is shown and labelled "Raw only" / "Adjusted only" — never silently swapped.
import type { EntityProfileDoc, MetricDef, Observation } from '../contract/types';
import type { StatMode } from '../state/statMode';
import { windowWords } from './sportUnits';

export interface AdjRawSide {
  value: number | null;
  rank: number | null;
  of: number | null;
  /** The metric to open for this side (the NHL raw value lives on the adjusted metric). */
  metricId: string;
  /** "5v5 recency-weighted", "season", "EWM to 2026-06-14". */
  window: string;
}

export interface AdjRawRow {
  key: string;
  label: string;
  /** The metric whose unit formats both sides. */
  unitMetricId: string;
  higherIsBetter: boolean | null;
  adjusted: AdjRawSide | null;
  raw: AdjRawSide | null;
  /** NHL only: the publication's raw − adjusted (positive = flattered by weaker opponents). */
  scheduleEffect: number | null;
  /** Both sides cover the same games (NHL), so a difference is meaningful. */
  sameGames: boolean;
  /** NHL: the adjusted value still leans mostly on last season. */
  priorHeavy: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function side(o: Observation, value: number | null, ranked: boolean, metricId = o.metric_id): AdjRawSide {
  return {
    value,
    rank: ranked ? o.context?.rank ?? null : null,
    of: ranked ? o.context?.universe_size ?? null : null,
    metricId,
    window: o.window?.kind === 'CUSTOM' ? String(o.window.label ?? '') : windowWords(o.window) || String(o.window?.label ?? ''),
  };
}

/** The team's unsplit observation of a metric, preferring the season window. */
function pick(p: EntityProfileDoc, metricId: string): Observation | undefined {
  const all = p.metrics.filter((o) => o.metric_id === metricId && !o.split);
  return all.find((o) => o.window?.kind === 'SEASON' && /^SEASON$/i.test(String(o.window.label))) ?? all.find((o) => o.window?.kind === 'SEASON') ?? all[0];
}

/** NHL: one row per opponent-adjusted 5v5 measure, raw from `extensions.raw_value` on the same observation. */
export function nhlAdjRawRows(p: EntityProfileDoc, metrics: Map<string, MetricDef>): AdjRawRow[] {
  const seen = new Set<string>();
  const rows: AdjRawRow[] = [];
  for (const o of p.metrics) {
    const d = metrics.get(o.metric_id);
    if (d?.category !== 'opponent_adjusted' || o.split || seen.has(o.metric_id)) continue;
    seen.add(o.metric_id);
    const x = (o.extensions ?? {}) as { raw_value?: unknown; schedule_effect?: unknown; status?: unknown };
    const raw = num(x.raw_value);
    rows.push({
      key: o.metric_id,
      label: d.short_name?.replace(/^adj\s+/i, '') || d.name,
      unitMetricId: o.metric_id,
      higherIsBetter: d.higher_is_better ?? null,
      adjusted: num(o.value) != null ? side(o, o.value, true) : null,
      raw: raw != null ? side(o, raw, false) : null,
      scheduleEffect: num(x.schedule_effect),
      sameGames: true,
      priorHeavy: x.status === 'PRIOR_HEAVY',
    });
  }
  return rows;
}

const NBA_PAIRS: { key: string; label: string; raw: string; adj: string }[] = [
  { key: 'off', label: 'Offense (pts / 100 poss)', raw: 'met_nba.team_off_rtg', adj: 'met_nba.team_adj_off_ppp' },
  { key: 'def', label: 'Defense (pts allowed / 100 poss)', raw: 'met_nba.team_def_rtg', adj: 'met_nba.team_adj_def_ppp' },
  { key: 'net', label: 'Net (pts / 100 poss)', raw: 'met_nba.team_net_rtg', adj: 'met_nba.team_adj_net_ppp' },
];

/** NBA: raw efficiency ratings against the model's opponent-adjusted points per 100 possessions. */
export function nbaAdjRawRows(p: EntityProfileDoc, metrics: Map<string, MetricDef>): AdjRawRow[] {
  const rows: AdjRawRow[] = [];
  for (const pr of NBA_PAIRS) {
    const r = pick(p, pr.raw);
    const a = pick(p, pr.adj);
    if (!r && !a) continue;
    rows.push({
      key: pr.key,
      label: pr.label,
      unitMetricId: (a ?? r)!.metric_id,
      higherIsBetter: metrics.get(pr.adj)?.higher_is_better ?? metrics.get(pr.raw)?.higher_is_better ?? null,
      adjusted: a && num(a.value) != null ? side(a, a.value, true) : null,
      raw: r && num(r.value) != null ? side(r, r.value, true) : null,
      scheduleEffect: null,
      sameGames: false,
      priorHeavy: false,
    });
  }
  return rows;
}

export function adjRawRows(sport: string, p: EntityProfileDoc, metrics: Map<string, MetricDef>): AdjRawRow[] {
  if (sport === 'NHL') return nhlAdjRawRows(p, metrics);
  if (sport === 'NBA') return nbaAdjRawRows(p, metrics);
  return [];
}

export interface ShownSide {
  basis: StatMode;
  data: AdjRawSide;
  /** True when the chosen footing is not published and the other one stands in ("Raw only" / "Adjusted only"). */
  only: boolean;
  other: { basis: StatMode; data: AdjRawSide } | null;
}

/** The side the reader's choice shows first, falling back (and saying so) when it is missing. */
export function shownSide(row: AdjRawRow, mode: StatMode): ShownSide | null {
  const want = mode === 'raw' ? row.raw : row.adjusted;
  const alt: StatMode = mode === 'raw' ? 'adjusted' : 'raw';
  const altData = mode === 'raw' ? row.adjusted : row.raw;
  if (want) return { basis: mode, data: want, only: false, other: altData ? { basis: alt, data: altData } : null };
  if (altData) return { basis: alt, data: altData, only: true, other: null };
  return null;
}

/** Which footings a set of rows publishes at all: drives the toggle (no toggle when only one exists). */
export function coverage(rows: AdjRawRow[]): 'both' | 'adjusted' | 'raw' | 'none' {
  const a = rows.some((r) => r.adjusted);
  const r = rows.some((x) => x.raw);
  return a && r ? 'both' : a ? 'adjusted' : r ? 'raw' : 'none';
}
