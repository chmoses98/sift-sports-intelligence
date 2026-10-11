// What the weather means for THIS game: one decision, shared by every screen that shows kickoff conditions (the game
// hero, the Home featured hero, game cards, News, the Intelligence context lines).
//
//   * Dome (fixed roof)            → no outdoor weather at all: "Indoors · dome".
//   * Retractable roof, published  → the publication's per-game roof status: closed = indoors; open = the forecast.
//   * Retractable roof, unknown    → "Retractable roof · roof status not announced"; the outside forecast, if any, only
//                                     as context and never flagged as a game condition (the roof may well be closed).
//   * Open-air                     → the forecast, labelled "Context only · not in the projection" (docs/WEATHER_AUDIT.md:
//                                     no production projection uses weather).
//
// Roof construction comes from the venue facts table (src/lib/venueFacts.ts), falling back to the hero venue registry;
// a publication's per-game roof field (nflverse: dome / closed / open / outdoors) outranks it for roof STATUS. When the
// two disagree on construction (a publication calling an open-air stadium a dome, or the reverse) the construction
// wins and the disagreement is carried in `conflict`, so the screen can say so instead of silently picking one.
//
// A published forecast is withheld when it cannot be for this venue: its kickoff period carries a UTC offset that
// does not match the venue's time zone (the NFL capture reads the US National Weather Service at the HOME TEAM's
// stadium, so a London game arrived with a Jacksonville forecast).
import type { EventResearchDoc } from '../contract/types';
import type { HeroVenue } from './hero/types';
import { weatherIcon } from './gamedata';
import { venueById } from './hero/registry';
import { venueFact, type RoofType, type VenueFact } from './venueFacts';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** How the game is actually played, as far as anyone has said. */
export type RoofState = 'indoor' | 'roof-closed' | 'roof-open' | 'retractable' | 'outdoors' | 'unknown';

export interface GameWeather {
  /** The coarse class every consumer switches on. `outdoor` is the only kind whose conditions are game conditions. */
  kind: 'outdoor' | 'indoor' | 'retractable' | 'none';
  roof: RoofState;
  icon: string;
  temp: number | null;
  /** indoor / retractable: the roof words; outdoor: the published short forecast. */
  condition: string | null;
  wind: string | null;
  precip: number | null;
  /** A condition that plausibly matters for the game (shown with more weight, never as a pick). Outdoor only. */
  flag: string | null;
  /** The outside forecast in one line, when one was published and is shown as context (outdoor or retractable). */
  outside: string | null;
  /** The quiet second line: why the reader sees what they see. */
  note: string | null;
  /** Why a published forecast is NOT shown (it cannot be for this venue). */
  withheld: string | null;
  /** The publication's roof field and the venue's construction disagree (plain words), else null. */
  conflict: string | null;
  /** Where the roof answer came from. */
  roofSource: 'publication' | 'venue table' | 'venue registry' | null;
  /** The venue facts row used, if any. */
  venue: VenueFact | null;
}

export const CONTEXT_NOTE = 'Context only · not in the projection';
const CONTEXT_TITLE = 'Audited 2026-10-10: the NFL, CFB and soccer publications capture the forecast for context; it does not enter their simulations or probabilities.';
export { CONTEXT_TITLE };

/** The publication's roof word, normalised; '' and unknown words are "not published". */
export function publishedRoof(raw: unknown): 'dome' | 'closed' | 'open' | 'outdoors' | null {
  const p = String(raw ?? '').trim().toLowerCase();
  if (p === 'dome' || p === 'indoor' || p === 'indoors') return 'dome';
  if (p === 'closed') return 'closed';
  if (p === 'open') return 'open';
  if (p === 'outdoors' || p === 'outdoor' || p === 'open air' || p === 'open-air') return 'outdoors';
  return null;
}

const CONSTRUCTION_WORD: Record<RoofType, string> = { dome: 'a fixed-roof dome', retractable: 'a retractable-roof stadium', open: 'open-air' };

/**
 * The roof the game is played under: the publication's per-game status when it has one, checked against the
 * venue's construction (table first, then the hero registry).
 */
export function resolveRoof(published: unknown, construction: RoofType | null): { state: RoofState; conflict: string | null; source: GameWeather['roofSource'] } {
  const p = publishedRoof(published);
  const c = construction;
  if (!c) {
    if (p === 'dome') return { state: 'indoor', conflict: null, source: 'publication' };
    if (p === 'closed') return { state: 'roof-closed', conflict: null, source: 'publication' };
    if (p === 'open') return { state: 'roof-open', conflict: null, source: 'publication' };
    if (p === 'outdoors') return { state: 'outdoors', conflict: null, source: 'publication' };
    return { state: 'unknown', conflict: null, source: null };
  }
  if (c === 'retractable') {
    if (p === 'closed' || p === 'dome') return { state: 'roof-closed', conflict: null, source: 'publication' };
    if (p === 'open') return { state: 'roof-open', conflict: null, source: 'publication' };
    // "outdoors" for a retractable roof says nothing about the roof: keep it unknown, and say the record disagrees.
    if (p === 'outdoors') return { state: 'retractable', conflict: `The publication lists this game as open-air; the venue is ${CONSTRUCTION_WORD.retractable}, so the roof status is treated as not announced.`, source: 'venue table' };
    return { state: 'retractable', conflict: null, source: 'venue table' };
  }
  if (c === 'dome') {
    if (p === 'outdoors' || p === 'open') return { state: 'indoor', conflict: `The publication lists this game as ${p === 'open' ? 'roof open' : 'open-air'}; the venue is ${CONSTRUCTION_WORD.dome}, so it is shown as indoors.`, source: 'venue table' };
    return { state: 'indoor', conflict: null, source: p ? 'publication' : 'venue table' };
  }
  // open-air construction
  if (p === 'dome' || p === 'closed') return { state: 'outdoors', conflict: `The publication lists this game as ${p === 'dome' ? 'a dome' : 'roof closed'}; the venue is ${CONSTRUCTION_WORD.open}, so it is shown as open-air.`, source: 'venue table' };
  return { state: 'outdoors', conflict: null, source: p ? 'publication' : 'venue table' };
}

/** "+01:00" style offset of a time zone at an instant (null when the runtime cannot say). */
export function zoneOffset(tz: string, atIso: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(atIso));
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    if (name === 'GMT') return '+00:00';
    const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(name);
    return m ? `${m[1]}:${m[2] ?? '00'}` : null;
  } catch {
    return null;
  }
}

/** The UTC offset written at the end of an ISO time ("…T13:00:00-07:00" → "-07:00"; "Z" → "+00:00"). */
export function isoOffset(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (/z$/i.test(iso)) return '+00:00';
  const m = /([+-]\d{2}):?(\d{2})$/.exec(iso);
  return m ? `${m[1]}:${m[2]}` : null;
}

/** Why a published forecast cannot be for this venue, or null when nothing says so. */
export function forecastMismatch(w: any, fact: VenueFact | null, kickoffIso: string | null | undefined): string | null {
  if (!fact || !w) return null;
  const at = w.period_start ?? kickoffIso;
  const got = isoOffset(w.period_start);
  const want = at ? zoneOffset(fact.tz, at) : null;
  if (got && want && got !== want) {
    return `The published forecast is for a different place (its kickoff hour is in UTC${got}, ${fact.city} is in UTC${want}), so it is not shown.`;
  }
  return null;
}

function constructionOf(venue: Pick<HeroVenue, 'roof'> & Partial<Pick<HeroVenue, 'id' | 'name'>> | null, pubName: string | null): { fact: VenueFact | null; roof: RoofType | null; from: GameWeather['roofSource'] } {
  const fact = venueFact(venue?.id ?? null, venue?.name ?? pubName) ?? (pubName ? venueFact(pubName) : null);
  if (fact) return { fact, roof: fact.roof, from: 'venue table' };
  const r = venue?.roof;
  if (r) return { fact: null, roof: r === 'outdoor' ? 'open' : r, from: 'venue registry' };
  return { fact: null, roof: null, from: null };
}

const noWeather = { temp: null, wind: null, precip: null, flag: null, outside: null } as const;

function outsideLine(t: number, cond: string | null, wind: string | null, precip: number | null): string {
  return [`${t}° ${cond ?? ''}`.trim(), wind?.replace(/^Wind/, 'wind'), precip != null && precip >= 30 ? `${precip}% precipitation` : null].filter(Boolean).join(' · ');
}

/**
 * The kickoff conditions the publication captured, read honestly for the roof the game is under.
 * `venue` is the hero's resolved venue (id, name, registry roof); the publication's own venue/weather fields are read
 * from `r.context`.
 */
export function venueWeather(r: Pick<EventResearchDoc, 'context'> & { event?: { start_time_utc?: string } }, venue: (Pick<HeroVenue, 'roof'> & Partial<Pick<HeroVenue, 'id' | 'name'>>) | null): GameWeather {
  const w = (r.context as any)?.weather as any;
  const pubVenue = (r.context as any)?.venue as any;
  const pubName = (typeof pubVenue?.name === 'string' && pubVenue.name) || (typeof w?.stadium === 'string' && w.stadium) || null;
  const { fact, roof: construction, from } = constructionOf(venue, pubName);
  const pubRoof = publishedRoof(pubVenue?.roof) ?? publishedRoof(w?.roof);
  const { state, conflict, source } = resolveRoof(pubRoof, construction);
  const roofSource = source === 'venue table' ? from : source;
  const base = { roof: state, conflict, roofSource, venue: fact, withheld: null as string | null };

  if (state === 'indoor' || state === 'roof-closed') {
    const arena = !!venue?.id && venueById(venue.id)?.kind === 'arena';
    const condition = state === 'roof-closed' ? 'Roof closed' : arena ? 'Indoor arena' : 'Indoors · dome';
    return { ...base, ...noWeather, kind: 'indoor', icon: 'dome', condition, note: state === 'roof-closed' ? 'Roof closed for this game · no weather exposure' : arena ? 'No weather exposure' : 'Fixed roof · no weather exposure' };
  }

  const has = !!w?.available && w.temperature_f != null;
  const withheld = has ? forecastMismatch(w, fact, r.event?.start_time_utc) : null;
  const t = has ? Number(w.temperature_f) : null;
  const wind = has && w.wind ? `Wind ${w.wind}${w.wind_direction ? ` ${w.wind_direction}` : ''}` : null;
  const precip = has ? (w.precipitation_probability ?? null) : null;
  const cond = has ? (w.short_forecast ?? null) : null;

  if (state === 'retractable') {
    const show = has && !withheld;
    return {
      ...base, withheld, kind: 'retractable', icon: 'dome', condition: 'Retractable roof',
      temp: show ? t : null, wind: show ? wind : null, precip: show ? precip : null, flag: null,
      outside: show && t != null ? outsideLine(t, cond, wind, precip) : null,
      note: show ? 'Roof status not announced · outside forecast for context' : 'Roof status not announced',
    };
  }

  if (!has || withheld) {
    const reason = withheld ?? (w?.available === false && w?.reason ? `No forecast captured yet (${String(w.reason).replace(/\.$/, '')}).` : null);
    return { ...base, withheld, ...noWeather, kind: 'none', icon: 'partly', condition: null, note: reason ?? (w == null ? 'No forecast in this publication' : 'Forecast not published yet') };
  }

  const mph = Math.max(0, ...String(w.wind ?? '').replace(/to/g, ' ').split(/\s+/).map(Number).filter((x) => Number.isFinite(x)));
  const flag = mph >= 15 ? `Wind ${mph} mph` : precip != null && precip >= 50 ? (/snow/i.test(cond ?? '') ? 'Snow likely' : 'Rain likely') : t! <= 32 ? 'Freezing' : t! >= 90 ? 'Heat' : null;
  return {
    ...base, kind: 'outdoor', icon: weatherIcon(cond), temp: t, condition: cond, wind, precip, flag,
    outside: outsideLine(t!, cond, wind, precip),
    note: state === 'roof-open' ? `Roof open · ${CONTEXT_NOTE.toLowerCase()}` : state === 'unknown' ? `Venue roof not confirmed · ${CONTEXT_NOTE.toLowerCase()}` : CONTEXT_NOTE,
  };
}

/** Kickoff conditions in one quiet line ("67° Mostly Sunny · wind 6 mph", "Indoors · dome", "Retractable roof · …"). */
export function venueWeatherLine(wx: GameWeather): string | null {
  if (wx.kind === 'indoor') return wx.condition;
  if (wx.kind === 'retractable') return `Retractable roof · roof status not announced${wx.temp != null ? ` · ${wx.temp}° outside` : ''}`;
  if (wx.kind !== 'outdoor') return null;
  return `${wx.roof === 'roof-open' ? 'Roof open · ' : ''}${wx.outside}`;
}

/**
 * Soccer's kickoff weather line (Open-Meteo capture, metric units, context only — soccer-edge-finder's
 * providers/open_meteo.py: "Nothing here feeds pricing"), read for the venue's roof. Null when nothing was captured.
 */
export function soccerWeatherLine(venueName: string | null | undefined, wx: { temperature_2m?: number | null; precipitation_probability?: number | null; wind_speed_10m?: number | null } | null | undefined): string | null {
  const fact = venueFact(venueName ?? null);
  if (fact?.roof === 'dome') return 'Indoors · dome';
  if (wx?.temperature_2m == null) return fact?.roof === 'retractable' ? 'Retractable roof · roof status not announced' : null;
  const t = `${Math.round(wx.temperature_2m)}°C`;
  if (fact?.roof === 'retractable') return `Retractable roof · roof status not announced · ${t} outside`;
  return `${t}${wx.precipitation_probability != null ? `, ${wx.precipitation_probability}% rain` : ''}${wx.wind_speed_10m != null ? `, wind ${Math.round(wx.wind_speed_10m)} km/h` : ''} (context only)`;
}
