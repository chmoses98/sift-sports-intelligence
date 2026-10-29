// Which score, if any, a v3 screen may print for a game. ONE decision function, pure, so every screen shows the same thing.
//
// VERIFIED (a score is shown only if it is verified):
//   1. the sport publication's own final result (event research extensions.result), or
//   2. the licensed free score feed (SportScore, attribution on its own page) holding a game that the identity layer MATCHED to this event
//      with evidence: the provider's own id, or both teams plus the start time (src/live/scores/identity.ts; never by name similarity,
//      never an ambiguous or orientation-conflicting match). A read with no matched game has no score here.
// A verified score is also required to be a pair of non-negative whole numbers and to come from a game whose phase the feed understood
// (an UNKNOWN phase is "the provider's status was not understood": that is not verified).
//
// DELAYED (a verified score that is a little old): the game is in play and the observation is older than 60 s (the feed's live window,
// src/live/scores/freshness.ts SCORE_LIVE_BEFORE_MS) but no older than 5 min (SCORE_STALE_AFTER_MS). Age is measured from the provider's
// own state time when it states one, else from the fetch time; a failed refresh never makes a score younger. The screen then shows the
// score with a subtle "Delayed" word and nothing else (no age, no timestamp).
//
// UNRELIABLE (never shown; the screen says "Score unavailable"): older than 5 min while in play, a feed outage (the last observation is
// "last known"), no trustworthy timestamp, not matched, an unknown phase, an implausible number. A score is NEVER fabricated: nothing here
// supplies 0-0, carries a score over from a previous read, or fills a missing side.
//
// A FINAL from the feed is a fact and does not age. This is separate from the quote rules (no age appears on a price).
import type { ScoreRead } from '../../live/scores/store';
import { SCORE_LIVE_BEFORE_MS, SCORE_STALE_AFTER_MS } from '../../live/scores/freshness';
import { periodClock, shownState } from '../../v4/scoreState';

export { SCORE_LIVE_BEFORE_MS as DELAYED_AFTER_MS, SCORE_STALE_AFTER_MS as UNRELIABLE_AFTER_MS };

export type ScoreVerdict =
  | { show: true; away: number; home: number; clock: string; over: boolean; delayed: boolean }
  | { show: false; reason: 'no-read' | 'unmatched' | 'not-started' | 'no-score' | 'unknown-phase' | 'implausible' | 'unreliable' };

/** A score is a whole number from 0 to 500 (no sport in the app comes near it; anything beyond is a garbled field, not a result). */
const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 500;

export function verifyScore(rd: ScoreRead | null | undefined): ScoreVerdict {
  if (!rd) return { show: false, reason: 'no-read' };
  const game = rd.game;
  if (!game || !rd.match || !rd.match.ok) return { show: false, reason: 'unmatched' };
  if (game.phase === 'UNKNOWN') return { show: false, reason: 'unknown-phase' };
  const st = shownState(rd);
  if (st !== 'live' && st !== 'over') return { show: false, reason: 'not-started' };
  if (!game.score) return { show: false, reason: 'no-score' };
  if (!whole(game.score.away) || !whole(game.score.home)) return { show: false, reason: 'implausible' };
  const mode = rd.view.mode;
  if (st === 'over') {
    // A final is a fact. (A game the feed calls final only ever reaches here with mode FINAL.)
    return mode === 'FINAL' ? { show: true, away: game.score.away, home: game.score.home, clock: 'Final', over: true, delayed: false } : { show: false, reason: 'unreliable' };
  }
  if (mode === 'LIVE') return { show: true, away: game.score.away, home: game.score.home, clock: periodClock(rd) || 'Live', over: false, delayed: false };
  if (mode === 'DELAYED') return { show: true, away: game.score.away, home: game.score.home, clock: periodClock(rd) || 'Live', over: false, delayed: true };
  return { show: false, reason: 'unreliable' };
}
