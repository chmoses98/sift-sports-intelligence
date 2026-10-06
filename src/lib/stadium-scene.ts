// The stadium SCENE for a game: what the environment under which it is played looks like — roof
// exposure, sky, precipitation and light — decided deterministically from the venue's construction, the
// publication's roof status, its kickoff forecast and the sun at the venue. The photograph stays the real
// photograph: the scene may choose between APPROVED photos (night game -> night photo) and name the
// restrained atmosphere layers a presentation is allowed to add. It never alters the venue.
//
// Decision rules (docs/STADIUMS.md -> Weather and roof):
//   fixed dome (venue.roof 'dome', or published 'dome')      -> indoor: no sky, no precipitation, label "Indoor"
//   retractable + published 'closed'                         -> roof-closed: as indoor, label "Roof closed"
//   retractable + published 'open'                           -> roof-open: the outdoor forecast applies
//   retractable + status not published                       -> roof-unknown: no weather layers (never guessed)
//   outdoor                                                  -> outdoor: the forecast applies
//   venue not resolved and no published roof                 -> unknown: no weather layers
import { roofState, type Venue } from './venues';

export type Exposure = 'outdoor' | 'roof-open' | 'roof-closed' | 'indoor' | 'roof-unknown' | 'unknown';
export type Sky = 'clear' | 'cloud';
export type Precip = 'rain' | 'snow';
export type Light = 'day' | 'night';
/** Atmosphere layers a presentation may add over a real photo. None of them touches geometry. */
export type Layer = 'overcast' | 'rain' | 'snow';

export interface StadiumScene {
  exposure: Exposure;
  /** Sky over an open field; null when the field is covered or the forecast is unknown. */
  sky: Sky | null;
  precip: Precip | null;
  /** Daylight at the venue during the game (the sun 90 min after kickoff); null when unknown. */
  light: Light | null;
  /** A short human label for the roof condition (also shown as text by the weather block). */
  label: string;
  /** Stable key, e.g. "outdoor:rain:night", "indoor", "roof-unknown". */
  key: string;
}

export interface SceneForecast {
  available?: boolean;
  short_forecast?: string | null;
  precipitation_probability?: number | null;
}

/** Precipitation counts only when the forecast commits to it: >= 50 %, or worded without "chance". */
export const PRECIP_MIN_PROBABILITY = 50;

/** Classify an NWS-style short forecast. */
export function classifyForecast(f: SceneForecast | null | undefined): { sky: Sky | null; precip: Precip | null } {
  if (!f || f.available === false) return { sky: null, precip: null };
  const t = (f.short_forecast ?? '').toLowerCase();
  if (!t) return { sky: null, precip: null };
  const p = f.precipitation_probability;
  const snow = /snow|flurr|sleet|wintry|blizzard|ice pellets/.test(t);
  const rain = /rain|shower|drizzle|thunder|storm/.test(t);
  const hedged = /chance|slight|isolated|scattered/.test(t);
  const committed = p != null ? p >= PRECIP_MIN_PROBABILITY : !hedged;
  if ((snow || rain) && committed) return { sky: 'cloud', precip: snow ? 'snow' : 'rain' };
  if (snow || rain || /cloud|overcast|fog|haze|partly sunny|partly cloudy/.test(t)) return { sky: 'cloud', precip: null };
  if (/sun|clear|fair/.test(t)) return { sky: 'clear', precip: null };
  return { sky: null, precip: null };
}

const RAD = Math.PI / 180;
/** Solar elevation in degrees at a place and instant (low-precision almanac, ~0.5 deg). */
export function solarElevation(lat: number, lon: number, when: Date): number {
  const d = when.getTime() / 86400000 - 10957.5; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) * 15 * RAD;
  const ha = gmst + lon * RAD - ra;
  return Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(ha)) / RAD;
}

/** Day or night for the bulk of the game: the sun 90 minutes after kickoff, below -0.833 deg = night. */
export function gameLight(venue: Venue | null, kickoffUtc: string | null | undefined): Light | null {
  if (!venue || !kickoffUtc) return null;
  const t = Date.parse(kickoffUtc);
  if (!Number.isFinite(t)) return null;
  return solarElevation(venue.lat, venue.lon, new Date(t + 90 * 60000)) < -0.833 ? 'night' : 'day';
}

export function stadiumScene(input: { venue: Venue | null; publishedRoof?: string | null; forecast?: SceneForecast | null; kickoffUtc?: string | null }): StadiumScene {
  const { venue } = input;
  // A fixed roof is a fact of the building: a stray 'outdoors' in a capture cannot rain onto its field.
  const roof = venue?.roof === 'dome' ? 'indoor' : roofState(input.publishedRoof, venue);
  const light = gameLight(venue, input.kickoffUtc);
  if (roof === 'indoor') return { exposure: 'indoor', sky: null, precip: null, light: null, label: 'Indoor', key: 'indoor' };
  if (roof === 'roof-closed') return { exposure: 'roof-closed', sky: null, precip: null, light: null, label: 'Roof closed', key: 'roof-closed' };
  if (roof === 'retractable') return { exposure: 'roof-unknown', sky: null, precip: null, light: null, label: 'Roof status not published', key: 'roof-unknown' };
  if (roof === 'unknown') return { exposure: 'unknown', sky: null, precip: null, light, label: 'Venue conditions unknown', key: 'unknown' };
  const exposure: Exposure = roof === 'roof-open' ? 'roof-open' : 'outdoor';
  const { sky, precip } = classifyForecast(input.forecast);
  const key = [exposure, precip ?? sky, light].filter(Boolean).join(':');
  return { exposure, sky, precip, light, label: roof === 'roof-open' ? 'Roof open' : 'Open air', key };
}

/**
 * The atmosphere layers allowed over a particular photograph for a scene. A layer is allowed only when the
 * field is open AND the layer does not contradict what the photo shows: no weather over an indoor photo,
 * and light is never relit (a day photo is not turned into night or back) — light is matched by choosing
 * an approved photo, not by editing one.
 */
export function allowedLayers(scene: StadiumScene, captured: { light: string } | null | undefined): Layer[] {
  if (!captured || captured.light === 'indoor') return [];
  if (scene.exposure !== 'outdoor' && scene.exposure !== 'roof-open') return [];
  const layers: Layer[] = [];
  if (scene.sky === 'cloud' && captured.light === 'day') layers.push('overcast');
  if (scene.precip) layers.push(scene.precip);
  return layers;
}
