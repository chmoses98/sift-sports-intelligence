// resolveHero: the ONE decision of what a game's hero shows. Pure (no React, no fetch), date-aware, and conservative:
// a home-stadium photograph is shown only when the publication STATES the home team, the game is not at a neutral
// site, the venue is (verifiably) that team's home on that date, and an approved photo of THAT team's identity at
// THAT venue exists for that date. Everything else falls back to a truthful branded hero — the home team's own
// identity when it is the stated host, both teams when nobody is at home — never a stand-in photograph.
import type { HeroInput, HeroPhoto, HeroSpec, HeroVenue } from './types';
import { homePhoto, homeVenuesOn, isTenant, neutralPhoto, standingNeutral, venuesNamed, type PhotoRecord, type VenueRecord } from './registry';

const BASE = (): string => (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';

export function photoOf(p: PhotoRecord): HeroPhoto {
  const dir = `${BASE()}heroes/${p.sport.toLowerCase()}/${p.id}`;
  return {
    id: p.id,
    srcset: [...p.widths].sort((a, b) => b - a).map((w) => ({ src: `${dir}-${w}.webp`, w })),
    card: `${dir}-720.webp`,
    width: p.w,
    height: p.h,
    focus: p.focus,
    identity: p.identity,
    credit: p.credit,
  };
}

const venueOf = (v: VenueRecord, source: HeroVenue['source']): HeroVenue => ({ id: v.id, name: v.name, city: v.city, roof: v.roof, source });

/** The registry venue a published name means on this date (a shared name is settled by the home team's tenancy). */
function publishedVenue(name: string, sport: string, home: string | null, date: string): VenueRecord | null {
  const all = venuesNamed(name);
  if (all.length <= 1) return all[0] ?? null;
  const tenant = home ? all.filter((v) => isTenant(v, sport, home, date)) : [];
  if (tenant.length === 1) return tenant[0];
  // Same name, several buildings (old/new Highmark, the many Memorial Stadiums): the one in service that day.
  const inService = all.filter((v) => v.tenants.length === 0 || v.tenants.some((t) => (!t.from || date.slice(0, 10) >= t.from) && (!t.to || date.slice(0, 10) < t.to)));
  return inService.length === 1 ? inService[0] : null;
}

export function resolveHero(input: HeroInput): HeroSpec {
  const { sport, date, home, away } = input;
  const base = { sport, home, away } as const;

  // Sports without home teams (tennis): the event is the identity.
  if (sport === 'TENNIS') {
    return { ...base, home: null, kind: 'branded', context: 'event', venue: input.venueName ? { id: null, name: input.venueName, city: null, roof: null, source: 'published' } : null, photo: null, label: input.eventName ?? 'Match', reason: 'event:no-home-team' };
  }

  const pub = input.venueName ? publishedVenue(input.venueName, sport, home?.code ?? null, date) : null;
  const pubVenue: HeroVenue | null = pub ? venueOf(pub, 'published') : input.venueName ? { id: null, name: input.venueName, city: null, roof: null, source: 'published' } : null;

  // Home side not stated (a display-order convention): nobody is shown at home.
  if (!home || !input.homeVerified) {
    return { ...base, kind: 'branded', context: 'matchup', venue: pubVenue, photo: null, label: input.eventName ?? '', reason: 'matchup:home-unverified' };
  }

  if (input.pending) return { ...base, kind: 'branded', context: 'home', venue: null, photo: null, label: `${home.short} home game`, reason: 'branded:pending' };

  // Neutral site: stated by the publication, a standing neutral matchup, or a published venue that is a neutral site.
  const standing = standingNeutral(sport, home.code, away?.code, date);
  const neutral = input.neutral === true || !!standing || pub?.kind === 'neutral';
  if (neutral) {
    const np = pub ? neutralPhoto(pub.id, date) : null;
    const intl = pub && pub.country !== 'US' && ['NFL', 'MLB', 'NHL', 'NBA'].includes(sport);
    return {
      ...base,
      kind: np ? 'photo' : 'branded',
      context: 'neutral',
      venue: pubVenue,
      photo: np ? photoOf(np) : null,
      label: input.eventName ?? (intl ? 'International game' : 'Neutral site'),
      reason: np ? 'photo:neutral' : input.neutral === true ? 'neutral:published' : standing ? 'neutral:standing-matchup' : 'neutral:venue-is-neutral',
    };
  }

  const homeLabel = `${home.short} home game`;

  // The publication names a venue.
  if (input.venueName) {
    if (pub && isTenant(pub, sport, home.code, date)) {
      const p = homePhoto(sport, home.code, pub.id, date);
      return { ...base, kind: p ? 'photo' : 'branded', context: 'home', venue: pubVenue, photo: p ? photoOf(p) : null, label: homeLabel, reason: p ? 'photo:home' : 'branded:home:no-verified-photo' };
    }
    if (pub) {
      // A known building that is not this team's home that day (a temporary home, another club's park, a special event).
      return { ...base, kind: 'branded', context: 'home-elsewhere', venue: pubVenue, photo: null, label: input.eventName ?? `Hosted by the ${home.short}`, reason: 'branded:home-elsewhere:venue-not-home' };
    }
    // A building the registry does not know. Stated not-neutral → the team's own home game; otherwise unverified.
    return input.neutral === false
      ? { ...base, kind: 'branded', context: 'home', venue: pubVenue, photo: null, label: homeLabel, reason: 'branded:home:venue-unregistered' }
      : { ...base, kind: 'branded', context: 'home-elsewhere', venue: pubVenue, photo: null, label: input.eventName ?? `Hosted by the ${home.short}`, reason: 'branded:home-elsewhere:venue-unverified' };
  }

  // No venue published. Postseason sites move: the host's identity, never its stadium.
  if (input.postseason) {
    return { ...base, kind: 'branded', context: 'home-elsewhere', venue: null, photo: null, label: input.eventName ?? 'Postseason', reason: 'branded:home-elsewhere:postseason-no-venue' };
  }
  const homes = homeVenuesOn(sport, home.code, date);
  if (homes.length === 1) {
    const v = homes[0];
    const p = homePhoto(sport, home.code, v.id, date);
    return { ...base, kind: p ? 'photo' : 'branded', context: 'home', venue: venueOf(v, 'tenancy'), photo: p ? photoOf(p) : null, label: homeLabel, reason: p ? 'photo:home' : 'branded:home:no-verified-photo' };
  }
  return { ...base, kind: 'branded', context: 'home', venue: null, photo: null, label: homeLabel, reason: homes.length ? 'branded:home:split-season' : 'branded:home:venue-unknown' };
}
