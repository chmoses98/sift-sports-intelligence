// Fee-aware pricing for one side of a Kalshi contract. The only arithmetic Sift adds to a publication's numbers:
//   fee        Kalshi's taker fee, round-up(0.07 × P × (1 − P)) per contract to the cent (the general schedule; a
//              publication's own fee figure wins when it publishes one, because some series carry a multiplier)
//   breakEven  ask + fee: the probability the side needs to break even
//   ev         fair − breakEven per $1 contract
// Nothing here produces a bet-up-to price or a stake: those are the publication's or they are absent.
import { quoteFreshness } from '../live/freshness';
import type { PriceIntel, PriceState, Side } from './types';

export const KALSHI_TAKER_RATE = 0.07;

/** Kalshi's general taker fee per contract at price p (dollars), rounded up to the cent. */
export function kalshiFee(p: number | null | undefined, multiplier = 1): number | null {
  if (p == null || !Number.isFinite(p) || p <= 0 || p >= 1) return null;
  return Math.ceil(KALSHI_TAKER_RATE * multiplier * p * (1 - p) * 100 - 1e-9) / 100;
}

export function breakEven(ask: number | null | undefined, fee: number | null | undefined): number | null {
  if (ask == null || fee == null) return null;
  return Math.round((ask + fee) * 1e6) / 1e6;
}

export interface PriceInputs {
  side: Side;
  ask: number | null;
  bid?: number | null;
  observedAt: string | null;
  source: PriceIntel['source'];
  fair: number | null;
  fairLow?: number | null;
  fairHigh?: number | null;
  /** The publication's fee per contract, when it publishes one. */
  publishedFee?: number | null;
  /** The publication's fee-adjusted EV per contract, when it publishes one. */
  publishedEv?: number | null;
  betUpTo?: number | null;
  availableSize?: number | null;
  expiresAt?: string | null;
  /** The publication's own freshness word for the price, when it says one (CURRENT / STALE …). */
  publishedPriceState?: string | null;
  now: number;
}

/** The price intelligence for a side, with its state decided in this order: expired → no quote → stale → above bet-up-to → unpriced → current. */
export function priceIntel(x: PriceInputs): PriceIntel {
  const fee = x.publishedFee ?? kalshiFee(x.ask);
  const be = breakEven(x.ask, fee);
  const ev = x.publishedEv ?? (x.fair != null && be != null ? Math.round((x.fair - be) * 1e6) / 1e6 : null);
  let state: PriceState = 'CURRENT';
  const expired = x.expiresAt != null && Date.parse(x.expiresAt) <= x.now;
  const fresh = quoteFreshness(x.observedAt, x.now);
  if (expired || (x.publishedPriceState ?? '').toUpperCase() === 'EXPIRED') state = 'EXPIRED';
  else if (x.ask == null) state = 'NO_QUOTE';
  else if (fresh === 'STALE' || (x.publishedPriceState ?? '').toUpperCase() === 'STALE') state = 'STALE';
  else if (x.betUpTo != null && x.ask > x.betUpTo + 1e-9) state = 'ABOVE_BET_UP_TO';
  else if (x.fair == null) state = 'UNPRICED';
  return {
    side: x.side, ask: x.ask, bid: x.bid ?? null, observedAt: x.observedAt, source: x.source, fair: x.fair, fairLow: x.fairLow ?? null, fairHigh: x.fairHigh ?? null,
    fee, feeSource: fee == null ? null : x.publishedFee != null ? 'publication' : 'kalshi-schedule', breakEven: be, evPerContract: ev,
    evSource: ev == null ? null : x.publishedEv != null ? 'publication' : 'derived', betUpTo: x.betUpTo ?? null, availableSize: x.availableSize ?? null, expiresAt: x.expiresAt ?? null, state,
  };
}

export const PRICE_STATE_WORD: Record<PriceState, string> = {
  CURRENT: 'Price current', ABOVE_BET_UP_TO: 'Above bet-up-to', EXPIRED: 'Validity expired', STALE: 'Quote stale', NO_QUOTE: 'No executable quote', UNPRICED: 'Not priced by the model',
};

/** "29¢ · break-even 30¢ · fair 47%": the price line a card shows. */
export function priceLine(p: PriceIntel): string {
  const c = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
  const parts = [`${p.side} ${c(p.ask)}`];
  if (p.breakEven != null) parts.push(`break-even ${c(p.breakEven)}`);
  if (p.fair != null) parts.push(`fair ${Math.round(p.fair * 100)}%`);
  if (p.betUpTo != null) parts.push(`bet up to ${c(p.betUpTo)}`);
  return parts.join(' · ');
}
