// Where a game is played, and the approved photograph of that place.
//
// VENUE: the publication's own venue for the event wins (`context.venue.name` / `.stadium`, or the
// weather capture's `stadium`) — neutral sites, international games and temporary homes included. A
// published name resolves through the canonical manifest (scripts/stadiums/venues.json): aliases and
// former names, and a name two venues have carried (old / new Highmark Stadium) is split by the game's
// date. Only when the publication names no venue — and does not mark the game neutral — is the home
// team's tenancy on that date used. A published venue the manifest does not know stays UNRESOLVED: it is
// never replaced by the home team's stadium.
//
// PHOTO: only an asset the owner approved in scripts/stadiums/photos.json is shown; everything else gets
// the designed floodlit fallback. Each approved asset has a desktop file, a mobile crop of the same
// photograph and a card strip, with its provenance (shown on Data & provenance).
import venueDoc from '../../scripts/stadiums/venues.json';
import photoDoc from '../../scripts/stadiums/photos.json';
import cropDoc from '../../scripts/stadiums/crop-targets.json';

export type Roof = 'outdoor' | 'dome' | 'retractable';
export type Window = { from?: string | null; to?: string | null };

export interface Venue {
  slug: string;
  name: string;
  aliases?: string[];
  /** Display string, e.g. "Glendale, AZ". */
  city: string;
  country: string;
  lat: number;
  lon: number;
  roof: Roof;
  kind: 'nfl' | 'neutral';
  in_service?: Window;
  tenancies: (Window & { team: string })[];
}

export type CapturedLight = 'day' | 'night' | 'indoor' | 'unknown';
interface Focus { x: number; y: number }
/**
 * The part of a photos.json asset the app reads (vite.config.ts ships only these fields, and only
 * approved assets; the full provenance stays in the repository).
 */
export interface PhotoAsset {
  venue: string;
  status: 'approved' | 'candidate' | 'rejected' | 'retired';
  captured: { light: CapturedLight; sky?: string; event?: string | null };
  source: { kind: string; file?: string; url?: string | null; author: string; license: string; license_url?: string | null };
  crop: { focus: Focus; mobile_focus?: Focus };
  files: { desktop?: { path: string }; mobile?: { path: string }; card?: { path: string } };
}

export interface VenuePhoto {
  id: string;
  /** Desktop file (the whole frame). */
  hero: string;
  /** Mobile file: a 3:4 crop of the same photograph (the desktop file when none was made). */
  mobile: string;
  card: string;
  /** CSS object-position for the desktop file and card, and for the mobile file. */
  focus: string;
  mobileFocus: string;
  captured: PhotoAsset['captured'];
  credit: { artist: string; license: string; licenseUrl: string | null; source: string | null; file: string; modifications: string | null };
}

const VENUES = (venueDoc as unknown as { venues: Venue[] }).venues;
const PHOTOS = (photoDoc as unknown as { photos: Record<string, PhotoAsset> }).photos;
/** At or below this viewport width the mobile crop is served (the layout's own 720 px breakpoint). */
export const MOBILE_MAX_WIDTH = (cropDoc as { breakpoint_px: number }).breakpoint_px - 1;

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const day = (date: string | null | undefined) => (date ? date.slice(0, 10) : new Date().toISOString().slice(0, 10));
const activeOn = (w: Window | undefined, d: string) => (!w?.from || w.from <= d) && (!w?.to || d < w.to);

export function allVenues(): readonly Venue[] {
  return VENUES;
}

/** The venue a published name means on a date (aliases and former names included). */
export function venueByName(name: string | null | undefined, date?: string | null): Venue | null {
  if (!name) return null;
  const n = norm(name);
  if (!n) return null;
  const hits = VENUES.filter((v) => norm(v.name) === n || (v.aliases ?? []).some((a) => norm(a) === n));
  return hits.find((v) => activeOn(v.in_service, day(date))) ?? (hits.length === 1 ? hits[0] : null);
}

/** A team's home venue on a date (its tenancy then), never a neutral site. */
export function venueForTeam(team: string | null | undefined, date?: string | null): Venue | null {
  if (!team) return null;
  const d = day(date);
  return VENUES.find((v) => v.tenancies.some((t) => t.team === team && activeOn(t, d))) ?? null;
}

export interface PublishedVenue {
  name: string | null;
  neutral: boolean;
  roof: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** What the publication says about where the game is, whichever capture shape carries it. */
export function publishedVenue(context: { venue?: unknown; weather?: unknown } | null | undefined): PublishedVenue {
  const v = (context?.venue ?? null) as any;
  const w = (context?.weather ?? null) as any;
  const name = v?.name || v?.stadium || w?.stadium || null;
  const neutral = v?.neutral_site === true || w?.neutral_site === true || /neutral/i.test(String(v?.location ?? ''));
  return { name, neutral, roof: v?.roof || w?.roof || null };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface VenueResolution {
  venue: Venue | null;
  /** The name to show: the publication's, else the resolved venue's. */
  displayName: string | null;
  how: 'published' | 'home-team' | 'unresolved';
}

/** The event's venue: the published name first; the home team's tenancy only when the publication names none. */
export function resolveVenue(input: { homeTeam?: string | null; published?: PublishedVenue | null; date?: string | null }): VenueResolution {
  const pub = input.published;
  if (pub?.name) {
    const v = venueByName(pub.name, input.date);
    return v ? { venue: v, displayName: pub.name, how: 'published' } : { venue: null, displayName: pub.name, how: 'unresolved' };
  }
  if (pub?.neutral) return { venue: null, displayName: null, how: 'unresolved' };
  const v = venueForTeam(input.homeTeam, input.date);
  return v ? { venue: v, displayName: v.name, how: 'home-team' } : { venue: null, displayName: null, how: 'unresolved' };
}

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

function toPhoto(id: string, p: PhotoAsset): VenuePhoto | null {
  if (p.status !== 'approved' || !p.files.desktop || !p.files.card) return null;
  const base = import.meta.env.BASE_URL;
  const m = p.crop.mobile_focus ?? p.crop.focus;
  return {
    id,
    hero: `${base}${p.files.desktop.path}`,
    mobile: `${base}${(p.files.mobile ?? p.files.desktop).path}`,
    card: `${base}${p.files.card.path}`,
    focus: `${pct(p.crop.focus.x)} ${pct(p.crop.focus.y)}`,
    mobileFocus: p.files.mobile ? `50% ${pct(m.y)}` : `${pct(p.crop.focus.x)} ${pct(p.crop.focus.y)}`,
    captured: p.captured,
    credit: {
      artist: p.source.author,
      license: p.source.license,
      licenseUrl: p.source.license_url ?? null,
      source: p.source.url ?? null,
      file: p.source.file ?? p.source.url ?? id,
      modifications: p.source.kind === 'wikimedia-commons' ? 'Cropped, resized and colour graded by Sift' : 'Cropped and resized by Sift',
    },
  };
}

/**
 * The approved photograph to show for a venue. With several approved photos, the one whose captured
 * light matches the game (a night game prefers a night photo) wins; weather never invents a photo.
 */
export function venuePhoto(v: Venue | null, prefer?: { light?: 'day' | 'night' | null }): VenuePhoto | null {
  if (!v) return null;
  const approved = Object.entries(PHOTOS).filter(([, p]) => p.venue === v.slug && p.status === 'approved');
  const pick = (prefer?.light && approved.find(([, p]) => p.captured.light === prefer.light)) || approved[0];
  return pick ? toPhoto(pick[0], pick[1]) : null;
}

/** Every approved photo, for the provenance page. */
export function allVenuePhotos(): { venue: Venue; photo: VenuePhoto }[] {
  return Object.entries(PHOTOS)
    .map(([id, p]) => ({ venue: VENUES.find((v) => v.slug === p.venue), photo: toPhoto(id, p) }))
    .filter((x): x is { venue: Venue; photo: VenuePhoto } => !!x.venue && !!x.photo);
}

/**
 * The roof the game is actually played under, from the publication's own capture when it has one
 * ('dome' / 'closed' / 'open' / 'outdoors'), else the venue's construction. A retractable roof whose
 * status is not published stays 'retractable' (status unknown) — it is never guessed.
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
