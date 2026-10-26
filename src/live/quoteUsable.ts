// The ONE rule that decides whether a quote may be displayed (internal configuration, never shown).
//
// A quote is displayable only if its OBSERVATION time (when Kalshi's data was observed: the relay's
// X-Sift-Observed-At, the feed's per-market observed_at) is within the maximum age of its context. Not
// the time a request was made, not whether the HTTP status was 200. Every price a screen renders goes
// through quoteUsable(); nothing else decides display. When it says no, the screen shows the
// missing-price state; it never shows an age, a badge or a warning (product rule, docs/quote-track).
//
// This is NOT the FRESH/AGING/STALE policy of src/live/freshness.ts, which stays for ChatGPT packets.
//
// Start time context comes from the LEAGUE SCHEDULE the caller passes in. Kalshi event metadata and a
// contract's close time are never used for the tiers.
import { quoteTimeMs } from './freshness';
import type { LiveQuote } from './types';

export type QuoteSurface = 'list' | 'contract';
export type QuotePhase = 'far' | 'near' | 'live';
/** The five rows of the max-age table (the contract's "within 2 hours" and "live" rows share a limit). */
export type ContextKey = 'list_far' | 'list_near' | 'list_live' | 'contract_far' | 'contract_near';

export interface QuoteContext {
  surface: QuoteSurface;
  /** Scheduled start of the game (league schedule), ISO string or epoch ms. null = unknown. */
  startsAt: string | number | null;
  /** The caller knows the game is in progress. A start time in the past also counts as live. */
  live?: boolean;
}

/** "More than 2 hours away" is a strict inequality: exactly 2 h before the start is already "within 2 hours". */
export const FAR_FROM_START_MS = 2 * 60 * 60 * 1000;
/** An observation stamped further ahead than this (after clock correction) is not believable. */
export const FUTURE_TOLERANCE_MS = 5_000;

/** Initial values, to be validated against measurement (docs/sift3/QUOTE_DELIVERY.md). */
export const MAX_AGE_MS: Readonly<Record<ContextKey, number>> = Object.freeze({
  list_far: 180_000,
  list_near: 90_000,
  list_live: 60_000,
  contract_far: 60_000,
  contract_near: 30_000,
});

export const CONTEXT_KEYS = Object.keys(MAX_AGE_MS) as ContextKey[];

export type UnusableReason =
  | 'no_quote'
  | 'missing_observed_at'
  | 'unparseable_observed_at'
  /** The provider gave no observation time; the arrival time of the response is not an observation time. */
  | 'untimed_observation'
  | 'future_observed_at'
  | 'too_old';

export interface Usability {
  usable: boolean;
  reason: UnusableReason | null;
  /** Age of the observation on the (skew-corrected) clock; null when it has no believable timestamp. */
  ageMs: number | null;
  /** The limit that applied. */
  limitMs: number;
  context: ContextKey;
}

export interface UsableOptions {
  /**
   * The relay's own clock minus this device's clock (from the relay's `Date` response header), so a
   * wrong device clock neither hides good quotes nor shows old ones. 0 / omitted = device clock trusted.
   */
  clockSkewMs?: number;
}

/**
 * Which phase of the game the schedule puts us in. Unknown or unparseable start times fall to 'near':
 * the STRICTER tier, so a missing schedule can only make the rule tighter, never looser.
 */
export function phaseOf(ctx: QuoteContext, now: number, clockSkewMs = 0): QuotePhase {
  if (ctx.live) return 'live';
  const start = quoteTimeMs(ctx.startsAt);
  if (start == null) return 'near';
  const until = start - (now + clockSkewMs);
  if (until <= 0) return 'live';
  return until > FAR_FROM_START_MS ? 'far' : 'near';
}

export function contextKey(ctx: QuoteContext, now: number, clockSkewMs = 0): ContextKey {
  const phase = phaseOf(ctx, now, clockSkewMs);
  if (ctx.surface === 'list') return `list_${phase}`;
  return phase === 'far' ? 'contract_far' : 'contract_near';
}

export function maxAgeMs(ctx: QuoteContext, now: number, clockSkewMs = 0): number {
  return MAX_AGE_MS[contextKey(ctx, now, clockSkewMs)];
}

/**
 * May `quote` be displayed in `ctx` at `now`? Age is `now - observed_at`; exactly the limit is still
 * usable, one second over is not. A timestamp up to 5 s ahead of the (corrected) clock is clock noise
 * and counts as age 0; further ahead is rejected. Pure: no clock, no store.
 */
export function quoteUsable(quote: LiveQuote | null | undefined, ctx: QuoteContext, now: number, opts: UsableOptions = {}): Usability {
  const skew = opts.clockSkewMs ?? 0;
  const key = contextKey(ctx, now, skew);
  const limitMs = MAX_AGE_MS[key];
  const no = (reason: UnusableReason, ageMs: number | null = null): Usability => ({ usable: false, reason, ageMs, limitMs, context: key });
  if (!quote) return no('no_quote');
  const raw = quote.observedAt as unknown;
  if (raw == null || raw === '') return no('missing_observed_at');
  if (quote.observedVia === 'received') return no('untimed_observation');
  const observed = typeof raw === 'string' || typeof raw === 'number' ? quoteTimeMs(raw) : null;
  if (observed == null) return no('unparseable_observed_at');
  const age = now + skew - observed;
  if (age < -FUTURE_TOLERANCE_MS) return no('future_observed_at', age);
  const ageMs = Math.max(0, age);
  if (ageMs > limitMs) return no('too_old', ageMs);
  return { usable: true, reason: null, ageMs, limitMs, context: key };
}

export interface BatchAssessment {
  /** The newest believable observation is within `limitMs`. */
  ok: boolean;
  /** Age of the newest believable observation; null when none of the quotes has one. */
  newestAgeMs: number | null;
  reason: 'ok' | 'no_observations' | 'too_old';
}

/**
 * A 200 whose NEWEST observation is over the limit is a failed refresh, not a success. Quotes with a
 * missing, unparseable, untimed or future-dated observation are ignored when finding the newest.
 */
export function assessBatch(quotes: readonly LiveQuote[], limitMs: number, now: number, clockSkewMs = 0): BatchAssessment {
  let newest: number | null = null;
  for (const q of quotes) {
    if (q.observedVia === 'received') continue;
    const t = typeof q.observedAt === 'string' ? quoteTimeMs(q.observedAt) : null;
    if (t == null || t - (now + clockSkewMs) > FUTURE_TOLERANCE_MS) continue;
    if (newest == null || t > newest) newest = t;
  }
  if (newest == null) return { ok: false, newestAgeMs: null, reason: 'no_observations' };
  const newestAgeMs = Math.max(0, now + clockSkewMs - newest);
  return newestAgeMs > limitMs ? { ok: false, newestAgeMs, reason: 'too_old' } : { ok: true, newestAgeMs, reason: 'ok' };
}
