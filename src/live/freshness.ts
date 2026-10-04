// The MARKET clock. Executable quotes (bid/ask/last/volume/OI/status) age on their own, much faster
// rule than research documents, so they get their own, owner-defined policy:
//
//   FRESH    quote age <  15:00
//   AGING    15:00 <= quote age <= 30:00   (exactly 30:00 is still AGING)
//   STALE    quote age >  30:00
//   UNKNOWN  no trustworthy quote timestamp
//
// Age is measured from the quote's own observation time (when the provider answered, or the
// publication's captured_at), never from when Sift last *tried* to refresh. A failed refresh does not
// make an old quote younger. These thresholds are for market quotes only: research documents, model
// prices and health keep the contract's per-component thresholds (src/contract/freshness.ts).
import { parseTs } from '../contract/freshness';

export type QuoteFreshness = 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';

export const QUOTE_FRESH_BEFORE_MS = 15 * 60 * 1000;
export const QUOTE_STALE_AFTER_MS = 30 * 60 * 1000;

export function quoteTimeMs(asOf: string | number | Date | null | undefined): number | null {
  if (asOf == null || asOf === '') return null;
  if (typeof asOf === 'number') return Number.isFinite(asOf) ? asOf : null;
  if (asOf instanceof Date) return Number.isNaN(asOf.getTime()) ? null : asOf.getTime();
  return parseTs(asOf);
}

/** Milliseconds since the quote was observed, or null without a trustworthy timestamp. */
export function quoteAgeMs(asOf: string | number | Date | null | undefined, now: number): number | null {
  const t = quoteTimeMs(asOf);
  return t == null ? null : now - t;
}

export function classifyQuoteAge(ageMs: number | null): QuoteFreshness {
  if (ageMs == null || Number.isNaN(ageMs)) return 'UNKNOWN';
  // A timestamp slightly in the future is clock skew between the provider and this device, not a
  // freshness problem (same rule as the contract).
  if (ageMs < QUOTE_FRESH_BEFORE_MS) return 'FRESH';
  if (ageMs <= QUOTE_STALE_AFTER_MS) return 'AGING';
  return 'STALE';
}

export function quoteFreshness(asOf: string | number | Date | null | undefined, now: number): QuoteFreshness {
  return classifyQuoteAge(quoteAgeMs(asOf, now));
}

const ORDER: Record<QuoteFreshness, number> = { FRESH: 0, AGING: 1, STALE: 2, UNKNOWN: 3 };

export function worstQuote(states: QuoteFreshness[]): QuoteFreshness {
  return states.reduce<QuoteFreshness>((a, b) => (ORDER[b] > ORDER[a] ? b : a), states.length ? 'FRESH' : 'UNKNOWN');
}

/**
 * An observation time as ISO 8601 to the second, rounded DOWN: a quote is never stamped younger than
 * it is, and packet rows share the publication's timestamp style (no milliseconds).
 */
export function isoSeconds(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** "3m", "34m", "2h 05m": an age for a chip, never rounded down into a younger bucket. */
export function formatQuoteAge(ageMs: number | null): string {
  if (ageMs == null) return 'no timestamp';
  if (ageMs < 0) return 'just now';
  const s = Math.floor(ageMs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d`;
}
