// The ONE place a screen decides whether a price may be displayed. Every price slot goes through `gate(price, context)`; a price that
// fails the rule is withheld ("—" in a list; "Price unavailable right now" with Retry in the exact-contract sheet). Nothing here is ever
// shown to the viewer: no ages, no freshness words, no timestamps.
//
// The rule is the approved one (docs/sift3/QUOTE_DELIVERY.md): a quote may be displayed only if its OBSERVATION time is within the
// maximum age for its context. This file is the v3 API (a `Price` in cents, a `{kind, startMs, live}` context); the decision itself is NOT made
// here. The age table, the start-time tiers, the 5 s future tolerance, the clock-skew correction and the "an answer the provider did not time is no
// observation" rule are `quoteUsable` in src/live/quoteUsable.ts (PR #148), the single source of truth for the whole app; the market-status
// vocabulary is src/live/tradable.ts through model/marketStatus.ts. What stays here is only what is specific to a v3 `Price`: it carries an ask in
// cents (1 to 99), a status already resolved to a state, and labelled sample data. tests/v3/quoteUsableEquivalence.test.ts pins this seam to the
// approved table.
import { maxAgeMs as liveMaxAgeMs, quoteUsable, type QuoteContext as LiveQuoteContext, type UnusableReason } from '../../live/quoteUsable';
import type { LiveQuote } from '../../live/types';
import type { MarketState } from '../model/marketStatus';
import type { Price } from '../model/types';

export type QuoteContext =
  | { kind: 'list'; startMs: number | null; live: boolean }
  | { kind: 'contract'; startMs: number | null; live: boolean };

/** This price's context in the shared rule's vocabulary. */
const liveContext = (c: QuoteContext): LiveQuoteContext => ({ surface: c.kind, startsAt: c.startMs, live: c.live });

/**
 * A price as the quote the shared rule judges: only what the rule reads (the observation and how it was made). Its status is deliberately the neutral
 * one ("none sent"): a Price's status is resolved before it gets here and `gate` answers it first.
 */
const asQuote = (p: Price): LiveQuote => ({
  ticker: p.ticker, availability: 'UNKNOWN', rawStatus: null, observedAt: p.observedAt as string, observedVia: p.observedVia, source: p.source,
} as LiveQuote); // (the fields the rule does not read are left out on purpose: v3 reads no market time of Kalshi's, see tests/v3/scheduleStarts.test.ts)

/** Maximum observation age in ms for a context (the shared table). An unknown start takes the stricter tier; a start in the past is live. */
export function maxAgeMs(c: QuoteContext, now: number, skewMs = 0): number {
  return liveMaxAgeMs(liveContext(c), now, skewMs);
}

export interface GateResult {
  price: Price | null;
  reason: 'ok' | 'no-price' | 'not-tradable' | 'no-observation-time' | 'future' | 'too-old';
  /** Why the market cannot be traded, for the exact-contract sheet ('not-tradable' only; otherwise null). */
  marketStatus: MarketState | null;
}

const out = (reason: GateResult['reason'], marketStatus: MarketState | null = null): GateResult => ({ price: null, reason, marketStatus });

/** The shared rule's reasons as v3's. */
const REASON: Record<Exclude<UnusableReason, 'no_quote' | 'not_tradable'>, GateResult['reason']> = {
  missing_observed_at: 'no-observation-time',
  unparseable_observed_at: 'no-observation-time',
  untimed_observation: 'no-observation-time',
  future_observed_at: 'future',
  too_old: 'too-old',
};

/**
 * A YES ask is executable only between 1 and 99 cents: Kalshi reports "no ask" as 100 (or 0), and neither is a price anyone can buy at.
 * (The live store already drops 100; a published 0 reaches here as 0.)
 */
export const isExecutableAsk = (ask: number | null | undefined): ask is number => ask != null && Number.isFinite(ask) && ask >= 1 && ask <= 99;

/** Is this price's OBSERVATION current for the context (a real observation time, not in the future, inside the maximum age)? Says nothing about the market's status or the ask. */
export function observationCurrent(p: Price, c: QuoteContext, now = Date.now(), skewMs = 0): boolean {
  return quoteUsable(asQuote(p), liveContext(c), now, { clockSkewMs: skewMs }).usable;
}

/**
 * THE rule, in order. (1) No Price: nothing. (2) A market whose status word is not positively open (closed, settled, expired, suspended, not open yet,
 * delisted, or any word SIFT does not recognise): withheld whatever its age, and whatever ask it carries. (3) No executable ask: nothing. (4) Sample data passes (labelled).
 * (5) Real data needs a current OBSERVATION for the context: the shared `quoteUsable`. A MISSING market status is not (2) (no word, nothing to distrust); an unrecognised one is: see model/marketStatus.ts.
 */
export function gate(p: Price | null | undefined, c: QuoteContext, now = Date.now(), skewMs = 0): GateResult {
  if (!p) return out('no-price');
  if (p.tradable === false) return out('not-tradable', p.marketStatus);
  if (!isExecutableAsk(p.ask)) return out('no-price');
  if (p.source === 'Sample') return { price: p, reason: 'ok', marketStatus: null };
  const u = quoteUsable(asQuote(p), liveContext(c), now, { clockSkewMs: skewMs });
  if (u.usable) return { price: p, reason: 'ok', marketStatus: null };
  // `not_tradable` cannot occur: the neutral status above is "none sent". `no_quote` cannot occur: a quote is always passed.
  return out(u.reason === 'no_quote' || u.reason === 'not_tradable' || u.reason == null ? 'no-observation-time' : REASON[u.reason]);
}

/** The price to show, or null to show the missing-price state. */
export const usablePrice = (p: Price | null | undefined, c: QuoteContext, now = Date.now(), skewMs = 0): Price | null => gate(p, c, now, skewMs).price;
