// Kalshi market object -> LiveQuote. Kalshi reports prices as dollar strings (yes_bid_dollars "0.5300"),
// sizes as fixed-point strings (volume_fp "5679.29") and keeps legacy integer-cent fields only on older
// payloads (observed by the sport capture workers, e.g. NHL-edge-finder kalshi/normalize.py). Every
// field is optional here: a missing field is null, never a guessed number.
import type { Availability, LiveQuote } from './types';

type Raw = Record<string, unknown>;

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** A price in dollars (0..1) from `<k>_dollars`, else legacy integer cents `<k>`. */
function price(m: Raw, k: string): number | null {
  const d = num(m[`${k}_dollars`]);
  if (d != null) return d;
  const c = num(m[k]);
  return c == null ? null : c / 100;
}

function size(m: Raw, k: string): number | null {
  const fp = num(m[`${k}_fp`]);
  return fp != null ? fp : num(m[k]);
}

/** Kalshi's status words (market objects and the status filter use different spellings). */
export function availabilityOf(status: unknown): Availability {
  switch (String(status ?? '').toLowerCase()) {
    case 'active':
    case 'open':
      return 'OPEN';
    case 'initialized':
    case 'unopened':
      return 'UNOPENED';
    case 'inactive':
    case 'paused':
      return 'SUSPENDED';
    case 'closed':
    case 'determined':
    case 'disputed':
    case 'amended':
      return 'CLOSED';
    case 'settled':
    case 'finalized':
      return 'SETTLED';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Bid 0 means "no bid" and ask 1.00 means "no ask" on Kalshi's book; both are reported as absent
 * rather than as executable prices.
 */
function bid(v: number | null): number | null {
  return v == null || v <= 0 ? null : v;
}
function ask(v: number | null): number | null {
  return v == null || v >= 1 ? null : v;
}

export function normalizeKalshiMarket(m: Raw, observedAt: string, source: string): LiveQuote | null {
  const ticker = typeof m.ticker === 'string' ? m.ticker : null;
  if (!ticker) return null;
  return {
    ticker,
    eventTicker: typeof m.event_ticker === 'string' ? m.event_ticker : null,
    seriesTicker: typeof m.series_ticker === 'string' ? m.series_ticker : typeof m.event_ticker === 'string' ? m.event_ticker.split('-')[0] : null,
    yesBid: bid(price(m, 'yes_bid')),
    yesAsk: ask(price(m, 'yes_ask')),
    noBid: bid(price(m, 'no_bid')),
    noAsk: ask(price(m, 'no_ask')),
    lastPrice: (() => {
      const p = price(m, 'last_price');
      return p == null || p <= 0 ? null : p;
    })(),
    volume: size(m, 'volume'),
    openInterest: size(m, 'open_interest'),
    availability: availabilityOf(m.status),
    rawStatus: m.status == null ? null : String(m.status),
    closeTime: typeof m.close_time === 'string' ? m.close_time : null,
    observedAt,
    source,
    title: typeof m.title === 'string' ? m.title : null,
    yesSubTitle: typeof m.yes_sub_title === 'string' ? m.yes_sub_title : typeof m.subtitle === 'string' ? m.subtitle : null,
    strike:
      m.floor_strike != null || m.cap_strike != null || m.strike_type != null
        ? { floor: num(m.floor_strike), cap: num(m.cap_strike), type: m.strike_type == null ? null : String(m.strike_type) }
        : null,
  };
}
