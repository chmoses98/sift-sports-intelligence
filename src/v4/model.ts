// Pure view-model helpers for the v4 screens: calendar days, the three honest filters and the lifecycle words.
// Nothing here fetches or invents data; every word is derived from fields the publication states.
import type { GameRow } from '../views/broadcast/games';
import { teamKey } from './follow';
import { shownState, NO_SCORES, type Scores } from './scoreState';
import type { ScoreRead } from '../live/scores/store';

export const dateKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** A `YYYY-MM-DD` key moved by whole calendar days (calendar fields, so a daylight-saving day cannot skip or repeat one). */
export const shiftDay = (key: string, n: number) => {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, (m || 1) - 1, (d || 1) + n).getTime());
};

export interface DayCell { key: string; weekday: string; label: string; today: boolean }

/** The days offered on the strip: three back, ten ahead, around today. */
export function dayStrip(now: number, back = 3, ahead = 10): DayCell[] {
  const today = dateKey(now);
  return Array.from({ length: back + ahead + 1 }, (_, i) => {
    const key = shiftDay(today, i - back);
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return {
      key,
      today: key === today,
      weekday: key === today ? 'Today' : dt.toLocaleDateString(undefined, { weekday: 'short' }),
      label: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    };
  });
}

// Each takes the game's score read when a score feed (today the Live Score Demo) has one. The read only changes which group a game is
// SHOWN in; the publication's own status (g.phase) is still what the research layer uses, and these are not used there.
export const isLiveGame = (g: GameRow, r?: ScoreRead | null) => { const s = shownState(r); return s ? s === 'live' : g.phase === 'STARTED' && !g.stale; };
export const isOver = (g: GameRow, r?: ScoreRead | null) => { const s = shownState(r); return s ? s === 'over' : g.phase === 'FINAL' || (g.phase === 'STARTED' && g.stale); };
export const isUpcoming = (g: GameRow, r?: ScoreRead | null) => { const s = shownState(r); return s ? s === 'upcoming' : g.phase === 'PREGAME' || g.phase === 'NO_START'; };

export type SlateFilter = 'following' | 'all' | 'live' | 'signals';

export function followsGame(g: GameRow, follow: readonly string[]): boolean {
  const a = teamKey(g.sport, g.away?.short_name);
  const h = teamKey(g.sport, g.home?.short_name);
  return (!!a && follow.includes(a)) || (!!h && follow.includes(h));
}

export function applyFilter(rows: GameRow[], filter: SlateFilter, follow: readonly string[], scores: Scores = NO_SCORES): GameRow[] {
  if (filter === 'live') return rows.filter((g) => isLiveGame(g, scores(g)));
  if (filter === 'signals') return rows.filter((g) => g.candidates > 0);
  if (filter === 'following') return rows.filter((g) => followsGame(g, follow));
  return rows;
}

export interface Groups { live: GameRow[]; upcoming: GameRow[]; over: GameRow[]; other: GameRow[] }

/** Live / upcoming / final, in the slate's order. Postponed, cancelled and suspended games sit apart, labelled as such. */
export function groupByPhase(rows: GameRow[], scores: Scores = NO_SCORES): Groups {
  const g: Groups = { live: [], upcoming: [], over: [], other: [] };
  for (const r of rows) { const s = scores(r); (isLiveGame(r, s) ? g.live : isUpcoming(r, s) ? g.upcoming : isOver(r, s) ? g.over : g.other).push(r); }
  g.upcoming.sort((a, b) => a.startMs - b.startMs);
  return g;
}

/** The featured game for the selected slate: the app's own rule when it applies, else the game with the most published research. */
export function pickFeature(rows: GameRow[], rule: GameRow | null, scores: Scores = NO_SCORES): GameRow | null {
  // With the Live Score Demo on, a game the demo has in play is featured first: that is the point of the preview.
  const demoLive = rows.filter((g) => g.home && g.away && scores(g)?.demo && isLiveGame(g, scores(g)));
  if (demoLive.length) return [...demoLive].sort((a, b) => b.candidates - a.candidates || a.startMs - b.startMs || a.item.event_id.localeCompare(b.item.event_id))[0];
  if (rule && rows.includes(rule)) return rule;
  const playable = rows.filter((g) => g.home && g.away);
  if (!playable.length) return null;
  return [...playable].sort((a, b) => b.candidates - a.candidates || b.item.markets_available - a.item.markets_available || a.startMs - b.startMs)[0];
}

/** "7:30 PM". */
export const clock = (ms: number) => (Number.isFinite(ms) ? new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'Time TBC');

export type GameTab = 'live' | 'matchups' | 'players' | 'markets';
export const GAME_TABS: [GameTab, string][] = [['live', 'Live'], ['matchups', 'Matchups'], ['players', 'Players'], ['markets', 'Markets']];

/**
 * The tab a game opens on when the viewer has not chosen one: pregame research (Matchups) before kickoff; the Live tab
 * for everything else. In play it is the live state; a final shows the published score and summary; a game awaiting a
 * result, postponed, cancelled or suspended is explained there too, in words, which is the most informative state those
 * phases have (Matchups would show pregame research as if it were current).
 */
export function defaultGameTab(g: Pick<GameRow, 'phase'>, r?: ScoreRead | null): GameTab {
  const s = shownState(r);
  if (s) return s === 'upcoming' ? 'matchups' : 'live';
  return g.phase === 'PREGAME' || g.phase === 'NO_START' ? 'matchups' : 'live';
}

export const isGameTab = (v: string | null): v is GameTab => GAME_TABS.some(([k]) => k === v);
