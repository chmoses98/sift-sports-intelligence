// Stat accessors over game logs, keyed by the same stat names the markets use (Kalshi `extensions.stat`),
// so a player page can put "this market's line" over "this stat, game by game" without translation.
// A sport plugs in by adding its own table; the screens never know which sport they draw.
import type { GameLogRow } from './types';

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
