// The favorites picker's view-model: which rows the one sheet shows for a sport/league filter and a search. Pure; the identity data it is fed comes
// from data/teamDirectory.ts. It decides only WHAT is listed; whether a row is on is read from the follows store (model/groups.ts, state/prefs.ts).
//
//   no query, filter "All"   one row to follow all college sports, and one "whole league" row per league (no team list: that would be ~700 rows)
//   no query, a league       that league's whole-league row, its conferences (college), then its teams
//   a query                  rows whose name, nickname, abbreviation, conference or league matches, narrowed by the filter
// Nothing is invented: a conference appears only if the identity data states it; a team appears only if the identity data or the slate lists it.
import { confToken, isCollege } from './groups';

export interface PickTeam {
  /** The follow key "slug:id", exactly as a game card's star writes it. */
  key: string;
  slug: string;
  name: string;
  nick: string;
  abbr: string;
  /** The short conference label ("SEC"), only when the identity data states one. */
  conference: string | null;
  logo: string | null;
  colors: [string, string];
}
export interface PickConference { label: string; token: string; count: number }
export interface PickLeague { slug: string; label: string; teams: PickTeam[]; /** College leagues only. */ conferences: PickConference[] }

export const LEAGUE_ORDER = ['nfl', 'cfb', 'cbb', 'nba', 'mlb', 'nhl', 'soccer', 'tennis'] as const;
const LABEL: Record<string, string> = { nfl: 'NFL', cfb: 'NCAAF', cbb: 'NCAAB', nba: 'NBA', mlb: 'MLB', nhl: 'NHL', soccer: 'Soccer', tennis: 'Tennis' };
export const leagueLabel = (slug: string): string => LABEL[slug] ?? slug.toUpperCase();
const rank = (slug: string) => { const i = (LEAGUE_ORDER as readonly string[]).indexOf(slug); return i < 0 ? LEAGUE_ORDER.length : i; };

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export interface LeagueInput {
  slug: string;
  teams: readonly PickTeam[];
  /** Conferences the identity data lists with their size, when the team list does not carry every team (NCAAB teams come from the slate). Else derived from `teams`. */
  conferences?: readonly { label: string; count: number }[];
}

/** Teams by name with one entry per follow key (the first wins), conferences in the order a fan expects, leagues in the product's order. */
export function buildLeagues(input: readonly LeagueInput[], conferenceOrder: readonly string[] = []): PickLeague[] {
  const order = (l: string) => { const i = conferenceOrder.indexOf(l); return i < 0 ? 999 : i; };
  return input
    .map((l): PickLeague => {
      const seen = new Set<string>();
      const teams = l.teams.filter((t) => !seen.has(t.key) && !!seen.add(t.key)).sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
      let confs: PickConference[] = [];
      if (isCollege(l.slug)) {
        const byToken = new Map<string, PickConference>();
        const add = (label: string, n: number) => { const token = confToken(label); if (!token) return; const c = byToken.get(token); if (c) c.count = Math.max(c.count, n); else byToken.set(token, { label, token, count: n }); };
        if (l.conferences) for (const c of l.conferences) add(c.label, c.count);
        else {
          const n = new Map<string, { label: string; count: number }>();
          for (const t of teams) if (t.conference) { const k = confToken(t.conference); n.set(k, { label: t.conference, count: (n.get(k)?.count ?? 0) + 1 }); }
          for (const c of n.values()) add(c.label, c.count);
        }
        confs = [...byToken.values()].sort((a, b) => order(a.label) - order(b.label) || a.label.localeCompare(b.label));
      }
      return { slug: l.slug, label: leagueLabel(l.slug), teams, conferences: confs };
    })
    .sort((a, b) => rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug));
}

export interface PickerLeagueView {
  league: PickLeague;
  /** The "follow the whole league" row. */
  leagueRow: boolean;
  conferences: PickConference[];
  teams: PickTeam[];
  /** Teams that match but are not listed (the list is capped). */
  moreTeams: number;
}
export interface PickerView {
  /** The "All college sports" row. */
  collegeRow: boolean;
  leagues: PickerLeagueView[];
  /** The list of teams is hidden until a league is chosen or a search is typed. */
  chooseHint: boolean;
  /** Nothing matches the search. */
  empty: boolean;
}

const COLLEGE_WORDS = ['college', 'ncaa', 'all college sports', 'all college'];

/** `filter` is "all" or a league slug; `query` is what was typed; `teamLimit` caps one league's listed teams. */
export function pickerView(leagues: readonly PickLeague[], filter: string, query: string, teamLimit = 60): PickerView {
  const q = norm(query);
  const inFilter = leagues.filter((l) => filter === 'all' || l.slug === filter);
  const collegeVisible = filter === 'all' || isCollege(filter);
  if (!q) {
    if (filter === 'all') {
      return { collegeRow: leagues.some((l) => isCollege(l.slug)), leagues: inFilter.map((league) => ({ league, leagueRow: true, conferences: [], teams: [], moreTeams: 0 })), chooseHint: true, empty: false };
    }
    return {
      collegeRow: collegeVisible && leagues.some((l) => isCollege(l.slug)),
      leagues: inFilter.map((league) => ({ league, leagueRow: true, conferences: league.conferences, teams: league.teams.slice(0, teamLimit), moreTeams: Math.max(0, league.teams.length - teamLimit) })),
      chooseHint: false,
      empty: false,
    };
  }
  const collegeRow = collegeVisible && leagues.some((l) => isCollege(l.slug)) && COLLEGE_WORDS.some((w) => w.includes(q));
  const out: PickerLeagueView[] = [];
  for (const league of inFilter) {
    const leagueHit = norm(league.label).includes(q) || (league.slug === 'cfb' && 'football college ncaa'.includes(q)) || (league.slug === 'cbb' && 'basketball college ncaa'.includes(q));
    const conferences = league.conferences.filter((c) => norm(c.label).includes(q));
    const all = league.teams.filter((t) => [t.name, t.nick, t.abbr, t.conference ?? ''].some((s) => norm(s).includes(q)));
    if (!leagueHit && !conferences.length && !all.length) continue;
    out.push({ league, leagueRow: leagueHit, conferences, teams: all.slice(0, teamLimit), moreTeams: Math.max(0, all.length - teamLimit) });
  }
  return { collegeRow, leagues: out, chooseHint: false, empty: !collegeRow && out.length === 0 };
}
