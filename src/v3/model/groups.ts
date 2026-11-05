// Following a GROUP: a whole league ("league:nfl"), a college conference ("conf:cfb:SEC") or every college sport ("college:all"). Pure (no React, no
// storage, no network). A group sits in the follows store beside teams, players and games (state/prefs.ts) and widens "is this game followed":
//
//   league:<slug>          every game of that sport
//   conf:<slug>:<Label>    a game where EITHER team is in that conference of that college sport (only when SIFT's identity data states the
//                          team's conference; a team with no stated conference never matches: nothing is inferred from a name)
//   college:all            every NCAAF and NCAAB game
//
// A group is a weaker reason than a star: priority.ts ranks a directly followed team or game first, a group-only game after it and before every
// unfollowed game. A group never creates a direct follow, and removing it removes only the group.
import type { V3Game } from './types';

export const COLLEGE_SLUGS = ['cfb', 'cbb'] as const;
export const isCollege = (slug: string): boolean => (COLLEGE_SLUGS as readonly string[]).includes(slug);

/** The address token of a conference label: "Big Ten" -> "big-ten". */
export const confToken = (label: string): string => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const COLLEGE_ALL = 'college:all';
export const MAX_GROUPS = 80;

export type GroupKind = 'college' | 'league' | 'conference';
export interface Group { key: string; kind: GroupKind; /** The sport slug; null for "all college sports". */ slug: string | null; /** The conference label as stored ("Big Ten"); conferences only. */ conference: string | null }

const SLUG = /^[a-z0-9]{2,12}$/;

export const leagueKey = (slug: string): string => `league:${slug.toLowerCase()}`;
/** A conference key keeps the label the viewer saw ("conf:cfb:Big Ten"); matching is by token, so "Big Ten" and "big-ten" are one conference. */
export const conferenceKey = (slug: string, label: string): string => `conf:${slug.toLowerCase()}:${label.trim()}`;

/** A stored key to its meaning, or null when it names nothing this build understands (an unknown key is dropped on revive, never guessed at). */
export function parseGroup(raw: unknown): Group | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim();
  if (key === COLLEGE_ALL) return { key, kind: 'college', slug: null, conference: null };
  const league = /^league:([a-z0-9]+)$/i.exec(key);
  if (league && SLUG.test(league[1].toLowerCase())) return { key: leagueKey(league[1]), kind: 'league', slug: league[1].toLowerCase(), conference: null };
  const conf = /^conf:([a-z0-9]+):(.{1,40})$/i.exec(key);
  if (conf && SLUG.test(conf[1].toLowerCase()) && isCollege(conf[1].toLowerCase()) && confToken(conf[2])) {
    return { key: conferenceKey(conf[1], conf[2]), kind: 'conference', slug: conf[1].toLowerCase(), conference: conf[2].trim() };
  }
  return null;
}

/** The sameness of two group keys (a conference by token, so a re-spelled label is the same group). */
export function sameGroup(a: string, b: string): boolean {
  const x = parseGroup(a), y = parseGroup(b);
  if (!x || !y) return a === b;
  return x.kind === y.kind && x.slug === y.slug && (x.conference == null ? y.conference == null : y.conference != null && confToken(x.conference) === confToken(y.conference));
}

/** A stored value to a clean list: valid keys only, canonical spelling, distinct, in stored order (most recent first), capped. Never throws. */
export function reviveGroups(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    const g = parseGroup(x);
    if (g && !out.some((k) => sameGroup(k, g.key))) out.push(g.key);
    if (out.length >= MAX_GROUPS) break;
  }
  return out;
}

export const hasGroup = (groups: readonly string[], key: string): boolean => groups.some((k) => sameGroup(k, key));

/** Toggle a group in a list (newest first, like every other follow). Returns the new list. */
export function toggleGroupIn(groups: readonly string[], key: string): string[] {
  const g = parseGroup(key);
  if (!g) return [...groups];
  return hasGroup(groups, g.key) ? groups.filter((k) => !sameGroup(k, g.key)) : [g.key, ...groups].slice(0, MAX_GROUPS);
}

/** True when one college game belongs to the group: league by sport, conference by either team's stated conference, college by sport. */
export function groupHasGame(group: string, g: Pick<V3Game, 'slug' | 'away' | 'home'>): boolean {
  const p = parseGroup(group);
  if (!p) return false;
  if (p.kind === 'college') return isCollege(g.slug);
  if (p.kind === 'league') return g.slug === p.slug;
  if (g.slug !== p.slug) return false;
  const want = confToken(p.conference!);
  return [g.away, g.home].some((t) => !!t.conference && confToken(t.conference) === want);
}

/** The followed groups a game belongs to, narrowest first (a conference, then a league, then all college sports): the first is the most specific reason. */
export function groupsOfGame(g: Pick<V3Game, 'slug' | 'away' | 'home'>, groups: readonly string[] | undefined): string[] {
  if (!groups?.length) return [];
  const rank = (k: string) => (k.startsWith('conf:') ? 0 : k.startsWith('league:') ? 1 : 2);
  return groups.filter((k) => groupHasGame(k, g)).sort((a, b) => rank(a) - rank(b));
}

export const followsViaGroup = (g: Pick<V3Game, 'slug' | 'away' | 'home'>, groups: readonly string[] | undefined): boolean => !!groups?.length && groups.some((k) => groupHasGame(k, g));

/**
 * The followed group that already includes this one, or null: "all college sports" covers every college league and conference, and a league covers its
 * own conferences. The picker shows a covered row as included (and not separately switchable) so the viewer never wonders why a tap changed nothing.
 */
export function coveredBy(groups: readonly string[], key: string): string | null {
  const g = parseGroup(key);
  if (!g || g.kind === 'college') return null;
  if (g.slug && isCollege(g.slug) && hasGroup(groups, COLLEGE_ALL)) return COLLEGE_ALL;
  if (g.kind === 'conference' && hasGroup(groups, leagueKey(g.slug!))) return leagueKey(g.slug!);
  return null;
}

/** The sports a list of groups reaches: a league or conference its own sport, "all college sports" both college sports. */
export function groupSports(groups: readonly string[]): string[] {
  const out = new Set<string>();
  for (const k of groups) {
    const g = parseGroup(k);
    if (!g) continue;
    if (g.kind === 'college') COLLEGE_SLUGS.forEach((s) => out.add(s)); else out.add(g.slug!);
  }
  return [...out];
}

/** The groups that reach one sport (null = all): the My SIFT sport filter. */
export function groupsInSport(groups: readonly string[], sport: string | null): string[] {
  return sport ? groups.filter((k) => groupSports([k]).includes(sport)) : [...groups];
}

const LEAGUE_WORD: Record<string, string> = { cfb: 'NCAAF', cbb: 'NCAAB' };
const leagueWord = (slug: string) => LEAGUE_WORD[slug] ?? slug.toUpperCase();

/** What the viewer reads: "All college sports", "NFL", "NCAAF · SEC". */
export function groupLabel(key: string): string {
  const g = parseGroup(key);
  if (!g) return key;
  if (g.kind === 'college') return 'All college sports';
  if (g.kind === 'league') return leagueWord(g.slug!);
  return `${leagueWord(g.slug!)} · ${g.conference}`;
}
