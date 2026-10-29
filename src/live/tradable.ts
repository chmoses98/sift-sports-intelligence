// Is this market tradable, according to what the provider positively reported about it? (Quote-delivery path only.)
//
// A displayed price is an ACTIONABLE ask: something a person may act on. A market that Kalshi reports as closed,
// settled, suspended or otherwise not trading has no actionable ask, however fresh its last quote is. This file is the
// one place that rule lives; `quoteUsable()` (the display rule) and the delivery chain read it, nothing else decides it.
//
// EVIDENCE (what each source carries; verified in this repository, see docs/quote-track/README.md "Non-tradable markets"):
//  * The relay forwards Kalshi's market object verbatim (relay/core.ts returns the upstream body), so a relay quote
//    carries Kalshi's `status` word and, once a market is determined, its `result` ("yes" / "no"; empty before).
//  * The feed (scripts/live-quotes/lib.mjs KEEP) keeps `status` and `close_time` only; it never carries `result`.
//  * `normalizeKalshiMarket` maps the status word to `availability` (OPEN, UNOPENED, SUSPENDED, CLOSED, SETTLED, UNKNOWN)
//    and keeps the raw word in `rawStatus`; a missing status is `rawStatus: null`.
//  * The published research documents (real NFL snapshot, 33,127 markets) carry `market_status`: OPEN 24,060, SETTLED
//    150 (none of them with an ask), absent 8,917 (all but 75 with an ask). So "no status" is the common case for
//    a priced market, and it must stay tradable.
//
// THE RULE. A quote is non-tradable only when the provider POSITIVELY reported it:
//    status word      closed, determined, disputed, amended                       -> 'closed'   (terminal)
//                     settled, finalized, finalised, resolved, voided, cancelled  -> 'settled'  (terminal)
//                     expired                                                      -> 'expired'  (terminal)
//                     inactive, paused, suspended, halted, frozen                  -> 'suspended'
//                     initialized, unopened                                        -> 'unopened'
//                     any other non-empty word                                     -> 'unrecognised'
//    result           a non-empty `result` means the market is determined          -> 'settled'  (terminal)
//    close_time       no status at all and a close time at or before the moment the
//                     PROVIDER observed the market (its own clock, so the device
//                     clock is not involved)                                       -> 'expired'  (terminal)
//  and tradable otherwise: an `active`/`open` status ('open'), or no status at all ('unreported') with a current quote.
// An unrecognised word is withheld: a status Sift does not understand is not confirmation that the market trades (the
// same conservative reading as src/opportunity/live.ts, "paused or unrecognised is not tradable either"). A missing
// status is not a word, so it is not withheld.
//
// Terminal states (closed, settled, expired) never revert, so a report of one is decisive whatever its age. Suspended,
// unopened and unrecognised can change within minutes, so they only count while the observation is inside its age limit;
// an old one is simply an old quote and the age table withholds it (src/live/quoteUsable.ts).
import { quoteTimeMs } from './freshness';
import type { LiveQuote } from './types';

export type MarketStatus = 'open' | 'unreported' | 'unopened' | 'suspended' | 'closed' | 'settled' | 'expired' | 'unrecognised';

const SETTLED_WORDS = new Set(['settled', 'finalized', 'finalised', 'resolved', 'voided', 'void', 'cancelled', 'canceled']);
const CLOSED_WORDS = new Set(['closed', 'determined', 'disputed', 'amended']);
const EXPIRED_WORDS = new Set(['expired', 'expiry']);
const SUSPENDED_WORDS = new Set(['inactive', 'paused', 'suspended', 'halted', 'frozen']);
const UNOPENED_WORDS = new Set(['initialized', 'initialised', 'unopened']);
const OPEN_WORDS = new Set(['active', 'open']);

/** What the provider positively reported about this market (see the rule above). */
export function marketStatusOf(q: LiveQuote): MarketStatus {
  if (typeof q.result === 'string' && q.result.trim() !== '') return 'settled';
  const word = String(q.rawStatus ?? '').trim().toLowerCase();
  let status: MarketStatus;
  if (word === '') status = q.availability === 'UNKNOWN' ? 'unreported' : fromAvailability(q);
  else if (OPEN_WORDS.has(word)) status = 'open';
  else if (SETTLED_WORDS.has(word)) status = 'settled';
  else if (CLOSED_WORDS.has(word)) status = 'closed';
  else if (EXPIRED_WORDS.has(word)) status = 'expired';
  else if (SUSPENDED_WORDS.has(word)) status = 'suspended';
  else if (UNOPENED_WORDS.has(word)) status = 'unopened';
  else status = 'unrecognised';
  // The two fields disagree (a hand-built or partially normalised quote): the more restrictive report wins.
  if (status === 'open' && q.availability !== 'OPEN' && q.availability !== 'UNKNOWN') status = fromAvailability(q);
  // A market that reports NO status, and that the provider itself observed after its close time, is no longer trading.
  // An explicit `active`/`open` status stays authoritative: Kalshi flips the status at close, and the spec forbids
  // reading a contract's close time for anything else (docs/sift3/QUOTE_DELIVERY.md).
  if (status === 'unreported') {
    const close = quoteTimeMs(q.closeTime);
    const seen = quoteTimeMs(q.observedAt);
    if (close != null && seen != null && close <= seen) return 'expired';
  }
  return status;
}

/** Only an availability with no status word (a hand-built quote): fall back to the normalised value. */
function fromAvailability(q: LiveQuote): MarketStatus {
  switch (q.availability) {
    case 'OPEN': return 'open';
    case 'UNOPENED': return 'unopened';
    case 'SUSPENDED': return 'suspended';
    case 'CLOSED': return 'closed';
    case 'SETTLED': return 'settled';
    default: return 'unreported';
  }
}

/** May an actionable ask be shown for a market in this state (age permitting)? */
export const isTradableStatus = (s: MarketStatus): boolean => s === 'open' || s === 'unreported';

/** Closed, settled or expired: never reverts, so one report settles it for good. */
export const isTerminalStatus = (s: MarketStatus): boolean => s === 'closed' || s === 'settled' || s === 'expired';

/** The market's status as the quote reports it, or null when there is no quote. */
export const marketStatusOfQuote = (q: LiveQuote | null | undefined): MarketStatus | null => (q ? marketStatusOf(q) : null);
