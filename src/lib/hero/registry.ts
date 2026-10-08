// The hero asset registry: every physical venue with its dated home tenants (venues.json), every approved photograph
// with the team whose identity it shows (photos.json, generated from scripts/heroes/pins.json), and the few standing
// rules (rules.json). Pages never read these files: they ask src/lib/hero/resolve.ts for a HeroSpec.
import venueData from './venues.json';
import photoData from './photos.json';
import rulesData from './rules.json';
import { nhlCode } from '../nhlTeams';
import { mlbCode } from '../mlb';

export type Roof = 'outdoor' | 'dome' | 'retractable';

export interface Tenancy { sport: string; team: string; from?: string; to?: string }

export interface VenueRecord {
  id: string;
  name: string;
  aliases: string[];
  city: string;
  country: string;
  roof: Roof;
  kind: 'stadium' | 'ballpark' | 'arena' | 'neutral';
  tenants: Tenancy[];
}

export interface PhotoRecord {
  id: string;
  sport: string;
  /** The home team whose identity the frame shows. */
  team: string;
  venue: string;
  /** [from, to) dates the frame is valid for (a venue's configuration or branding era). */
  from?: string | null;
  to?: string | null;
  /** May represent the venue for a NEUTRAL-site game too (no tenant branding dominates the frame). */
  neutralOk?: boolean;
  identity: string;
  w: number;
  h: number;
  widths: number[];
  focus: { desktop: string; mobile: string };
  credit: { artist: string; license: string; licenseUrl: string | null; source: string; file: string; modifications: string };
}

export interface NeutralMatchup { sport: string; teams: [string, string]; months: number[]; note: string }

export const VENUES: VenueRecord[] = (venueData as unknown as { venues: VenueRecord[] }).venues;
export const PHOTOS: PhotoRecord[] = (photoData as unknown as { photos: PhotoRecord[] }).photos;
const RULES = rulesData as unknown as { neutral_matchups: NeutralMatchup[] };

export const normName = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

/** One spelling per team: the publication's alias codes (NFL LA, NHL L.A, MLB OAK …) fold into the registry's code. */
export function canonicalTeam(sport: string, code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (sport === 'NFL') return c === 'LA' ? 'LAR' : c === 'WSH' ? 'WAS' : c === 'JAC' ? 'JAX' : c;
  if (sport === 'NHL') return nhlCode(c) ?? c;
  if (sport === 'MLB') return mlbCode(c) ?? c;
  return c;
}

const within = (date: string, from?: string | null, to?: string | null): boolean => {
  const d = date.slice(0, 10);
  return (!from || d >= from) && (!to || d < to);
};

/** True when `team` is a home tenant of `v` on `date`. */
export function isTenant(v: VenueRecord, sport: string, team: string, date: string): boolean {
  const t = canonicalTeam(sport, team);
  return v.tenants.some((x) => x.sport === sport && canonicalTeam(sport, x.team) === t && within(date, x.from, x.to));
}

/** Every venue a published name can mean (current name or any alias). */
export function venuesNamed(name: string): VenueRecord[] {
  const n = normName(name);
  if (!n) return [];
  return VENUES.filter((v) => normName(v.name) === n || v.aliases.some((a) => normName(a) === n));
}

/** The home team's venue(s) on a date (more than one = a split season: a temporary home, a relocation year). */
export function homeVenuesOn(sport: string, team: string, date: string): VenueRecord[] {
  return VENUES.filter((v) => isTenant(v, sport, team, date));
}

export const venueById = (id: string): VenueRecord | null => VENUES.find((v) => v.id === id) ?? null;

/** The approved photo of this team's identity at this venue, valid on this date. */
export function homePhoto(sport: string, team: string, venueId: string, date: string): PhotoRecord | null {
  const t = canonicalTeam(sport, team);
  return PHOTOS.find((p) => p.sport === sport && canonicalTeam(sport, p.team) === t && p.venue === venueId && within(date, p.from, p.to)) ?? null;
}

/** A photo that may stand for this venue at a neutral-site game (no tenant branding dominates it). */
export function neutralPhoto(venueId: string, date: string): PhotoRecord | null {
  return PHOTOS.find((p) => p.venue === venueId && p.neutralOk && within(date, p.from, p.to)) ?? null;
}

/** A standing neutral-site matchup (Red River, Florida–Georgia, Army–Navy) in its usual month. */
export function standingNeutral(sport: string, a: string | null | undefined, b: string | null | undefined, date: string): NeutralMatchup | null {
  if (!a || !b) return null;
  const month = Number(date.slice(5, 7));
  const pair = new Set([canonicalTeam(sport, a), canonicalTeam(sport, b)]);
  return RULES.neutral_matchups.find((m) => m.sport === sport && m.months.includes(month) && m.teams.every((t) => pair.has(t))) ?? null;
}
