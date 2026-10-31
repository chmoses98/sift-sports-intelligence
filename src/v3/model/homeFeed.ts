// The Home feed as pure functions: which sports and days to offer, which sport opens by default, and how one sport's games on one day are
// grouped into a time-ordered schedule (Live, then one section per kickoff window, then Awaiting result, then Final). The order inside a
// section is model/priority.ts. No React and no clock of its own: `now` is passed in.
import { clockTime, dayKey, hasStart, keyLabel, shiftDayKey } from './time';
import { orderFinal, orderLive, orderUpcoming, type FollowsLike, type Memory } from './priority';
import type { V3Game } from './types';

/** The product's sport order. Tennis is last and is never a default: it is a chip a viewer chooses (or follows into). */
export const SPORT_ORDER = ['NFL', 'NBA', 'MLB', 'NHL', 'CFB', 'CBB', 'SOCCER', 'TENNIS'] as const;
export const SPORT_LABEL: Record<string, string> = { CFB: 'NCAAF', CBB: 'NCAAB' };
export const sportLabel = (sport: string) => SPORT_LABEL[sport] ?? sport;

export interface SportChip { slug: string; label: string; live: number; count: number }

/** The games Home shows for a calendar day: those that start on it, plus (on today) anything still in play that started before midnight. */
export function gamesOnDay(games: readonly V3Game[], day: string, today: string): V3Game[] {
  return games.filter((g) => dayKey(g.startMs) === day || (day === today && g.phase === 'live'));
}

/** Sports with at least one game in the list, in product order, with how many are in play. */
export function sportChips(dayGames: readonly V3Game[]): SportChip[] {
  return SPORT_ORDER.map((s) => {
    const mine = dayGames.filter((g) => g.sport === s);
    return { slug: s.toLowerCase(), label: sportLabel(s), live: mine.filter((g) => g.phase === 'live').length, count: mine.length };
  }).filter((c) => c.count > 0);
}

/** The first sport with live games, else the first with games that day; tennis only when nothing else has a game. */
export function defaultSport(chips: readonly SportChip[]): string | null {
  const main = chips.filter((c) => c.slug !== 'tennis');
  const pool = main.length ? main : chips;
  return (pool.find((c) => c.live > 0) ?? pool[0])?.slug ?? null;
}

/**
 * The sport Home opens on: the one the address names, else the one this device last used (when it has games that day), else the default.
 * A sport the address names is honoured even with no games that day (the empty state says so); a stored one is not.
 */
export function pickSport(asked: string | null, stored: string | null, chips: readonly SportChip[]): string | null {
  const known = (s: string | null) => !!s && (SPORT_ORDER as readonly string[]).includes(s.toUpperCase());
  if (known(asked)) return asked!.toLowerCase();
  if (known(stored) && chips.some((c) => c.slug === stored)) return stored!.toLowerCase();
  return defaultSport(chips);
}

export const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The days the strip offers: three back, ten forward, and the selected day when it lies outside that. */
export function dayStrip(today: string, selected: string): string[] {
  const days = Array.from({ length: 14 }, (_, i) => shiftDayKey(today, i - 3));
  if (!days.includes(selected)) days.push(selected);
  return days.sort();
}

export const dayParts = (key: string): { weekday: string; date: number } => ({ weekday: keyLabel(key).split(/[,\s]/)[0], date: Number(key.slice(8, 10)) });

export type SectionKind = 'live' | 'time' | 'awaiting' | 'final';
export interface Section { id: string; kind: SectionKind; title: string; games: V3Game[] }

/**
 * One sport's games on one day as sections. Live games are in priority order (with the memory of the last order, so a score change does
 * not move a card); each kickoff window is its own section in time order; finals come last, newest first. Empty sections are omitted.
 */
export function buildSchedule(games: readonly V3Game[], f: FollowsLike, memory?: Memory): { sections: Section[]; memory: Memory } {
  const live = orderLive(games.filter((g) => g.phase === 'live'), f, memory);
  const sections: Section[] = [];
  if (live.ordered.length) sections.push({ id: 'live', kind: 'live', title: 'Live', games: live.ordered });
  const windows = new Map<number, V3Game[]>();
  const untimed: V3Game[] = [];
  for (const g of games) {
    if (g.phase !== 'pregame') continue;
    if (!hasStart(g.startMs)) { untimed.push(g); continue; }
    const k = Math.floor(g.startMs / 60_000);
    windows.set(k, [...(windows.get(k) ?? []), g]);
  }
  for (const k of [...windows.keys()].sort((a, b) => a - b)) {
    const gs = windows.get(k)!;
    sections.push({ id: `t${k}`, kind: 'time', title: clockTime(gs[0].startMs), games: orderUpcoming(gs, f) });
  }
  if (untimed.length) sections.push({ id: 'tbd', kind: 'time', title: 'Time to be announced', games: orderUpcoming(untimed, f) });
  const awaiting = games.filter((g) => g.phase === 'other');
  if (awaiting.length) sections.push({ id: 'awaiting', kind: 'awaiting', title: 'Awaiting result', games: orderUpcoming(awaiting, f) });
  const final = games.filter((g) => g.phase === 'final');
  if (final.length) sections.push({ id: 'final', kind: 'final', title: 'Final', games: orderFinal(final, f) });
  return { sections, memory: live.memory };
}

/** What the jump row offers: Live, the rest of the schedule ("Later", the coming windows) and Final, each with its game count. */
export function jumpTargets(sections: readonly Section[]): { id: string; label: string; count: number }[] {
  const out: { id: string; label: string; count: number }[] = [];
  const live = sections.find((s) => s.kind === 'live');
  if (live) out.push({ id: live.id, label: 'Live', count: live.games.length });
  const upcoming = sections.filter((s) => s.kind === 'time' || s.kind === 'awaiting');
  if (upcoming.length) out.push({ id: upcoming[0].id, label: 'Upcoming', count: upcoming.reduce((n, s) => n + s.games.length, 0) });
  const fin = sections.find((s) => s.kind === 'final');
  if (fin) out.push({ id: fin.id, label: 'Final', count: fin.games.length });
  return out;
}
