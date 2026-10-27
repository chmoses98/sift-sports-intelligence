// Stat Detail's pure model: everything the four tabs derive from published documents, with no React, no fetching and no clock. Every
// value comes from a ranking, a team profile, a series or a metric definition; a value the publication does not carry is null and
// the screen prints "—" or a locked row. Raw and opponent-adjusted statistics are separate statistics: nothing here combines them.
import type { MetricDef, SeriesDoc } from '../../contract/types';
import { defaultWindow, percentileOf, seasonOfDate, shortMetricId } from '../data/research/normalize';
import type { RankingCatalog, RankingEntryVM, RankingVM, TeamProfile, WindowObs } from '../data/research/types';
import { statDecl, type CompareGroup, type Role } from './statDecl';

// ------------------------------------------------------------------ windows

const SEASON_LIKE = /^\d{4}(-\d{2})?$/;

/** "SEASON" to "Season", "L6" to "Last 6", "2026-27" to "2026–27". Anything else is the publication's label as it stands. */
export function windowLabel(label: string): string {
  if (label === 'SEASON') return 'Season';
  if (label === 'ADJ_RIDGE') return 'Adjusted';
  const l = /^L(\d+)$/.exec(label);
  if (l) return `Last ${l[1]}`;
  if (SEASON_LIKE.test(label)) return label.replace('-', '–');
  return label;
}

/** The window as a sentence ("Three-season weighted rating"), only where the registry's own description states it. */
export function windowSentence(label: string, def?: Pick<MetricDef, 'description'>): string {
  if (label === 'ADJ_RIDGE') return /3-season window/i.test(def?.description ?? '') ? 'Three-season weighted rating' : 'Opponent-adjusted rating';
  if (label === 'SEASON') return 'Current season';
  const l = /^L(\d+)$/.exec(label);
  if (l) return `Last ${l[1]} games`;
  if (SEASON_LIKE.test(label)) return `${label.replace('-', '–')} season`;
  return label;
}

const windowRank = (w: string): number => {
  if (w === 'ADJ_RIDGE') return 0;
  if (w === 'SEASON') return 1;
  if (SEASON_LIKE.test(w)) return 2;
  if (/^L\d+$/.test(w)) return 3;
  return 4;
};

/** Windows in the order the screen lists them: adjusted rating, season, season labels newest first, then the last-N windows by length. */
export function orderWindows(labels: string[]): string[] {
  return [...labels].sort((a, b) => {
    const d = windowRank(a) - windowRank(b);
    if (d) return d;
    if (SEASON_LIKE.test(a)) return b.localeCompare(a);
    if (/^L\d+$/.test(a)) return Number(a.slice(1)) - Number(b.slice(1));
    return a.localeCompare(b);
  });
}

// ------------------------------------------------------------------ which ranking is this

export type Resolution =
  | { ok: true; metricId: string; id: string; windows: string[]; window: string; requested: string | null; fellBack: boolean; rankingId: string; legacy: boolean }
  | { ok: false; reason: 'unknown' };

/**
 * (statistic, window) to the ranking document, through the catalog the team profiles' own ranking lists build (never by matching labels).
 *  - `statId` is the short id ("adj_off_epa"); a full metric id is accepted; a RANKING id ("rnk_...", the first build's address)
 *    resolves through the catalog and is flagged `legacy` so the screen can canonicalise the address.
 *  - A window the statistic does not have falls back to the sport's default window and says so (`fellBack`).
 */
export function resolveStat(catalog: RankingCatalog, statId: string, win: string | null, prefer: string[] = []): Resolution {
  let metricId: string | undefined;
  let legacyWindow: string | null = null;
  let legacy = false;
  if (/^rnk_/.test(statId)) {
    const hit = catalog.byRanking.get(statId);
    if (hit) { metricId = hit.metricId; legacyWindow = hit.window; legacy = true; }
  } else {
    metricId = [...catalog.windows.keys()].find((m) => m === statId || shortMetricId(m) === shortMetricId(statId));
  }
  if (!metricId) return { ok: false, reason: 'unknown' };
  const byWindow = catalog.windows.get(metricId);
  if (!byWindow || !byWindow.size) return { ok: false, reason: 'unknown' };
  const windows = orderWindows([...byWindow.keys()]);
  const wanted = legacyWindow ?? win;
  const fellBack = wanted != null && !byWindow.has(wanted);
  const window = wanted != null && byWindow.has(wanted) ? wanted : defaultWindow(windows, prefer) ?? windows[0];
  return { ok: true, metricId, id: shortMetricId(metricId), windows, window, requested: wanted, fellBack, rankingId: byWindow.get(window)!, legacy };
}

// ------------------------------------------------------------------ values

const minus = (n: number) => (n < 0 ? '−' : '+');
const signed = (v: number, d: number) => (Math.abs(v) < 0.5 * 10 ** -d ? (0).toFixed(d) : `${minus(v)}${Math.abs(v).toFixed(d)}`);

/** A statistic's value as the screen prints it, by the unit the registry publishes. A missing value is "—". */
export function fmtValue(v: number | null | undefined, unit: string | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const u = (unit ?? '').toLowerCase();
  if (u === 'share' || u === 'rate' || u === 'pct') return `${(v * 100).toFixed(1)}%`;
  if (u.includes('epa') || u.includes('deviation')) return signed(v, 3);
  if (u.includes('pct points') || u.includes('percent')) return signed(v, 1);
  if (u === 'multiplier') return v.toFixed(3);
  if (u === 'points' || u === 'yards' || u === 'plays') return v.toFixed(1);
  if (u.includes('goals') || u.includes('xg')) return v.toFixed(2);
  if (Math.abs(v) >= 100) return String(Math.round(v));
  return String(Math.round(v * 100) / 100);
}

/** The short label above a bar: no unit decoration, at most three characters of precision. */
export function fmtBar(v: number | null | undefined, unit: string | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '';
  const u = (unit ?? '').toLowerCase();
  if (u === 'share' || u === 'rate' || u === 'pct') return String(Math.round(v * 100));
  if (u.includes('epa') || u.includes('deviation')) return v.toFixed(2).replace('-', '−');
  if (Math.abs(v) >= 10 || Number.isInteger(v)) return String(Math.round(v));
  return v.toFixed(1).replace('-', '−');
}

/** The registry's value for an entry: the adjusted figure for an adjusted statistic, otherwise the raw one. Never both. */
export const entryValue = (e: Pick<RankingEntryVM, 'value' | 'adjusted'>, adjusted: boolean): number | null => (adjusted ? e.adjusted ?? e.value : e.value ?? e.adjusted);

export const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`; };

// ------------------------------------------------------------------ ranking

export interface RankedTeam { rank: number; code: string; name: string; entityId: string; value: number | null; percentile: number | null }

export function rankedTeams(r: RankingVM): RankedTeam[] {
  return r.entries
    .map((e) => ({ rank: e.rank, code: e.code, name: e.name, entityId: e.entityId, value: entryValue(e, r.adjusted), percentile: percentileOf(e.rank, r.n) }))
    .sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code));
}

export type RankRow = { type: 'row'; team: RankedTeam } | { type: 'gap'; count: number };

/**
 * Which rows the ranked list shows: the leaders, the selected team with the teams either side of it, and the next opponent, with a
 * "N more teams" gap wherever the ranks skip. Every team when `all`.
 */
export function visibleRows(teams: RankedTeam[], o: { sel: string | null; opp: string | null; all: boolean; top?: number }): RankRow[] {
  const top = o.top ?? 5;
  const idx = (code: string | null) => (code ? teams.findIndex((t) => t.code === code) : -1);
  const want = new Set<number>();
  if (o.all) teams.forEach((_, i) => want.add(i));
  else {
    for (let i = 0; i < Math.min(top, teams.length); i++) want.add(i);
    const s = idx(o.sel);
    if (s >= 0) [s - 1, s, s + 1].forEach((i) => { if (i >= 0 && i < teams.length) want.add(i); });
    const p = idx(o.opp);
    if (p >= 0) want.add(p);
  }
  const out: RankRow[] = [];
  let skipped = 0;
  teams.forEach((t, i) => {
    if (want.has(i)) {
      if (skipped) { out.push({ type: 'gap', count: skipped }); skipped = 0; }
      out.push({ type: 'row', team: t });
    } else skipped++;
  });
  if (skipped) out.push({ type: 'gap', count: skipped });
  return out;
}

/** A bar's length as a share of the league spread, best at full length; never zero so the lowest team still shows. */
export function barShare(v: number | null, lo: number, hi: number, higherIsBetter: boolean | null): number {
  if (v == null || hi === lo) return 0.04;
  const s = higherIsBetter === false ? (hi - v) / (hi - lo) : (v - lo) / (hi - lo);
  return Math.max(0.04, Math.min(1, s));
}

export function spreadOf(teams: RankedTeam[]): { lo: number; hi: number } | null {
  const vs = teams.map((t) => t.value).filter((v): v is number => v != null);
  return vs.length ? { lo: Math.min(...vs), hi: Math.max(...vs) } : null;
}

/** Entries' sample sizes as "9 to 13 g" (or "13 g"); null when the publication states none. */
export function sampleSpan(r: RankingVM): string | null {
  const s = r.entries.map((e) => e.sample).filter((x): x is number => x != null);
  if (!s.length) return null;
  const lo = Math.min(...s), hi = Math.max(...s);
  return lo === hi ? `${lo} g` : `${lo} to ${hi} g`;
}

/** "28 teams in the current packet" when the publication's universe says so, else "32 teams · 2026-27 regular season". */
export function universeNote(label: string, n: number): string {
  if (/current packet/i.test(label)) return `${n} teams in the current packet`;
  const tail = label.includes(', ') ? label.slice(label.indexOf(', ') + 2) : '';
  return tail ? `${n} teams · ${tail}` : `${n} teams`;
}

export interface SeasonPair { from: { window: string; obs: WindowObs }; to: { window: string; obs: WindowObs } }

/**
 * The selected team's rank in two consecutive published seasons of a statistic (hockey: 2025-26 and 2026-27), from its own profile.
 * `to` is the open window when it is a season, else the newest season; `from` is the season before it. Null unless both are ranked.
 */
export function seasonPair(windows: Record<string, WindowObs> | undefined, open: string): SeasonPair | null {
  const seasons = Object.keys(windows ?? {}).filter((w) => SEASON_LIKE.test(w) && windows![w].rank != null).sort();
  if (!windows || seasons.length < 2) return null;
  const to = SEASON_LIKE.test(open) && seasons.includes(open) ? open : seasons[seasons.length - 1];
  const i = seasons.indexOf(to);
  if (i < 1) return null;
  return { from: { window: seasons[i - 1], obs: windows[seasons[i - 1]] }, to: { window: to, obs: windows[to] } };
}

// ------------------------------------------------------------------ dot plot

export interface Dot { code: string; cx: number; cy: number }

/**
 * A beeswarm of every team on the value axis (best on the right whichever way the statistic runs): dots keep their true x and stack
 * upward where they would overlap. Deterministic; `hit` finds the dot nearest a point for tapping.
 */
export function swarmLayout(items: { code: string; v: number | null }[], o: { higherIsBetter: boolean | null; w?: number; h?: number }): { dots: Dot[]; x: (v: number) => number; lo: number; hi: number } {
  const w = o.w ?? 330, h = o.h ?? 74;
  const vs = items.map((i) => i.v).filter((v): v is number => v != null);
  const lo = vs.length ? Math.min(...vs) : 0, hi = vs.length ? Math.max(...vs) : 0;
  const span = hi - lo || 1;
  const x = (v: number) => 12 + (w - 24) * (o.higherIsBetter === false ? (hi - v) / span : (v - lo) / span);
  const base = h - 26;
  const placed: Dot[] = [];
  [...items.filter((i) => i.v != null)].sort((a, b) => x(a.v!) - x(b.v!) || a.code.localeCompare(b.code)).forEach((i) => {
    const cx = x(i.v!);
    let cy = base;
    for (let k = 0; k < 8; k++) {
      cy = base - k * 8.6;
      if (!placed.some((p) => Math.hypot(p.cx - cx, p.cy - cy) < 8.4)) break;
    }
    placed.push({ code: i.code, cx, cy });
  });
  return { dots: placed, x, lo, hi };
}

/** The dot nearest (px, py) within `radius` (in the plot's own units), or null. */
export function nearestDot(dots: Dot[], px: number, py: number, radius = 22): Dot | null {
  let best: Dot | null = null, bd = radius;
  for (const d of dots) { const dd = Math.hypot(d.cx - px, d.cy - py); if (dd <= bd) { bd = dd; best = d; } }
  return best;
}

// ------------------------------------------------------------------ trend

export interface SeriesPt { i: number; t: string; x: string; value: number; rolling: number | null; eventId: string | null; opponentId: string | null; season: string }

/** A series' observations that have a value, oldest first; `i` is the position in that list (the address's `obs`). */
export function seriesPoints(doc: SeriesDoc, slug: string, adjusted = false): SeriesPt[] {
  return doc.points
    .map((p) => ({ p, v: adjusted ? p.adjusted_value ?? p.value : p.value ?? p.adjusted_value }))
    .filter((r): r is { p: SeriesDoc['points'][number]; v: number } => r.v != null && Number.isFinite(r.v))
    .sort((a, b) => a.p.t.localeCompare(b.p.t))
    .map(({ p, v }, i) => ({ i, t: p.t, x: p.x, value: v, rolling: p.rolling_value, eventId: p.event_id, opponentId: p.opponent_id, season: seasonOfDate(slug, p.t) }));
}

export const seasonsOf = (pts: SeriesPt[]): string[] => [...new Set(pts.map((p) => p.season))].sort();

export const LAST_N = 12;
export const MAX_BARS = 20;

/** The observations a Trend cut shows: the latest games ("last"), or one season. At most MAX_BARS, the latest of them. */
export function cutPoints(pts: SeriesPt[], cut: string | null): { shown: SeriesPt[]; total: number; cut: string } {
  const seasons = seasonsOf(pts);
  const c = cut && cut !== 'last' && seasons.includes(cut) ? cut : 'last';
  const all = c === 'last' ? pts.slice(-LAST_N) : pts.filter((p) => p.season === c);
  return { shown: all.slice(-MAX_BARS), total: all.length, cut: c };
}

/** "2025–26" for the seasons a cut spans (NFL "2025" and "2026"), "2026" for one; hockey seasons keep their own span ("2025–27"). */
export function spanLabel(pts: SeriesPt[]): string {
  const seasons = seasonsOf(pts);
  if (!seasons.length) return '';
  const start = (s: string) => s.slice(0, 4);
  const end = (s: string) => (s.length > 4 ? `20${s.slice(5)}` : s);
  const a = seasons[0], b = seasons[seasons.length - 1];
  if (a === b) return a.replace('-', '–');
  return `${start(a)}–${end(b).slice(2)}`;
}

/** "Week 6" from the publication's competition text ("2026 REG week 6"); "Playoffs" for a postseason; otherwise nothing. */
export function gameTag(competition: string | null | undefined): string | null {
  const c = competition ?? '';
  const wk = /week\s*(\d+)/i.exec(c);
  if (wk) return `Week ${wk[1]}`;
  if (/playoff|post|wild card|divisional|conference|super bowl|cup final/i.test(c)) return 'Playoffs';
  return null;
}

export interface SeasonRow { season: string; games: number; avg: number | null; rank: { rank: number; n: number } | null; current: boolean }

/** Per-season averages of a series. A rank is shown only where the profile publishes a window for that season; otherwise it is null (locked). */
export function seasonRows(pts: SeriesPt[], windows: Record<string, WindowObs> | undefined, currentSeason: string | null): SeasonRow[] {
  return seasonsOf(pts).map((season) => {
    const rows = pts.filter((p) => p.season === season);
    const w = windows?.[season] ?? (season === currentSeason ? windows?.SEASON : undefined);
    return {
      season, games: rows.length, avg: rows.length ? rows.reduce((a, p) => a + p.value, 0) / rows.length : null,
      rank: w?.rank != null && w.n != null ? { rank: w.rank, n: w.n } : null,
      current: season === currentSeason,
    };
  });
}

/** Home and away averages for one season, from the series joined to the profile's games. Games with no known site are left out of both. */
export function siteSplit(pts: SeriesPt[], siteOf: (eventId: string) => boolean | null | undefined, season: string): { home: { n: number; avg: number } | null; away: { n: number; avg: number } | null } {
  const of = (home: boolean) => {
    const rows = pts.filter((p) => p.season === season && p.eventId != null && siteOf(p.eventId) === home);
    return rows.length ? { n: rows.length, avg: rows.reduce((a, p) => a + p.value, 0) / rows.length } : null;
  };
  return { home: of(true), away: of(false) };
}

// ------------------------------------------------------------------ compare (teams)

export interface CompareLine { label: string; id: string; window: string; a: WindowObs; b: WindowObs; unit: string | null; role: Role; /** true: A has the better rank; false: B; null: level. */ aBetter: boolean | null }
export interface CompareBlock { role: Role; title: string; lines: CompareLine[] }

const obsOf = (p: TeamProfile, id: string, season: string | null): { w: string; o: WindowObs; unit: string | null } | null => {
  const m = p.metrics.get(id);
  if (!m) return null;
  const w = defaultWindow(Object.keys(m.windows), season ? [season] : []);
  return w && m.windows[w] ? { w, o: m.windows[w], unit: m.unit } : null;
};

/** The comparison rows two team profiles can both fill, grouped as the sport declares. A row either team lacks is left out, never filled. */
export function compareBlocks(slug: string, a: TeamProfile, b: TeamProfile, groups: CompareGroup[] | undefined = statDecl(slug)?.compare): CompareBlock[] {
  return (groups ?? []).map((g) => ({
    role: g.role, title: g.title,
    lines: g.rows.flatMap(([label, id]): CompareLine[] => {
      const x = obsOf(a, id, a.season), y = obsOf(b, id, b.season);
      if (!x || !y || x.o.rank == null || y.o.rank == null || x.o.n == null || y.o.n == null || x.w !== y.w) return [];
      return [{ label, id, window: x.w, a: x.o, b: y.o, unit: x.unit, role: g.role, aBetter: x.o.rank === y.o.rank ? null : x.o.rank < y.o.rank }];
    }),
  })).filter((g) => g.lines.length > 0);
}

// ------------------------------------------------------------------ compare (players)

export interface PlayerSummary { n: number; avg: number | null; median: number | null; best: number | null; hits: number }

/** The last games' values, their average, median, best and how many reached `thr`. History, observed: nothing is projected. */
export function playerSummary(vals: number[], thr: number): PlayerSummary {
  if (!vals.length) return { n: 0, avg: null, median: null, best: null, hits: 0 };
  const s = [...vals].sort((a, b) => a - b);
  const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return { n: vals.length, avg: vals.reduce((a, b) => a + b, 0) / vals.length, median, best: s[s.length - 1], hits: vals.filter((v) => v >= thr).length };
}

/** A threshold to start from: the pooled median of both players' games, rounded down, never below 1. */
export function defaultThreshold(a: number[], b: number[]): number {
  const s = [...a, ...b].sort((x, y) => x - y);
  if (!s.length) return 1;
  const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return Math.max(1, Math.floor(m));
}

export const f1 = (v: number | null) => (v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1));

// ------------------------------------------------------------------ about

/**
 * A plain-language line for the About card. The registry's description is the source; the approved plain wording for the
 * opponent-adjusted ridge ratings is used only when the published description itself states the method it describes.
 */
export function briefFor(id: string, def: Pick<MetricDef, 'description'> | undefined): string {
  const d = def?.description?.trim() ?? '';
  const side = /^adj_off_/.test(id) ? 'offense' : /^adj_def_/.test(id) ? 'defense' : null;
  if (side && /weighted ridge/i.test(d) && /half-life 10 weeks/i.test(d) && /3-season window/i.test(d)) {
    return `An opponent-adjusted rating of the team’s ${side}: a weighted ridge regression over the last three seasons, with recent games counting more (half-life 10 weeks).`;
  }
  if (!d) return 'The publication gives no definition for this statistic.';
  const m = /^([\s\S]*?[a-z0-9)])\.\s+[A-Z(]/.exec(d);
  const first = m ? m[1] : d.replace(/\.$/, '');
  return `${first}.`;
}

/** The cadence in plain words: "Each publication run" when the registry says per run, otherwise its own wording. */
export const updateWord = (frequency: string | null | undefined): string | null => (frequency ? (/^per run/i.test(frequency) ? 'Each publication run' : frequency) : null);

/** Every limit the publication states for a statistic, registry first, no duplicates, verbatim. */
export function limitsOf(def: Pick<MetricDef, 'known_limitations'> | undefined, ranking: Pick<RankingVM, 'limitations'> | null): string[] {
  const out: string[] = [];
  for (const l of [...(def?.known_limitations ?? []), ...(ranking?.limitations ?? [])]) if (l && !out.includes(l)) out.push(l);
  return out;
}

export const directionWord = (hib: boolean | null) => (hib == null ? 'Descriptive' : hib ? 'Higher is better' : 'Lower is better');
