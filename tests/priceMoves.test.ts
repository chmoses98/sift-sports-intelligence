// Owner item 41: price movement in plain words from the publication's own captures.
import { describe, expect, it } from 'vitest';
import { midOf, priceMove, sparkPath } from '../src/lib/priceMoves';

const pt = (at: string, bid: number | null, ask: number | null, last: number | null = null) => ({ captured_at: at, yes_bid: bid, yes_ask: ask, last_price: last, volume: null, open_interest: null, source: null });

describe('price moves', () => {
  it('reads a tight two-sided quote as its midpoint and skips an empty book', () => {
    expect(midOf(pt('x', 0.48, 0.5))).toBeCloseTo(0.49);
    expect(midOf(pt('x', 0, 1))).toBeNull();
    expect(midOf(pt('x', 0, 0.01, 0))).toBeNull();
    expect(midOf(pt('x', 0.2, 0.6, 0.41))).toBe(0.41);
  });
  it('says where it opened, where it is now and over how long', () => {
    const mv = priceMove([pt('2026-10-01T12:00:00Z', 0, 1), pt('2026-10-03T12:00:00Z', 0.47, 0.49), pt('2026-10-06T12:00:00Z', 0.5, 0.52), pt('2026-10-11T12:00:00Z', 0.54, 0.56)])!;
    expect(mv.open).toBeCloseTo(0.48);
    expect(mv.now).toBeCloseTo(0.55);
    expect(mv.words).toBe('Opened 48¢ Oct 3 · now 55¢ · up 7¢ in 8 days');
    expect(mv.hi).toBeCloseTo(0.55);
  });
  it('extends to a newer live quote only when it is newer than the last capture', () => {
    const h = [pt('2026-10-03T12:00:00Z', 0.47, 0.49), pt('2026-10-04T12:00:00Z', 0.5, 0.52)];
    expect(priceMove(h, { v: 0.6, at: '2026-10-05T12:00:00Z' })!.now).toBeCloseTo(0.6);
    expect(priceMove(h, { v: 0.6, at: '2026-10-04T00:00:00Z' })!.now).toBeCloseTo(0.51);
    expect(priceMove([h[0]])).toBeNull();
  });
  it('draws a path inside its box', () => {
    const p = sparkPath([{ t: 0, v: 0.4 }, { t: 1, v: 0.6 }], 140, 40);
    expect(p.line.startsWith('M')).toBe(true);
    expect(p.first[1]).toBeGreaterThan(p.last[1]);
  });
});
