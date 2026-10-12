// NBA PLAYER HISTORY FROM THE PUBLICATION (backlog 1.1 and 1.2). The NBA profile ships two tables:
//   extensions.game_log   the last 82 team games with a box-score row (DNP rows included): min, pts, reb, ast, fg3m, …
//   extensions.prop_log   Kalshi player-prop lines that were actually posted (one per player-game, the rung nearest
//                         50¢): the line, the over's mid and executable YES ask 30 minutes before tip, and the outcome
//                         (1 = the over settled YES).
// Averages here are plain arithmetic over games he played; the posted-line record counts settled lines. Neither is a
// probability or a projection, and nothing is fitted.
import { num, type BoxRow } from './boxLog';

export const NBA_PROP_STATS = ['pts', 'reb', 'ast', 'fg3m'] as const;
export type NbaPropStat = (typeof NBA_PROP_STATS)[number];
export const NBA_STAT_LABEL: Record<string, string> = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', fg3m: '3-pointers made', min: 'Minutes' };

/** Rows of games he played (box-score minutes), oldest first. */
export const nbaPlayed = (rows: BoxRow[]) => rows.filter((r) => r.played === true || (r.played == null && (num(r.min) ?? 0) > 0));

/** The newest season in the log ("2025-26"), or null. */
export function nbaLatestSeason(rows: BoxRow[]): string | null {
  const s = rows.map((r) => r.season).filter((x): x is string => typeof x === 'string').sort();
  return s.length ? s[s.length - 1] : null;
}

export interface NbaAverages {
  season: string;
  games: number;
  avg: Record<string, number | null>;
}

/** Per-game averages over the regular-season games he played in a season (playoffs and preseason left out). */
export function nbaSeasonAverages(rows: BoxRow[], season: string, cols: string[] = ['min', ...NBA_PROP_STATS]): NbaAverages {
  const games = nbaPlayed(rows).filter((r) => r.season === season && r.season_type === 'regular');
  const avg: Record<string, number | null> = {};
  for (const c of cols) {
    const vs = games.map((r) => num(r[c])).filter((v): v is number => v != null);
    avg[c] = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
  }
  return { season, games: games.length, avg };
}

export interface PostedLine {
  tip: string;
  eventId: string;
  stat: string;
  line: number;
  mid: number | null;
  ask: number | null;
  /** 1 = over settled YES, 0 = NO, null = not settled. */
  outcome: number | null;
}

/** The posted-line table as records, newest first. */
export function readPropLog(propLog: unknown): PostedLine[] {
  const pl = propLog as { columns?: unknown; rows?: unknown } | null | undefined;
  if (!pl || !Array.isArray(pl.columns) || !Array.isArray(pl.rows)) return [];
  const c = pl.columns as string[];
  const ix = (k: string) => c.indexOf(k);
  const out: PostedLine[] = [];
  for (const r of pl.rows as unknown[][]) {
    if (!Array.isArray(r)) continue;
    const line = num(r[ix('line')]);
    const tip = r[ix('tip_utc')];
    const stat = r[ix('stat')];
    if (line == null || typeof tip !== 'string' || typeof stat !== 'string') continue;
    const o = num(r[ix('outcome')]);
    out.push({ tip, eventId: String(r[ix('event_id')] ?? ''), stat, line, mid: num(r[ix('mid_t30m')]), ask: num(r[ix('exec_yes_t30m')]), outcome: o === 1 || o === 0 ? o : null });
  }
  return out.sort((a, b) => b.tip.localeCompare(a.tip));
}

export interface PostedRecord {
  stat: string;
  /** Settled posted lines (the denominator). */
  n: number;
  over: number;
  under: number;
  avgLine: number | null;
  /** Mean of the over's mid 30 minutes before tip, over the settled lines that carry one, and how many do. */
  avgMid: number | null;
  midN: number;
}

/** Over/under record against the lines actually posted, per stat (only stats with a settled line). */
export function postedRecord(lines: PostedLine[]): PostedRecord[] {
  const out: PostedRecord[] = [];
  for (const stat of NBA_PROP_STATS) {
    const xs = lines.filter((l) => l.stat === stat && l.outcome != null);
    if (!xs.length) continue;
    const mids = xs.map((l) => l.mid).filter((v): v is number => v != null);
    out.push({
      stat, n: xs.length,
      over: xs.filter((l) => l.outcome === 1).length,
      under: xs.filter((l) => l.outcome === 0).length,
      avgLine: xs.reduce((a, l) => a + l.line, 0) / xs.length,
      avgMid: mids.length ? mids.reduce((a, b) => a + b, 0) / mids.length : null,
      midN: mids.length,
    });
  }
  return out;
}
