// Deterministic freshness (contract freshness.py). A component is FRESH while younger than
// fresh_after, AGING until stale_after, STALE after that, UNKNOWN without a timestamp.
import type { FreshnessState, Thresholds } from './types';

export const DEFAULT_THRESHOLDS: Record<string, Thresholds> = {
  market_data: { fresh_after_seconds: 15 * 60, stale_after_seconds: 60 * 60 },
  model: { fresh_after_seconds: 60 * 60, stale_after_seconds: 6 * 60 * 60 },
  schedule: { fresh_after_seconds: 24 * 3600, stale_after_seconds: 72 * 3600 },
  recommendations: { fresh_after_seconds: 60 * 60, stale_after_seconds: 6 * 60 * 60 },
  export: { fresh_after_seconds: 30 * 60, stale_after_seconds: 3 * 60 * 60 },
  router: { fresh_after_seconds: 30 * 60, stale_after_seconds: 4 * 60 * 60 },
  settlement: { fresh_after_seconds: 24 * 3600, stale_after_seconds: 72 * 3600 },
};

export function parseTs(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : ms;
}

export function ageSeconds(asOf: string | null | undefined, now: string | number | Date): number | null {
  const t = parseTs(asOf);
  if (t == null) return null;
  const n = typeof now === 'number' ? now : now instanceof Date ? now.getTime() : Date.parse(now);
  return (n - t) / 1000;
}

export function classify(age: number | null, th: Thresholds): FreshnessState {
  if (age == null) return 'UNKNOWN';
  if (age < 0) return 'FRESH';
  if (age <= th.fresh_after_seconds) return 'FRESH';
  if (age <= th.stale_after_seconds) return 'AGING';
  return 'STALE';
}

export function statusFor(
  asOf: string | null | undefined,
  component: string,
  now: string | number | Date,
  thresholds?: Thresholds,
): FreshnessState {
  const th = thresholds ?? DEFAULT_THRESHOLDS[component];
  // A component Sift has no freshness policy for (a sport's health manifest can list its own, without thresholds):
  // its age cannot be judged, so it is UNKNOWN — never a crash, never a guessed FRESH.
  if (!th) return 'UNKNOWN';
  return classify(ageSeconds(asOf, now), th);
}

const ORDER: Record<string, number> = { FRESH: 0, AGING: 1, STALE: 2, UNKNOWN: 3 };

/** The least fresh of several states (UNKNOWN is worse than STALE). Python max() keeps the first maximum. */
export function worst(...states: string[]): FreshnessState {
  if (!states.length) return 'UNKNOWN';
  let best = states[0];
  for (const s of states) if ((ORDER[s] ?? 3) > (ORDER[best] ?? 3)) best = s;
  return best as FreshnessState;
}
