import { describe, expect, it } from 'vitest';
import { gate, maxAgeMs, type QuoteContext } from '../../src/v3/data/quoteGate';
import type { Price } from '../../src/v3/model/types';

const NOW = Date.parse('2026-10-26T20:00:00Z');
const at = (ageS: number): Price => ({ ask: 54, bid: 52, implied: 53, ticker: 'KX-1', side: 'YES', description: 'x', observedAt: new Date(NOW - ageS * 1000).toISOString(), source: 'Kalshi' });
const list = (hoursAway: number | null, live = false): QuoteContext => ({ kind: 'list', startMs: hoursAway == null ? null : NOW + hoursAway * 3600_000, live });
const contract = (hoursAway: number | null, live = false): QuoteContext => ({ kind: 'contract', startMs: hoursAway == null ? null : NOW + hoursAway * 3600_000, live });

describe('the approved quote-usability table (display seam)', () => {
  it.each([
    ['list, start more than 2 hours away', list(5), 180],
    ['list, start within 2 hours', list(1), 90],
    ['list, live', list(0, true), 60],
    ['contract, start more than 2 hours away', contract(5), 60],
    ['contract, start within 2 hours', contract(1), 30],
    ['contract, live', contract(0, true), 30],
  ])('%s: usable at the limit, withheld one second over', (_n, ctx, limit) => {
    expect(maxAgeMs(ctx, NOW)).toBe(limit * 1000);
    expect(gate(at(limit), ctx, NOW).price).not.toBeNull();
    expect(gate(at(limit + 1), ctx, NOW)).toMatchObject({ price: null, reason: 'too-old' });
  });
  it('exactly two hours out counts as within two hours; an unknown start takes the stricter tier', () => {
    expect(maxAgeMs(list(2), NOW)).toBe(90_000);
    expect(maxAgeMs(list(null), NOW)).toBe(90_000);
    expect(maxAgeMs(contract(null), NOW)).toBe(30_000);
  });
  it('withholds a price with no observation time, an unparseable one, a future one and a missing ask', () => {
    expect(gate({ ...at(1), observedAt: null }, list(5), NOW).reason).toBe('no-observation-time');
    expect(gate({ ...at(1), observedAt: 'soon' }, list(5), NOW).reason).toBe('no-observation-time');
    expect(gate(at(-30), list(5), NOW).reason).toBe('future');
    expect(gate(at(-3), list(5), NOW).price).not.toBeNull();
    expect(gate({ ...at(1), ask: null }, list(5), NOW).reason).toBe('no-price');
    expect(gate(null, list(5), NOW).reason).toBe('no-price');
  });
  it('lets labelled sample prices through, because the screen already says it is sample data', () => {
    expect(gate({ ...at(9999), source: 'Sample' }, list(1), NOW).price).not.toBeNull();
  });
});
