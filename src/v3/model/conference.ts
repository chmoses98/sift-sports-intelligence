// College conference vocabulary and the Home filter over it. Pure. A conference is only ever read from SIFT's committed identity data
// (data/conference.ts); a team with no stated conference matches no conference chip (it still shows under All).
import type { V3Game } from './types';
import { anyRanked } from './priority';

/** CFB: the publication's own conference labels ("BIG-TEN") as a reader writes them. */
const CFB_LABEL: Record<string, string> = {
  'SEC': 'SEC', 'BIG-TEN': 'Big Ten', 'BIG-12': 'Big 12', 'ACC': 'ACC', 'PAC-12': 'Pac-12', 'AAC': 'AAC', 'MOUNTAIN-WEST': 'Mountain West',
  'SUN-BELT': 'Sun Belt', 'MID-AMERICAN': 'MAC', 'CONFERENCE-USA': 'C-USA', 'BIG-EAST': 'Big East', 'INDEPENDENT': 'Ind', 'INDEPENDENTS': 'Ind',
  'CAA': 'CAA', 'BIG-SKY': 'Big Sky', 'SWAC': 'SWAC', 'PIONEER': 'Pioneer', 'SOUTHERN': 'SoCon', 'SOUTHLAND': 'Southland', 'PATRIOT': 'Patriot',
  'IVY': 'Ivy', 'BIG-SOUTH-OVC': 'Big South-OVC', 'MISSOURI-VALLEY': 'MVFC', 'UAC': 'UAC', 'NEC': 'NEC', 'MEAC': 'MEAC',
};
const title = (s: string) => s.toLowerCase().split(/[-\s]+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

/** The short label of a publication CFB conference key; an unknown key is title-cased rather than dropped. */
export const cfbConferenceLabel = (raw: string): string => CFB_LABEL[raw.toUpperCase()] ?? title(raw);

/** CBB identity names the American "American"; the football publication and every reader say AAC. One label across both sports. */
export const unifyLabel = (label: string): string => (label === 'American' ? 'AAC' : label);

/** The big conferences first, in the order a fan expects; every other conference follows alphabetically. */
export const CONFERENCE_ORDER = ['SEC', 'Big Ten', 'ACC', 'Big 12', 'Pac-12', 'AAC', 'Mountain West', 'Sun Belt', 'MAC', 'C-USA', 'Big East'] as const;

/** The address token of a conference label: "Big Ten" -> "big-ten". */
export const confToken = (label: string): string => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const COLLEGE_SLUGS = ['cfb', 'cbb'] as const;
export const isCollege = (slug: string): boolean => (COLLEGE_SLUGS as readonly string[]).includes(slug);

const rankIndex = (label: string) => { const i = (CONFERENCE_ORDER as readonly string[]).indexOf(label); return i < 0 ? 99 : i; };

/** The conferences that have a team in these games, in display order. */
export function conferencesIn(games: readonly V3Game[]): string[] {
  const set = new Set<string>();
  for (const g of games) for (const t of [g.away, g.home]) if (t.conference) set.add(t.conference);
  return [...set].sort((a, b) => rankIndex(a) - rankIndex(b) || a.localeCompare(b));
}

export type ConfFilter = 'all' | 'top25' | string;

/** Top 25 needs a top-25 rank the source stated for a team of the game. A conference matches when EITHER team is in it. */
export function matchesConference(g: V3Game, filter: ConfFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'top25') return anyRanked(g);
  return [g.away, g.home].some((t) => !!t.conference && confToken(t.conference) === filter);
}

/** The filter an address or a stored preference asks for, reduced to what this day's games can show (an unknown or empty one is All). */
export function resolveFilter(asked: string | null | undefined, games: readonly V3Game[]): ConfFilter {
  if (!asked || asked === 'all') return 'all';
  if (asked === 'top25') return games.some(anyRanked) ? 'top25' : 'all';
  return conferencesIn(games).some((c) => confToken(c) === asked) ? asked : 'all';
}
