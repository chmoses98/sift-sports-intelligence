// Store-level support for the quote-delivery track: scopes for visible rows / the selected contract /
// list-wide feed data, pause and resume, the contract-open forced refresh (relay first, feed second, 8 s
// bound) and every failure row (relay success, relay 429 + Retry-After, relay timeout, 200 with old data,
// both failing), plus the refresh-outcome history and the availability meter. Fake clock, no network.
import { afterEach, describe, expect, it } from 'vitest';
import { DeliveryProvider } from '../../src/live/providers/deliveryChain';
import { KalshiApiProvider } from '../../src/live/providers/kalshi';
import { MAX_AGE_MS, type QuoteContext } from '../../src/live/quoteUsable';
import { CADENCE_MS, HISTORY_LIMIT, MAX_ROW_TICKERS, PRIMARY_TIMEOUT_MS, QuoteStore } from '../../src/live/store';
import { ProviderError } from '../../src/live/types';
import { FakeClock, FakeEnv } from './fakes';
import { EVENT, FAR, HOUR, NEAR, T, U, rig } from './support/delivery';

let store: QuoteStore | null = null;
afterEach(() => store?.dispose());

function setup() {
  const r = rig();
  store = r.store;
  return r;
}

const farList: QuoteContext = { surface: 'list', ...FAR };
const farContract: QuoteContext = { surface: 'contract', ...FAR };

describe('scope registration', () => {
  it('visible rows: game cadence (45 s) through the relay, one batch of <= 100 tickers', async () => {
    const { clock, relay, feed, store } = setup();
    const rows = Array.from({ length: 30 }, (_, i) => `KXNHLGOAL-26OCT26TORCGY-P${i}`);
    rows.forEach((t) => relay.prices.set(t, 0.3));
    store.addRowsScope(rows, FAR);
    await clock.advance(0);
    expect(relay.tickerCalls().map((c) => c.ids.length)).toEqual([30]);
    expect(feed.calls).toHaveLength(0);
    await clock.advance(CADENCE_MS.game - 1);
    expect(relay.tickerCalls()).toHaveLength(1);
    await clock.advance(1);
    expect(relay.tickerCalls()).toHaveLength(2);
    expect(CADENCE_MS.game).toBe(45_000);
  });

  it('visible rows are capped (the 900-contract universe is never polled) and batched at <= 100', async () => {
    const { clock, relay, store } = setup();
    const many = Array.from({ length: 900 }, (_, i) => `KXNHLGOAL-26OCT26TORCGY-X${i}`);
    many.forEach((t) => relay.prices.set(t, 0.3));
    store.addRowsScope(many, FAR);
    await clock.advance(0);
    expect(MAX_ROW_TICKERS).toBe(200);
    expect(relay.tickerCalls().map((c) => c.ids.length)).toEqual([100, 100]);
    expect(store.diagnostics().trackedTickers).toBe(200);
  });

  it('the selected contract refreshes at detail cadence (20 s), faster than the rows around it', async () => {
    const { clock, relay, store } = setup();
    store.addRowsScope([T, U], FAR);
    store.addContractScope(T, FAR);
    await clock.advance(0);
    expect(relay.tickerCalls()).toHaveLength(1);
    await clock.advance(CADENCE_MS.detail);
    const calls = relay.tickerCalls();
    expect(calls).toHaveLength(2);
    expect(calls[1].ids).toEqual([T]); // only the contract is due at 20 s
    await clock.advance(25_000); // 45 s: the rows' turn (the contract was refreshed at 40 s)
    expect(relay.tickerCalls().slice(2).flatMap((c) => c.ids)).toContain(U);
  });

  it('call volume: ~30 visible rows + one open contract = about 80 + 180 relay requests an hour', async () => {
    const { clock, relay, store } = setup();
    const rows = Array.from({ length: 30 }, (_, i) => `KXNHLGOAL-26OCT26TORCGY-P${i}`);
    rows.forEach((t) => relay.prices.set(t, 0.3));
    store.addRowsScope(rows, FAR);
    await clock.advance(0);
    const rowsOnly = () => relay.tickerCalls().length;
    await clock.advance(60 * 60_000);
    expect(rowsOnly()).toBeGreaterThanOrEqual(79);
    expect(rowsOnly()).toBeLessThanOrEqual(81); // 3600 / 45 = 80 (+1 for the first at t=0)
    store.addContractScope(T, FAR);
    const before = rowsOnly();
    await clock.advance(60_000);
    // the contract adds 3 a minute while open (the rows keep their 45 s turn on top)
    expect(rowsOnly() - before).toBeGreaterThanOrEqual(3);
    expect(rowsOnly() - before).toBeLessThanOrEqual(5);
  });

  it('list-wide background data is the production chain\'s inventory: asked of the feed first, at slate cadence (90 s)', async () => {
    const { clock, relay, feed, prod, store } = setup();
    store.addSlateScope([EVENT]);
    await clock.advance(0);
    expect(prod.feed.calls.map((c) => c.kind)).toEqual(['events']);
    expect(prod.relay.calls).toHaveLength(0);
    expect(relay.calls).toHaveLength(0); // the delivery chain never serves inventory
    expect(feed.calls).toHaveLength(0);
    await clock.advance(CADENCE_MS.slate);
    expect(prod.feed.calls).toHaveLength(2);
  });

  it('a released scope stops being requested', async () => {
    const { clock, relay, store } = setup();
    const release = store.addRowsScope([T], FAR);
    await clock.advance(0);
    release();
    await clock.advance(10 * 60_000);
    expect(relay.tickerCalls()).toHaveLength(1);
  });
});

describe('pause when hidden, resume on visible / focus / online', () => {
  it('sends nothing while hidden and refreshes the scope immediately on return', async () => {
    const { clock, env, relay, store } = setup();
    store.addRowsScope([T], FAR);
    store.addContractScope(T, FAR);
    await clock.advance(0);
    const n = relay.tickerCalls().length;
    env.set({ visible: false });
    await clock.advance(30 * 60_000);
    expect(relay.tickerCalls()).toHaveLength(n);
    // While hidden nothing can refresh, so the price ages out of the usability window and is withheld, not shown.
    expect(store.renderQuote(T, farContract)).toBeNull();
    env.set({ visible: true });
    await clock.advance(0);
    expect(relay.tickerCalls().length).toBeGreaterThan(n);
    expect(store.renderQuote(T, farContract)?.yesBid).toBe(0.41);
  });

  it('refreshes immediately when the connection returns', async () => {
    const { clock, env, relay, store } = setup();
    store.addRowsScope([T], FAR);
    await clock.advance(0);
    env.set({ online: false });
    await clock.advance(10 * 60_000);
    expect(relay.tickerCalls()).toHaveLength(1);
    env.set({ online: true });
    await clock.advance(0);
    expect(relay.tickerCalls()).toHaveLength(2);
  });
});

describe('opening an exact contract: refreshContract, relay first then feed, inside the 8 s bound', () => {
  it('relay success: the freshest price, no feed request, outcome recorded', async () => {
    const { clock, relay, feed, store } = setup();
    const r = await store.refreshContract(T, FAR);
    expect(r.usability).toMatchObject({ usable: true, context: 'contract_far' });
    expect(r.quote).toMatchObject({ ticker: T, yesBid: 0.41, source: 'kalshi-relay' });
    expect(relay.tickerCalls().map((c) => c.ids)).toEqual([[T]]);
    expect(feed.calls).toHaveLength(0);
    expect(store.refreshHistory().at(-1)).toMatchObject({ kind: 'tickers', provider: 'kalshi-relay', fallbackReason: null, outcome: 'ok', observationAgeMs: 0, tickers: 1 });
    void clock;
  });

  it('relay 429: honours Retry-After (not asked again until it elapses), falls back to the feed', async () => {
    const { clock, relay, feed, store } = setup();
    feed.staleBy = 5_000; // a fresh feed publication
    relay.failWith = new ProviderError('rate_limited', 'rate limited (HTTP 429)', 429, 60_000);
    const r = await store.refreshContract(T, FAR);
    expect(r.quote).toMatchObject({ yesBid: 0.41, source: 'quote-feed' });
    expect(r.usability.usable).toBe(true);
    expect(store.refreshHistory().at(-1)).toMatchObject({ provider: 'quote-feed', outcome: 'ok' });
    expect(store.refreshHistory().at(-1)!.fallbackReason).toMatch(/rate_limited: rate limited \(HTTP 429\)/);
    expect(store.diagnostics().fallback).toMatchObject({ provider: 'kalshi-relay', status: 429 });
    expect(relay.tickerCalls()).toHaveLength(1);

    // Within the Retry-After window the relay is skipped, not hammered.
    await clock.advance(30_000);
    await store.refreshContract(T, FAR);
    expect(relay.tickerCalls()).toHaveLength(1);
    expect(feed.tickerCalls()).toHaveLength(2);

    // After it, the relay is asked again.
    relay.failWith = null;
    await clock.advance(31_000);
    const again = await store.refreshContract(T, FAR);
    expect(relay.tickerCalls()).toHaveLength(2);
    expect(again.quote?.source).toBe('kalshi-relay');
  });

  it('relay 429 and the feed is older than the limit: no usable price (missing-price state), Retry works later', async () => {
    const { clock, relay, store } = setup();
    relay.failWith = new ProviderError('rate_limited', 'rate limited (HTTP 429)', 429, 20_000);
    const r = await store.refreshContract(T, FAR); // feed is 3 min old, contract_far allows 60 s
    expect(r.result.refreshed).toEqual([T]); // the feed did answer...
    expect(r.usability).toMatchObject({ usable: false, reason: 'too_old', limitMs: MAX_AGE_MS.contract_far });
    expect(r.quote).toBeNull(); // ...but nothing is displayed
    expect(store.refreshHistory().at(-1)).toMatchObject({ provider: 'quote-feed', outcome: 'over_limit' });
    relay.failWith = null;
    await clock.advance(21_000);
    const retry = await store.refreshContract(T, FAR);
    expect(retry.quote?.source).toBe('kalshi-relay');
  });

  it('relay timeout: abandoned after 4 s so the feed still answers inside the 8 s bound', async () => {
    const { clock, relay, feed, store } = setup();
    feed.staleBy = 2_000;
    relay.delayMs = 60_000; // never answers in time
    const t0 = clock.now();
    const p = store.refreshContract(T, FAR);
    await clock.advance(PRIMARY_TIMEOUT_MS - 1);
    expect(feed.calls).toHaveLength(0);
    await clock.advance(1);
    const r = await p;
    expect(clock.now() - t0).toBe(PRIMARY_TIMEOUT_MS);
    expect(r.result.timedOut).toBe(false);
    expect(r.quote).toMatchObject({ source: 'quote-feed', yesBid: 0.41 });
    expect(store.refreshHistory().at(-1)!.fallbackReason).toMatch(/^timeout: no answer from kalshi-relay within 4s/);
  });

  it('relay 200 with OLD data is a failed refresh: the feed is asked, and the stale relay price is never shown', async () => {
    const { relay, feed, store } = setup();
    relay.staleBy = 5 * 60_000; // HTTP 200, observed 5 minutes ago
    feed.staleBy = 3_000;
    const r = await store.refreshContract(T, FAR);
    expect(feed.tickerCalls()).toHaveLength(1);
    expect(r.quote).toMatchObject({ source: 'quote-feed' });
    expect(store.refreshHistory().at(-1)!.fallbackReason).toMatch(/^stale: HTTP 200 but 1 of 1 requested tickers have no usable observation \(newest returned is 300s old; limit 60s\)/);
  });

  it('both sources too old: unusable, nothing is displayed, the outcome is over_limit', async () => {
    const { relay, store } = setup();
    relay.staleBy = 5 * 60_000; // feed stays 3 min old
    const r = await store.refreshContract(T, FAR);
    expect(r.usability.usable).toBe(false);
    expect(r.quote).toBeNull();
    expect(store.refreshHistory().at(-1)).toMatchObject({ outcome: 'over_limit', provider: 'quote-feed' });
  });

  it('both failing: unusable, the error is reported, an earlier price that has aged out is not resurrected', async () => {
    const { clock, relay, feed, store } = setup();
    expect((await store.refreshContract(T, FAR)).quote).not.toBeNull(); // a good relay price first
    await clock.advance(2 * 60_000); // now older than the 60 s contract limit
    relay.failWith = new ProviderError('network', 'network error: offline');
    feed.failWith = new ProviderError('http', 'HTTP 503', 503);
    const r = await store.refreshContract(T, FAR);
    expect(r.result.failed).toEqual([T]);
    expect(r.result.error).toMatch(/network/);
    expect(r.usability).toMatchObject({ usable: false, reason: 'too_old' });
    expect(r.quote).toBeNull();
    expect(store.quote(T)?.yesBid).toBe(0.41); // still held (last known good), just never displayed
    expect(store.refreshHistory().at(-1)).toMatchObject({ provider: null, outcome: 'error' });
  });

  it('both failing and no price ever seen: unusable with reason no_quote', async () => {
    const { relay, feed, store } = setup();
    relay.failWith = new ProviderError('http', 'HTTP 502', 502);
    feed.failWith = new ProviderError('http', 'HTTP 503', 503);
    const r = await store.refreshContract(T, FAR);
    expect(r.usability).toMatchObject({ usable: false, reason: 'no_quote' });
  });

  it('the single-ticker forced refresh is bounded at 8 s even if both sources hang', async () => {
    const { clock, relay, feed, store } = setup();
    relay.delayMs = 10 * 60_000;
    feed.delayMs = 10 * 60_000;
    const t0 = clock.now();
    const p = store.refreshContract(T, FAR);
    await clock.advance(8_000);
    const r = await p;
    expect(clock.now() - t0).toBe(8_000);
    expect(r.result.failed).toEqual([T]); // whichever bound fires first, the call never outlives 8 s
    expect(r.quote).toBeNull();
  });

  it('the 4 s relay share also protects scope refreshes with a context', async () => {
    const { clock, relay, feed, store } = setup();
    feed.staleBy = 10_000;
    relay.delayMs = 60_000;
    store.addRowsScope([T], FAR);
    await clock.advance(PRIMARY_TIMEOUT_MS);
    expect(store.quote(T)?.source).toBe('quote-feed');
    expect(feed.tickerCalls()).toHaveLength(1);
  });
});

describe('legacy scopes and the packet preflight stay on the production chain', () => {
  it('a scope without a context is served by the production chain: no policy, the delivery chain is never asked', async () => {
    const { clock, relay, feed, prod, store } = setup();
    prod.relay.staleBy = 10 * 60_000; // an old relay 200 is still "the relay's answer" on the production chain
    store.addScope({ tickers: [T], cadence: 'detail' });
    await clock.advance(0);
    expect(prod.relay.seen[0] ?? {}).toEqual({});
    expect(prod.feed.calls).toHaveLength(0);
    expect(store.diagnostics().answeredBy).toBe('kalshi-relay');
    expect(relay.calls).toHaveLength(0);
    expect(feed.calls).toHaveLength(0);
  });

  it('refreshNow without a context (the packet preflight call) uses the production chain with no policy', async () => {
    const { relay, prod, store } = setup();
    await store.refreshNow([T]);
    expect(prod.relay.seen[0] ?? {}).toEqual({});
    expect(prod.relay.tickerCalls()).toHaveLength(1);
    expect(relay.calls).toHaveLength(0);
  });

  it('production chain: after a relay 429 the relay is asked again on the next refresh (no Retry-After skipping)', async () => {
    const { clock, prod, store } = setup();
    prod.feed.staleBy = 5_000;
    prod.relay.failWith = new ProviderError('rate_limited', 'rate limited (HTTP 429)', 429, 60_000);
    await store.refreshNow([T]);
    await clock.advance(5_000);
    await store.refreshNow([T]);
    expect(prod.relay.tickerCalls()).toHaveLength(2);
    expect(prod.feed.tickerCalls()).toHaveLength(2);
  });

  it('a ticker on both a legacy and a context scope is served by the delivery chain; the legacy-only ticker is not', async () => {
    const { clock, relay, prod, store } = setup();
    store.addScope({ tickers: [T], cadence: 'game' });
    store.addRowsScope([T], FAR);
    store.addScope({ tickers: [U], cadence: 'game' });
    await clock.advance(0);
    expect(relay.tickerCalls().flatMap((c) => c.ids)).toEqual([T]);
    expect(prod.relay.tickerCalls().flatMap((c) => c.ids)).toEqual([U]);
  });

  it('a failing delivery chain does not put the production chain into backoff (and the reverse)', async () => {
    const { clock, relay, feed, prod, store } = setup();
    const limited = () => new ProviderError('rate_limited', 'rate limited (HTTP 429)', 429, 60_000);
    relay.failWith = limited();
    feed.failWith = limited();
    store.addRowsScope([T], FAR);
    await clock.advance(0);
    expect(store.diagnostics().backoffReason).toBe('rate_limited');
    const r = await store.refreshNow([U]); // a packet-preflight style call is not held back
    expect(r.error).toBeNull();
    expect(prod.relay.tickerCalls()).toHaveLength(1);

    // The reverse, on a fresh rig: the production chain failing leaves the delivery scopes running.
    store.dispose();
    const b = setup();
    b.prod.relay.failWith = limited();
    b.prod.feed.failWith = limited();
    const failed = await b.store.refreshNow([T]);
    expect(failed.failed).toEqual([T]);
    b.store.addRowsScope([U], FAR);
    await b.clock.advance(0);
    expect(b.relay.tickerCalls().flatMap((c) => c.ids)).toEqual([U]);
    expect(b.store.quote(U)?.source).toBe('kalshi-relay');
  });
});

describe('policy sent to the delivery chain', () => {
  it('carries each ticker\'s own limit and the loosest of them', async () => {
    const { clock, relay, store } = setup();
    store.addRowsScope([T], NEAR); // list_near 90 s
    store.addRowsScope([U], FAR); // list_far 180 s
    await clock.advance(0);
    expect(relay.seen[0]).toMatchObject({ maxAgeMs: 180_000, maxAgeByTicker: { [T]: 90_000, [U]: 180_000 }, primaryTimeoutMs: PRIMARY_TIMEOUT_MS });
  });
});

describe('refresh-outcome history and diagnostics', () => {
  it('is bounded', async () => {
    const { clock, store } = setup();
    store.addContractScope(T, FAR);
    for (let i = 0; i < HISTORY_LIMIT + 50; i++) await clock.advance(CADENCE_MS.detail);
    expect(store.refreshHistory().length).toBe(HISTORY_LIMIT);
    expect(store.refreshHistory(5)).toHaveLength(5);
  });

  it('records provider, fallback reason, latency, observation age and outcome per call', async () => {
    const { clock, relay, feed, store } = setup();
    feed.staleBy = 4 * 60_000; // beyond the 3 min list limit
    store.addRowsScope([T], FAR);
    await clock.advance(0);
    relay.failWith = new ProviderError('rate_limited', 'rate limited (HTTP 429)', 429, 5_000);
    await clock.advance(CADENCE_MS.game);
    const [ok, fallback] = store.refreshHistory();
    expect(ok).toEqual({ at: expect.any(Number), kind: 'tickers', tickers: 1, provider: 'kalshi-relay', fallbackReason: null, latencyMs: 0, observationAgeMs: 0, unusableTickers: 0, outcome: 'ok' });
    expect(fallback).toMatchObject({ provider: 'quote-feed', observationAgeMs: 4 * 60_000, outcome: 'over_limit' });
    expect(fallback.fallbackReason).toContain('429');
    expect(store.diagnostics().lastOutcome).toEqual(fallback);
  });

  it('a provider failure is recorded with its kind', async () => {
    const { clock, relay, feed, store } = setup();
    relay.failWith = new ProviderError('http', 'HTTP 503', 503);
    feed.failWith = new ProviderError('http', 'HTTP 503', 503);
    store.addRowsScope([T], FAR);
    await clock.advance(0);
    expect(store.refreshHistory()[0]).toMatchObject({ provider: null, outcome: 'error', fallbackReason: 'http: HTTP 503' });
  });
});

describe('availability meter (internal diagnostics only)', () => {
  it('counts each price-slot render: usable or not, per context and provider, with age percentiles', async () => {
    const { clock, relay, store } = setup();
    expect(store.renderQuote(T, farList)).toBeNull(); // nothing yet: counted as unavailable, provider none
    await store.refreshContract(T, FAR);
    for (let i = 0; i < 8; i++) {
      await clock.advance(1_000);
      expect(store.renderQuote(T, farList)?.source).toBe('kalshi-relay'); // 1..8 s old: usable
    }
    await clock.advance(200_000); // 3 min 28 s: beyond list_far
    expect(store.renderQuote(T, farList)).toBeNull();
    void relay;
    const a = store.availability();
    expect(a.overall).toMatchObject({ renders: 10, usable: 8, availabilityPct: 80 });
    expect(a.byContext).toHaveLength(1);
    expect(a.byProvider.map((r) => [r.provider, r.renders, r.usable])).toEqual([['kalshi-relay', 9, 8], ['none', 1, 0]]);
    const relayRow = a.byContextProvider.find((r) => r.provider === 'kalshi-relay')!;
    expect(relayRow).toMatchObject({ context: 'list_far', availabilityPct: 88.9, p50AgeMs: 5_000, p95AgeMs: 208_000 });
  });

  it('records nothing user-visible: the meter is a plain data API', () => {
    const { store } = setup();
    expect(store.renderQuote(T, farList)).toBeNull();
    expect(JSON.stringify(store.availability())).not.toMatch(/stale|fresh|ago|updated/i);
  });
});

describe('relay provider: observation time, untimed answers, clock skew', () => {
  const body = JSON.stringify({ markets: [{ ticker: T, event_ticker: EVENT, status: 'active', yes_bid_dollars: '0.4100', yes_ask_dollars: '0.4300' }], cursor: '' });
  const NOW = Date.parse('2026-10-26T18:00:30Z');
  const make = (headers: Record<string, string>) =>
    new KalshiApiProvider({ baseUrl: 'https://relay.example/kalshi', now: () => NOW, strictObservation: true, fetchImpl: async () => new Response(body, { headers }) });

  it('without strictObservation (the production chain) the provider behaves exactly as on main: no marking, no skew', async () => {
    const plain = new KalshiApiProvider({ baseUrl: 'https://relay.example/kalshi', now: () => NOW, fetchImpl: async () => new Response(body, { headers: { date: 'Mon, 26 Oct 2026 18:10:30 GMT' } }) });
    const r = await plain.fetchQuotes([T]);
    expect(r.quotes[0].observedVia).toBeUndefined();
    expect(r.quotes[0].observedAt).toBe('2026-10-26T18:00:30Z'); // arrival time, as before
    expect(r.clockSkewMs).toBeUndefined();
  });

  it('X-Sift-Observed-At is the observation time', async () => {
    const r = await make({ 'x-sift-observed-at': '2026-10-26T18:00:12Z' }).fetchQuotes([T]);
    expect(r.quotes[0]).toMatchObject({ observedAt: '2026-10-26T18:00:12Z' });
    expect(r.quotes[0].observedVia).toBeUndefined();
  });

  it('a relay answer without the header is marked untimed and is never usable', async () => {
    const { quoteUsable } = await import('../../src/live/quoteUsable');
    const r = await make({}).fetchQuotes([T]);
    expect(r.quotes[0].observedVia).toBe('received');
    expect(quoteUsable(r.quotes[0], farContract, NOW)).toMatchObject({ usable: false, reason: 'untimed_observation' });
  });

  it('reports the relay clock minus the device clock from the Date header (ignoring < 2 s noise)', async () => {
    const slow = await make({ 'x-sift-observed-at': '2026-10-26T18:00:12Z', date: 'Mon, 26 Oct 2026 18:10:30 GMT' }).fetchQuotes([T]);
    expect(slow.clockSkewMs).toBe(10 * 60_000); // device clock is 10 min behind the relay
    const fine = await make({ 'x-sift-observed-at': '2026-10-26T18:00:12Z', date: 'Mon, 26 Oct 2026 18:00:30 GMT' }).fetchQuotes([T]);
    expect(fine.clockSkewMs).toBeUndefined();
    const hidden = await make({ 'x-sift-observed-at': '2026-10-26T18:00:12Z' }).fetchQuotes([T]);
    expect(hidden.clockSkewMs).toBeUndefined(); // header not exposed cross-origin: trust the device clock
  });

  it('the store applies the skew: a device clock 10 min slow still shows a fresh relay quote', async () => {
    const clock = new FakeClock(NOW);
    const relay = new KalshiApiProvider({
      baseUrl: 'https://relay.example/kalshi', now: clock.now, strictObservation: true,
      // the relay's clock is 10 minutes ahead of this device's
      fetchImpl: async () => new Response(body, { headers: { 'x-sift-observed-at': new Date(clock.now() + 10 * 60_000 - 3_000).toISOString(), date: new Date(clock.now() + 10 * 60_000).toUTCString() } }),
    });
    store = new QuoteStore({ provider: relay, deliveryProvider: new DeliveryProvider([relay], { now: clock.now, timers: clock }), now: clock.now, timers: clock, env: new FakeEnv(), persistence: null, random: () => 0.5 });
    const r = await store.refreshContract(T, FAR);
    expect(store.clockSkewMs).toBe(10 * 60_000);
    expect(r.usability).toMatchObject({ usable: true, ageMs: 3_000 });
    const naive = (await import('../../src/live/quoteUsable')).quoteUsable(store.quote(T), farContract, clock.now());
    expect(naive.reason).toBe('future_observed_at'); // without the correction it would have been withheld
  });
});
