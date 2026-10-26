// The ONE place a screen decides whether a price may be displayed. Every price slot goes through `gate(price, context)`; a price that
// fails the rule is withheld ("—" in a list; "Price unavailable right now" with Retry in the exact-contract sheet). Nothing here is ever
// shown to the viewer: no ages, no freshness words, no timestamps.
//
// The rule is the approved one (docs/sift3/QUOTE_DELIVERY.md): a quote may be displayed only if its OBSERVATION time is within the
// maximum age for its context. This file is the seam: when the separately reviewed quote branch (`claude/quote-track`,
// src/live/quoteUsable.ts) is merged, `gate` delegates to its `quoteUsable` and the availability meter, and nothing else changes.
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

export interface GateResult { price: Price | null; reason: 'ok' | 'no-price' | 'no-observation-time' | 'future' | 'too-old' }

/** Sample prices are labelled sample data and have no observation clock: they pass (the screen already says "Sample"). */
export function gate(p: Price | null | undefined, c: QuoteContext, now = Date.now(), skewMs = 0): GateResult {
  if (!p || p.ask == null) return { price: null, reason: 'no-price' };
  if (p.source === 'Sample') return { price: p, reason: 'ok' };
  const t = p.observedAt ? Date.parse(p.observedAt) : NaN;
  if (!Number.isFinite(t)) return { price: null, reason: 'no-observation-time' };
  if (t - (now + skewMs) > 5_000) return { price: null, reason: 'future' };
  if (now + skewMs - t > maxAgeMs(c, now)) return { price: null, reason: 'too-old' };
  return { price: p, reason: 'ok' };
}

/** The price to show, or null to show the missing-price state. */
export const usablePrice = (p: Price | null | undefined, c: QuoteContext, now = Date.now()): Price | null => gate(p, c, now).price;
