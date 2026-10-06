// Stat accessors over game logs, keyed by the same stat names the markets use (Kalshi `extensions.stat`),
// so a player page can put "this market's line" over "this stat, game by game" without translation.
// A sport plugs in by adding its own table; the screens never know which sport they draw.
import type { GameLogRow, PlayerHistoryDoc, PlayerRankEntry } from './types';

export interface StatDef {
  key: string;
  label: string;
  /** Unit word for values: "yds", "rec"… */
  unit: string;
  /** Positions this stat is a primary lens for, in priority order. */
  positions: string[];
  get: (g: GameLogRow) => number | null;
}

const td = (g: GameLogRow) => g.rushing.td + g.receiving.td;

export const NFL_STATS: StatDef[] = [
  { key: 'passing_yards', label: 'Passing yards', unit: 'yds', positions: ['QB'], get: (g) => g.passing?.yds ?? null },
  { key: 'attempts', label: 'Pass attempts', unit: 'att', positions: ['QB'], get: (g) => g.passing?.att ?? null },
  { key: 'completions', label: 'Completions', unit: 'cmp', positions: ['QB'], get: (g) => g.passing?.cmp ?? null },
  { key: 'passing_tds', label: 'Passing TDs', unit: 'TD', positions: ['QB'], get: (g) => g.passing?.td ?? null },
  { key: 'interceptions', label: 'Interceptions', unit: 'INT', positions: ['QB'], get: (g) => g.passing?.int ?? null },
  { key: 'rushing_yards', label: 'Rushing yards', unit: 'yds', positions: ['RB', 'QB', 'FB'], get: (g) => g.rushing.yds },
  { key: 'carries', label: 'Carries', unit: 'car', positions: ['RB', 'FB'], get: (g) => g.rushing.car },
  { key: 'longest_rush', label: 'Longest rush', unit: 'yds', positions: ['RB'], get: (g) => (g.rushing.car > 0 ? g.rushing.long : null) },
  { key: 'receiving_yards', label: 'Receiving yards', unit: 'yds', positions: ['WR', 'TE', 'RB'], get: (g) => g.receiving.yds },
  { key: 'receptions', label: 'Receptions', unit: 'rec', positions: ['WR', 'TE', 'RB'], get: (g) => g.receiving.rec },
  { key: 'targets', label: 'Targets', unit: 'tgt', positions: ['WR', 'TE', 'RB'], get: (g) => g.receiving.tgt },
  { key: 'longest_reception', label: 'Longest reception', unit: 'yds', positions: ['WR', 'TE'], get: (g) => (g.receiving.rec > 0 ? g.receiving.long : null) },
  { key: 'rush_rec_yards', label: 'Rush + rec yards', unit: 'yds', positions: ['RB'], get: (g) => g.rushing.yds + g.receiving.yds },
  { key: 'touchdowns', label: 'Touchdowns', unit: 'TD', positions: ['RB', 'WR', 'TE'], get: td },
];

export const statDef = (key: string | null | undefined) => NFL_STATS.find((s) => s.key === key) ?? null;

/** The stats worth offering for a position, best first. */
export function statsForPosition(pos: string): StatDef[] {
  return NFL_STATS.filter((s) => s.positions.includes(pos)).sort((a, b) => a.positions.indexOf(pos) - b.positions.indexOf(pos));
}

export interface HitRecord {
  /** Games with a value, oldest first. */
  values: { row: GameLogRow; v: number }[];
  over: number;
  under: number;
  /** Games where the value equals the line (only possible on whole-number lines). */
  push: number;
}

/** How often a stat cleared a line in the given games. `line` is the market's over line (e.g. 79.5). */
export function hitRecord(rows: GameLogRow[], stat: StatDef, line: number): HitRecord {
  const values = rows.map((row) => ({ row, v: stat.get(row) })).filter((x): x is { row: GameLogRow; v: number } => x.v != null);
  return {
    values,
    over: values.filter((x) => x.v > line).length,
    under: values.filter((x) => x.v < line).length,
    push: values.filter((x) => x.v === line).length,
  };
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Games before a given game, oldest first. The week is the reliable cut (a Monday-night kickoff is already
 * the next day in UTC); without one, games dated at least a day before the kickoff instant.
 */
export function gamesBefore(rows: GameLogRow[], beforeIso: string | null | undefined, week?: number | null): GameLogRow[] {
  if (week != null) return rows.filter((r) => r.week < week);
  if (!beforeIso) return rows;
  const cut = new Date(Date.parse(beforeIso) - 86400e3).toISOString().slice(0, 10);
  return rows.filter((r) => r.date != null && r.date < cut);
}

export interface RoleShift {
  metric: 'snap share' | 'target share' | 'carries';
  from: number;
  to: number;
  /** Week the change began. */
  sinceWeek: number;
}

/**
 * A material role change: the last two games against the games before them. Reported only when both
 * windows have games and the change is large (snap share ±15 pts, target share ±8 pts, carries ±6/game).
 */
export function roleShift(rows: GameLogRow[]): RoleShift | null {
  if (rows.length < 3) return null;
  const recent = rows.slice(-2);
  const before = rows.slice(0, -2);
  const avg = (xs: GameLogRow[], f: (g: GameLogRow) => number | null) => mean(xs.map(f).filter((v): v is number => v != null));
  const checks: [RoleShift['metric'], (g: GameLogRow) => number | null, number][] = [
    ['snap share', (g) => g.snaps?.pct ?? null, 0.15],
    ['target share', (g) => g.receiving.target_share, 0.08],
    ['carries', (g) => g.rushing.car, 6],
  ];
  for (const [metric, f, min] of checks) {
    const a = avg(before, f);
    const b = avg(recent, f);
    if (a != null && b != null && Math.abs(b - a) >= min) return { metric, from: a, to: b, sinceWeek: recent[0].week };
  }
  return null;
}

export type HistoryWindow = 'last5' | 'last10' | 'season' | 'prior';

/**
 * Every game a pregame view may use, oldest first: last season's games, then this season's games before
 * the viewed one (cut by week, see gamesBefore). Each row carries its season.
 */
export function pregameRows(doc: PlayerHistoryDoc, beforeIso: string | null | undefined, week?: number | null): { prior: GameLogRow[]; current: GameLogRow[] } {
  const current = gamesBefore(doc.games, beforeIso, week).map((r) => ({ ...r, season: r.season ?? doc.season }));
  const prior = (doc.prior?.games ?? []).map((r) => ({ ...r, season: r.season ?? doc.prior!.season }));
  return { prior, current };
}

/** The windows worth offering, in order, given what exists. */
export function windowsFor(rows: { prior: GameLogRow[]; current: GameLogRow[] }): HistoryWindow[] {
  const n = rows.prior.length + rows.current.length;
  const out: HistoryWindow[] = [];
  if (n > 0) out.push('last5');
  if (n > 5) out.push('last10');
  if (rows.current.length) out.push('season');
  if (rows.prior.length) out.push('prior');
  return out;
}

export function windowRows(rows: { prior: GameLogRow[]; current: GameLogRow[] }, w: HistoryWindow): GameLogRow[] {
  const all = [...rows.prior, ...rows.current];
  if (w === 'last5') return all.slice(-5);
  if (w === 'last10') return all.slice(-10);
  if (w === 'season') return rows.current;
  return rows.prior;
}

export function windowLabel(w: HistoryWindow, season: number, prior: number | null): string {
  return w === 'last5' ? 'Last 5' : w === 'last10' ? 'Last 10' : w === 'season' ? String(season) : String(prior ?? season - 1);
}

/** "W3", or "'25 W17" / "'25 WC" when a window mixes seasons. */
export function gameTag(r: GameLogRow, currentSeason: number): string {
  const wk = r.season_type && r.season_type !== 'REG' ? (POST_ROUND[r.week] ?? 'PO') : `W${r.week}`;
  return r.season != null && r.season !== currentSeason ? `'${String(r.season).slice(2)} ${wk}` : wk;
}
// nflverse numbers postseason weeks after the regular season (19 = Wild Card … 22 = Super Bowl).
const POST_ROUND: Record<number, string> = { 19: 'WC', 20: 'DIV', 21: 'CONF', 22: 'SB' };

/**
 * The player's rank for a stat that a pregame view may use: this season's ranking through the last week
 * before the game (never the game's own week), else last season's full ranking. Null when unranked.
 */
export function rankFor(doc: PlayerHistoryDoc, stat: string, beforeWeek: number | null, season?: 'current' | 'prior'): (PlayerRankEntry['stats'][string] & { season: number; through_week: number | null; position: string; min_games: number }) | null {
  const ranks = doc.ranks ?? [];
  if (season === 'prior') {
    const prior = ranks.find((r) => r.season !== doc.season && r.stats[stat]);
    return prior ? { ...prior.stats[stat], season: prior.season, through_week: prior.through_week, position: prior.position, min_games: prior.min_games } : null;
  }
  const now = ranks
    .filter((r) => r.season === doc.season && r.through_week != null && (beforeWeek == null || r.through_week < beforeWeek) && r.stats[stat])
    .sort((a, b) => (b.through_week ?? 0) - (a.through_week ?? 0))[0];
  const pick = now ?? ranks.find((r) => r.season !== doc.season && r.stats[stat]);
  return pick ? { ...pick.stats[stat], season: pick.season, through_week: pick.through_week, position: pick.position, min_games: pick.min_games } : null;
}

/** Words for a player's rank in a large pool (#1 = most): Top 3, Top 10, Top quarter, Bottom quarter… */
export function playerTier(rank: number, of: number): string {
  if (rank <= 3) return 'Top 3';
  if (rank <= 10) return 'Top 10';
  if (rank <= Math.ceil(of / 4)) return 'Top quarter';
  if (rank > of - Math.ceil(of / 4)) return 'Bottom quarter';
  return 'Middle of the pack';
}
