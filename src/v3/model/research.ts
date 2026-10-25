// The player-research engine: pure functions over observed games. Every number the chart, the summary strip, the game log and the
// Replay show comes from these, so changing a stat, line, window or filter moves them all together. History, never a forecast:
// a hit is "the observed value cleared TODAY's line", counted in games, with pushes kept apart.

export interface Obs {
  key: string;
  /** YYYY-MM-DD */
  date: string;
  opp: string;
  home: boolean | null;
  v: Record<string, number | null>;
  /** Minutes actually played (null when the source has none). */
  min: number | null;
  /** Final margin from the player's team side (positive = won), when the source has the score. */
  margin: number | null;
  /** Days since the team's previous game. */
  rest: number | null;
  season: string | null;
  /** The slate event id when the game is a published event. */
  eventId: string | null;
  label: string;
}

export type Window = 'L5' | 'L10' | 'L20' | 'SEASON' | 'H2H';
export const WINDOWS: Window[] = ['L5', 'L10', 'L20', 'SEASON', 'H2H'];
export const WINDOW_N: Partial<Record<Window, number>> = { L5: 5, L10: 10, L20: 20 };

export interface Filters {
  /** 'home' | 'away' | null */
  site: 'home' | 'away' | null;
  /** Only games against this opponent code (the H2H window sets it implicitly). */
  opp: string | null;
  /** Days of rest: 'short' (<=6), 'normal' (>=7) */
  rest: 'short' | 'normal' | null;
  /** 'close' (margin within 8) | 'blowout' (margin beyond 14) */
  script: 'close' | 'blowout' | null;
  /** Actual minutes played at least this many. */
  minMin: number | null;
}
export const NO_FILTERS: Filters = { site: null, opp: null, rest: null, script: null, minMin: null };

export const filtersActive = (f: Filters) => Object.values(f).filter((x) => x != null).length;

export function applyFilters(rows: Obs[], f: Filters): Obs[] {
  return rows.filter((r) => {
    if (f.site && (r.home == null || (f.site === 'home') !== r.home)) return false;
    if (f.opp && r.opp !== f.opp) return false;
    if (f.rest && (r.rest == null || (f.rest === 'short' ? r.rest > 6 : r.rest < 7))) return false;
    if (f.script && (r.margin == null || (f.script === 'close' ? Math.abs(r.margin) > 8 : Math.abs(r.margin) <= 14))) return false;
    if (f.minMin != null && (r.min == null || r.min < f.minMin)) return false;
    return true;
  });
}

/** The games a window shows, oldest first: the last N of the (filtered) games, this season's, or only those against `opp`. */
export function sliceWindow(rows: Obs[], w: Window, opp: string | null, season: string | null): Obs[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  if (w === 'H2H') return sorted.filter((r) => opp != null && r.opp === opp);
  if (w === 'SEASON') return sorted.filter((r) => season == null || r.season === season);
  return sorted.slice(-(WINDOW_N[w] ?? 10));
}

export type Result = 'over' | 'under' | 'push';
export const resultOf = (v: number, line: number): Result => (Math.abs(v - line) < 1e-9 ? 'push' : v > line ? 'over' : 'under');

export interface Summary { n: number; over: number; under: number; push: number; mean: number | null; median: number | null; vsLine: number | null }

export function summarize(rows: Obs[], stat: string, line: number | null): Summary {
  const vals = rows.map((r) => r.v[stat]).filter((x): x is number => x != null);
  const sorted = [...vals].sort((a, b) => a - b);
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
  const res = line == null ? [] : vals.map((v) => resultOf(v, line));
  return {
    n: vals.length, over: res.filter((x) => x === 'over').length, under: res.filter((x) => x === 'under').length, push: res.filter((x) => x === 'push').length,
    mean, median, vsLine: mean != null && line != null ? mean - line : null,
  };
}

/** A reference line when no market exists: the median, rounded to a half point. Labelled as a reference, never as a price. */
export const referenceLine = (rows: Obs[], stat: string): number | null => {
  const s = summarize(rows, stat, null);
  return s.median == null ? null : Math.round(s.median * 2) / 2 + (Number.isInteger(Math.round(s.median * 2) / 2) ? 0.5 : 0);
};

/** A small sample is warned about, never hidden. */
export const smallSample = (n: number) => n < 8;

/** Fill each row's rest days from the previous row's date. Rows must be sorted oldest first. */
export function withRest(rows: Omit<Obs, 'rest'>[]): Obs[] {
  const out: Obs[] = [];
  rows.forEach((r, i) => {
    const prev = i ? Date.parse(rows[i - 1].date) : NaN;
    const days = Number.isFinite(prev) ? Math.round((Date.parse(r.date) - prev) / 864e5) : null;
    out.push({ ...r, rest: days });
  });
  return out;
}
