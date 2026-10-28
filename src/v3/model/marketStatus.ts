// Whether a market can be traded, from the status word a publication or a live quote carries. ONE vocabulary for every v3 surface;
// nothing else in v3 decides tradability. Pure and sport-agnostic. Self-contained: v3 imports nothing from src/live for this. The vocabulary
// and the semantics are those of the quote-delivery chain (claude/quote-track, src/live/tradable.ts, PR #148); keep the two in step.
//
// What the publications carry (measured on the captured real documents, 2026-10-26):
//   event_detail markets   `market_status`: OPEN, SETTLED (the app's own normalised words); absent on many priced markets of other snapshots
//   live-quote feed games  `status` (Kalshi's own words): active, inactive, determined (and, by Kalshi's API, closed, finalized, ...)
//   live store quotes      `rawStatus` (that same word, null when the provider sent none) and `availability` (OPEN, UNOPENED, SUSPENDED, CLOSED, SETTLED, UNKNOWN)
//
// THE RULE (documented, tested): a displayed price is an ACTIONABLE ask. A market is actionable only when its status word POSITIVELY says it
// trades (open, active, trading), or when it reports NO status at all (the common case for a priced market in the real publications: a missing
// status is not a word, so there is nothing to distrust; the quote gate then still needs a current observation and a real ask of 1 to 99 cents).
// ANY other non-empty word withholds the price:
//     closed, determined, disputed, amended, ended             -> 'closed'      (terminal)
//     settled, finalized, finalised, resolved, voided, void,
//       cancelled, canceled, or a non-empty `result`           -> 'settled'     (terminal)
//     expired, expiry                                           -> 'expired'     (terminal)
//     delisted, removed, withdrawn, archived                    -> 'delisted'    (terminal; v3's own word for "no longer listed")
//     inactive, paused, suspended, halted, trading_halted,
//       frozen, on_hold                                         -> 'suspended'   (can reverse)
//     initialized, initialised, unopened, not_open, ...         -> 'unopened'    (can reverse)
//     any other non-empty word (including the app's UNKNOWN)   -> 'unrecognised' (a status SIFT does not understand is not confirmation that
//                                                                 the market trades: withheld, and the sheet offers Retry)
// Terminal states never revert, so they withhold at any age. The others are withheld whatever their age at the quote gate; the exact-contract
// sheet only SAYS "Trading suspended" for one while the observation is current (an old report is just an old quote: "Price unavailable right now").
// The one place a missing status can hide is a live quote, whose `availability` is UNKNOWN when the provider sent no status: `liveStatusWord`.

export type MarketState = 'open' | 'unreported' | 'unopened' | 'suspended' | 'closed' | 'settled' | 'expired' | 'delisted' | 'unrecognised';

const WORDS: Record<Exclude<MarketState, 'unreported' | 'unrecognised'>, readonly string[]> = {
  open: ['open', 'active', 'trading'],
  unopened: ['initialized', 'initialised', 'unopened', 'not_open', 'not_yet_open'],
  suspended: ['inactive', 'paused', 'suspended', 'halted', 'trading_halted', 'frozen', 'on_hold'],
  closed: ['closed', 'determined', 'disputed', 'amended', 'ended'],
  settled: ['settled', 'finalized', 'finalised', 'resolved', 'voided', 'void', 'cancelled', 'canceled'],
  expired: ['expired', 'expiry'],
  delisted: ['delisted', 'removed', 'withdrawn', 'archived'],
};

const BY_WORD = new Map<string, MarketState>();
for (const [state, words] of Object.entries(WORDS) as [MarketState, readonly string[]][]) for (const w of words) BY_WORD.set(w, state);

/**
 * A status word (any case, spaces or hyphens) as a state. A missing or blank word is 'unreported' (no status is not a word); any other word
 * that is not on the list above is 'unrecognised'. A non-empty `result` means the market is determined: 'settled'.
 */
export function marketStateOf(word: string | null | undefined, result?: string | null): MarketState {
  if (typeof result === 'string' && result.trim() !== '') return 'settled';
  if (word == null) return 'unreported';
  const k = String(word).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (k === '') return 'unreported';
  return BY_WORD.get(k) ?? 'unrecognised';
}

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

/** True when the word says the market trades, or there is no word. */
export const isTradableWord = (word: string | null | undefined): boolean => isTradableState(marketStateOf(word));

/** The sheet's headline for a market that cannot be traded (null when the sheet should say "Price unavailable right now" with Retry instead: open, unreported, unrecognised). */
export function nonTradableTitle(s: MarketState): string | null {
  switch (s) {
    case 'closed': case 'expired': return 'Market closed';
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
