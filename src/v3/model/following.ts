// Following: the pure selectors behind the Following screen. Everything the viewer follows (teams, players, games) across every sport is read
// together; a sport filter only narrows what is shown. Nothing here reads a document or invents a value: it sorts and groups what the slate and
// the follows store already hold.
import type { V3Game } from './types';
import { dayKey, keyWord } from './time';
import { groupSports, groupsInSport, groupsOfGame, reviveGroups } from './groups';

/**
 * The follows store's shape (state/prefs.ts). Keys are "slug:id": a team "nfl:DAL", a player "nba:prt_…", a game "nfl:evt_…". `groups` are whole
 * leagues, college conferences or all college sports ("league:nfl", "conf:cfb:SEC", "college:all"; model/groups.ts). Stored shapes from before
 * groups existed have no `groups`; they load with none and keep every team, player and game.
 */
export interface FollowSet { teams: string[]; players: string[]; games: string[]; groups: string[] }

export const SPORT_ORDER = ['nfl', 'cfb', 'cbb', 'nba', 'mlb', 'nhl', 'soccer', 'tennis'] as const;

const MAX_FOLLOWS = 500;

/**
 * A stored follows value to the current shape. Older builds (and other tabs) may hold a missing list, a non-list, duplicates or non-string
 * entries; every list is made a list of distinct non-empty strings, most recent first as stored. Never throws.
 */
export function reviveFollows(raw: unknown): FollowSet {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const list = (x: unknown): string[] => {
    if (!Array.isArray(x)) return [];
    const seen = new Set<string>();
    for (const k of x) if (typeof k === 'string' && k.trim() && k.length <= 120) seen.add(k.trim());
    return [...seen].slice(0, MAX_FOLLOWS);
  };
  return { teams: list(o.teams), players: list(o.players), games: list(o.games), groups: reviveGroups(o.groups) };
}

export const keySlug = (key: string): string => key.split(':')[0].toLowerCase();
export const keyId = (key: string): string => key.split(':').slice(1).join(':');

export const isEmptyFollows = (f: FollowSet): boolean => !f.teams.length && !f.players.length && !f.games.length && !f.groups.length;

/** How many things the viewer follows: the Home Following badge. A group counts once, however many games it brings. */
export const followCount = (f: Pick<FollowSet, 'teams' | 'games' | 'groups'>): number => f.teams.length + f.games.length + f.groups.length;

/** The sports something is followed in, in the product's order. Unknown sport slugs follow the known ones (never dropped). */
export function followedSports(f: FollowSet): string[] {
  const have = new Set([...[...f.teams, ...f.players, ...f.games].map(keySlug).filter(Boolean), ...groupSports(f.groups)]);
  const known = SPORT_ORDER.filter((s) => have.has(s));
  const rest = [...have].filter((s) => !(SPORT_ORDER as readonly string[]).includes(s)).sort();
  return [...known, ...rest];
}

/** The sport filter as the address states it, honoured only when the viewer follows something in that sport (anything else is "all"). */
export const validSport = (raw: string | null | undefined, f: FollowSet): string | null => (raw && followedSports(f).includes(raw) ? raw : null);

/** The follows narrowed to one sport (null = all). A filter, never a new selection. */
export function filterFollows(f: FollowSet, sport: string | null): FollowSet {
  if (!sport) return f;
  const keep = (k: string) => keySlug(k) === sport;
  return { teams: f.teams.filter(keep), players: f.players.filter(keep), games: f.games.filter(keep), groups: groupsInSport(f.groups, sport) };
}

export const teamKeyOf = (g: V3Game, side: 'away' | 'home') => `${g.slug}:${g[side].id}`;

/** Why a game is on this screen, strongest first. A player counts through the team he is on (`playerTeams`: player key to team key). */
export type Why = { kind: 'game' } | { kind: 'team'; teamKey: string } | { kind: 'player'; playerKey: string } | { kind: 'group'; groupKey: string };

export function whyFollowed(g: V3Game, f: FollowSet, playerTeams: Readonly<Record<string, string | null | undefined>> = {}): Why[] {
  const out: Why[] = [];
  if (f.games.includes(g.key)) out.push({ kind: 'game' });
  for (const side of ['away', 'home'] as const) {
    const k = teamKeyOf(g, side);
    if (f.teams.includes(k)) out.push({ kind: 'team', teamKey: k });
  }
  for (const p of f.players) {
    const t = playerTeams[p];
    if (t && (t === teamKeyOf(g, 'away') || t === teamKeyOf(g, 'home'))) out.push({ kind: 'player', playerKey: p });
  }
  // The most specific followed group only: one reason, however many of the viewer's groups include the game.
  const group = groupsOfGame(g, f.groups)[0];
  if (group) out.push({ kind: 'group', groupKey: group });
  return out;
}

export interface FollowedGame { g: V3Game; why: Why[] }

/**
 * THE single ordering point for this screen. Order within a section must not move when a score or a price refreshes, so this uses only what
 * does not change during a game: how strongly the game is followed, the start time, the key. To rank by game priority (close and late games
 * first) swap this one function for model/priority.ts when it lands: `FollowedGame` carries everything it needs (`g`, `why`).
 */
export function compareLive(a: FollowedGame, b: FollowedGame): number {
  return strength(b) - strength(a) || a.g.startMs - b.g.startMs || a.g.key.localeCompare(b.g.key);
}
const strength = (x: FollowedGame) => (x.why.some((w) => w.kind === 'game') ? 3 : 0) + (x.why.some((w) => w.kind === 'team') ? 2 : 0) + (x.why.some((w) => w.kind === 'player') ? 1 : 0) + (x.why.some((w) => w.kind === 'group') ? 0.5 : 0);
/** A game followed only through a group (a league, conference or all college sports): no star, team or player of the viewer's is in it. */
export const groupOnly = (x: FollowedGame): boolean => x.why.length > 0 && x.why.every((w) => w.kind === 'group');

/**
 * The first `limit` of a list already in display order, except that games followed only through a group cannot take the places of the viewer's own:
 * the viewer's teams and games come first, a group fills what is left (at least `minGroup` places, so a followed league is never silently empty).
 * The result keeps the input order.
 */
export function capWithGroups(list: readonly FollowedGame[], limit: number, minGroup = 3): FollowedGame[] {
  const own = list.filter((x) => !groupOnly(x)).slice(0, limit);
  const room = Math.max(limit - own.length, Math.min(minGroup, limit));
  const keep = new Set<FollowedGame>([...own, ...list.filter(groupOnly).slice(0, room)]);
  return list.filter((x) => keep.has(x));
}

/** Every game the viewer follows on purpose, and at most `max` of those followed only through a group. */
const capGroupOnly = (list: readonly FollowedGame[], max: number): FollowedGame[] => { let n = 0; return list.filter((x) => !groupOnly(x) || ++n <= max); };

const byStart = (a: FollowedGame, b: FollowedGame) => a.g.startMs - b.g.startMs || a.g.key.localeCompare(b.g.key);
const byRecent = (a: FollowedGame, b: FollowedGame) => b.g.startMs - a.g.startMs || a.g.key.localeCompare(b.g.key);

export interface DayGroup { day: string; word: string; games: FollowedGame[] }

/** Games grouped by the viewer's local calendar day, in the order given (a game without a start time sorts last under "Time to be announced"). */
export function groupByDay(list: FollowedGame[], todayKey: string): DayGroup[] {
  const out: DayGroup[] = [];
  for (const x of list) {
    const day = dayKey(x.g.startMs) ?? '';
    let grp = out.find((d) => d.day === day);
    if (!grp) { grp = { day, word: day ? keyWord(day, todayKey) : 'Time to be announced', games: [] }; out.push(grp); }
    grp.games.push(x);
  }
  return out;
}

export interface FollowingOptions {
  /** Player key to the team key he is on ("nba:prt_1" to "nba:NYK"), where the player's team is known. */
  playerTeams?: Readonly<Record<string, string | null | undefined>>;
  /** Sport slug to narrow to (already validated), or null for every followed sport. */
  sport?: string | null;
  now: number;
  upcomingLimit?: number;
  finalsLimit?: number;
  /** How many games in play that are followed ONLY through a group are listed (default 12): a whole league on a busy day must not bury the viewer's own teams. */
  groupLiveLimit?: number;
}

export interface FollowingView {
  /** Games in play, then games past their start with no result yet. */
  live: FollowedGame[];
  /** Games in play followed only through a group that the limit left out (the screen says how many and points to Home). */
  groupLiveHidden: number;
  pending: FollowedGame[];
  /** Games still to come, by start time, grouped by day. */
  upcoming: DayGroup[];
  upcomingCount: number;
  /** The most recent results first. */
  finals: FollowedGame[];
  /** Followed game keys that are not on the published slate (for the management list). */
  missingGames: string[];
}

/** Everything the screen lists, from the slate and the follows. Pure and deterministic for the same inputs. */
export function selectFollowing(games: readonly V3Game[], f: FollowSet, o: FollowingOptions): FollowingView {
  const sport = o.sport ?? null;
  const fs = filterFollows(f, sport);
  const mine: FollowedGame[] = [];
  const onSlate = new Set<string>();
  for (const g of games) {
    onSlate.add(g.key);
    if (sport && g.slug !== sport) continue;
    const why = whyFollowed(g, fs, o.playerTeams);
    if (why.length) mine.push({ g, why });
  }
  const phase = (p: V3Game['phase']) => mine.filter((x) => x.g.phase === p);
  const upcoming = phase('pregame').sort(byStart);
  const liveAll = phase('live').sort(compareLive);
  const liveCap = o.groupLiveLimit ?? 12;
  let groupSeen = 0;
  const live = liveAll.filter((x) => !groupOnly(x) || ++groupSeen <= liveCap);
  const limit = o.upcomingLimit ?? 16;
  return {
    live,
    groupLiveHidden: liveAll.length - live.length,
    pending: capGroupOnly(phase('other').sort(byStart), 6),
    upcoming: groupByDay(capWithGroups(upcoming, limit), dayKey(o.now) ?? ''),
    upcomingCount: upcoming.length,
    finals: capWithGroups(phase('final').sort(byRecent), o.finalsLimit ?? 8),
    missingGames: fs.games.filter((k) => !onSlate.has(k)),
  };
}

/** Teams on the slate in order of how soon they play (live first), one entry per team: the empty state's "popular teams". Deterministic. */
export function suggestTeams(games: readonly V3Game[], max = 6): V3Game['away'][] {
  const rank = (g: V3Game) => (g.phase === 'live' ? 0 : g.phase === 'pregame' ? 1 : 2);
  const sorted = [...games].sort((a, b) => rank(a) - rank(b) || a.startMs - b.startMs || a.key.localeCompare(b.key));
  const seen = new Set<string>();
  const out: V3Game['away'][] = [];
  // Spread across sports first: the soonest game of each sport, then the rest.
  const perSport = new Map<string, V3Game[]>();
  for (const g of sorted) perSport.set(g.slug, [...(perSport.get(g.slug) ?? []), g]);
  const round: V3Game[][] = [...perSport.entries()].sort(([a], [b]) => sportRank(a) - sportRank(b)).map(([, l]) => l);
  for (let i = 0; out.length < max; i++) {
    let any = false;
    for (const l of round) {
      const g = l[Math.floor(i / 2)];
      if (!g) continue;
      any = true;
      const t = i % 2 === 0 ? g.home : g.away;
      const k = `${t.slug}:${t.id}`;
      if (!seen.has(k)) { seen.add(k); out.push(t); if (out.length >= max) break; }
    }
    if (!any) break;
  }
  return out;
}
const sportRank = (s: string) => { const i = (SPORT_ORDER as readonly string[]).indexOf(s); return i < 0 ? SPORT_ORDER.length : i; };

/** The most recent games of a player's log first, capped: the Following card's "recent performances" rows. */
export function recentRows<T extends { date: string }>(obs: readonly T[], n = 3): T[] {
  return [...obs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
}

/** Mean of the values that exist (null when none do): never a guess for a missing game. */
export function meanOf(values: readonly (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
