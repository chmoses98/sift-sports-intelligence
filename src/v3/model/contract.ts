// The exact-contract sheet's arithmetic, kept apart from the sheet so it can be tested: a live quote as a Price, which of two observations
// is the newer, and the rows a usable price gives (ask, bid, implied pre-fee, taker fee, fee-aware break-even). The fee and break-even use the
// one schedule in model/format.ts. Nothing here knows about freshness words: whether a price may be shown at all is data/quoteGate.ts.
import type { LiveQuote } from '../../live/types';
import { breakEvenPct, cents, takerFeeCents } from './format';
import type { Price } from './types';

/** A live quote (dollars) as the v3 Price (cents). A quote with no executable YES ask has no Price. */
export function priceOfQuote(q: LiveQuote | undefined, fallbackDescription = ''): Price | null {
  if (!q) return null;
  const ask = cents(q.yesAsk), bid = cents(q.yesBid);
  if (ask == null) return null;
  return {
    ask, bid, implied: ask, ticker: q.ticker, side: 'YES', description: q.title ?? q.yesSubTitle ?? fallbackDescription,
    observedAt: q.observedAt, source: 'Kalshi', volume: q.volume,
  };
}

/** The more recently OBSERVED of two prices (an observation is only ever replaced by a newer one). */
export function newerPrice(a: Price | null | undefined, b: Price | null | undefined): Price | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const ta = a.observedAt ? Date.parse(a.observedAt) : NaN, tb = b.observedAt ? Date.parse(b.observedAt) : NaN;
  if (!Number.isFinite(tb)) return a;
  if (!Number.isFinite(ta)) return b;
  return tb > ta ? b : a;
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
