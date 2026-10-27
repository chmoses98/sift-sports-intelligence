// The discovery horizon: how far ahead of kickoff Prop Discovery reads games. Pure rules, no fetching.
//
// 48 hours is the initial horizon (Kalshi lists player props close to the start, and one game's contract document is 8 KB to 50 KB on the
// wire and 0.1 to 1.3 MB of JSON to parse). 7 days and "All upcoming" are chosen by the viewer, so weekend markets are not hidden; they read
// only the EXTRA games' documents, lazily, and the control states what that costs before it is chosen. Nothing here names a sport or a game.
import type { V3Game } from '../../model/types';

export type Horizon = '48h' | '7d' | 'all';
export const HORIZONS: readonly Horizon[] = ['48h', '7d', 'all'];
export const HORIZON_LABEL: Record<Horizon, string> = { '48h': '48 hours', '7d': '7 days', all: 'All upcoming' };
export const HORIZON_MS: Record<Horizon, number> = { '48h': 48 * 3600_000, '7d': 7 * 86_400_000, all: Infinity };

/** The most games one view will read, whatever the horizon: a bound on bytes, memory and time. The control says so when it applies. */
export const MAX_GAMES = 320;

/**
 * What a game's contract document costs on the wire (gzip), estimated from the number of markets its board row lists. Measured on the
 * published documents: football, hockey, baseball and college games 100 to 125 bytes per listed market, basketball 70. This is an estimate for
 * the control's "about X MB", never a measurement; 110 is the rounded middle. A row that does not say how many markets is taken as 300.
 */
export const GZ_BYTES_PER_MARKET = 110;
export const gameCostBytes = (g: Pick<V3Game, 'item'>): number => (g.item?.markets_available ?? 300) * GZ_BYTES_PER_MARKET;

/** "1.4 MB", "820 KB": the cost as the control prints it (rounded, never falsely precise). */
export function costText(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(10, Math.round(bytes / 10_000) * 10)} KB`;
}

/** True when a game can hold a player ladder at all and starts inside the horizon. */
export const startsWithin = (g: Pick<V3Game, 'startMs'>, now: number, h: Horizon): boolean => g.startMs - now <= HORIZON_MS[h];

export interface HorizonCount { games: number; bytes: number }

/** For each horizon: how many eligible games it holds and what reading all of them would cost (cumulative, so "7 days" includes the first 48 hours). */
export function horizonCounts(eligible: V3Game[], now: number): Record<Horizon, HorizonCount> {
  const out: Record<Horizon, HorizonCount> = { '48h': { games: 0, bytes: 0 }, '7d': { games: 0, bytes: 0 }, all: { games: 0, bytes: 0 } };
  for (const g of eligible) for (const h of HORIZONS) if (startsWithin(g, now, h)) { out[h].games++; out[h].bytes += gameCostBytes(g); }
  return out;
}

/** The soonest `max` games (the list is already ordered by start) and how many were left out. */
export function capGames<T>(games: T[], max = MAX_GAMES): { games: T[]; omitted: number } {
  return games.length <= max ? { games, omitted: 0 } : { games: games.slice(0, max), omitted: games.length - max };
}
