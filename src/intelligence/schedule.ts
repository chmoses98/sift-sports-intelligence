// WHICH DAY A FINDING BELONGS TO. Home's "What matters today" must only speak about games on the viewer's local calendar
// day; findings about later games go under "Coming up" and are never worded as today's. A finding is placed by the
// game's scheduled start (an instant: the publication's ISO time with its offset), read on the viewer's local calendar
// day, so a game that starts after local midnight is tomorrow's whatever its UTC date. Nothing is guessed: a finding
// whose game has no usable start, whose two schedule sources disagree about the local day, or whose game is already
// over (final, postponed, cancelled, suspended) is left out of both lists and counted, never relabelled.
import { inDay } from '../views/broadcast/games';
import type { Discovery } from './discoveries';

/** What a game row knows about its own schedule (views/broadcast/games.ts `GameRow` satisfies this). */
export interface GameSchedule { startMs: number; phase: string }

export interface ScopedDiscovery { d: Discovery; startMs: number }

export interface ScopedDiscoveries {
  /** Findings about games scheduled on the viewer's local day, in the order given. */
  today: ScopedDiscovery[];
  /** Findings about games on a later day within the next week, soonest game first (ties keep the order given). */
  comingUp: ScopedDiscovery[];
  /** Game findings that could be placed on neither list (no usable start, conflicting schedule data, game over, more than a week away). */
  excluded: number;
}

const OVER = new Set(['FINAL', 'POSTPONED', 'CANCELLED', 'SUSPENDED']);

/** An ISO start with an explicit offset ("…Z", "…+01:00"). A bare local time is ambiguous and reads as missing. */
export function parseStart(iso: string | null | undefined): number {
  if (!iso || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso.trim())) return NaN;
  return Date.parse(iso);
}

/** The key a game is looked up by: a board event id is only unique within its sport. */
export const gameKey = (slug: string, eventId: string) => `${slug}:${eventId}`;

export function scopeDiscoveries(ds: Discovery[], games: ReadonlyMap<string, GameSchedule>, now: number): ScopedDiscoveries {
  const today: ScopedDiscovery[] = [];
  const comingUp: ScopedDiscovery[] = [];
  let excluded = 0;
  const sameDay = (a: number, b: number) => inDay(a, b, 'today');
  for (const d of ds) {
    if (d.kind === 'freshness') continue; // monitoring notices are not about a game
    const g = d.eventId ? games.get(gameKey(d.slug, d.eventId)) : undefined;
    const board = g && Number.isFinite(g.startMs) ? g.startMs : NaN;
    const own = parseStart(d.startsAt);
    // Two schedule sources that disagree about the local day cannot be trusted to say "today".
    const start = Number.isFinite(board) ? board : own;
    if (!Number.isFinite(start) || (Number.isFinite(board) && Number.isFinite(own) && !sameDay(board, own)) || (g && OVER.has(g.phase))) { excluded++; continue; }
    if (inDay(start, now, 'today')) today.push({ d, startMs: start });
    else if (start > now && inDay(start, now, 'week')) comingUp.push({ d, startMs: start });
    else excluded++;
  }
  comingUp.sort((a, b) => a.startMs - b.startMs);
  return { today, comingUp, excluded };
}

/** "Mon, Oct 5 · 7:15 PM" in the viewer's zone: the day is always spelled out for a coming-up finding. */
export function comingUpWhen(startMs: number): string {
  const d = new Date(startMs);
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}
