import { describe, expect, it } from 'vitest';
import { explainGate, gate, type QuoteContext } from '../../src/v3/data/quoteGate';
import type { Price } from '../../src/v3/model/types';

const NOW = Date.parse('2026-11-02T15:00:00Z');
const ctx: QuoteContext = { kind: 'list', startMs: NOW + 10 * 3600_000, live: false };
const price = (o: Partial<Price> = {}): Price => ({ ask: 52, bid: 50, implied: 52, ticker: 'T-1', side: 'YES', description: 'x', observedAt: '2026-11-02T14:59:30Z', source: 'Kalshi', tradable: true, marketStatus: 'open', ...o } as Price);
const clock = (ms: number) => new Date(ms).toISOString().slice(11, 16);

describe('explainGate: a withheld price always says why', () => {
  it('says nothing when the price is shown', () => {
    expect(explainGate(gate(price(), ctx, NOW), ctx, NOW, clock)).toBeNull();
  });
  it('too old: names the last observation, its age and the limit, and allows Retry', () => {
    const w = explainGate(gate(price({ observedAt: '2026-11-02T01:53:14Z' }), ctx, NOW), ctx, NOW, clock)!;
    expect(w.short).toBe('Price 13 h old');
    expect(w.detail).toContain('01:53');
    expect(w.detail).toContain('under 3 min');
    expect(w.observedAt).toBe('2026-11-02T01:53:14Z');
    expect(w.retry).toBe(true);
  });
  it('no ask: says the market lists none', () => {
    const w = explainGate(gate(price({ ask: null }), ctx, NOW), ctx, NOW, clock)!;
    expect(w.short).toBe('No ask listed');
  });
  it('closed market: names the state and offers no Retry', () => {
    const w = explainGate(gate(price({ tradable: false, marketStatus: 'closed' }), ctx, NOW), ctx, NOW, clock)!;
    expect(w.short).toBe('Market closed');
    expect(w.retry).toBe(false);
  });
  it('suspended market can clear, so Retry stays', () => {
    expect(explainGate(gate(price({ tradable: false, marketStatus: 'suspended' }), ctx, NOW), ctx, NOW, clock)!.retry).toBe(true);
  });
  it('an observation the provider did not time is not current, and says so', () => {
    const w = explainGate(gate(price({ observedVia: 'received' }), ctx, NOW), ctx, NOW, clock)!;
    expect(w.short).toBe('Price not timed');
  });
  it('never changes the rule: the explanation of a refusal does not make the price displayable', () => {
    expect(gate(price({ observedAt: '2026-11-02T01:53:14Z' }), ctx, NOW).price).toBeNull();
  });
});
