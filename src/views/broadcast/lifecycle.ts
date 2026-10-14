// What the featured card says about the game itself, kept apart from the research on it. Everything here is read from fields
// the publications already carry: the status word and start time (via the game row's lifecycle phase) and, for a finished
// game, `extensions.result.{home_score,away_score}`. The contract has NO live score, period or clock, so a game in play
// reads "Live — score unavailable": a projection is never shown as a score, and nothing is estimated.
import type { GameRow } from './games';

export type FeaturedState = 'pregame' | 'live' | 'awaiting' | 'final';

export interface FeaturedScores { away: number; home: number; winner: 'away' | 'home' | null }

export interface FeaturedView {
  state: FeaturedState;
  /** Short status word for the eyebrow chip. */
  word: string;
  /** The verified final score, only for a finished game that reports both numbers. */
  scores: FeaturedScores | null;
  /** One explicit line about the game's status where the numbers are not (yet) available. */
  statusLine: string | null;
  /** Kept separate from the status: what the pregame research is now (never a graded outcome). */
  researchLine: string | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The published final score, or null: both numbers must be present. */
export function finalScores(result: unknown): FeaturedScores | null {
  const r = (result ?? null) as { home_score?: unknown; away_score?: unknown } | null;
  const home = num(r?.home_score);
  const away = num(r?.away_score);
  if (home == null || away == null) return null;
  return { away, home, winner: home > away ? 'home' : away > home ? 'away' : null };
}

const FROZEN = 'Pregame research, frozen at kickoff — not a graded result';

export function featuredView(g: Pick<GameRow, 'phase' | 'stale'>, result: unknown): FeaturedView {
  if (g.phase === 'FINAL') {
    const scores = finalScores(result);
    return { state: 'final', word: 'Final', scores, statusLine: scores ? null : 'Final — score unavailable', researchLine: FROZEN };
  }
  if (g.phase === 'STARTED' && !g.stale) {
    return { state: 'live', word: 'Live', scores: null, statusLine: 'Live — score unavailable', researchLine: FROZEN };
  }
  if (g.phase === 'STARTED') {
    return { state: 'awaiting', word: 'Awaiting result', scores: null, statusLine: 'Started — the publication has not reported a final yet', researchLine: FROZEN };
  }
  return { state: 'pregame', word: 'Upcoming', scores: null, statusLine: null, researchLine: null };
}
