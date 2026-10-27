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
  /** League week (NFL), when the log carries one. */
  week?: number | null;
  /** Share of the team's offensive snaps (0 to 1) and of the team's targets (0 to 1), when the log carries them (NFL history). */
  snap?: number | null;
  tgtShare?: number | null;
}

/** The locked windows: last 5, last 10, this season, games against the coming opponent, every logged game. */
export type Window = 'L5' | 'L10' | 'SEASON' | 'H2H' | 'ALL';
export const WINDOWS: Window[] = ['L5', 'L10', 'SEASON', 'H2H', 'ALL'];
export const WINDOW_N: Partial<Record<Window, number>> = { L5: 5, L10: 10 };

export interface Filters {
  /** 'home' | 'away' | null */
  site: 'home' | 'away' | null;
  /** Only games against this opponent code (the H2H window sets it implicitly). */
  opp: string | null;
  /** Days of rest: 'short' (6 or fewer), 'week' (exactly 7), 'long' (8 or more); 'normal' (7 or more) is the pre-lock value. */
  rest: 'short' | 'week' | 'long' | 'normal' | null;
  /** 'won' / 'lost' by the final margin; 'close' (margin within 8) | 'blowout' (margin beyond 14) are the pre-lock values. */
  script: 'won' | 'lost' | 'close' | 'blowout' | null;
  /** Actual minutes played at least this many. */
  minMin: number | null;
  /** Opponent tier by the opponent's current season rank for the opposing unit (needs `ctx.tierOf`). */
  tier: 'top' | 'bottom' | null;
  /** Role: 85% or more of the team's snaps, or 25% or more of its targets. */
  role: 'snaps' | 'share' | null;
}
export const NO_FILTERS: Filters = { site: null, opp: null, rest: null, script: null, minMin: null, tier: null, role: null };
export const SNAP_ROLE = 0.85;
export const SHARE_ROLE = 0.25;

export interface FilterContext {
  /** 'top' (rank 10 or better) / 'bottom' (the worst 10) for an opponent code, or null when its rank is not published. */
  tierOf?: (opp: string) => 'top' | 'bottom' | null;
}

export const filtersActive = (f: Filters) => Object.values(f).filter((x) => x != null).length;

/** A game that is missing the field a filter needs never matches that filter (it is not guessed). */
export function matchesFilters(r: Obs, f: Filters, ctx: FilterContext = {}): boolean {
  if (f.site && (r.home == null || (f.site === 'home') !== r.home)) return false;
  if (f.opp && r.opp !== f.opp) return false;
  if (f.tier) { const t = ctx.tierOf?.(r.opp) ?? null; if (t !== f.tier) return false; }
  if (f.rest) {
    if (r.rest == null) return false;
    const ok = f.rest === 'short' ? r.rest <= 6 : f.rest === 'week' ? r.rest === 7 : f.rest === 'long' ? r.rest >= 8 : r.rest >= 7;
    if (!ok) return false;
  }
  if (f.script) {
    if (r.margin == null) return false;
    const ok = f.script === 'won' ? r.margin > 0 : f.script === 'lost' ? r.margin < 0 : f.script === 'close' ? Math.abs(r.margin) <= 8 : Math.abs(r.margin) > 14;
    if (!ok) return false;
  }
  if (f.role === 'snaps' && (r.snap == null || r.snap < SNAP_ROLE)) return false;
  if (f.role === 'share' && (r.tgtShare == null || r.tgtShare < SHARE_ROLE)) return false;
  if (f.minMin != null && (r.min == null || r.min < f.minMin)) return false;
  return true;
}

export function applyFilters(rows: Obs[], f: Filters, ctx: FilterContext = {}): Obs[] {
  return rows.filter((r) => matchesFilters(r, f, ctx));
}

/**
 * The pool a window defines, oldest first: the last N games, this season's, those against `opp`, or every logged game.
 * Filters then narrow WITHIN the window (the locked design: "L10 + Away" is the away games among the last ten).
 */
export function sliceWindow(rows: Obs[], w: Window, opp: string | null, season: string | null): Obs[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  if (w === 'H2H') return sorted.filter((r) => opp != null && r.opp === opp);
  if (w === 'SEASON') return sorted.filter((r) => season == null || r.season === season);
  if (w === 'ALL') return sorted;
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

/** A gap longer than this is an offseason (or a missed season), not days of rest: such a game has no rest figure. */
export const MAX_REST_DAYS = 21;

/** Fill each row's rest days from the previous row's date. Rows must be sorted oldest first. */
export function withRest(rows: Omit<Obs, 'rest'>[]): Obs[] {
  const out: Obs[] = [];
  rows.forEach((r, i) => {
    const prev = i ? Date.parse(rows[i - 1].date) : NaN;
    const days = Number.isFinite(prev) ? Math.round((Date.parse(r.date) - prev) / 864e5) : null;
    out.push({ ...r, rest: days != null && days <= MAX_REST_DAYS ? days : null });
  });
  return out;
}
