// Whether a market can be traded, from the status word a publication or a live quote carries. ONE vocabulary for every v3 surface;
// nothing else in v3 decides tradability. Pure and sport-agnostic. The vocabulary IS the quote-delivery chain's (PR #148, src/live/tradable.ts
// `marketStatusOf`): every word, every `result` and every live quote is judged by that module, so the two can never disagree about whether a market
// trades. v3 adds only a REFINEMENT of words that module calls 'unrecognised' (they are synonyms of states that withhold a price, so the sheet can
// name the state: "ended" is closed, "on hold" is suspended, "delisted" is a state of its own). A refinement only ever names a NON-tradable state:
// it can never make a market tradable (tests/v3/marketStatus.test.ts runs every word of both tables through both). The one word v3 used to accept as
// open that the shared table does not is "trading": it is not a Kalshi status and the shared table withholds it, so v3 does too.
//
// What the publications carry (measured on the captured real documents, 2026-10-26):
//   event_detail markets   `market_status`: OPEN, SETTLED (the app's own normalised words); absent on many priced markets of other snapshots
//   live-quote feed games  `status` (Kalshi's own words): active, inactive, determined (and, by Kalshi's API, closed, finalized, ...)
//   live store quotes      `rawStatus` (that same word, null when the provider sent none) and `availability` (OPEN, UNOPENED, SUSPENDED, CLOSED, SETTLED, UNKNOWN)
//
// THE RULE (documented, tested): a displayed price is an ACTIONABLE ask. A market is actionable only when its status word POSITIVELY says it
// trades (open, active), or when it reports NO status at all (the common case for a priced market in the real publications: a missing
// status is not a word, so there is nothing to distrust; the quote gate then still needs a current observation and a real ask of 1 to 99 cents).
// ANY other non-empty word withholds the price:
//     closed, determined, disputed, amended, ended             -> 'closed'      (terminal)
//     settled, finalized, finalised, resolved, voided, void,
//       cancelled, canceled, or a non-empty `result`           -> 'settled'     (terminal)
//     expired, expiry                                           -> 'expired'     (terminal)
//     a LIVE quote with no status whose close time is at or before the moment the provider observed it -> 'expired' (terminal; shared rule)
//     delisted, removed, withdrawn, archived                    -> 'delisted'    (terminal; v3's own word for "no longer listed")
//     inactive, paused, suspended, halted, trading_halted,
//       frozen, on_hold                                         -> 'suspended'   (can reverse)
//     initialized, initialised, unopened, not_open, ...         -> 'unopened'    (can reverse)
//     any other non-empty word (including the app's UNKNOWN)   -> 'unrecognised' (a status SIFT does not understand is not confirmation that
//                                                                 the market trades: withheld, and the sheet offers Retry)
// Terminal states never revert, so they withhold at any age. The others are withheld whatever their age at the quote gate; the exact-contract
// sheet only SAYS "Trading suspended" for one while the observation is current (an old report is just an old quote: "Price unavailable right now").
// The one place a missing status can hide is a live quote, whose `availability` is UNKNOWN when the provider sent no status: `liveStatusWord`.
import { MARKET_CLOSED } from '../../live/missingPrice';
import { marketStatusOf as sharedStatusOf } from '../../live/tradable';
import type { LiveQuote } from '../../live/types';

export type MarketState = 'open' | 'unreported' | 'unopened' | 'suspended' | 'closed' | 'settled' | 'expired' | 'delisted' | 'unrecognised';

/**
 * Words the shared table does not list but that name a state that withholds a price (v3's refinement). Never open or unreported.
 * Keys are the normalised spelling (lower case, spaces and hyphens as underscores).
 */
export const REFINED_WORDS: Readonly<Record<'unopened' | 'suspended' | 'closed' | 'delisted', readonly string[]>> = {
  unopened: ['not_open', 'not_yet_open'],
  suspended: ['trading_halted', 'on_hold'],
  closed: ['ended'],
  delisted: ['delisted', 'removed', 'withdrawn', 'archived'],
};

const REFINE = new Map<string, MarketState>();
for (const [state, words] of Object.entries(REFINED_WORDS) as [MarketState, readonly string[]][]) for (const w of words) REFINE.set(w, state);

/** Lower case, trimmed, runs of spaces and hyphens as one underscore. */
const normalWord = (word: string): string => word.trim().toLowerCase().replace(/[\s-]+/g, '_');

/** The shared module's verdict on a quote, refined by v3's synonyms when it calls the word 'unrecognised'. */
function stateOf(q: LiveQuote, word: string | null): MarketState {
  const shared = sharedStatusOf(q);
  return shared === 'unrecognised' && word != null ? REFINE.get(normalWord(word)) ?? 'unrecognised' : shared;
}

/**
 * A status word (any case, spaces or hyphens) as a state. A missing or blank word is 'unreported' (no status is not a word); any other word
 * that is not on the list above is 'unrecognised'. A non-empty `result` means the market is determined: 'settled'.
 */
export function marketStateOf(word: string | null | undefined, result?: string | null): MarketState {
  const w = word == null ? '' : String(word);
  const probe = { rawStatus: w.trim() === '' ? null : w, availability: 'UNKNOWN', result: result ?? null, observedAt: '' } as LiveQuote;
  return stateOf(probe, w);
}

/**
 * The state a live quote reports, by the shared rule on the WHOLE quote: its status word (the raw word, else the normalised availability; the more
 * restrictive of the two when they disagree), a non-empty `result`, and, when it sent no status, a close time at or before the moment the provider
 * observed the market. v3's synonyms refine an 'unrecognised' word.
 */
export const liveMarketState = (q: LiveQuote): MarketState => stateOf(q, liveStatusWord(q));

/** The provider's status word for a live quote: its own raw word, else the normalised availability, except UNKNOWN (which only says "none sent"). */
export function liveStatusWord(q: { rawStatus?: string | null; availability?: string | null } | null | undefined): string | null {
  if (!q) return null;
  const raw = q.rawStatus == null ? '' : String(q.rawStatus).trim();
  if (raw !== '') return raw;
  const a = q.availability == null ? '' : String(q.availability).trim();
  return a === '' || a.toUpperCase() === 'UNKNOWN' ? null : a;
}

/** Closed, settled, expired, delisted: never reverts, so one report decides it for good. */
export const isTerminalState = (s: MarketState): boolean => s === 'closed' || s === 'settled' || s === 'expired' || s === 'delisted';

/** Only an explicit open word, or no status at all, may show an ask; they then go on to the quote gate. */
export const isTradableState = (s: MarketState): boolean => s === 'open' || s === 'unreported';

export interface MarketStatusFacts { tradable: boolean; marketStatus: MarketState }

/** `tradable` and `marketStatus` for a status word, as carried on a Price. */
export function statusFacts(word: string | null | undefined, result?: string | null): MarketStatusFacts {
  const marketStatus = marketStateOf(word, result);
  return { tradable: isTradableState(marketStatus), marketStatus };
}

/** `tradable` and `marketStatus` for a live quote (the shared rule on the whole quote). */
export function liveStatusFacts(q: LiveQuote): MarketStatusFacts {
  const marketStatus = liveMarketState(q);
  return { tradable: isTradableState(marketStatus), marketStatus };
}

/** True when the word says the market trades, or there is no word. */
export const isTradableWord = (word: string | null | undefined): boolean => isTradableState(marketStateOf(word));

/** The sheet's headline for a market that cannot be traded (null when the sheet should say "Price unavailable right now" with Retry instead: open, unreported, unrecognised). */
export function nonTradableTitle(s: MarketState): string | null {
  switch (s) {
    case 'closed': case 'expired': return MARKET_CLOSED.contract;
    case 'settled': return 'Market settled';
    case 'suspended': return 'Trading suspended';
    case 'unopened': return 'Not open for trading yet';
    case 'delisted': return 'Market no longer listed';
    default: return null;
  }
}

/** The sentence under the headline: why there is no price, in the viewer's words. */
export function nonTradableNote(s: MarketState): string {
  switch (s) {
    case 'closed': case 'expired': return 'Trading has ended on this contract, so there is no price to buy at.';
    case 'settled': return 'This contract has settled, so there is no price to buy at.';
    case 'suspended': return 'Trading is paused on this contract, so there is no price to buy at.';
    case 'unopened': return 'Trading has not opened on this contract yet, so there is no price to buy at.';
    case 'delisted': return 'Kalshi no longer lists this contract, so there is no price to buy at.';
    default: return 'This contract cannot be traded right now.';
  }
}

/**
 * Whether the exact-contract sheet may NAME the reason a price is withheld (no Retry), or must say "Price unavailable right now" with Retry.
 * Terminal states are named at any age. Suspended and not-yet-open are named while the observation is current (asking again cannot change a
 * fresh report); an old report is only an old quote. An unrecognised word is never named: it may clear on the next read.
 */
export function sheetNamesStatus(s: MarketState, observationCurrent: boolean): boolean {
  if (nonTradableTitle(s) == null) return false;
  return isTerminalState(s) || observationCurrent;
}
