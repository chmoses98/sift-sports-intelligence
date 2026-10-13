// The cross-sport game list behind Home's rail and the Games destination: every game the publications' boards
// list, with its lifecycle phase and how many live candidates its own publication flags. Read from the boards
// already loaded for the opportunity layer — no per-game document is fetched to draw a tile.
import type { BoardItem } from '../../contract/types';
import { resolveHero } from '../../lib/hero/resolve';
import { heroInputFor } from '../../lib/hero/input';
import { eventPhase, type EventPhase } from '../../opportunity/lifecycle';
import { compareOpportunities, isLive } from '../../opportunity/rank';
import { eventLabel } from '../../opportunity/sources';
import type { SportBundle } from '../../opportunity/load';
import type { Opportunity } from '../../opportunity/types';

export interface GameRow {
  sport: string;
  slug: string;
  item: BoardItem;
  label: string;
  phase: EventPhase;
  /** Started more than four hours ago without a final word from the publication: not "in play", awaiting a result. */
  stale: boolean;
  startMs: number;
  away: BoardItem['participants'][number] | undefined;
  home: BoardItem['participants'][number] | undefined;
  /** Live candidates (not PASS) the publication flags on this game. */
  candidates: number;
  best: Opportunity | null;
  /** Every row the publication judged on this game (candidates and passes), best first. */
  opps: Opportunity[];
}

export type DayWindow = 'today' | 'tomorrow' | 'week';
export const DAY_WORD: Record<DayWindow, string> = { today: 'Today', tomorrow: 'Tomorrow', week: 'Next 7 days' };

/** The local calendar day (year, month, day) a timestamp falls on, as one comparable number. */
function dayNum(ms: number): number {
  const d = new Date(ms);
  return d.getFullYear() * 10_000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** The local calendar day `n` days after `ms`'s own day. Built from calendar fields, never `+ n * 24h`, so a 23- or 25-hour
 *  daylight-saving day cannot shift the boundary. */
function dayNumPlus(ms: number, n: number): number {
  const d = new Date(ms);
  return dayNum(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime());
}

/**
 * Whether a start time falls on the user's local calendar day (today), the next one (tomorrow) or one of the next seven
 * (week = today through six days on). It is the SCHEDULED local date that decides, so live and finished games of today
 * stay in Today and a game that starts after local midnight is tomorrow's, whatever its UTC date.
 */
export function inDay(startMs: number, now: number, w: DayWindow): boolean {
  if (!Number.isFinite(startMs)) return false;
  const k = dayNum(startMs);
  if (w === 'today') return k === dayNum(now);
  if (w === 'tomorrow') return k === dayNumPlus(now, 1);
  return k >= dayNum(now) && k <= dayNumPlus(now, 6);
}

/** Games after tomorrow and within the next seven local days ("later this week"). */
export function inLater(startMs: number, now: number): boolean {
  return Number.isFinite(startMs) && dayNum(startMs) > dayNumPlus(now, 1) && dayNum(startMs) <= dayNumPlus(now, 6);
}

export function gameRows(bundles: SportBundle[], opportunities: Opportunity[], now: number): GameRow[] {
  const byEvent = new Map<string, Opportunity[]>();
  const allBy = new Map<string, Opportunity[]>();
  for (const o of opportunities) {
    allBy.set(o.eventId, [...(allBy.get(o.eventId) ?? []), o]);
    if (isLive(o)) byEvent.set(o.eventId, [...(byEvent.get(o.eventId) ?? []), o]);
  }
  return bundles.flatMap((b) => b.board.map((item) => {
    const os = [...(byEvent.get(item.event_id) ?? [])].sort(compareOpportunities);
    const p = eventPhase(item, now);
    return {
      sport: b.sport.code,
      slug: b.sport.slug,
      item,
      label: eventLabel(item, b.sport.code),
      phase: p.phase,
      stale: p.phase === 'STARTED' && now - Date.parse(item.start_time_utc) > 4 * 3600_000,
      startMs: Date.parse(item.start_time_utc),
      away: item.participants.find((x) => x.participant_id === item.away_participant) ?? item.participants[1],
      home: item.participants.find((x) => x.participant_id === item.home_participant) ?? item.participants[0],
      candidates: os.length,
      best: os[0] ?? null,
      opps: [...(allBy.get(item.event_id) ?? [])].sort(compareOpportunities),
    };
  }));
}

/** Games in play first, then upcoming by start, then started games awaiting a result, then finals and the rest. */
export function slateOrder(a: GameRow, b: GameRow): number {
  const rank = (g: GameRow) => (g.phase === 'STARTED' && !g.stale ? 0 : g.phase === 'PREGAME' || g.phase === 'NO_START' ? 1 : g.phase === 'STARTED' ? 2 : 3);
  return rank(a) - rank(b) || a.startMs - b.startMs;
}

/** Whether the game's home venue has a licensed photograph pinned (the hero's centrepiece). */
export function hasVenuePhoto(g: GameRow): boolean {
  try {
    return !!resolveHero(heroInputFor(g.item, null, g.sport)).photo;
  } catch {
    return false;
  }
}

/** Sports whose venue art and research make the richest featured hero, in order of preference. CFB leads for now. */
const FEATURE_PREF = ['CFB', 'NFL', 'NHL', 'MLB', 'NBA', 'SOCCER', 'CBB', 'TENNIS'];

/**
 * The featured matchup. Only a game that has not started is eligible. Selection, in order:
 *  1. a CFB game scheduled for the user's local TODAY (the featured card is then an ordinary "Featured" card);
 *  2. otherwise the next CFB game on a later day (the card says "Upcoming CFB Feature": it is never passed off as today's);
 *  3. with no CFB game at all, the same two steps over every sport (today first, then the next day with games).
 * Within a step: a game whose home venue has a licensed photograph, then the sport order above, then a game whose own
 * publication flags a candidate, then the most markets listed, then the earliest start. A documented rule over
 * published fields, never a hidden score (and no market-volume or best-bet ranking yet); null when nothing is upcoming.
 */
export function featuredGame(rows: GameRow[], now: number): GameRow | null {
  const open = rows.filter((g) => g.phase === 'PREGAME' && g.startMs > now && g.home && g.away);
  if (!open.length) return null;
  const pref = (g: GameRow) => { const i = FEATURE_PREF.indexOf(g.sport); return i < 0 ? 99 : i; };
  const best = (pool: GameRow[]): GameRow => {
    const photo = new Map(pool.map((g) => [g, hasVenuePhoto(g)]));
    return [...pool].sort((a, b) => pref(a) - pref(b) || Number(photo.get(b)) - Number(photo.get(a)) || (b.candidates > 0 ? 1 : 0) - (a.candidates > 0 ? 1 : 0) || b.item.markets_available - a.item.markets_available || a.startMs - b.startMs)[0];
  };
  const cfb = open.filter((g) => g.sport === 'CFB');
  const todayCfb = cfb.filter((g) => inDay(g.startMs, now, 'today'));
  if (todayCfb.length) return best(todayCfb);
  if (cfb.length) {
    const next = dayNum(Math.min(...cfb.map((g) => g.startMs)));
    return best(cfb.filter((g) => dayNum(g.startMs) === next));
  }
  const today = open.filter((g) => inDay(g.startMs, now, 'today'));
  if (today.length) return best(today);
  const first = Math.min(...open.map((g) => g.startMs));
  return best(open.filter((g) => dayNum(g.startMs) === dayNum(first)));
}

/** "today" when the featured game is scheduled for the user's local today; "upcoming" when it is a later day's game. */
export function featuredScope(g: GameRow, now: number): 'today' | 'upcoming' {
  return inDay(g.startMs, now, 'today') ? 'today' : 'upcoming';
}

/** Clock words for a tile: "7:30 PM", "Live", "Final", "Postponed". */
export function phaseWord(g: GameRow): string {
  if (g.phase === 'FINAL') return 'Final';
  if (g.phase === 'STARTED') return g.stale ? 'Awaiting result' : 'In play';
  if (g.phase === 'POSTPONED') return 'Postponed';
  if (g.phase === 'CANCELLED') return 'Cancelled';
  if (g.phase === 'SUSPENDED') return 'Suspended';
  if (!Number.isFinite(g.startMs)) return 'Time TBC';
  return new Date(g.startMs).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** A board competition word fit for a tile: "regular" → "Regular season"; real names pass through. */
export function competitionWord(c: string | null | undefined, sportLabel: string): string {
  if (!c) return sportLabel;
  const wk = /^\d{4}\s+(?:reg\s+|post\s+)?week\s+(\d+)$/i.exec(c.trim());
  if (wk) return `${sportLabel} · Week ${wk[1]}`;
  const k = c.trim().toLowerCase();
  if (k === 'regular' || k === 'reg' || k === 'regular_season') return `${sportLabel} · Regular season`;
  if (k === 'preseason' || k === 'pre') return `${sportLabel} · Preseason`;
  if (k === 'postseason' || k === 'playoffs' || k === 'post') return `${sportLabel} · Playoffs`;
  return c;
}

/** How many of a sport's games Home's rail shows before a "more" tile: the deep slates (tennis, soccer) are capped. */
export const RAIL_CAP: Record<string, number> = { NFL: 16, CFB: 12, NHL: 10, MLB: 10, NBA: 10, CBB: 8, SOCCER: 6, TENNIS: 4 };

export interface RailGroup { slug: string; sport: string; games: GameRow[]; total: number }

/**
 * Home's rail as sport groups: the sports with the richest published research first (FEATURE_PREF), each sport's
 * games in slate order with games its own publication flags pulled forward, capped per sport so a 198-match tennis
 * day cannot bury twelve NFL games. A single-sport filter shows that sport uncapped.
 */
export function railGroups(rows: GameRow[], sportSlug: string | null = null): RailGroup[] {
  const by = new Map<string, GameRow[]>();
  for (const g of rows) if (!sportSlug || g.slug === sportSlug) by.set(g.sport, [...(by.get(g.sport) ?? []), g]);
  const pref = (s: string) => { const i = FEATURE_PREF.indexOf(s); return i < 0 ? 99 : i; };
  const flagged = (g: GameRow) => (g.phase === 'PREGAME' || (g.phase === 'STARTED' && !g.stale)) && g.candidates > 0;
  return [...by.entries()]
    .sort(([a], [b]) => pref(a) - pref(b) || a.localeCompare(b))
    .map(([sport, gs]) => {
      const ordered = [...gs].sort((a, b) => slateOrder(a, b));
      const cap = sportSlug ? ordered.length : RAIL_CAP[sport] ?? 8;
      // Flagged games inside the cap first, so a capped sport still shows what its publication points at.
      const pick = [...ordered.filter(flagged), ...ordered.filter((g) => !flagged(g))].slice(0, cap);
      const keep = new Set(pick);
      return { slug: gs[0].slug, sport, games: ordered.filter((g) => keep.has(g)), total: gs.length };
    });
}
