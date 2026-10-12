// HIT RATES — how often a player's past games cleared TODAY's market line. History, not probability.
//
//   eligible game   a game the player actually played with the stat recorded: the history layer has a row for it,
//                   the stat reads a value, and he took at least one offensive snap (or, where the snap count was
//                   not joined, recorded a touch). Rows with zero offensive snaps are special-teams-only or inactive
//                   appearances: they are skipped, never counted as zeros. Games he missed have no row at all.
//   window          the last N ELIGIBLE games (N = 5, 10; spanning seasons), this season's eligible games, last
//                   season's, or every eligible game available. The n of eligible games is always reported.
//   over / under    value > line / value < line. A value equal to the line (possible only on a whole-number line)
//                   is a PUSH, counted on its own and never folded into over or under.
//
// Every comparison is with the CURRENT line: historical betting lines are not published (docs/INSIGHTS.md). The words
// are "7 of 10 over 54.5", never a percentage chance.
import type { GameLogRow } from './types';
import type { StatDef } from './stats';

export type HitWindow = 'last5' | 'last10' | 'season' | 'prior' | 'all';
export const HIT_WINDOWS: HitWindow[] = ['last5', 'last10', 'season', 'prior', 'all'];
export type LineResult = 'over' | 'under' | 'push';
export type SkipReason = 'no-offensive-snaps' | 'no-stat';

export interface GameValue {
  row: GameLogRow;
  v: number;
}
export interface GameResult extends GameValue {
  result: LineResult;
}

/** Lines and values are published to at most one decimal: compare with a tolerance so 54.5 never "equals" 54.49999. */
const EPS = 1e-9;
export function compareToLine(v: number, line: number): LineResult {
  if (Math.abs(v - line) < EPS) return 'push';
  return v > line ? 'over' : 'under';
}

/** Did he play this game on offense? Snap count first; where none was joined, any recorded touch counts. */
export function playedOffense(row: GameLogRow): boolean {
  if (row.snaps) return row.snaps.off > 0;
  return (row.passing?.att ?? 0) > 0 || (row.passing?.sacks ?? 0) > 0 || row.rushing.car > 0 || row.receiving.tgt > 0;
}

/** Why a row is not eligible for this stat, or null when it is. */
export function skipReason(row: GameLogRow, stat: StatDef): SkipReason | null {
  const v = stat.get(row);
  if (v == null || !Number.isFinite(v)) return 'no-stat';
  // A non-zero value proves he played even if the snap join missed him.
  if (v === 0 && !playedOffense(row)) return 'no-offensive-snaps';
  return null;
}

export interface Pregame {
  prior: GameLogRow[];
  current: GameLogRow[];
}

export interface HitRate {
  window: HitWindow;
  line: number;
  /** Eligible games in the window, oldest first, with their result against the line. */
  games: GameResult[];
  /** Eligible games counted (the denominator). */
  n: number;
  over: number;
  under: number;
  push: number;
  /** The window's nominal size (5 or 10), or null for a season / all window. */
  wanted: number | null;
  /** Rows inside the window's span that were skipped (no offensive snap or no stat). */
  skipped: number;
}

/** Eligible games of a window, oldest first, and the rows skipped inside its span. */
export function windowGames(rows: Pregame, stat: StatDef, w: HitWindow): { games: GameValue[]; skipped: number; wanted: number | null } {
  const pool = w === 'season' ? rows.current : w === 'prior' ? rows.prior : [...rows.prior, ...rows.current];
  const wanted = w === 'last5' ? 5 : w === 'last10' ? 10 : null;
  const games: GameValue[] = [];
  let skipped = 0;
  // Walk back from the newest game: a "last 10" is the last ten games he played, skipping rows he did not.
  for (let i = pool.length - 1; i >= 0; i--) {
    if (wanted != null && games.length >= wanted) break;
    const row = pool[i];
    if (skipReason(row, stat)) {
      skipped++;
      continue;
    }
    games.push({ row, v: stat.get(row)! });
  }
  // Skips older than the oldest counted game are outside the window's span.
  if (wanted != null && games.length >= wanted) {
    const oldest = pool.indexOf(games[games.length - 1].row);
    skipped = pool.slice(oldest).filter((r) => skipReason(r, stat)).length;
  }
  return { games: games.reverse(), skipped, wanted };
}

export function hitRate(rows: Pregame, stat: StatDef, line: number, w: HitWindow): HitRate {
  const { games, skipped, wanted } = windowGames(rows, stat, w);
  const res = games.map((g) => ({ ...g, result: compareToLine(g.v, line) }));
  return {
    window: w, line, games: res, n: res.length, wanted, skipped,
    over: res.filter((g) => g.result === 'over').length,
    under: res.filter((g) => g.result === 'under').length,
    push: res.filter((g) => g.result === 'push').length,
  };
}

/** The windows worth offering for a stat, with their eligible counts. "All" only when it adds games beyond Last 10 and spans two seasons. */
export function hitWindows(rows: Pregame, stat: StatDef): { w: HitWindow; n: number }[] {
  const out: { w: HitWindow; n: number }[] = [];
  const n = (w: HitWindow) => windowGames(rows, stat, w).games.length;
  const all = n('all');
  if (all > 0) out.push({ w: 'last5', n: Math.min(5, all) });
  if (all > 5) out.push({ w: 'last10', n: Math.min(10, all) });
  const cur = n('season');
  if (cur > 0) out.push({ w: 'season', n: cur });
  const pri = n('prior');
  if (pri > 0) out.push({ w: 'prior', n: pri });
  if (cur > 0 && pri > 0 && all > 10) out.push({ w: 'all', n: all });
  return out;
}

export function hitWindowLabel(w: HitWindow, season: number, prior: number | null): string {
  switch (w) {
    case 'last5': return 'Last 5';
    case 'last10': return 'Last 10';
    case 'season': return `${season} season`;
    case 'prior': return `${prior ?? season - 1} season`;
    default: return 'All games';
  }
}
/** Short label for segmented controls. */
export function hitWindowShort(w: HitWindow, season: number, prior: number | null): string {
  return w === 'season' ? String(season) : w === 'prior' ? String(prior ?? season - 1) : w === 'all' ? 'All' : hitWindowLabel(w, season, prior);
}

/** The line as the market writes it: "54.5", "5". */
export const lineText = (line: number) => (Number.isInteger(line) ? String(line) : String(Math.round(line * 10) / 10));

/** "7 of 10 over 54.5" — plus ", 1 push" when any game landed on a whole-number line. */
export function hitPhrase(h: Pick<HitRate, 'over' | 'n' | 'push' | 'line'>): string {
  const base = `${h.over} of ${h.n} over ${lineText(h.line)}`;
  return h.push ? `${base}, ${h.push} push${h.push > 1 ? 'es' : ''}` : base;
}

/** "Last 10: 7/10 over" — the compact form for tiles and boards. */
export function hitShort(h: Pick<HitRate, 'over' | 'n' | 'push'>, label: string): string {
  return `${label}: ${h.over}/${h.n} over${h.push ? ` · ${h.push}P` : ''}`;
}

/** A note when the window holds fewer eligible games than its name promises, or skipped rows. */
export function sampleNote(h: Pick<HitRate, 'n' | 'wanted' | 'skipped'>): string | null {
  const parts: string[] = [];
  if (h.wanted != null && h.n < h.wanted) parts.push(`only ${h.n} game${h.n === 1 ? '' : 's'} played on record`);
  if (h.skipped) parts.push(`${h.skipped} game${h.skipped === 1 ? '' : 's'} without an offensive snap skipped`);
  return parts.length ? parts.join(' · ') : null;
}
