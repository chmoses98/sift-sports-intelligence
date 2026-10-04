// Research market rows + live quotes. The sport publication stays the record of WHAT a market is
// (family, subject, line, model price, history, provenance); the live provider is authoritative for
// its CURRENT quote, volume, open interest and availability whenever it has a newer observation.
// Nothing is deleted: the research row is kept alongside, and a quote is only ever replaced by a newer
// one, so a failed refresh can never make a price look newer than it is.
import type { Market } from '../contract/types';
import { quoteTimeMs } from './freshness';
import type { Availability, LiveQuote } from './types';

/** The quote a screen shows for a market, wherever it came from. */
export interface QuoteView {
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
  lastPrice: number | null;
  volume: number | null;
  openInterest: number | null;
  availability: Availability;
  /** The authoritative observation time of these numbers (null = UNKNOWN). */
  observedAt: string | null;
  /** "publication" (the sport repo's capture) or the live provider id. */
  source: string;
  live: boolean;
}

type MarketLike = Pick<Market, 'kalshi_ticker' | 'yes_bid' | 'yes_ask' | 'captured_at'> &
  Partial<Pick<Market, 'no_bid' | 'no_ask' | 'last_price' | 'volume' | 'open_interest' | 'market_status' | 'source'>>;

export function availabilityFromStatus(s: string | null | undefined): Availability {
  switch ((s ?? '').toUpperCase()) {
    case 'OPEN':
    case 'UNOPENED':
    case 'SUSPENDED':
    case 'CLOSED':
    case 'SETTLED':
      return s!.toUpperCase() as Availability;
    default:
      return 'UNKNOWN';
  }
}

/** True when the live observation is at least as new as the publication's capture. */
export function liveWins(m: { captured_at?: string | null }, q: LiveQuote | undefined): q is LiveQuote {
  if (!q) return false;
  const lt = quoteTimeMs(q.observedAt);
  if (lt == null) return false;
  const pt = quoteTimeMs(m.captured_at ?? null);
  return pt == null || lt >= pt;
}

export function quoteView(m: MarketLike, q?: LiveQuote): QuoteView {
  if (liveWins(m, q)) {
    return {
      yesBid: q.yesBid, yesAsk: q.yesAsk, noBid: q.noBid, noAsk: q.noAsk, lastPrice: q.lastPrice,
      volume: q.volume, openInterest: q.openInterest, availability: q.availability, observedAt: q.observedAt,
      source: q.source, live: true,
    };
  }
  return {
    yesBid: m.yes_bid ?? null, yesAsk: m.yes_ask ?? null, noBid: m.no_bid ?? null, noAsk: m.no_ask ?? null,
    lastPrice: m.last_price ?? null, volume: m.volume ?? null, openInterest: m.open_interest ?? null,
    availability: availabilityFromStatus(m.market_status), observedAt: m.captured_at ?? null, source: 'publication', live: false,
  };
}

/**
 * A contract Market row with its current quote fields replaced by the newer live observation. Used
 * for screens and for the handicap packet, whose market rows carry yes_bid/yes_ask/last/captured_at/
 * market_status and nothing else from the quote. market_probability (a research field, the
 * repository's implied probability at capture) is left untouched.
 */
export function overlayMarket<M extends MarketLike>(m: M, q: LiveQuote | undefined): M {
  if (!liveWins(m, q)) return m;
  return {
    ...m,
    yes_bid: q.yesBid,
    yes_ask: q.yesAsk,
    no_bid: q.noBid,
    no_ask: q.noAsk,
    last_price: q.lastPrice,
    volume: q.volume,
    open_interest: q.openInterest,
    market_status: q.availability,
    captured_at: q.observedAt,
    source: `${q.source} (live quote; research row: ${m.source ?? 'publication'})`,
  };
}

/**
 * Contracts the live provider lists under a game's event tickers that the research publication does
 * not have (a new alternate line or prop rung). Shown with Kalshi's own wording and live quote only:
 * the publication has no family, subject, model price or history for them, and none is invented.
 */
export function newlyListed(published: Iterable<string>, live: LiveQuote[]): LiveQuote[] {
  const have = new Set(published);
  return live.filter((q) => !have.has(q.ticker) && q.availability !== 'SETTLED').sort((a, b) => a.ticker.localeCompare(b.ticker));
}
