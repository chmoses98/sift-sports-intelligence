// Turning a publication into a HeroInput: only STATED facts. Each feed carries the venue and the neutral-site flag
// in its own shape (NFL: context.venue.name or .stadium with neutral_site / location; NHL: event.venue + the
// neutral_site extension; MLB: event.venue / context.venue.name; CBB: its research extension; CFB: none at all),
// and says how sure it is of the home side (CFB: home_away_confidence 'stated' vs a display-order 'convention').
import type { EventResearchDoc } from '../../contract/types';
import { displayName } from '../format';
import { teamColors, teamLogo } from '../teams';
import { mlbClub } from '../mlb';
import { nhlTeam } from '../nhlTeams';
import type { HeroInput, HeroTeam } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** "New Orleans Saints" → "Saints"; NHL/MLB two-word nicknames from their identity tables; college names whole. */
export function shortName(sport: string, code: string, name: string): string {
  const n = displayName(name);
  if (sport === 'NHL') return nhlTeam(code)?.name ?? n.split(' ').slice(-1)[0];
  if (sport === 'MLB') return mlbClub(code)?.nick ?? n.split(' ').slice(-1)[0];
  if (sport === 'CFB' || sport === 'CBB' || sport === 'TENNIS') return n;
  const w = n.split(' ');
  return w.length > 1 ? w[w.length - 1] : n;
}

/** A team's hero identity from Sift's committed identity tables (NFL, CFB, MLB, NHL). */
export function heroTeam(sport: string, code: string | null | undefined, name: string | null | undefined): HeroTeam | null {
  if (!code) return null;
  const full = displayName(name ?? code);
  return { sport, code, name: full, short: shortName(sport, code, full), colors: teamColors(sport, code), logo: teamLogo(sport, code) };
}

const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);

/** The venue name and neutral-site flag the publication states, in any of its shapes. */
export function publishedVenue(r: EventResearchDoc): { name: string | null; neutral: boolean | null } {
  const ctx = (r.context ?? {}) as any;
  const cv = ctx.venue ?? {};
  const ev = r.event as any;
  const evVenue = ev.venue;
  const name = str(cv.name) ?? str(cv.stadium) ?? str(ctx.weather?.stadium) ?? (typeof evVenue === 'string' ? str(evVenue) : str(evVenue?.name));
  const loc = str(cv.location)?.toLowerCase();
  const neutral = bool(cv.neutral_site) ?? (loc === 'neutral' ? true : loc === 'home' ? false : null) ?? bool(ev.extensions?.neutral_site) ?? bool(evVenue?.neutral_site);
  return { name, neutral };
}

function isPostseason(r: EventResearchDoc): boolean {
  const ev = r.event as any;
  const st = String(ev.extensions?.season_type ?? '').toUpperCase();
  const comp = String(ev.competition ?? '').toLowerCase();
  return st === 'POST' || /playoff|postseason|bowl|championship|world series|wild card|division series|league championship/.test(comp);
}

/** True when the feed itself says its home/away is only a convention (CFB: from the title's display order). */
function homeIsConvention(r: EventResearchDoc): boolean {
  const x = (r.event as any).extensions ?? {};
  return x.home_away_confidence === 'convention' || x.home_away_source === 'event_title_order';
}

export function heroInputFromResearch(r: EventResearchDoc, sport: string): HeroInput {
  const ev = r.event;
  const homeP = r.participants.find((p) => p.home_away === 'HOME');
  const awayP = r.participants.find((p) => p.home_away === 'AWAY');
  const short = (pid?: string) => ev.participants.find((p) => p.participant_id === pid)?.short_name ?? null;
  const v = publishedVenue(r);
  return {
    sport,
    date: ev.start_time_utc,
    home: homeP ? heroTeam(sport, short(homeP.participant_id), homeP.display_name) : null,
    away: awayP ? heroTeam(sport, short(awayP.participant_id), awayP.display_name) : null,
    homeVerified: !!homeP && !homeIsConvention(r),
    venueName: v.name,
    neutral: v.neutral,
    postseason: isPostseason(r),
  };
}

/** A board row before its research is read: who plays and when, no venue yet (pending → identity only). */
export function heroInputFromBoard(item: { start_time_utc: string; home_participant: string | null; away_participant: string | null; participants: { participant_id: string; display_name: string; short_name: string | null }[] }, sport: string): HeroInput {
  const home = item.participants.find((p) => p.participant_id === item.home_participant);
  const away = item.participants.find((p) => p.participant_id === item.away_participant);
  return {
    sport,
    date: item.start_time_utc,
    home: home ? heroTeam(sport, home.short_name, home.display_name) : null,
    away: away ? heroTeam(sport, away.short_name, away.display_name) : null,
    // The CFB board cannot say whether its home side is stated or only the title's display order: until the
    // research says 'stated', nobody is shown at home. The other feeds always state home and away.
    homeVerified: !!home && sport !== 'CFB',
    venueName: null,
    neutral: null,
    pending: true,
  };
}

/** The hero input for a game: from its research when read, else its board row (identity only). */
export function heroInputFor(item: Parameters<typeof heroInputFromBoard>[0], r: EventResearchDoc | null | undefined, sport: string): HeroInput {
  return r ? heroInputFromResearch(r, sport) : heroInputFromBoard(item, sport);
}
