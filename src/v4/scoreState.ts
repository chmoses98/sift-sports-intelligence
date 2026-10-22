// How v4 screens turn a score read into what they print. DISPLAY ONLY: this decides which words and numbers a row, card or game
// header shows. It never touches a game's real phase (GameRow.phase), which alone decides research freezing, signals and saves.
import type { GameRow } from '../views/broadcast/games';
import { TeamDirectory } from '../live/scores/identity';
import type { ScoreRead } from '../live/scores/store';
import type { LiveSport, ObservedEvent } from '../live/scores/types';
import { formatQuoteAge } from '../live/freshness';

export type Scores = (g: GameRow) => ScoreRead | null;
export const NO_SCORES: Scores = () => null;

/** Games a real publication already calls over are never simulated or overwritten: their published result is the truth. */
const OVER = new Set(['FINAL', 'POSTPONED', 'CANCELLED', 'SUSPENDED']);

/** A score feed is only asked about games that can be in play: from 45 minutes before the start to 7 hours after it. Everything else needs no request. */
export const BEFORE_MS = 45 * 60_000;
export const AFTER_MS = 7 * 3600_000;

/** The minimal shape of a published game that score matching needs: what a board item and a slate row both have. */
export interface PublishedGame {
  eventId: string;
  startUtc: string;
  league?: string | null;
  home: { display_name: string; short_name?: string | null };
  away: { display_name: string; short_name?: string | null };
}

/**
 * The games of one sport as score-store events: identity comes from the publication's own participants (an individual sport such as
 * tennis has no home/away ids on the board; callers order the two sides the way the screen does). A team the directory cannot resolve
 * means no event, never a guess.
 */
export function observedFromGames(sport: LiveSport, games: PublishedGame[]): ObservedEvent[] {
  const dir = new TeamDirectory(sport, games.flatMap((g) => [g.home, g.away]).map((p) => ({ abbr: p.short_name ?? null, name: p.display_name })));
  const out: ObservedEvent[] = [];
  for (const g of games) {
    const hk = dir.resolve({ abbr: g.home.short_name ?? null, name: g.home.display_name });
    const ak = dir.resolve({ abbr: g.away.short_name ?? null, name: g.away.display_name });
    if (!hk || !ak || hk === ak) continue;
    out.push({
      league: g.league ?? null,
      ref: { eventId: g.eventId, sport, startUtc: g.startUtc, home: { key: hk, name: g.home.display_name }, away: { key: ak, name: g.away.display_name } },
      home: { abbr: g.home.short_name ?? null, name: g.home.display_name },
      away: { abbr: g.away.short_name ?? null, name: g.away.display_name },
    });
  }
  return out;
}

/**
 * The slate rows as score-store events. `now` limits the list to games that can be in play (see above), so a screen showing a whole
 * week of games asks the feed about today's only.
 */
export function observedFor(rows: GameRow[], now: number = Date.now()): ObservedEvent[] {
  const bySport = new Map<LiveSport, PublishedGame[]>();
  for (const g of rows) {
    if (OVER.has(g.phase) || !g.home || !g.away || g.startMs - BEFORE_MS > now || now > g.startMs + AFTER_MS) continue;
    const sport = g.sport as LiveSport;
    bySport.set(sport, [...(bySport.get(sport) ?? []), { eventId: g.item.event_id, startUtc: g.item.start_time_utc, league: g.item.league ?? null, home: g.home, away: g.away }]);
  }
  return [...bySport].flatMap(([sport, games]) => observedFromGames(sport, games));
}

export type Shown = 'live' | 'upcoming' | 'over';

/** What a read says the game is doing, or null when it has no game to say it (the publication's own status then applies). */
export function shownState(r: ScoreRead | null | undefined): Shown | null {
  const g = r?.game;
  if (!g) return null;
  if (g.phase === 'FINAL') return 'over';
  if (g.phase === 'SCHEDULED') return 'upcoming';
  if (g.phase === 'POSTPONED' || g.phase === 'CANCELLED') return null;
  return 'live';
}

/** "Q3 4:32", "Halftime", "67'", "Top 7th", "Set 2": the line under a live score. */
export function periodClock(r: ScoreRead | null | undefined): string {
  const g = r?.game;
  if (!g) return '';
  const c = g.clock;
  if (!c) return '';
  const label = c.periodLabel ?? '';
  const short = label.replace(/(\d)(st|nd|rd|th) (Quarter|Period|Half)/, (_m, n, _s, k) => `${k === 'Half' ? 'H' : k === 'Quarter' ? 'Q' : 'P'}${n}`).replace('Overtime', 'OT');
  if (c.display && /^\d+'$/.test(c.display)) return c.display;
  return [short, c.display].filter(Boolean).join(' ');
}

/** A short freshness word for a row or card, empty while the score is live: "2m ago" (delayed), "stale 6m" (last known). */
export function ageChip(r: ScoreRead | null | undefined): string {
  const v = r?.view;
  if (!v?.game || v.ageMs == null || v.mode === 'LIVE' || v.mode === 'FINAL') return '';
  const age = formatQuoteAge(v.ageMs);
  return v.mode === 'DELAYED' ? `${age} ago` : v.mode === 'LAST_KNOWN' ? `stale ${age}` : '';
}

/** True when any of the sides has three digits, so a compact row must tighten its numerals. */
export const wideScore = (r: ScoreRead | null | undefined) => !!r?.game?.score && (r.game.score.home > 99 || r.game.score.away > 99);

/**
 * The one word a badge may use for a game a feed has in play. Only a fresh score is LIVE: a score older than the live window is
 * DELAYED, and one the feed stopped updating (or lost) is STALE, so a badge can never call old data live.
 */
export function liveWord(r: ScoreRead | null | undefined): 'LIVE' | 'DELAYED' | 'STALE' {
  const m = r?.view.mode;
  return m === 'DELAYED' ? 'DELAYED' : m === 'LAST_KNOWN' ? 'STALE' : 'LIVE';
}

/**
 * The short line under a score on a scoreboard or row, where space is tight: "LIVE · 12s", "Updated 2m ago", "Stale · 6m", "Final".
 * The full sentence ("Last update 6m ago · provider unavailable") belongs on the Live tab card, which has room for it.
 */
export function chipLine(r: ScoreRead | null | undefined): string {
  const v = r?.view;
  if (!v?.game) return '';
  const age = formatQuoteAge(v.ageMs);
  return v.mode === 'DELAYED' ? `Updated ${age} ago` : v.mode === 'LAST_KNOWN' ? `Stale · ${age}` : v.mode === 'FINAL' ? 'Final' : v.label;
}
