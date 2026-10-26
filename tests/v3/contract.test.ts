// The exact-contract sheet's arithmetic: Over price, implied, fee and break-even all derive from the ask, with the one fee schedule
// in model/format.ts; a quote with no ask has no facts (the sheet then says "Price unavailable right now" and hides fee and break-even).
import { describe, expect, it } from 'vitest';
import { contractFacts, newerPrice, priceOfQuote } from '../../src/v3/model/contract';
import { breakEvenPct, takerFeeCents } from '../../src/v3/model/format';
import type { Price } from '../../src/v3/model/types';

const price = (ask: number | null, observedAt: string | null = '2026-10-26T19:00:00Z', bid: number | null = 50): Price => ({ ask, bid, implied: ask, ticker: 'KXNFLREC-26OCT26DALPHI-DALCLAMB88-7', side: 'YES', description: 'Lamb 7+', observedAt, source: 'Kalshi' });

describe('contract facts', () => {
  it('everything derives from the ask through the one fee schedule', () => {
    const f = contractFacts(price(56))!;
    expect(f).toMatchObject({ ask: 56, implied: 56, fee: takerFeeCents(56), breakEven: breakEvenPct(56), bid: 50 });
    expect(f.breakEven).toBeGreaterThanOrEqual(56);
  });
  it('no ask, no facts: nothing is estimated', () => {
    expect(contractFacts(price(null))).toBeNull();
    expect(contractFacts(null)).toBeNull();
    expect(contractFacts(undefined)).toBeNull();
  });
  it('a live quote (dollars) becomes a price in cents, and one with no executable ask becomes none', () => {
    const q = { ticker: 'T', yesAsk: 0.56, yesBid: 0.54, observedAt: '2026-10-26T19:00:00Z', title: 'x', volume: 10 } as never;
    expect(priceOfQuote(q)).toMatchObject({ ask: 56, bid: 54, ticker: 'T', side: 'YES' });
    expect(priceOfQuote({ ...(q as object), yesAsk: null } as never)).toBeNull();
    expect(priceOfQuote(undefined)).toBeNull();
  });
  it('the newer observation wins and an observation is never replaced by an older one', () => {
    const a = price(56, '2026-10-26T19:00:00Z'), b = price(58, '2026-10-26T19:01:00Z');
    expect(newerPrice(a, b)).toBe(b);
    expect(newerPrice(b, a)).toBe(b);
    expect(newerPrice(a, null)).toBe(a);
    expect(newerPrice(null, b)).toBe(b);
    expect(newerPrice(a, price(60, null))).toBe(a);
  });
});
