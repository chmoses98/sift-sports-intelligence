// The shared quote-usability rule: every row of the max-age table, both sides of every boundary, and
// the validation rules (missing / unparseable / future timestamps, a 200 with old data, clock skew).
import { describe, expect, it } from 'vitest';
import {
  assessBatch, CONTEXT_KEYS, contextKey, FAR_FROM_START_MS, FUTURE_TOLERANCE_MS, MAX_AGE_MS, phaseOf, quoteUsable,
  type ContextKey, type QuoteContext,
} from '../../src/live/quoteUsable';
import { quote } from './fakes';

const NOW = Date.parse('2026-10-26T18:00:00Z');
const T = 'KXNHLGOAL-26OCT26TORCGY-TOR19';
const HOUR = 3_600_000;

const FAR: Omit<QuoteContext, 'surface'> = { startsAt: NOW + 5 * HOUR };
const NEAR: Omit<QuoteContext, 'surface'> = { startsAt: NOW + HOUR };
const LIVE: Omit<QuoteContext, 'surface'> = { startsAt: NOW - HOUR, live: true };
const list = (c: Omit<QuoteContext, 'surface'>): QuoteContext => ({ ...c, surface: 'list' });
const contract = (c: Omit<QuoteContext, 'surface'>): QuoteContext => ({ ...c, surface: 'contract' });
/** A quote observed `ageMs` before NOW. */
const aged = (ageMs: number) => quote(T, 0.5, NOW - ageMs);

describe('the max-age table (initial values from docs/sift3/QUOTE_DELIVERY.md)', () => {
  const rows: [string, QuoteContext, ContextKey, number][] = [
    ['list, start more than 2 h away', list(FAR), 'list_far', 180_000],
    ['list, start within 2 h', list(NEAR), 'list_near', 90_000],
    ['list, live', list(LIVE), 'list_live', 60_000],
    ['exact contract, start more than 2 h away', contract(FAR), 'contract_far', 60_000],
    ['exact contract, start within 2 h', contract(NEAR), 'contract_near', 30_000],
    ['exact contract, live', contract(LIVE), 'contract_near', 30_000],
  ];

  it('has exactly the five documented limits', () => {
    expect(MAX_AGE_MS).toEqual({ list_far: 180_000, list_near: 90_000, list_live: 60_000, contract_far: 60_000, contract_near: 30_000 });
    expect(CONTEXT_KEYS).toHaveLength(5);
  });

  for (const [name, ctx, key, limit] of rows) {
    describe(name, () => {
      it('maps to its row', () => {
        expect(contextKey(ctx, NOW)).toBe(key);
        expect(quoteUsable(aged(0), ctx, NOW)).toMatchObject({ usable: true, context: key, limitMs: limit });
      });
      it('is usable well inside the limit', () => {
        expect(quoteUsable(aged(limit - 10_000), ctx, NOW).usable).toBe(true);
      });
      it('is usable exactly AT the limit', () => {
        expect(quoteUsable(aged(limit), ctx, NOW)).toMatchObject({ usable: true, reason: null, ageMs: limit });
      });
      it('is NOT usable one second over the limit', () => {
        expect(quoteUsable(aged(limit + 1_000), ctx, NOW)).toMatchObject({ usable: false, reason: 'too_old', ageMs: limit + 1_000 });
      });
    });
  }
});

describe('start-time tiers come from the schedule', () => {
  it('exactly 2 h before the start is already "within 2 hours"; one second more is "more than 2 hours"', () => {
    expect(phaseOf({ surface: 'list', startsAt: NOW + FAR_FROM_START_MS }, NOW)).toBe('near');
    expect(phaseOf({ surface: 'list', startsAt: NOW + FAR_FROM_START_MS + 1_000 }, NOW)).toBe('far');
  });
  it('a start time in the past, or live=true, is live', () => {
    expect(phaseOf({ surface: 'list', startsAt: NOW }, NOW)).toBe('live');
    expect(phaseOf({ surface: 'list', startsAt: NOW - 60_000 }, NOW)).toBe('live');
    expect(phaseOf({ surface: 'list', startsAt: NOW + 9 * HOUR, live: true }, NOW)).toBe('live');
  });
  it('an unknown or unparseable start falls to the STRICTER (near) tier, never the looser one', () => {
    expect(phaseOf({ surface: 'list', startsAt: null }, NOW)).toBe('near');
    expect(phaseOf({ surface: 'list', startsAt: 'someday' }, NOW)).toBe('near');
    // 100 s old: fine for a far list (180 s), not for near (90 s).
    expect(quoteUsable(aged(100_000), { surface: 'list', startsAt: null }, NOW).usable).toBe(false);
  });
  it('the same quote changes verdict as the game approaches (the schedule, not the quote, decides)', () => {
    const q = aged(120_000);
    expect(quoteUsable(q, list({ startsAt: NOW + 3 * HOUR }), NOW).usable).toBe(true);
    expect(quoteUsable(q, list({ startsAt: NOW + HOUR }), NOW).usable).toBe(false);
  });
  it('ignores the contract close time entirely (only the passed-in schedule counts)', () => {
    const q = { ...aged(100_000), closeTime: new Date(NOW + 30 * 24 * HOUR).toISOString() };
    expect(quoteUsable(q, list(NEAR), NOW).usable).toBe(false);
    const q2 = { ...aged(100_000), closeTime: new Date(NOW - HOUR).toISOString() };
    expect(quoteUsable(q2, list(FAR), NOW).usable).toBe(true);
  });
});

describe('validation: a quote with no believable observation time is never usable', () => {
  it('no quote at all', () => {
    expect(quoteUsable(undefined, list(FAR), NOW)).toMatchObject({ usable: false, reason: 'no_quote', ageMs: null });
    expect(quoteUsable(null, list(FAR), NOW).usable).toBe(false);
  });
  it('missing observed_at', () => {
    expect(quoteUsable({ ...aged(0), observedAt: '' }, list(FAR), NOW)).toMatchObject({ usable: false, reason: 'missing_observed_at' });
    expect(quoteUsable({ ...aged(0), observedAt: undefined as unknown as string }, list(FAR), NOW).reason).toBe('missing_observed_at');
    expect(quoteUsable({ ...aged(0), observedAt: null as unknown as string }, list(FAR), NOW).reason).toBe('missing_observed_at');
  });
  it('unparseable observed_at', () => {
    expect(quoteUsable({ ...aged(0), observedAt: 'yesterday-ish' }, list(FAR), NOW)).toMatchObject({ usable: false, reason: 'unparseable_observed_at' });
    expect(quoteUsable({ ...aged(0), observedAt: {} as unknown as string }, list(FAR), NOW).reason).toBe('unparseable_observed_at');
  });
  it('an observation the provider did not stamp (arrival time only) is not an observation time', () => {
    expect(quoteUsable({ ...aged(0), observedVia: 'received' }, list(FAR), NOW)).toMatchObject({ usable: false, reason: 'untimed_observation' });
  });
  it('future timestamp: up to 5 s ahead is clock noise (age 0); 6 s ahead is rejected', () => {
    const ahead = (ms: number) => quote(T, 0.5, NOW + ms);
    expect(quoteUsable(ahead(FUTURE_TOLERANCE_MS), contract(NEAR), NOW)).toMatchObject({ usable: true, ageMs: 0 });
    expect(quoteUsable(ahead(FUTURE_TOLERANCE_MS + 1_000), contract(NEAR), NOW)).toMatchObject({ usable: false, reason: 'future_observed_at' });
    expect(quoteUsable(ahead(10 * 60_000), list(FAR), NOW).usable).toBe(false);
  });
  it('a "200 with old data": the HTTP status plays no part, only the observation time', () => {
    // An answer received a moment ago whose data was observed 10 minutes ago.
    expect(quoteUsable(aged(10 * 60_000), list(FAR), NOW)).toMatchObject({ usable: false, reason: 'too_old' });
  });
});

describe('clock skew correction (relay Date header)', () => {
  it('a device clock 10 minutes SLOW would show a fresh relay quote as "future"; the correction accepts it', () => {
    const deviceNow = NOW - 10 * 60_000;
    const q = quote(T, 0.5, NOW - 2_000); // observed 2 s ago on the relay's clock
    expect(quoteUsable(q, contract(NEAR), deviceNow).reason).toBe('future_observed_at');
    expect(quoteUsable(q, contract(NEAR), deviceNow, { clockSkewMs: 10 * 60_000 })).toMatchObject({ usable: true, ageMs: 2_000 });
  });
  it('a device clock 10 minutes FAST would reject a fresh quote as old; the correction accepts it', () => {
    const deviceNow = NOW + 10 * 60_000;
    const q = quote(T, 0.5, NOW - 2_000);
    expect(quoteUsable(q, contract(NEAR), deviceNow).reason).toBe('too_old');
    expect(quoteUsable(q, contract(NEAR), deviceNow, { clockSkewMs: -10 * 60_000 }).usable).toBe(true);
  });
  it('the correction also applies to the start-time tier', () => {
    // Device says 3 h before the start; the corrected clock says 1 h: the near tier (90 s) applies.
    const startsAt = NOW + HOUR;
    expect(contextKey({ surface: 'list', startsAt }, NOW - 2 * HOUR, 2 * HOUR)).toBe('list_near');
    expect(contextKey({ surface: 'list', startsAt }, NOW - 2 * HOUR)).toBe('list_far');
  });
});

describe('assessBatch: a 200 whose newest observation is over the limit is a failed refresh', () => {
  const batch = (...ages: number[]) => ages.map((a, i) => quote(`${T}${i}`, 0.5, NOW - a));
  it('uses the NEWEST observation, not the oldest', () => {
    expect(assessBatch(batch(500_000, 20_000), 30_000, NOW)).toMatchObject({ ok: true, newestAgeMs: 20_000 });
  });
  it('exactly at the limit passes; one second over fails', () => {
    expect(assessBatch(batch(30_000), 30_000, NOW).ok).toBe(true);
    expect(assessBatch(batch(31_000), 30_000, NOW)).toMatchObject({ ok: false, reason: 'too_old', newestAgeMs: 31_000 });
  });
  it('ignores untimed, unparseable and future-dated quotes when finding the newest', () => {
    const qs = [
      { ...quote(`${T}a`, 0.5, NOW), observedVia: 'received' as const },
      { ...quote(`${T}b`, 0.5, NOW), observedAt: 'garbage' },
      quote(`${T}c`, 0.5, NOW + 60_000),
      quote(`${T}d`, 0.5, NOW - 100_000),
    ];
    expect(assessBatch(qs, 30_000, NOW)).toMatchObject({ ok: false, newestAgeMs: 100_000 });
    expect(assessBatch(qs.slice(0, 3), 30_000, NOW)).toMatchObject({ ok: false, reason: 'no_observations', newestAgeMs: null });
  });
});
