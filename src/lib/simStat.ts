// One number for a simulated NFL stat on the pages that read the established simulation directly (Player, Market, Compare,
// Depth chart): they ask here instead of reading the simulation's observation, so a stat whose approved engine is the
// Projection Foundation model never shows the established simulation's number, range or fair price beside it.
//
//   * the stat's approved engine is the established model → its observation, as the page always showed it;
//   * the approved engine is the Projection Foundation model and its projection passes every check → that projection's mean,
//     range, quantiles and rung probabilities (the established values are not shown);
//   * the projection is withheld → no number from either engine, only the reason;
//   * missing / stale / unpublished feed → the approved established-model fallback, only if it passes its own checks
//     (lib/projectionFallback.ts), still as the one number.
// The selection is lib/projectionAuthority.ts. Betting authority is untouched: nothing here prices or recommends.
import type { Distribution } from '../contract/types';
import { thresholdProbability, usesEstablished, type ProjectionAuthority, type Resolution } from './projectionAuthority';
import type { LegacyCandidate } from './projectionFallback';
import type { Quantiles } from './projections';

/** The established simulation's five quantiles (the `football_p*` extensions of a `met_nfl.sim_*` observation). */
export interface SimQuantiles { p05: number; p25: number; p50: number; p75: number; p95: number }

/** The part of a simulation observation (or a `Distribution`, see `obsFromDistribution`) the established number is read from. */
export interface SimObs { value: number | null; as_of?: string | null; extensions?: Record<string, unknown> | null }

/** An established simulation `Distribution` row (event research) in the shape of a `met_nfl.sim_*` observation. */
export function obsFromDistribution(d: Pick<Distribution, 'mean' | 'quantiles' | 'generated_at'> | undefined, fallbackAsOf: string | null | undefined = null): SimObs | undefined {
  if (!d || d.mean == null) return undefined;
  const q = d.quantiles ?? {};
  return { value: d.mean, as_of: d.generated_at ?? fallbackAsOf, extensions: q.p50 != null ? { football_p05: q.p05, football_p25: q.p25, football_p50: q.p50, football_p75: q.p75, football_p95: q.p95 } : null };
}

export function establishedQuantiles(o: SimObs | undefined): SimQuantiles | null {
  const x = (o?.extensions ?? {}) as Record<string, number>;
  if (x.football_p50 == null) return null;
  return { p05: x.football_p05, p25: x.football_p25, p50: x.football_p50, p75: x.football_p75, p95: x.football_p95 };
}

export type SimView =
  /** the page's feed is still loading: show nothing rather than a number the loaded feed would replace */
  | { state: 'loading' }
  /** neither engine has a number for this player and stat */
  | { state: 'none' }
  | { state: 'withheld'; reason: string }
  | {
    state: 'shown';
    /** 'projection' = the Projection Foundation model's number; 'established' = the established model's (its own stat, or an approved fallback) */
    engine: 'projection' | 'established';
    value: number;
    /** five-quantile range for the existing charts; null when the selected projection publishes no quantiles */
    q: SimQuantiles | null;
    /** seven published quantiles of a promoted projection, when it has them */
    distribution: Quantiles | null;
    /** the selected projection's 80% prediction range (p10–p90), when published */
    band: { lo: number; hi: number } | null;
    /** P(stat ≥ k) from the selected projection's distribution: a number, or null (no line on its ladder). undefined = the page keeps its established fair price. */
    probAtLeast: (k: number) => number | null | undefined;
    resolution: Resolution;
  };

export interface SimQuery {
  stat: string;
  obs?: SimObs;
  playerId?: string | null;
  name?: string | null;
  team?: string | null;
  opponent?: string | null;
  gameId?: string | null;
  /** the injury designation listed for the player (checked before the established fallback), null = none */
  designation?: string | null;
  /** the stat's main market line (checked against the established range before the fallback) */
  line?: number | null;
}

/**
 * The one number for a simulated stat. `authority` is null while the feed loads (`ready` false) or for a sport without a
 * projection feed; pass `ready` so a page never flashes the established number the loaded feed would replace.
 */
export function simView(authority: ProjectionAuthority | null, ready: boolean, a: SimQuery): SimView {
  const q = establishedQuantiles(a.obs);
  const established = (resolution: Resolution): SimView => a.obs?.value == null
    ? { state: 'none' }
    : { state: 'shown', engine: 'established', value: a.obs.value, q, distribution: null, band: null, probAtLeast: () => undefined, resolution };
  if (!ready) return { state: 'loading' };
  if (!authority) return established({ kind: 'legacy' });
  const candidate: LegacyCandidate | null = a.obs?.value != null
    ? { mean: a.obs.value, interval: q ? { lo: q.p05, hi: q.p95 } : null, generatedAt: a.obs.as_of ?? null, designation: a.designation ?? null, line: a.line ?? null, checkLine: true }
    : null;
  const res = authority.resolve({ stat: a.stat, playerId: a.playerId, name: a.name, team: a.team, opponent: a.opponent, gameId: a.gameId }, candidate);
  if (usesEstablished(res)) return established(res);
  if (res.kind === 'withheld') return { state: 'withheld', reason: res.reason };
  if (res.kind !== 'authoritative') return { state: 'none' };
  const v = res.value;
  const d = v.quantiles;
  return {
    state: 'shown', engine: 'projection', value: v.mean,
    q: d ? { p05: d.p05, p25: d.p25, p50: d.p50, p75: d.p75, p95: d.p95 } : null,
    distribution: d,
    band: d?.p10 != null && d.p90 != null ? { lo: d.p10, hi: d.p90 } : v.p10 != null && v.p90 != null ? { lo: v.p10, hi: v.p90 } : null,
    probAtLeast: (k) => thresholdProbability(v, k), resolution: res,
  };
}

/** The shown number of a view, or null. */
export const simValue = (v: SimView): number | null => (v.state === 'shown' ? v.value : null);
