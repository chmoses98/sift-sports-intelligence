// The exact-contract sheet's arithmetic, kept apart from the sheet so it can be tested: a live quote as a Price, which of two observations
// is the newer, and the rows a usable price gives (ask, bid, implied pre-fee, taker fee, fee-aware break-even). The fee and break-even use the
// one schedule in model/format.ts. Nothing here knows about freshness words: whether a price may be shown at all is data/quoteGate.ts.
import type { LiveQuote } from '../../live/types';
import { guardLiveQuote } from '../data/validate';
import { breakEvenPct, cents, takerFeeCents } from './format';
import { isTerminalState, liveStatusFacts } from './marketStatus';
import type { Price } from './types';

/**
 * A live quote (dollars) as the v3 Price (cents). A quote with no executable YES ask has no Price, EXCEPT a quote whose status
 * is not positively open (any word but open/active: closed, settled, suspended, or one SIFT does not recognise): that is a Price with no ask
 * whose `tradable` is false, so the exact-contract sheet can say "Market closed" / "Market settled" / "Trading suspended" instead of offering a Retry
 * that cannot help (an unrecognised word says "Price unavailable right now" with Retry). The provider's own status word (`rawStatus`) is read before its
 * normalised `availability`, which folds several words into UNKNOWN; an UNKNOWN availability with no raw word means the provider sent no status.
 */
export function priceOfQuote(q: LiveQuote | undefined, fallbackDescription = ''): Price | null {
  if (!q || !guardLiveQuote(q).ok) return null; // a quote whose numbers are not a price's is no price (data/validate.ts guardLiveQuote)
  const sf = liveStatusFacts(q); // the shared rule (src/live/tradable.ts) on the whole quote: status word, `result`, close time
  const ask = sf.tradable ? cents(q.yesAsk) : null, bid = sf.tradable ? cents(q.yesBid) : null;
  if (ask == null && sf.tradable) return null;
  return {
    ask, bid, ...sf, implied: ask, ticker: q.ticker, side: 'YES', description: q.title ?? q.yesSubTitle ?? fallbackDescription,
    observedAt: q.observedAt, ...(q.observedVia ? { observedVia: q.observedVia } : {}), source: 'Kalshi', volume: q.volume,
  };
}

/**
 * The more recently OBSERVED of two prices (an observation is only ever replaced by a newer one). A terminal report (closed, settled, expired,
 * delisted) is not undone by a newer observation that carries no status at all: it says nothing about the status, and a finished market never reopens.
 */
export function newerPrice(a: Price | null | undefined, b: Price | null | undefined): Price | null {
  if (!a) return b ?? null;
  if (!b) return a;
  // An answer the provider did not time is not an observation (its `observedAt` is only when this device received it): it never replaces a timed one.
  if (b.observedVia === 'received' && a.observedVia !== 'received') return a;
  if (a.observedVia === 'received' && b.observedVia !== 'received') return b;
  const ta = a.observedAt ? Date.parse(a.observedAt) : NaN, tb = b.observedAt ? Date.parse(b.observedAt) : NaN;
  if (!Number.isFinite(tb)) return a;
  if (!Number.isFinite(ta)) return b;
  if (tb <= ta) return a;
  return b.marketStatus === 'unreported' && isTerminalState(a.marketStatus) ? a : b;
}

export interface ContractFacts {
  ask: number;
  bid: number | null;
  /** The Over price as an implied probability, before fees: the ask itself. */
  implied: number;
  /** The taker fee at this ask, in cents per contract. */
  fee: number;
  /** The ask plus the fee: what the side must be worth to break even, in cents and as a percentage. */
  breakEven: number;
  volume: number | null;
}

/** The facts of a price that may be shown. Everything derives from the ask; null when there is no ask (no invented number). */
export function contractFacts(p: Price | null | undefined): ContractFacts | null {
  if (!p || p.ask == null) return null;
  return { ask: p.ask, bid: p.bid, implied: p.ask, fee: takerFeeCents(p.ask), breakEven: breakEvenPct(p.ask), volume: p.volume ?? null };
}
