// The SCORE clock. A live score ages in seconds, not the minutes the market clock allows, and it only ages while
// the game is live: a final is a fact and does not go stale, a pregame row has no score to be stale about.
//
//   LIVE     game in play and observation age <  60 s   ("LIVE" may be shown)
//   DELAYED  game in play and 60 s <= age <= 5 min      (shown with its age, never labelled live)
//   STALE    game in play and age > 5 min               (shown as last known with its age)
//   FINAL    provider says final (any age)
//   PREGAME  scheduled / postponed / cancelled: nothing live to age
//   UNKNOWN  in play with no trustworthy timestamp
//
// Age is measured from the provider's own state time when it gives one, else from when Sift's server fetched it.
// It is never reset by a client retry: a failed refresh does not make a score younger.
import { formatQuoteAge } from '../freshness';
import type { DisplayMode, LiveGame, LiveScoreView, ScoreFreshness } from './types';

export const SCORE_LIVE_BEFORE_MS = 60_000;
export const SCORE_STALE_AFTER_MS = 5 * 60_000;
/** Seconds a provider timestamp may lead this device's clock before it is distrusted (clock skew vs. bad data). */
const FUTURE_SKEW_MS = 2 * 60_000;

/** When this observation was true, as epoch ms; null if neither timestamp parses. */
export function observedMs(g: LiveGame): number | null {
  const p = Date.parse(g.provenance.providerUpdatedAt ?? '');
  const f = Date.parse(g.provenance.fetchedAt);
  // A provider time wildly in the future is not "fresher than now"; fall back to the fetch time.
  if (Number.isFinite(p) && p <= (Number.isFinite(f) ? f : Date.now()) + FUTURE_SKEW_MS) return Number.isFinite(f) ? Math.min(p, f + FUTURE_SKEW_MS) : p;
  return Number.isFinite(f) ? f : null;
}

/**
 * `liveBeforeMs` is the age under which "LIVE" may be said. The default (60 s) suits a feed that updates every 15-30 s;
 * a provider that only updates every 2 minutes would never reach it, so its chip reads "Updated 1m ago" instead.
 * Do NOT widen it to make a slow feed look live: widen it only to the provider's own documented cadence.
 */
export function scoreFreshness(g: LiveGame, now: number, liveBeforeMs = SCORE_LIVE_BEFORE_MS): ScoreFreshness {
  if (g.phase === 'FINAL') return 'FINAL';
  if (g.phase === 'SCHEDULED' || g.phase === 'POSTPONED' || g.phase === 'CANCELLED') return 'PREGAME';
  const t = observedMs(g);
  if (t == null) return 'UNKNOWN';
  const age = now - t;
  if (age < liveBeforeMs) return 'LIVE';
  return age <= SCORE_STALE_AFTER_MS ? 'DELAYED' : 'STALE';
}

export function ageMs(g: LiveGame, now: number): number | null {
  const t = observedMs(g);
  return t == null ? null : Math.max(0, now - t);
}

/** The one sentence a status chip may print. */
function labelFor(mode: DisplayMode, g: LiveGame | null, age: number | null): string {
  switch (mode) {
    case 'LIVE': return `LIVE · ${formatQuoteAge(age)}`;
    case 'FINAL': return 'Final';
    case 'DELAYED': return `Updated ${formatQuoteAge(age)} ago`;
    case 'LAST_KNOWN': return `Last update ${formatQuoteAge(age)} ago · provider unavailable`;
    case 'PUBLICATION_FINAL': return 'Final · published result';
    default: return g ? 'Score unavailable' : 'Live — score unavailable';
  }
}

/**
 * What a screen may show for one game. `providerDown` is true while the provider chain is failing (outage), which
 * turns any in-play score into LAST_KNOWN regardless of its age bucket. `publicationFinal` is the sport
 * publication's own final result for the event (extensions.result), the last honest fallback.
 */
export function scoreView(game: LiveGame | null, now: number, opts: { providerDown?: boolean; publicationFinal?: boolean; liveBeforeMs?: number } = {}): LiveScoreView {
  if (!game) {
    const mode: DisplayMode = opts.publicationFinal ? 'PUBLICATION_FINAL' : 'UNAVAILABLE';
    return { mode, freshness: opts.publicationFinal ? 'FINAL' : 'UNKNOWN', game: null, ageMs: null, label: labelFor(mode, null, null) };
  }
  const freshness = scoreFreshness(game, now, opts.liveBeforeMs);
  const age = ageMs(game, now);
  let mode: DisplayMode;
  if (freshness === 'FINAL') mode = 'FINAL';
  else if (freshness === 'PREGAME') mode = 'UNAVAILABLE';
  else if (opts.providerDown || freshness === 'STALE') mode = 'LAST_KNOWN';
  else if (freshness === 'LIVE') mode = 'LIVE';
  else if (freshness === 'DELAYED') mode = 'DELAYED';
  else mode = 'UNAVAILABLE';
  const label = freshness === 'PREGAME' ? 'Not started' : labelFor(mode, game, age);
  // A score may only be shown when there is one and the mode is not UNAVAILABLE.
  return { mode, freshness, game: mode === 'UNAVAILABLE' && freshness !== 'PREGAME' ? null : game, ageMs: age, label };
}
