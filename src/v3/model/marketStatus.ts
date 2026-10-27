// Whether a market can be traded, from the status word a publication or a live quote carries. ONE vocabulary for every v3 surface;
// nothing else in v3 decides tradability. Pure and sport-agnostic.
//
// What the publications carry (measured on the captured real documents, 2026-10-26):
//   event_detail markets   `market_status`: OPEN, SETTLED, UNKNOWN (the app's own normalised words)
//   live-quote feed games  `status` (Kalshi's own words): active, inactive, determined (and, by Kalshi's API, closed, finalized, ...)
//   live store quotes      `rawStatus` (that same word) and `availability` (OPEN, UNOPENED, SUSPENDED, CLOSED, SETTLED, UNKNOWN)
//
// THE RULE (documented, tested): a market is NOT tradable only when its status word POSITIVELY says so (closed, settled, suspended,
// not yet open, delisted, ...). A missing status, or a word this file does not know, does not say so: it stays tradable, because the
// price still has to pass the quote gate (a current observation, a real ask of 1 to 99 cents) before anything is shown. We never guess
// that an unrecognised word means closed, and we never guess that it means open: it means "no evidence either way", and the gate decides.

export type MarketState = 'open' | 'unopened' | 'suspended' | 'closed' | 'settled' | 'delisted' | 'unknown';

const WORDS: Record<MarketState, readonly string[]> = {
  open: ['open', 'active', 'trading'],
  unopened: ['initialized', 'initialised', 'unopened', 'not_open', 'not_yet_open'],
  suspended: ['inactive', 'paused', 'suspended', 'halted', 'trading_halted', 'frozen', 'on_hold'],
  closed: ['closed', 'determined', 'disputed', 'amended', 'expired', 'ended'],
  settled: ['settled', 'finalized', 'finalised', 'resolved'],
  delisted: ['delisted', 'cancelled', 'canceled', 'voided', 'void', 'removed', 'withdrawn', 'archived'],
  unknown: [],
};

const BY_WORD = new Map<string, MarketState>();
for (const [state, words] of Object.entries(WORDS) as [MarketState, readonly string[]][]) for (const w of words) BY_WORD.set(w, state);

/** A status word (any case, spaces or hyphens) as a state. Missing and unrecognised words are 'unknown'. */
export function marketStateOf(word: string | null | undefined): MarketState {
  if (word == null) return 'unknown';
  const k = String(word).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return BY_WORD.get(k) ?? 'unknown';
}

/** Only a positively non-tradable state withholds the price. 'open' and 'unknown' (no evidence either way) go on to the quote gate. */
export const isTradableState = (s: MarketState): boolean => s === 'open' || s === 'unknown';

export interface MarketStatusFacts { tradable: boolean; marketStatus: MarketState }

/** `tradable` and `marketStatus` for a status word, as carried on a Price. */
export function statusFacts(word: string | null | undefined): MarketStatusFacts {
  const marketStatus = marketStateOf(word);
  return { tradable: isTradableState(marketStatus), marketStatus };
}

/** True unless the word positively says the market cannot be traded. */
export const isTradableWord = (word: string | null | undefined): boolean => isTradableState(marketStateOf(word));

/** The sheet's headline for a market that cannot be traded (null for a tradable state). */
export function nonTradableTitle(s: MarketState): string | null {
  switch (s) {
    case 'closed': return 'Market closed';
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
    case 'closed': return 'Trading has ended on this contract, so there is no price to buy at.';
    case 'settled': return 'This contract has settled, so there is no price to buy at.';
    case 'suspended': return 'Trading is paused on this contract, so there is no price to buy at.';
    case 'unopened': return 'Trading has not opened on this contract yet, so there is no price to buy at.';
    case 'delisted': return 'Kalshi no longer lists this contract, so there is no price to buy at.';
    default: return 'This contract cannot be traded right now.';
  }
}
