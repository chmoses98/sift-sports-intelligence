// Where a game is played, and the curated photograph of that place. The venue comes from the
// publication (`context.venue.name`) when it names one — neutral sites and international games included —
// otherwise from the home team's home stadium. Photos are committed files (scripts/stadiums/), credited in
// src/lib/stadium-credits.json; a venue without one simply has no photo (never a generic stand-in).
import venueList from '../../scripts/stadiums/venues.json';
import credits from './stadium-credits.json';

export type Roof = 'outdoor' | 'dome' | 'retractable';

export interface Venue {
  slug: string;
  name: string;
  city: string;
  roof: Roof;
  teams: string[];
  aliases?: string[];
  focus?: string;
}

export interface VenuePhoto {
  hero: string;
  card: string;
  credit: { artist: string; license: string; licenseUrl: string | null; source: string | null; file: string };
}

const VENUES = (venueList as { venues: Venue[] }).venues;
const CREDITS = (credits as { venues: Record<string, { artist: string; license: string; license_url: string | null; source: string | null; file: string }> }).venues;

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function venueFor(homeAbbr: string | null | undefined, publishedName?: string | null): Venue | null {
  if (publishedName) {
    const n = norm(publishedName);
    const byName = VENUES.find((v) => norm(v.name) === n || (v.aliases ?? []).some((a) => norm(a) === n));
    if (byName) return byName;
  }
  if (homeAbbr) return VENUES.find((v) => v.teams.includes(homeAbbr)) ?? null;
  return null;
}

export function venuePhoto(v: Venue | null): VenuePhoto | null {
  if (!v) return null;
  const c = CREDITS[v.slug];
  if (!c) return null;
  const base = import.meta.env.BASE_URL;
  return {
    hero: `${base}stadiums/${v.slug}.webp`,
    card: `${base}stadiums/${v.slug}-sm.webp`,
    credit: { artist: c.artist, license: c.license, licenseUrl: c.license_url, source: c.source, file: c.file },
  };
}

/** Every credited photo, for the provenance page. */
export function allVenuePhotos(): { venue: Venue; photo: VenuePhoto }[] {
  return VENUES.map((venue) => ({ venue, photo: venuePhoto(venue) })).filter((x): x is { venue: Venue; photo: VenuePhoto } => !!x.photo);
}

/**
 * The roof the game is actually played under, from the publication's own capture when it has one
 * ('dome' / 'closed' / 'open' / 'outdoors'), else the venue's construction.
 */
export function roofState(published: string | null | undefined, v: Venue | null): 'outdoors' | 'indoor' | 'roof-open' | 'roof-closed' | 'retractable' | 'unknown' {
  const p = (published ?? '').toLowerCase();
  if (p === 'dome') return 'indoor';
  if (p === 'closed') return 'roof-closed';
  if (p === 'open') return 'roof-open';
  if (p === 'outdoors' || p === 'outdoor') return 'outdoors';
  if (v?.roof === 'dome') return 'indoor';
  if (v?.roof === 'retractable') return 'retractable';
  if (v?.roof === 'outdoor') return 'outdoors';
  return 'unknown';
}
