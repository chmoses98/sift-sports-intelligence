// Which of a team profile's games belong to its season, and which of them are still to be played. Pure functions over one published team
// document (`games[]`, `season`); nothing here fetches or estimates.
import type { EntityProfileDoc } from '../../contract/types';

/**
 * The first instant (as a sortable ISO prefix) that belongs to a profile's season. A season is labelled by the year it starts ("2025", football)
 * or by both years ("2025-26", basketball and hockey). The label itself is NOT a date: "2025-26-06-01" sorts below every 2026 date but ALSO
 * above every autumn 2025 one, which silently dropped the whole season from the Team screen's results.
 * Football starts in the autumn and its profile also lists the previous season's playoffs, so June 1 is the cut; basketball and hockey seasons
 * open in October with preseason in September, so July 1 is.
 */
export function seasonStartIso(season: string | null | undefined): string {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(season ?? '');
  if (!m) return '';
  return m[2] ? `${m[1]}-07-01` : `${m[1]}-06-01`;
}

export interface ScheduledGame { eventId: string; startUtc: string; oppId: string; oppName: string; home: boolean; competition: string | null }

/** Games the profile lists that have no result yet and start at or after `nowMs`, soonest first. A game with a result is never listed here. */
export function scheduledGames(p: EntityProfileDoc | null | undefined, nowMs: number): ScheduledGame[] {
  type Raw = { event_id?: string; start_time_utc?: string; opponent_id?: string; opponent_name?: string; home_away?: string; competition?: string | null; result?: unknown; status?: string };
  const games = ((p as unknown as { games?: Raw[] } | null | undefined)?.games ?? []);
  return games
    .filter((g): g is Raw & { event_id: string; start_time_utc: string } => !!g.event_id && !!g.start_time_utc && !g.result && Date.parse(g.start_time_utc) >= nowMs && !/^(FINAL|CANCELLED|POSTPONED)$/i.test(g.status ?? ''))
    .map((g) => ({ eventId: g.event_id, startUtc: g.start_time_utc, oppId: g.opponent_id ?? '', oppName: g.opponent_name ?? '', home: g.home_away === 'HOME', competition: g.competition ?? null }))
    .sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}
