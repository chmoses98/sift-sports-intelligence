// The league schedule layer: every NFL game of the season with its final score and, once it is final, the closing
// spread and total as nflverse publishes them (scripts/history/build-nfl-schedule.mjs → public/data/league/nfl/).
// Pure helpers turn one row into a result line ("DET won 31–25 · DET −5.5 covered") and the whole schedule into
// season records. Nothing is modelled: a record is a count of published finals, a cover is the published final
// margin against the published closing spread. A game without a final score has no result and no line here.
import { getJson, joinUrl } from '../data/fetcher';
import { useAsync } from '../data/hooks';

export interface LeagueGame {
  id: string;
  week: number | null;
  /** REG / WC / DIV / CON / SB (nflverse game_type). */
  type: string | null;
  /** Local (US Eastern) game date, YYYY-MM-DD. */
  date: string | null;
  time_et: string | null;
  away: string;
  home: string;
  neutral: boolean;
  /** A division game (nflverse div_game). */
  div?: boolean;
  away_score: number | null;
  home_score: number | null;
  overtime: boolean | null;
  /** nflverse closing spread: POSITIVE = home favoured by that many points. Null until the game is final. */
  spread_line: number | null;
  total_line: number | null;
}

export interface LeagueScheduleDoc {
  kind: 'sift_league_schedule';
  sport: string;
  season: number;
  built_at: string;
  source: { url: string; rows: number; licence: string };
  notes: string[];
  games: LeagueGame[];
}

export const LEAGUE_SOURCE = 'nflverse schedule (CC-BY 4.0)';

let base = `${import.meta.env.BASE_URL}data/league`;
/** Tests point the layer at a disk reader. */
export function setLeagueBase(b: string): void {
  base = b;
}

export const leagueAvailable = (sportCode: string | null | undefined) => (sportCode ?? '').toUpperCase() === 'NFL';

export function leagueSchedule(sportCode = 'NFL'): Promise<LeagueScheduleDoc> {
  return getJson<LeagueScheduleDoc>(joinUrl(base, `${sportCode.toLowerCase()}/schedule.json`));
}

/** The season schedule, or null (never an error screen) when the sport has none or the file cannot be read. */
export function useLeagueSchedule(sportCode: string | null | undefined) {
  return useAsync(leagueAvailable(sportCode) ? `league:${sportCode}` : null, () => leagueSchedule(sportCode!).catch(() => null));
}

export const isFinal = (g: Pick<LeagueGame, 'away_score' | 'home_score'>): boolean => g.away_score != null && g.home_score != null;

export interface FinalResult {
  away: number;
  home: number;
  /** Winner's abbreviation, null for a tie. */
  winner: string | null;
  loser: string | null;
  margin: number;
  overtime: boolean;
}

export function finalOf(g: LeagueGame): FinalResult | null {
  if (!isFinal(g)) return null;
  const a = g.away_score!, h = g.home_score!;
  return { away: a, home: h, winner: a === h ? null : a > h ? g.away : g.home, loser: a === h ? null : a > h ? g.home : g.away, margin: Math.abs(a - h), overtime: !!g.overtime };
}

export type Cover = 'covered' | 'not_covered' | 'push';

export interface AtsResult {
  /** The favourite by the closing spread, or null for a pick'em. */
  favourite: string | null;
  underdog: string | null;
  /** Points the favourite gave (positive). 0 for a pick'em. */
  line: number;
  /** From the favourite's side; null for a pick'em (nobody gave points). */
  cover: Cover | null;
  /** "DET −5.5 · covered", "DET −5.5 · did not cover", "DET −3 · push", "Pick'em". */
  text: string;
  /** Who won against the spread: the favourite, the underdog, or null (push / pick'em). */
  atsWinner: string | null;
}

const fmtLine = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * Against the spread, from the published final and the published closing spread only. Null when either is missing:
 * Sift never estimates a closing line.
 */
export function atsOf(g: LeagueGame): AtsResult | null {
  const f = finalOf(g);
  if (!f || g.spread_line == null || !Number.isFinite(g.spread_line)) return null;
  const s = g.spread_line;
  if (s === 0) {
    const w = f.winner;
    return { favourite: null, underdog: null, line: 0, cover: null, text: 'Pick’em', atsWinner: w };
  }
  const homeFav = s > 0;
  const favourite = homeFav ? g.home : g.away;
  const underdog = homeFav ? g.away : g.home;
  const favMargin = homeFav ? f.home - f.away : f.away - f.home;
  const line = Math.abs(s);
  const cover: Cover = favMargin > line ? 'covered' : favMargin === line ? 'push' : 'not_covered';
  const text = `${favourite} −${fmtLine(line)} · ${cover === 'covered' ? 'covered' : cover === 'push' ? 'push' : 'did not cover'}`;
  return { favourite, underdog, line, cover, text, atsWinner: cover === 'covered' ? favourite : cover === 'not_covered' ? underdog : null };
}

/** Over/under against the published closing total. Null when the game is not final or no total is published. */
export function totalResultOf(g: LeagueGame): { line: number; points: number; result: 'over' | 'under' | 'push' } | null {
  const f = finalOf(g);
  if (!f || g.total_line == null) return null;
  const points = f.away + f.home;
  return { line: g.total_line, points, result: points > g.total_line ? 'over' : points < g.total_line ? 'under' : 'push' };
}

export interface TeamRecord { w: number; l: number; t: number; text: string }

/**
 * Win–loss(–tie) records from published finals, counting only games dated BEFORE `beforeDate` (YYYY-MM-DD) when
 * given, so a pregame card never includes the game's own result. Regular season only unless `includePost`.
 */
export function recordsFrom(games: LeagueGame[], beforeDate?: string | null, includePost = false): Map<string, TeamRecord> {
  const m = new Map<string, { w: number; l: number; t: number }>();
  const bump = (k: string, f: 'w' | 'l' | 't') => { const r = m.get(k) ?? { w: 0, l: 0, t: 0 }; r[f]++; m.set(k, r); };
  for (const g of games) {
    if (!includePost && g.type && g.type !== 'REG') continue;
    if (beforeDate && (!g.date || g.date >= beforeDate)) continue;
    const f = finalOf(g);
    if (!f) continue;
    if (!f.winner) { bump(g.away, 't'); bump(g.home, 't'); continue; }
    bump(f.winner, 'w');
    bump(f.loser!, 'l');
  }
  return new Map([...m.entries()].map(([k, r]) => [k, { ...r, text: `${r.w}–${r.l}${r.t ? `–${r.t}` : ''}` }]));
}

/** Against-the-spread records from the published closing spreads (pushes counted separately), before a date. */
export function atsRecordsFrom(games: LeagueGame[], beforeDate?: string | null): Map<string, { w: number; l: number; p: number; text: string }> {
  const m = new Map<string, { w: number; l: number; p: number }>();
  const bump = (k: string, f: 'w' | 'l' | 'p') => { const r = m.get(k) ?? { w: 0, l: 0, p: 0 }; r[f]++; m.set(k, r); };
  for (const g of games) {
    if (beforeDate && (!g.date || g.date >= beforeDate)) continue;
    const a = atsOf(g);
    if (!a || a.favourite == null) continue;
    if (a.cover === 'push') { bump(g.away, 'p'); bump(g.home, 'p'); continue; }
    bump(a.atsWinner!, 'w');
    bump(a.atsWinner === g.home ? g.away : g.home, 'l');
  }
  return new Map([...m.entries()].map(([k, r]) => [k, { ...r, text: `${r.w}–${r.l}${r.p ? `–${r.p}` : ''}` }]));
}

/** The local game date (US Eastern, as nflverse dates games) of a UTC kickoff. */
export function easternDate(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
  } catch {
    return new Date(t - 4 * 3600_000).toISOString().slice(0, 10);
  }
}

/**
 * The schedule row for a published game: same away and home abbreviations, dated within a day and a half of the
 * kickoff (teams meet at most twice a season, weeks apart). Null when nothing matches — never a guess.
 */
export function findLeagueGame(games: LeagueGame[] | null | undefined, away: string | null | undefined, home: string | null | undefined, startIso: string): LeagueGame | null {
  if (!games || !away || !home) return null;
  const t = Date.parse(startIso);
  if (!Number.isFinite(t)) return null;
  const near = (g: LeagueGame) => g.date != null && Math.abs(Date.parse(`${g.date}T12:00:00Z`) - t) < 1.5 * 86_400_000;
  return games.find((g) => g.away === away && g.home === home && near(g))
    // A neutral-site game may be listed with the sides the other way round by one of the two sources.
    ?? games.find((g) => g.neutral && g.away === home && g.home === away && near(g))
    ?? null;
}

/** "Lions won 31–25" style result line, winner's score first. */
export function resultLine(g: LeagueGame): string | null {
  const f = finalOf(g);
  if (!f) return null;
  if (!f.winner) return `Tied ${f.away}–${f.home}${f.overtime ? ' (OT)' : ''}`;
  const hi = Math.max(f.away, f.home), lo = Math.min(f.away, f.home);
  return `${f.winner} won ${hi}–${lo}${f.overtime ? ' (OT)' : ''}`;
}

export type LeagueCell =
  | { kind: 'game'; game: LeagueGame; home: boolean; opp: string }
  | { kind: 'bye' }
  | { kind: 'none' };

/** A full regular season (17 games × 32 teams / 2). Below it the schedule is partial and no bye is inferred. */
export const FULL_REG_SEASON = 272;

/**
 * One team's regular season, week by week. A bye is stated only when the schedule is complete (every regular-season
 * game listed) and the week has games but none of this team's; otherwise an empty week is "none", never a bye.
 */
export function leagueWeekCells(games: LeagueGame[], abbr: string, weeks = 18): LeagueCell[] {
  const reg = games.filter((g) => g.type == null || g.type === 'REG');
  const complete = reg.length >= FULL_REG_SEASON;
  return Array.from({ length: weeks }, (_, i) => {
    const w = i + 1;
    const inWeek = reg.filter((g) => g.week === w);
    const g = inWeek.find((x) => x.home === abbr || x.away === abbr);
    if (g) return { kind: 'game', game: g, home: g.home === abbr, opp: g.home === abbr ? g.away : g.home };
    return complete && inWeek.length ? { kind: 'bye' } : { kind: 'none' };
  });
}

/** The current week: the first regular-season week with a game not yet final on or after `today` (YYYY-MM-DD). */
export function currentLeagueWeek(games: LeagueGame[], today: string): number | null {
  const reg = games.filter((g) => (g.type == null || g.type === 'REG') && g.week != null);
  if (!reg.length) return null;
  const open = reg.filter((g) => !isFinal(g) && (g.date ?? '') >= today).sort((a, b) => (a.week ?? 0) - (b.week ?? 0));
  if (open.length) return open[0].week;
  return Math.max(...reg.map((g) => g.week ?? 0));
}
