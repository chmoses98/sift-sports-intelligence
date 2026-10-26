// Verification (not a change) that an older observation never replaces a newer one: in the store and in
// the research overlay. The quote track must not regress this.
import { afterEach, describe, expect, it } from 'vitest';
import { liveWins, quoteView } from '../../src/live/overlay';
import { FallbackProvider } from '../../src/live/providers/fallback';
import { QuoteStore } from '../../src/live/store';
import { ProviderError } from '../../src/live/types';
import { FAR, T as TICKER, rig } from './support/delivery';
import { FakeClock, FakeEnv, FakeProvider, quote } from './fakes';

const T = 'KXNHLGOAL-26OCT26TORCGY-TOR19';
let store: QuoteStore | null = null;
afterEach(() => store?.dispose());

describe('an older observation never replaces a newer one', () => {
  it('the store keeps the newer relay quote when a later answer carries an older observation', async () => {
    const clock = new FakeClock();
    const relay = new FakeProvider(clock);
    const feed = new FakeProvider(clock);
    Object.defineProperty(relay, 'id', { value: 'kalshi-relay' });
    Object.defineProperty(feed, 'id', { value: 'quote-feed' });
    relay.prices.set(T, 0.41);
    feed.prices.set(T, 0.39);
    const old = feed.fetchQuotes.bind(feed);
    feed.fetchQuotes = async (t, s) => {
      const r = await old(t, s);
      return { ...r, quotes: r.quotes.map((q) => ({ ...q, observedAt: new Date(clock.now() - 3 * 60_000).toISOString() })) };
    };
    store = new QuoteStore({ provider: new FallbackProvider([relay, feed]), now: clock.now, timers: clock, env: new FakeEnv(), persistence: null });
    await store.refreshNow([T]);
    const newer = store.quote(T)!;
    expect(newer.yesBid).toBe(0.41);
    relay.failWith = new ProviderError('http', 'HTTP 503', 503); // the next refresh is answered by the 3-minute-old feed
    await clock.advance(5_000);
    await store.refreshNow([T]);
    expect(store.diagnostics().answeredBy).toBe('quote-feed');
    expect(store.quote(T)).toEqual(newer);
  });

  it('the same holds on the delivery chain: a later, older feed answer never replaces the newer relay quote', async () => {
    const r = rig();
    store = r.store;
    r.feed.staleBy = 3 * 60_000;
    const first = await r.store.refreshContract(TICKER, FAR);
    const newer = r.store.quote(TICKER)!;
    expect(first.quote?.source).toBe('kalshi-relay');
    r.relay.failWith = new ProviderError('http', 'HTTP 503', 503);
    await r.clock.advance(5_000);
    await r.store.refreshContract(TICKER, FAR);
    expect(r.store.diagnostics().answeredBy).toBe('quote-feed');
    expect(r.store.quote(TICKER)).toEqual(newer); // held with its own, newer observation time
  });

  it('a publication capture newer than the live quote wins in the overlay; an equal one does not', () => {
    const q = quote(T, 0.5, Date.parse('2026-10-26T18:00:30Z'));
    expect(liveWins({ captured_at: '2026-10-26T18:00:31Z' }, q)).toBe(false);
    expect(liveWins({ captured_at: '2026-10-26T18:00:30Z' }, q)).toBe(true);
    expect(quoteView({ kalshi_ticker: T, yes_bid: 0.1, yes_ask: 0.2, captured_at: '2026-10-26T18:00:31Z' }, q)).toMatchObject({ yesBid: 0.1, live: false });
  });
});
