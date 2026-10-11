// Where an injury list comes from and how old it is, in plain words (issue 33). Every sport that publishes injuries
// copies them from a provider (ESPN today) at capture time; the reader should see the provider, when it was captured,
// whether that is still fresh for an injury list, and what each official designation means.
//
// Age words are for injury lists only (they never touch the market-quote freshness gates): a list captured within
// 6 hours is fresh, within 24 hours aging, older is stale — injury designations change daily in game weeks and the
// publications capture every few hours.
import { statusWord } from './nfl';

export type InjuryAge = 'fresh' | 'aging' | 'stale' | 'unknown';

export const INJURY_FRESH_MS = 6 * 3600_000;
export const INJURY_STALE_MS = 24 * 3600_000;

export interface InjurySourceInfo {
  /** "ESPN injury report". */
  name: string;
  /** What the reader should know about the source (official report not captured, name-matching …), or null. */
  caveat: string | null;
  /** Newest capture time among the rows (ISO), or null. */
  asOf: string | null;
  age: InjuryAge;
  /** "Fresh", "Aging", "Stale", "Age unknown". */
  ageWord: string;
  /** "captured 3 h ago" / "capture time not published". */
  ageText: string;
  /** The raw source string, for Data & provenance. */
  raw: string | null;
}

/** The provider in reader words, with the publication's own qualifier turned into a sentence. */
export function injurySourceName(raw: string | null | undefined): { name: string; caveat: string | null } {
  const s = (raw ?? '').trim();
  if (!s) return { name: 'Source not named', caveat: 'The publication does not say where this list comes from.' };
  const caveats: string[] = [];
  if (/official[^)]*not captured/i.test(s)) caveats.push('The official league injury report is not captured; this list can lag it.');
  if (/name-?matched/i.test(s)) caveats.push('Players are matched to the list by name.');
  if (/espn/i.test(s)) return { name: 'ESPN injury report', caveat: caveats.join(' ') || null };
  if (/sleeper/i.test(s)) return { name: 'Sleeper player status', caveat: caveats.join(' ') || null };
  if (/official/i.test(s)) return { name: 'Official league injury report', caveat: caveats.join(' ') || null };
  return { name: s.replace(/[_]+/g, ' ').replace(/\s*\(.*\)\s*$/, ''), caveat: caveats.join(' ') || null };
}

export function injuryAge(asOf: string | null | undefined, now: number): InjuryAge {
  const t = asOf ? Date.parse(asOf) : NaN;
  if (!Number.isFinite(t)) return 'unknown';
  const a = now - t;
  return a <= INJURY_FRESH_MS ? 'fresh' : a <= INJURY_STALE_MS ? 'aging' : 'stale';
}

const AGE_WORD: Record<InjuryAge, string> = { fresh: 'Fresh', aging: 'Aging', stale: 'Stale', unknown: 'Age unknown' };

/** "40 min", "3 h", "2 days". */
export function spanWords(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

/** Source, newest capture and its age for a list of injury rows ({ source, as_of } as the publications carry them). */
export function injurySource(rows: { source?: string | null; as_of?: string | null; asOf?: string | null }[], now: number): InjurySourceInfo {
  const raw = rows.map((r) => r.source).find((s) => !!s) ?? null;
  const times = rows.map((r) => r.as_of ?? r.asOf ?? null).filter((x): x is string => !!x && Number.isFinite(Date.parse(x)));
  const asOf = times.length ? times.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null;
  const { name, caveat } = injurySourceName(raw);
  const age = injuryAge(asOf, now);
  return { name, caveat, asOf, age, ageWord: AGE_WORD[age], ageText: asOf ? `captured ${spanWords(now - Date.parse(asOf))} ago` : 'capture time not published', raw };
}

/** The official designation in words, and what it means for the game. */
const MEANING: Record<string, string> = {
  OUT: 'will not play',
  DOUBTFUL: 'unlikely to play',
  QUESTIONABLE: 'uncertain to play',
  PROBABLE: 'expected to play',
  DAY_TO_DAY: 're-evaluated daily',
  INJURED_RESERVE: 'on injured reserve: out for several games',
  IR: 'on injured reserve: out for several games',
  PUP: 'physically unable to perform: out for several games',
  PHYSICALLY_UNABLE_TO_PERFORM: 'out for several games',
  SUSPENSION: 'suspended',
  SUSPENDED: 'suspended',
  ACTIVE: 'available',
};

export function designation(status: string | null | undefined): { word: string; meaning: string | null; code: string } {
  const code = String(status ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const word = code === 'IR' ? 'Injured reserve' : code === 'PUP' ? 'PUP list' : statusWord(code) || 'Not stated';
  return { word, meaning: MEANING[code] ?? null, code };
}

/** One sentence on when designations settle, per sport (null when the sport has no fixed moment). */
export function designationTiming(sport: string): string | null {
  if (sport === 'NFL') return 'Game designations are final at the inactive list, 90 minutes before kickoff.';
  if (sport === 'NBA') return 'NBA statuses can change up to tip-off.';
  if (sport === 'NHL') return 'Lineups are confirmed at morning skate and warm-ups.';
  return null;
}
