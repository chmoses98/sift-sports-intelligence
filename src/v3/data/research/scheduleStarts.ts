// The schedule authority for start times. A game's start comes from the league schedule (the explorer index's events), never from Kalshi
// event metadata and never from a market's close time. The board publication carries the same schedule's time; when the explorer's
// schedule for the sport is known and disagrees (a moved game, a Kalshi-implied time on a board built from it), the schedule wins on every
// surface at once: the slate's games take its start, so cards, tiles, switcher, props and the lifecycle phase all read one time.
//
// The explorer index is read lazily by the screens that need it (useSchedule); nothing here adds a request. Until a sport's schedule has been
// read, its games keep the board's own start time, which the publication builds from that same schedule.
import { useSyncExternalStore } from 'react';
import type { SportBundle } from '../../../opportunity/load';
import { scheduledStart } from './gameMarkets';
import type { ScheduleEvent } from './types';

const known = new Map<string, { events: ScheduleEvent[]; source: object }>();
let version = 0;
const subs = new Set<() => void>();
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** Sports whose board time is a nominal day placeholder verified by first-ball status (src/lib/tennis.ts): the schedule does not replace it. */
const KEEP_BOARD_START = new Set(['tennis']);

/** A screen that has read a sport's explorer schedule tells the slate (idempotent for the same array). */
export function registerSchedule(slug: string, events: ScheduleEvent[], source: object): void {
  if (!events.length || known.get(slug)?.source === source) return;
  known.set(slug, { events, source });
  version++;
  subs.forEach((f) => f());
}
export const useScheduleVersion = (): number => useSyncExternalStore(subscribe, () => version, () => 0);
export const knownSchedule = (slug: string): ScheduleEvent[] | undefined => known.get(slug)?.events;
/** Test seam. */
export const clearSchedules = (): void => { known.clear(); version++; subs.forEach((f) => f()); };

/**
 * The bundles with each board item's `start_time_utc` replaced by the schedule's start where the schedule has the game (by event id, else
 * the same two teams within three days) and says something different. Items the schedule does not know keep the board's time.
 */
export function withScheduleStarts(bundles: SportBundle[], scheduleOf: (slug: string) => ScheduleEvent[] | undefined): SportBundle[] {
  return bundles.map((b) => {
    const schedule = scheduleOf(b.sport.slug);
    if (!schedule?.length || KEEP_BOARD_START.has(b.sport.slug)) return b;
    let changed = false;
    const board = b.board.map((item) => {
      const code = (id: string | null | undefined) => item.participants.find((p) => p.participant_id === id)?.short_name ?? '';
      const boardMs = Date.parse(item.start_time_utc);
      const ms = scheduledStart(schedule, { eventId: item.event_id, away: code(item.away_participant), home: code(item.home_participant), startMs: boardMs });
      if (ms == null || ms === boardMs) return item;
      changed = true;
      return { ...item, start_time_utc: new Date(ms).toISOString().replace('.000Z', 'Z') };
    });
    return changed ? { ...b, board } : b;
  });
}
