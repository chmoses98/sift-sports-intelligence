// The owner's market-quote freshness policy, boundaries included, measured from real timestamps.
import { describe, expect, it } from 'vitest';
import { classifyQuoteAge, formatQuoteAge, QUOTE_FRESH_BEFORE_MS, QUOTE_STALE_AFTER_MS, quoteFreshness, worstQuote } from '../src/live/freshness';
import { statusFor } from '../src/contract/freshness';

const T0 = '2026-10-04T16:00:00Z';
const at = (mmss: string) => {
  const [m, s] = mmss.split(':').map(Number);
  return Date.parse(T0) + (m * 60 + s) * 1000;
};

describe('market quote freshness (FRESH < 15:00 <= AGING <= 30:00 < STALE)', () => {
  it.each([
    ['00:00', 'FRESH'],
    ['14:59', 'FRESH'],
    ['15:00', 'AGING'],
    ['29:59', 'AGING'],
    ['30:00', 'AGING'],
    ['30:01', 'STALE'],
    ['34:00', 'STALE'],
    ['600:00', 'STALE'],
  ])('a quote observed %s ago is %s', (elapsed, want) => {
    expect(quoteFreshness(T0, at(elapsed))).toBe(want);
  });

  it('is millisecond-exact at both boundaries', () => {
    const t = Date.parse(T0);
    expect(quoteFreshness(t, t + QUOTE_FRESH_BEFORE_MS - 1)).toBe('FRESH');
    expect(quoteFreshness(t, t + QUOTE_FRESH_BEFORE_MS)).toBe('AGING');
    expect(quoteFreshness(t, t + QUOTE_STALE_AFTER_MS)).toBe('AGING');
    expect(quoteFreshness(t, t + QUOTE_STALE_AFTER_MS + 1)).toBe('STALE');
  });

  it('a missing or untrustworthy timestamp is UNKNOWN, never fresh', () => {
    expect(quoteFreshness(null, at('00:01'))).toBe('UNKNOWN');
    expect(quoteFreshness(undefined, at('00:01'))).toBe('UNKNOWN');
    expect(quoteFreshness('', at('00:01'))).toBe('UNKNOWN');
    expect(quoteFreshness('not a time', at('00:01'))).toBe('UNKNOWN');
    expect(quoteFreshness(Number.NaN, at('00:01'))).toBe('UNKNOWN');
    expect(classifyQuoteAge(null)).toBe('UNKNOWN');
  });

  it('uses elapsed time across offsets, not string comparison', () => {
    // 16:00Z observed, 11:20-04:00 (= 15:20Z) ... evaluated at 16:31Z: 31 minutes, STALE.
    expect(quoteFreshness('2026-10-04T12:00:00-04:00', Date.parse('2026-10-04T16:31:00Z'))).toBe('STALE');
    expect(quoteFreshness('2026-10-04T12:00:00-04:00', Date.parse('2026-10-04T16:14:59Z'))).toBe('FRESH');
  });

  it('clock skew (a quote from a few seconds in the future) is not a failure', () => {
    expect(quoteFreshness(at('00:05'), at('00:00'))).toBe('FRESH');
  });

  it('is deliberately different from the contract research thresholds', () => {
    // The contract's market_data component is FRESH through 15:00 and AGING to 60:00; Sift's live
    // quote policy is stricter and must not leak into research freshness (or vice versa).
    expect(statusFor(T0, 'market_data', at('15:00'))).toBe('FRESH');
    expect(quoteFreshness(T0, at('15:00'))).toBe('AGING');
    expect(statusFor(T0, 'market_data', at('45:00'))).toBe('AGING');
    expect(quoteFreshness(T0, at('45:00'))).toBe('STALE');
    expect(statusFor(T0, 'model', at('45:00'))).toBe('FRESH');
  });

  it('ranks the worst quote state (UNKNOWN below STALE)', () => {
    expect(worstQuote(['FRESH', 'AGING'])).toBe('AGING');
    expect(worstQuote(['FRESH', 'STALE', 'UNKNOWN'])).toBe('UNKNOWN');
    expect(worstQuote([])).toBe('UNKNOWN');
  });

  it('writes ages without rounding a quote into a younger bucket', () => {
    expect(formatQuoteAge(null)).toBe('no timestamp');
    expect(formatQuoteAge(59_999)).toBe('59s');
    expect(formatQuoteAge(34 * 60_000 + 59_000)).toBe('34m');
    expect(formatQuoteAge(125 * 60_000)).toBe('2h 05m');
  });
});
