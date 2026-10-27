// The History lane: observed frequency over a player's last games. Pure functions over a game log; the log itself is fetched lazily for
// the rows on screen (history/bank.ts), never for every player up front. A rung's History is "hits of the shown window" ("5/10"), an
// observed count, never a probability.
import { windowGames } from '../../../history/hitRate';
import { nhlPregame } from '../../../history/nhlProps';
import { num, type BoxRow } from '../../../history/boxLog';
import { pregameRows, statDef } from '../../../history/stats';
import type { PlayerHistoryDoc } from '../../../history/types';
import type { HistorySpec } from './types';

/** The shown window: the last ten games he played. */
export const HISTORY_GAMES = 10;

/** The raw per-player log a prop's History reads from. */
export type PlayerLog = { kind: 'nfl'; doc: PlayerHistoryDoc } | { kind: 'nhl'; rows: BoxRow[] };

/** His last `n` eligible values of one statistic before this kickoff, oldest first. Empty when the log cannot measure it. */
export function recentValues(log: PlayerLog, spec: HistorySpec, kickoffIso: string, n = HISTORY_GAMES): number[] {
  if (log.kind === 'nfl' && spec.kind === 'nfl') {
    const def = statDef(spec.stat);
    if (!def) return [];
    const { games } = windowGames(pregameRows(log.doc, kickoffIso, null), def, 'all');
    return games.map((g) => g.v).slice(-n);
  }
  if (log.kind === 'nhl' && spec.kind === 'nhl') {
    const vals = nhlPregame(log.rows, kickoffIso).map((r) => num(r[spec.col])).filter((v): v is number => v != null);
    return vals.slice(-n);
  }
  return [];
}

/** How many of the shown games reached this rung. */
export const hitsAt = (values: number[], k: number) => values.filter((v) => v >= k).length;

/** The hits of the newest `window` games (5 or 10) at a rung, or null when the window has no games. */
export function hitCount(values: number[], k: number, window: 5 | 10 = 10): { h: number; n: number } | null {
  const vs = values.slice(-window);
  return vs.length ? { h: hitsAt(vs, k), n: vs.length } : null;
}
