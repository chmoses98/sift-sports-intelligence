// Which published opportunity, if any, covers the exact contract and side a viewer is reading on a prop.
//
// A prop ladder rung is one Kalshi market with two sides. The opportunity layer publishes a signal for ONE side of one
// market (YES or NO). A signal for the other side says nothing about this one, so it is never shown as covering it.
// A match is also not a validation: a published opportunity is a valid research signal only while its own authority,
// status and price still hold at `now`. Everything else is said as what it is (passed, ineligible, opposite side).
// Nothing here judges a number or derives a status: it reads the opportunity layer's fields and refuses to stretch them.
import type { Opportunity, Side } from '../opportunity/types';
import { quoteFreshness } from '../live/freshness';
import type { PropSide } from './propsModel';

/** The contract side a prop-ladder side buys: over is YES on "n+", under is NO on the same market. */
export const sideOfProp = (s: PropSide): Side => (s === 'over' ? 'YES' : 'NO');

export type SignalMatch =
  /** No published opportunity names this market. */
  | { kind: 'none' }
  /** The publication named this market, but only for the other side. */
  | { kind: 'oppositeSide'; opp: Opportunity; has: Side; wanted: Side }
  /** The publication judged this exact contract and side and said pass. */
  | { kind: 'passed'; opp: Opportunity }
  /** The publication flagged this exact contract and side, but the flag no longer holds (stale, expired, over its limit, game started …). */
  | { kind: 'ineligible'; opp: Opportunity; why: string }
  /** A published game-level watch rather than a priced contract signal. */
  | { kind: 'watch'; opp: Opportunity }
  /** An exact-side, current, eligible published research signal (or actionable recommendation). */
  | { kind: 'valid'; opp: Opportunity };

/**
 * Why an opportunity that claims ACTIONABLE or RESEARCH_CANDIDATE is still not a valid signal at `now`, or null when it is.
 * The opportunity layer evaluated these once at load; the checks run again here against the sheet's own clock so a
 * signal left open past its window is not shown as current.
 */
export function ineligibleWhy(o: Opportunity, now: number): string | null {
  if (o.phase !== 'PREGAME') return o.phase === 'NO_START' ? 'The game has no verified start time, so the signal cannot be treated as pregame.' : 'The game has started or is no longer scheduled: pregame research is frozen.';
  if (o.orientation === 'MISMATCH') return 'The contract identity could not be verified.';
  if (o.what.side !== o.price.side) return 'The published side and its price are for different sides.';
  if (o.status === 'ACTIONABLE' && /RESEARCH/i.test(o.authority)) return 'The publication rates this number research only, which cannot back an actionable status.';
  if (o.price.state !== 'CURRENT') {
    const why: Record<string, string> = {
      EXPIRED: 'The publication’s validity window for this price has passed.',
      ABOVE_BET_UP_TO: 'The ask is above the publication’s own bet-up-to price.',
      STALE: 'The quote behind this signal is stale.',
      NO_QUOTE: 'No executable quote is known for this side.',
      UNPRICED: 'The publication prices nothing on this contract.',
    };
    return why[o.price.state] ?? 'The price is not current.';
  }
  if (o.price.ask == null) return 'No executable quote is known for this side.';
  const q = quoteFreshness(o.price.observedAt, now);
  if (q !== 'FRESH' && q !== 'AGING') return q === 'UNKNOWN' ? 'The quote behind this signal has no capture time.' : 'The quote behind this signal is stale.';
  if (o.price.expiresAt) {
    const t = Date.parse(o.price.expiresAt);
    if (Number.isFinite(t) && t <= now) return 'The publication’s validity window for this price has passed.';
  }
  return null;
}

const RANK: Record<SignalMatch['kind'], number> = { valid: 5, ineligible: 4, passed: 3, watch: 2, oppositeSide: 1, none: 0 };

function classify(o: Opportunity, side: Side, now: number): SignalMatch {
  if (o.what.side !== side) return { kind: 'oppositeSide', opp: o, has: o.what.side, wanted: side };
  if (o.status === 'PASS') return { kind: 'passed', opp: o };
  if (o.status === 'WATCH') return { kind: 'watch', opp: o };
  const why = ineligibleWhy(o, now);
  return why ? { kind: 'ineligible', opp: o, why } : { kind: 'valid', opp: o };
}

/**
 * The published opportunity for exactly this market AND this side. Several opportunities can name one market (one per
 * side, or a re-published one); the strongest honest reading wins: valid, then ineligible, passed, watch, and only then
 * a signal for the other side. Missing ticker/market ids never match.
 */
export function matchSignal(opps: readonly Opportunity[], marketId: string | null | undefined, side: Side, now: number, sport = 'NFL'): SignalMatch {
  if (!marketId) return { kind: 'none' };
  let best: SignalMatch = { kind: 'none' };
  for (const o of opps) {
    if (o.sport !== sport || o.marketId !== marketId) continue;
    const m = classify(o, side, now);
    if (RANK[m.kind] > RANK[best.kind]) best = m;
  }
  return best;
}
