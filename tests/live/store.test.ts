// The shared live-quote store: cadence, de-duplication, batching, visibility, offline, backoff,
// last-known-good and honest aging — all on a fake clock, no network.
import { afterEach, describe, expect, it } from 'vitest';
import { quoteFreshness } from '../../src/live/freshness';
import { CADENCE_MS, QuoteStore, type Persistence } from '../../src/live/store';
import { ProviderError, type LiveQuote } from '../../src/live/types';
import { FakeClock, FakeEnv, FakeProvider, flush, quote } from './fakes';

const A = 'KXNFLGAME-26OCT04NEBUF-BUF';
const B = 'KXNFLGAME-26OCT04NEBUF-NE';
const C = 'KXNFLSPREAD-26OCT04NEBUF-BUF3';

let store: QuoteStore | null = null;
function setup(opts: { persistence?: Persistence | null } = {}) {
  const clock = new FakeClock();
  const env = new FakeEnv();
  const provider = new FakeProvider(clock);
  provider.prices.set(A, 0.46).set(B, 0.52).set(C, 0.6);
  store = new QuoteStore({ provider, now: clock.now, timers: clock, env, persistence: opts.persistence ?? null, random: () => 0.5 });
  return { clock, env, provider, store };
}
afterEach(() => store?.dispose());

describe('cadence and sharing', () => {
  it('fetches a new scope immediately, then on its cadence', async () => {
    const { clock, provider, store } = setup();
    store.addScope({ tickers: [A], cadence: 'detail' });
    await clock.advance(0);
    expect(provider.tickerCalls()).toHaveLength(1);
    expect(store.quote(A)?.yesBid).toBe(0.46);
    await clock.advance(CADENCE_MS.detail - 1);
    expect(provider.tickerCalls()).toHaveLength(1);
    await clock.advance(1);
    expect(provider.tickerCalls()).toHaveLength(2);
  });

  it('five components showing the same tickers share one request', async () => {
    const { clock, provider, store } = setup();
    for (let i = 0; i < 5; i++) store.addScope({ tickers: [A, B], cadence: 'game' });
    await clock.advance(0);
    expect(provider.tickerCalls()).toHaveLength(1);
    expect(provider.tickerCalls()[0].ids.sort()).toEqual([A, B].sort());
  });

  it('a ticker refreshes at the fastest cadence any scope asks for', async () => {
    const { clock, provider, store } = setup();
    store.addScope({ tickers: [A, B], cadence: 'slate' });
    store.addScope({ tickers: [A], cadence: 'detail' });
    await clock.advance(0);
    await clock.advance(CADENCE_MS.detail);
    const second = provider.tickerCalls()[1];
    expect(second.ids).toEqual([A]);
  });

  it('batches by the provider limit', async () => {
    const { clock, provider, store } = setup();
    provider.maxBatch = 100;
    const many = Array.from({ length: 250 }, (_, i) => `KXNFLREC-26OCT04NEBUF-P${i}`);
    many.forEach((t) => provider.prices.set(t, 0.5));
    store.addScope({ tickers: many, cadence: 'game' });
    await clock.advance(0);
    expect(provider.tickerCalls().map((c) => c.ids.length)).toEqual([100, 100, 50]);
  });

  it('never runs two overlapping polls for the same ticker', async () => {
    const { clock, provider, store } = setup();
    provider.delayMs = 5_000; // a slow answer
    store.addScope({ tickers: [A], cadence: 'detail' });
    await clock.advance(1_000);
    store.addScope({ tickers: [A, B], cadence: 'detail' }); // a second screen mounts mid-request
    await clock.advance(1_000);
    expect(provider.tickerCalls().map((c) => c.ids)).toEqual([[A], [B]]);
    await clock.advance(4_000);
    expect(store.quote(A)?.yesBid).toBe(0.46);
    expect(provider.tickerCalls()).toHaveLength(2);
  });

  it('a request that never answers times out and backs off', async () => {
    const { clock, provider, store } = setup();
    provider.delayMs = 10 * 60_000;
    store.addScope({ tickers: [A], cadence: 'detail' });
    await clock.advance(8_000);
    expect(store.diagnostics().lastError).toMatch(/timeout/);
    expect(store.diagnostics().backoffReason).toBe('timeout');
  });

  it('stops polling when the last scope is released', async () => {
    const { clock, provider, store } = setup();
    const release = store.addScope({ tickers: [A], cadence: 'detail' });
    await clock.advance(0);
    release();
    await clock.advance(10 * CADENCE_MS.detail);
    expect(provider.tickerCalls()).toHaveLength(1);
  });

  it('respects a provider that cannot change faster than its minimum interval', async () => {
    const { clock, provider, store } = setup();
    provider.minIntervalMs = 60_000;
    store.addScope({ tickers: [A], cadence: 'detail' });
    await clock.advance(0);
    await clock.advance(59_000);
    expect(provider.tickerCalls()).toHaveLength(1);
    await clock.advance(1_000);
    expect(provider.tickerCalls()).toHaveLength(2);
  });
});

describe('quotes move without a redeploy', () => {
  it('46¢ then 51¢: the store follows the provider', async () => {
    const { clock, provider, store } = setup();
    store.addScope({ tickers: [A], cadence: 'game' });
    await clock.advance(0);
    expect(store.quote(A)?.yesBid).toBe(0.46);
    provider.prices.set(A, 0.51);
    await clock.advance(CADENCE_MS.game);
    expect(store.quote(A)?.yesBid).toBe(0.51);
  });

  it('a released and re-added scope (navigate away and back) never resurrects the old price', async () => {
    const { clock, provider, store } = setup();
    let release = store.addScope({ tickers: [A], cadence: 'game' });
    await clock.advance(0);
    provider.prices.set(A, 0.51);
    await clock.advance(CADENCE_MS.game);
    release();
    provider.prices.set(A, 0.53);
    await clock.advance(5 * 60_000); // several minutes on another screen
    expect(store.quote(A)?.yesBid).toBe(0.51); // last-known, not 46
    release = store.addScope({ tickers: [A], cadence: 'game' });
    await clock.advance(0); // overdue -> refreshed immediately on return
    expect(store.quote(A)?.yesBid).toBe(0.53);
    release();
  });

  it('an older observation never overwrites a newer quote', async () => {
    const { clock, store } = setup();
    store.addScope({ tickers: [A], cadence: 'game' });
    await clock.advance(0);
    const newer = store.quote(A)!;
    (store as unknown as { accept(q: LiveQuote): void }).accept(quote(A, 0.1, clock.now() - 60_000));
    expect(store.quote(A)).toEqual(newer);
  });

  it('tracks availability (status) separately from the price', async () => {
    const { clock, provider, store } = setup();
    store.addScope({ tickers: [A], cadence: 'game' });
    await clock.advance(0);
    provider.status.set(A, 'SUSPENDED');
    await clock.advance(CADENCE_MS.game);
    expect(store.quote(A)?.availability).toBe('SUSPENDED');
    expect(quoteFreshness(store.quote(A)!.observedAt, clock.now())).toBe('FRESH');
  });
});

describe('visibility and connectivity', () => {
  it('pauses while hidden and refreshes immediately on return', async () => {
    const { clock, env, provider, store } = setup();
    store.addScope({ tickers: [A], cadence: 'detail' });
    await clock.advance(0);
    env.set({ visible: false });
    await clock.advance(10 * 60_000);
    expect(provider.tickerCalls()).toHaveLength(1);
    provider.prices.set(A, 0.51);
    env.set({ visible: true });
    await clock.advance(0);
    expect(provider.tickerCalls()).toHaveLength(2);
    expect(store.quote(A)?.yesBid).toBe(0.51);
  });

  it('pauses offline and refreshes when the connection returns', async () => {
    const { clock, env, provider, store } = setup();
    store.addScope({ tickers: [A], cadence: 'game' });
    await clock.advance(0);
    env.set({ online: false });
    await clock.advance(5 * 60_000);
    expect(provider.tickerCalls()).toHaveLength(1);
    env.set({ online: true });
    await clock.advance(0);
    expect(provider.tickerCalls()).toHaveLength(2);
  });
});

describe('failure keeps the last-known-good quote and ages it honestly', () => {
  it('51¢ survives a provider outage, with its real timestamp, and turns STALE after 30:00', async () => {
    const { clock, provider, store } = setup();
    provider.prices.set(A, 0.51);
    store.addScope({ tickers: [A], cadence: 'game' });
    await clock.advance(0);
    const observed = store.quote(A)!.observedAt;
    provider.failWith = new ProviderError('http', 'HTTP 503', 503);
    await clock.advance(34 * 60_000);
    const q = store.quote(A)!;
    expect(q.yesBid).toBe(0.51);
    expect(q.observedAt).toBe(observed);
    expect(quoteFreshness(q.observedAt, clock.now())).toBe('STALE');
    expect(store.ticker(A)?.lastError).toBe('HTTP 503');
  });

  it('backs off exponentially instead of storming a failing provider', async () => {
    const { clock, provider, store } = setup();
    provider.failWith = new ProviderError('network', 'down');
    store.addScope({ tickers: [A], cadence: 'detail' });
    await clock.advance(10 * 60_000);
    // 10 minutes at a 20 s cadence would be 30 calls; backoff (4 s, 8 s, 16 s ... capped at 5 min) keeps it small.
    const n = provider.tickerCalls().length;
    expect(n).toBeGreaterThan(2);
    expect(n).toBeLessThanOrEqual(9);
    expect(store.diagnostics().consecutiveFailures).toBe(n);
    provider.failWith = null;
    await clock.advance(5 * 60_000);
    expect(store.diagnostics().consecutiveFailures).toBe(0);
    expect(store.quote(A)).toBeDefined();
  });

  it('honours Retry-After on HTTP 429 and refuses a forced refresh while rate limited', async () => {
    const { clock, provider, store } = setup();
    provider.failWith = new ProviderError('rate_limited', '429', 429, 120_000);
    store.addScope({ tickers: [A], cadence: 'detail' });
    await clock.advance(0);
    await clock.advance(119_000);
    expect(provider.tickerCalls()).toHaveLength(1);
    const r = await store.refreshNow([A]);
    expect(r.failed).toEqual([A]);
    expect(r.error).toMatch(/rate limiting/);
    expect(provider.tickerCalls()).toHaveLength(1);
  });

  it('a delisted ticker is reported missing, not failed', async () => {
    const { clock, store } = setup();
    const gone = 'KXNFLSPREAD-26OCT04NEBUF-BUF99';
    store.addScope({ tickers: [gone], cadence: 'game' });
    await clock.advance(0);
    expect(store.ticker(gone)?.missing).toBe(true);
    expect(store.quote(gone)).toBeUndefined();
  });
});

describe('inventory', () => {
  it('learns newly listed contracts under an event and refreshes their tickers in the same request', async () => {
    const { clock, provider, store } = setup();
    const ev = 'KXNFLSPREAD-26OCT04NEBUF';
    const fresh = 'KXNFLSPREAD-26OCT04NEBUF-BUF6';
    provider.prices.set(fresh, 0.41);
    provider.events.set(ev, [C, fresh]);
    store.addScope({ tickers: [C], events: [ev], cadence: 'game' });
    await clock.advance(0);
    expect(store.eventQuotes([ev]).map((q) => q.ticker).sort()).toEqual([C, fresh].sort());
    // C came back in the event listing, so no separate ticker request was needed.
    expect(provider.tickerCalls()).toHaveLength(0);
  });
});

describe('bounded refreshNow (packet preflight)', () => {
  it('resolves by its deadline even if the provider never answers', async () => {
    const { clock, provider, store } = setup();
    provider.delayMs = 10 * 60_000;
    let done = false;
    const p = store.refreshNow([A, B], { timeoutMs: 5_000 }).then((r) => {
      done = true;
      return r;
    });
    await clock.advance(4_999);
    expect(done).toBe(false);
    await clock.advance(1);
    const r = await p;
    expect(r.timedOut).toBe(true);
    expect(r.failed.sort()).toEqual([A, B].sort());
  });

  it('is unavailable without a provider and says so', async () => {
    const clock = new FakeClock();
    const s = new QuoteStore({ provider: null, now: clock.now, timers: clock, env: new FakeEnv() });
    const r = await s.refreshNow([A]);
    expect(r.error).toMatch(/no live quote provider/);
    expect(r.failed).toEqual([A]);
    await flush();
  });
});

describe('persistence', () => {
  it('previously seen quotes come back after a reload with their original timestamp', async () => {
    let saved: LiveQuote[] = [];
    const persistence: Persistence = { load: () => saved, save: (q) => (saved = q) };
    const { clock, store } = setup({ persistence });
    store.addScope({ tickers: [A], cadence: 'game' });
    await clock.advance(2_000);
    expect(saved.map((q) => q.ticker)).toEqual([A]);
    const reloaded = new QuoteStore({ provider: null, now: clock.now, timers: clock, env: new FakeEnv(), persistence });
    expect(reloaded.quote(A)?.observedAt).toBe(saved[0].observedAt);
    expect(reloaded.quote(A)?.yesBid).toBe(0.46);
  });
});

describe('source mode: LIVE when the relay answers, FEED when the fallback does', () => {
  it('reports the answering provider, the mode and the relay failure behind a feed answer', async () => {
    const { FallbackProvider } = await import('../../src/live/providers/fallback');
    const { liveMode } = await import('../../src/components/LiveQuote');
    const clock = new FakeClock();
    const relay = new FakeProvider(clock);
    relay.prices.set(A, 0.51);
    const feed = new FakeProvider(clock);
    feed.prices.set(A, 0.5);
    Object.defineProperty(relay, 'id', { value: 'kalshi-relay' });
    Object.defineProperty(feed, 'id', { value: 'quote-feed' });
    store = new QuoteStore({ provider: new FallbackProvider([relay, feed]), now: clock.now, timers: clock, env: new FakeEnv(), persistence: null, random: () => 0.5 });
    store.addScope({ tickers: [A], cadence: 'detail' });
    await clock.advance(0);
    let d = store.diagnostics();
    expect([d.answeredBy, liveMode(d, clock.now()), d.fallback]).toEqual(['kalshi-relay', 'LIVE', null]);

    relay.failWith = new ProviderError('rate_limited', 'rate limited (HTTP 429)', 429, 7000);
    await clock.advance(CADENCE_MS.detail);
    d = store.diagnostics();
    expect([d.answeredBy, liveMode(d, clock.now())]).toEqual(['quote-feed', 'FEED']);
    expect(d.fallback).toMatchObject({ provider: 'kalshi-relay', status: 429 });
    expect(store.quote(A)?.yesBid).toBe(0.5);

    relay.failWith = null;
    await clock.advance(CADENCE_MS.detail);
    d = store.diagnostics();
    expect([d.answeredBy, liveMode(d, clock.now()), d.fallback]).toEqual(['kalshi-relay', 'LIVE', null]);
  });
});

describe('inventory feed-first, quotes relay-first (production routing)', () => {
  async function setupChain() {
    const { FallbackProvider } = await import('../../src/live/providers/fallback');
    const { liveMode } = await import('../../src/components/LiveQuote');
    const clock = new FakeClock();
    const relay = new FakeProvider(clock);
    const feed = new FakeProvider(clock);
    Object.defineProperty(relay, 'id', { value: 'kalshi-relay' });
    Object.defineProperty(feed, 'id', { value: 'quote-feed' });
    const E = 'KXNFLGAME-26OCT04NEBUF';
    for (const p of [relay, feed]) p.events.set(E, [A, B]);
    relay.prices.set(A, 0.51).set(B, 0.49);
    feed.prices.set(A, 0.46).set(B, 0.52);
    // The feed publishes every 3 minutes: its observations are minutes old, the relay's are current.
    const feedEvents = feed.fetchEventMarkets.bind(feed);
    feed.fetchEventMarkets = async (ev, s) => {
      const r = await feedEvents(ev, s);
      return { ...r, quotes: r.quotes.map((q) => ({ ...q, observedAt: new Date(clock.now() - 4 * 60_000).toISOString() })) };
    };
    store = new QuoteStore({ provider: new FallbackProvider([relay, feed], { inventoryOrder: [feed, relay] }), now: clock.now, timers: clock, env: new FakeEnv(), persistence: null, random: () => 0.5 });
    store.addScope({ tickers: [A, B], events: [E], cadence: 'game' });
    return { clock, relay, feed, store, liveMode, E };
  }

  it('a feed inventory sweep never stands in for the relay quote batch: prices come from the relay, LIVE', async () => {
    const { clock, relay, feed, store, liveMode } = await setupChain();
    await clock.advance(0);
    expect(feed.calls.map((c) => c.kind)).toEqual(['events']);
    expect(relay.calls.map((c) => c.kind)).toEqual(['tickers']); // asked for quotes, never for the 57-series sweep
    expect(store.quote(A)?.yesBid).toBe(0.51);
    expect(store.quote(A)?.observedAt).toBe(new Date(clock.now()).toISOString());
    const d = store.diagnostics();
    expect([d.answeredBy, d.inventoryAnsweredBy, liveMode(d, clock.now()), d.fallback, d.inventoryFallback]).toEqual(['kalshi-relay', 'quote-feed', 'LIVE', null, null]);
  });

  it('relay down: quotes come from the feed with their real age, FEED, and the 429 is named; inventory unaffected', async () => {
    const { clock, relay, store, liveMode } = await setupChain();
    relay.failWith = new ProviderError('rate_limited', 'rate limited (HTTP 429)', 429, 7000);
    await clock.advance(0);
    const d = store.diagnostics();
    expect([d.answeredBy, d.inventoryAnsweredBy, liveMode(d, clock.now())]).toEqual(['quote-feed', 'quote-feed', 'FEED']);
    expect(d.fallback).toMatchObject({ provider: 'kalshi-relay', status: 429 });
    expect(d.inventoryFallback).toBeNull();
    expect(store.quote(A)?.yesBid).toBe(0.46);
  });

  it('feed down: inventory falls back to the relay, whose listing covers the quotes (LIVE); the feed failure is named', async () => {
    const { clock, relay, feed, store, liveMode } = await setupChain();
    feed.failWith = new ProviderError('network', 'network error: offline');
    await clock.advance(0);
    expect(relay.calls.map((c) => c.kind)).toEqual(['events']); // the relay listing refreshed A and B: no extra batch
    const d = store.diagnostics();
    expect([d.answeredBy, d.inventoryAnsweredBy]).toEqual(['kalshi-relay', 'kalshi-relay']);
    expect(d.inventoryFallback).toMatchObject({ provider: 'quote-feed', error: 'network: network error: offline' });
    expect(d.fallback).toBeNull();
    expect(liveMode(d, clock.now())).toBe('LIVE'); // the relay's listing is a real quote refresh
    expect(store.quote(A)?.yesBid).toBe(0.51);
  });
});

describe('an inventory answer alone makes no claim about quotes', () => {
  it('stays CONNECTING until a quote source has answered', async () => {
    const { FallbackProvider } = await import('../../src/live/providers/fallback');
    const { liveMode } = await import('../../src/components/LiveQuote');
    const clock = new FakeClock();
    const relay = new FakeProvider(clock);
    const feed = new FakeProvider(clock);
    Object.defineProperty(relay, 'id', { value: 'kalshi-relay' });
    Object.defineProperty(feed, 'id', { value: 'quote-feed' });
    feed.events.set('KXNFLGAME-26OCT04NEBUF', []);
    store = new QuoteStore({ provider: new FallbackProvider([relay, feed], { inventoryOrder: [feed, relay] }), now: clock.now, timers: clock, env: new FakeEnv(), persistence: null, random: () => 0.5 });
    store.addScope({ tickers: [], events: ['KXNFLGAME-26OCT04NEBUF'], cadence: 'game' });
    await clock.advance(0);
    const d = store.diagnostics();
    expect([d.inventoryAnsweredBy, d.answeredBy, liveMode(d, clock.now())]).toEqual(['quote-feed', null, 'CONNECTING']);
  });
});
