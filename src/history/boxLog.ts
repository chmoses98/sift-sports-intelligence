// PUBLICATION BOX LOGS — the per-game tables the NHL and NBA publications ship in a player profile's
// `extensions.game_log` ({ columns, rows }), read as records, plus the hit-rate arithmetic over them.
//
//   NHL   columns game_id, date, opp, ha, type, g, a, p, sog, toi_s, …   (skaters; goalies add sa, sv, ga, start, dec)
//   NBA   columns date_et, event_id, season, season_type, team, opp, home, played, dnp_reason, min, pts, reb, ast, …
//
// Hit rates follow history/hitRate.ts: a game counts only when he played it; value > line is over, value < line is
// under, equal is a push (never folded into either side). Every comparison is with TODAY's threshold: these logs carry
// no historical line, so the words are "3 of 5 at 1+", never a probability. Nothing here is fitted or projected.
import { compareToLine, type LineResult } from './hitRate';

export type BoxRow = Record<string, unknown>;

/** The rows of a published `game_log` as records, in the order published (oldest first), or null when absent. */
export function readBoxLog(gameLog: unknown): BoxRow[] | null {
  const gl = gameLog as { columns?: unknown; rows?: unknown } | null | undefined;
  if (!gl || !Array.isArray(gl.columns) || !Array.isArray(gl.rows)) return null;
  const cols = gl.columns as string[];
  return (gl.rows as unknown[]).filter(Array.isArray).map((r) => Object.fromEntries(cols.map((c, i) => [c, (r as unknown[])[i] ?? null])));
}

export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export interface LogHit {
  /** Games counted (the denominator). */
  n: number;
  over: number;
  under: number;
  push: number;
  /** Result per counted game, oldest → newest. */
  results: LineResult[];
  /** The window's nominal size (5, 10) or null for a season window. */
  wanted: number | null;
}

/** Hits of the newest `wanted` values (all of them when null) against a line. `values` are oldest first. */
export function logHit(values: number[], line: number, wanted: number | null): LogHit {
  const vs = wanted == null ? values : values.slice(-wanted);
  const results = vs.map((v) => compareToLine(v, line));
  return {
    n: results.length, wanted, results,
    over: results.filter((r) => r === 'over').length,
    under: results.filter((r) => r === 'under').length,
    push: results.filter((r) => r === 'push').length,
  };
}

/** "3/5" with a push suffix, or an em dash when no game counts. */
export function logHitText(h: LogHit | null): string {
  if (!h || !h.n) return '—';
  return `${h.over}/${h.n}${h.push ? ` · ${h.push}P` : ''}`;
}

/** Plain, accent-free, punctuation-free form of a name, for matching a market subject to a profile. */
export function nameKey(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}
