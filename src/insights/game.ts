// A game's two sides in one place (ids, abbreviations, nicknames), shared by every insight builder.
import type { EventResearchDoc, Observation } from '../contract/types';
import { displayName } from '../lib/format';
import { cfbName } from '../lib/cfbTeams';

export interface Side {
  pid: string;
  abbr: string;
  /** "Falcons" */
  nick: string;
  /** "Atlanta" */
  city: string;
  home: boolean;
}

export interface GameSides {
  home: Side;
  away: Side;
  /** The other team. */
  opp: (abbr: string) => Side;
  byAbbr: (abbr: string) => Side;
  byPid: (pid: string | null | undefined) => Side | null;
  week: number | null;
  kickoff: string;
}

export function gameSides(r: EventResearchDoc): GameSides | null {
  const mk = (side: 'HOME' | 'AWAY'): Side | null => {
    const p = r.participants.find((x) => x.home_away === side);
    if (!p) return null;
    const name = displayName(p.display_name);
    const w = name.split(' ');
    const abbr = r.event.participants.find((x) => x.participant_id === p.participant_id)?.short_name ?? '?';
    // College names are one name ("Iowa State"): never split into a "city" and a last-word "nick" ("State").
    if (((r.event as { sport?: string }).sport ?? (r as { sport?: string }).sport) === 'CFB') return { pid: p.participant_id, abbr, nick: cfbName(abbr, name), city: '', home: side === 'HOME' };
    return { pid: p.participant_id, abbr, nick: w[w.length - 1] || abbr, city: w.slice(0, -1).join(' '), home: side === 'HOME' };
  };
  const home = mk('HOME');
  const away = mk('AWAY');
  if (!home || !away) return null;
  const week = Number((r.event as unknown as { extensions?: { week?: number } }).extensions?.week ?? /week\s*(\d+)/i.exec(r.event.competition ?? '')?.[1] ?? NaN);
  return {
    home, away,
    opp: (a) => (a === home.abbr ? away : home),
    byAbbr: (a) => (a === home.abbr ? home : away),
    byPid: (pid) => (pid === home.pid ? home : pid === away.pid ? away : null),
    week: Number.isFinite(week) ? week : null,
    kickoff: r.event.start_time_utc,
  };
}

/** A team's observation of a metric in the game's matchup rows (or a profile's metrics). */
export function matchupObs(r: EventResearchDoc, metricId: string, side: Side): Observation | null {
  const row = r.matchup.find((m) => m.metric_id === metricId);
  return (side.home ? row?.home : row?.away) ?? null;
}

/** Plural nicknames take "have"; "49ers" etc. are plural too. */
export const verb = (nick: string, plural: string, singular: string) => (/s$|ers$/i.test(nick) ? plural : singular);
