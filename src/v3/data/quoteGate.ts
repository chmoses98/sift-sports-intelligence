// The ONE place a screen decides whether a price may be displayed. Every price slot goes through `gate(price, context)`; a price that
// fails the rule is withheld ("—" in a list; "Price unavailable right now" with Retry in the exact-contract sheet). Nothing here is ever
// shown to the viewer: no ages, no freshness words, no timestamps.
//
// The rule is the approved one (docs/sift3/QUOTE_DELIVERY.md): a quote may be displayed only if its OBSERVATION time is within the
// maximum age for its context. This file is the seam: when the separately reviewed quote branch (`claude/quote-track`,
// src/live/quoteUsable.ts) is merged, `gate` delegates to its `quoteUsable` and the availability meter, and nothing else changes.
import type { MarketState } from '../model/marketStatus';
import type { Price } from '../model/types';

export type QuoteContext =
  | { kind: 'list'; startMs: number | null; live: boolean }
  | { kind: 'contract'; startMs: number | null; live: boolean };

const TWO_HOURS = 2 * 3600_000;
/** Maximum observation age in ms for a context. Unknown start time takes the stricter tier. */
export function maxAgeMs(c: QuoteContext, now: number): number {
  const soon = c.live || c.startMs == null || c.startMs - now <= TWO_HOURS;
  if (c.kind === 'list') return c.live ? 60_000 : soon ? 90_000 : 180_000;
  return soon ? 30_000 : 60_000;
}

export interface GateResult {
  price: Price | null;
  reason: 'ok' | 'no-price' | 'not-tradable' | 'no-observation-time' | 'future' | 'too-old';
  /** Why the market cannot be traded, for the exact-contract sheet ('not-tradable' only; otherwise null). */
  marketStatus: MarketState | null;
}

const out = (reason: GateResult['reason'], marketStatus: MarketState | null = null): GateResult => ({ price: null, reason, marketStatus });

/**
 * A YES ask is executable only between 1 and 99 cents: Kalshi reports "no ask" as 100 (or 0), and neither is a price anyone can buy at.
 * (The live store already drops 100; a published 0 reaches here as 0.)
 */
export const isExecutableAsk = (ask: number | null | undefined): ask is number => ask != null && Number.isFinite(ask) && ask >= 1 && ask <= 99;

/**
 * THE rule, in order. (1) No Price: nothing. (2) A market that POSITIVELY is not tradable (closed, settled, suspended, not open yet,
 * delisted): withheld whatever its age, and whatever ask it carries. (3) No executable ask: nothing. (4) Sample data passes (labelled).
 * (5) Real data needs a current OBSERVATION for the context. A missing or unrecognised market status is not (2): see model/marketStatus.ts.
 */
export function gate(p: Price | null | undefined, c: QuoteContext, now = Date.now(), skewMs = 0): GateResult {
  if (!p) return out('no-price');
  if (p.tradable === false) return out('not-tradable', p.marketStatus);
  if (!isExecutableAsk(p.ask)) return out('no-price');
  if (p.source === 'Sample') return { price: p, reason: 'ok', marketStatus: null };
  const t = p.observedAt ? Date.parse(p.observedAt) : NaN;
  if (!Number.isFinite(t)) return out('no-observation-time');
  if (t - (now + skewMs) > 5_000) return out('future');
  if (now + skewMs - t > maxAgeMs(c, now)) return out('too-old');
  return { price: p, reason: 'ok', marketStatus: null };
}

/** The price to show, or null to show the missing-price state. */
export const usablePrice = (p: Price | null | undefined, c: QuoteContext, now = Date.now()): Price | null => gate(p, c, now).price;
