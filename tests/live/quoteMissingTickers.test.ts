// Per-REQUESTED-ticker accounting in the quote-delivery chain and the store: the chain and the store's usability
// decision look at every ticker that was asked for, never at the freshest observation in the returned batch.
//
// Covered, for list rows (addRowsScope / refresh) and for the exact contract (refreshContract):
//   partial batch (requested tickers absent), empty HTTP 200, stale requested tickers next to fresh unrelated ones,
//   a delisted market, a closed market, and the sources failing in each combination. A ticker no source can supply
//   a usable observation for stays unusable: renderQuote() returns null, never an older quote passed off as current.
import { afterEach, describe, expect, it } from 'vitest';
import { quoteUsable } from '../../src/live/quoteUsable';
import { QuoteStore } from '../../src/live/store';
import { ProviderError } from '../../src/live/types';
import { FAR, OTHER, T, U, V, rig } from './support/delivery';

let current: QuoteStore | null = null;
afterEach(() => current?.dispose());
const setup = (tickers = [T, U, V]) => {
  const r = rig(tickers);
  current = r.store;
  return r;
};
const rows = { surface: 'list' as const, ...FAR }; // list_far: 180 s
const contract = { surface: 'contract' as const, ...FAR }; // contract_far: 60 s
const SEC = 1_000;

describe('partial batch: requested tickers absent from the relay answer', () => {
  it('the next provider is asked for exactly the absent tickers and the results are merged per ticker', async () => {
    const { clock, relay, feed, store } = setup();
    relay.omit = new Set([U, V]);
    feed.staleBy = 20 * SEC; // a fresh feed publication
    store.addRowsScope([T, U, V], FAR);
    await clock.advance(0);
    expect(relay.tickerCalls().map((c) => c.ids)).toEqual([[T, U, V]]);
    expect(feed.tickerCalls().map((c) => c.ids)).toEqual([[U, V]]); // only what the relay could not supply
    expect(store.quote(T)?.source).toBe('kalshi-relay');
    expect(store.quote(U)?.source).toBe('quote-feed');
    expect(store.quote(V)?.source).toBe('quote-feed');
    for (const t of [T, U, V]) expect(store.renderQuote(t, rows)).not.toBeNull();
    expect(store.refreshHistory().at(-1)).toMatchObject({ outcome: 'ok', unusableTickers: 0 });
    expect(store.refreshHistory().at(-1)!.fallbackReason).toMatch(/^stale: HTTP 200 but 2 of 3 requested tickers have no usable observation/);
  });

  it('a ticker absent from every source stays unusable (silent missing price); the others display', async () => {
    const { clock, relay, feed, store } = setup();
    relay.omit = new Set([U]);
    feed.omit = new Set([U]);
    feed.staleBy = 20 * SEC;
    store.addRowsScope([T, U, V], FAR);
    await clock.advance(0);
    expect(store.renderQuote(T, rows)).not.toBeNull();
    expect(store.renderQuote(V, rows)).not.toBeNull();
    expect(store.renderQuote(U, rows)).toBeNull();
    expect(store.usable(U, rows)).toMatchObject({ usable: false, reason: 'no_quote' });
    expect(store.ticker(U)?.missing).toBe(true);
    expect(store.refreshHistory().at(-1)).toMatchObject({ outcome: 'partial', unusableTickers: 1 });
  });

  it('refreshContract: relay answers without the contract, the feed supplies it', async () => {
    const { relay, feed, store } = setup();
    relay.omit = new Set([T]);
    feed.staleBy = 10 * SEC;
    const r = await store.refreshContract(T, FAR);
    expect(r.quote).toMatchObject({ ticker: T, source: 'quote-feed' });
    expect(r.usability.usable).toBe(true);
    expect(feed.tickerCalls().map((c) => c.ids)).toEqual([[T]]);
  });

  it('refreshContract: absent from relay and feed: no price, reported missing, not failed', async () => {
    const { relay, feed, store } = setup();
    relay.omit = new Set([T]);
    feed.omit = new Set([T]);
    const r = await store.refreshContract(T, FAR);
    expect(r.quote).toBeNull();
    expect(r.usability).toMatchObject({ usable: false, reason: 'no_quote' });
    expect(r.result).toMatchObject({ missing: [T], failed: [], unusable: [T] });
    expect(store.renderQuote(T, contract)).toBeNull();
  });
});

describe('empty HTTP 200', () => {
  it('relay answers 200 with no markets: the feed is asked for all of them', async () => {
    const { clock, relay, feed, store } = setup();
    relay.empty = true;
    feed.staleBy = 20 * SEC;
    store.addRowsScope([T, U], FAR);
    await clock.advance(0);
    expect(feed.tickerCalls().map((c) => c.ids)).toEqual([[T, U]]);
    expect(store.renderQuote(T, rows)?.source).toBe('quote-feed');
    expect(store.renderQuote(U, rows)?.source).toBe('quote-feed');
    expect(store.refreshHistory().at(-1)!.fallbackReason).toMatch(/none of the 2 requested tickers were returned/);
  });

  it('both answer 200 with nothing: every ticker unusable, outcome no_quotes, no error', async () => {
    const { clock, relay, feed, store } = setup();
    relay.empty = true;
    feed.empty = true;
    store.addRowsScope([T, U], FAR);
    await clock.advance(0);
    expect(store.renderQuote(T, rows)).toBeNull();
    expect(store.renderQuote(U, rows)).toBeNull();
    expect(store.refreshHistory().at(-1)).toMatchObject({ outcome: 'no_quotes', unusableTickers: 2 });
    expect(store.diagnostics().lastError).toBeNull(); // an empty 200 is an answer, not a failure
    expect(store.diagnostics().consecutiveFailures).toBe(0);
  });

  it('refreshContract: empty relay 200 and the feed erroring: no price, nothing thrown', async () => {
    const { relay, feed, store } = setup();
    relay.empty = true;
    feed.failWith = new ProviderError('http', 'HTTP 503', 503);
    const r = await store.refreshContract(T, FAR);
    expect(r.quote).toBeNull();
    expect(r.usability.reason).toBe('no_quote');
    expect(r.result.missing).toEqual([T]);
    expect(store.refreshHistory().at(-1)).toMatchObject({ outcome: 'no_quotes' });
    expect(store.refreshHistory().at(-1)!.fallbackReason).toMatch(/none of the 1 requested tickers.*; then quote-feed: http: HTTP 503/);
  });

  it('refreshContract: empty relay 200 then the feed supplies a fresh quote', async () => {
    const { relay, feed, store } = setup();
    relay.empty = true;
    feed.staleBy = 5 * SEC;
    const r = await store.refreshContract(T, FAR);
    expect(r.quote).toMatchObject({ source: 'quote-feed' });
  });
});

describe('stale requested tickers next to fresh unrelated ones (a failed refresh for those tickers)', () => {
  it('a fresh unrelated ticker in the batch does not make a stale requested one acceptable', async () => {
    const { clock, relay, feed, store } = setup();
    relay.ageBy.set(T, 10 * 60_000); // T is ten minutes old on the relay...
    relay.unrelated = [OTHER]; // ...while a fresh quote for a ticker nobody asked for rides along
    feed.staleBy = 20 * SEC;
    store.addRowsScope([T, U], FAR);
    await clock.advance(0);
    expect(feed.tickerCalls().map((c) => c.ids)).toEqual([[T]]); // U was fine; only T falls through
    expect(store.quote(T)?.source).toBe('quote-feed');
    expect(store.quote(U)?.source).toBe('kalshi-relay');
    expect(store.renderQuote(T, rows)).not.toBeNull();
    expect(store.quote(OTHER)).toBeUndefined(); // an unrequested quote is never kept
    expect(store.refreshHistory().at(-1)).toMatchObject({ outcome: 'ok', observationAgeMs: 0 });
  });

  it('the old whole-batch rule would have accepted this: the freshest observation in the batch is 0 s old', async () => {
    const { relay, store } = setup();
    relay.ageBy.set(T, 10 * 60_000);
    relay.unrelated = [OTHER];
    const r = await store.refreshContract(T, FAR);
    // relay answer: T 600 s old + OTHER 0 s old; the feed (3 min old, past the 60 s contract limit) cannot help.
    expect(r.usability).toMatchObject({ usable: false, reason: 'too_old' });
    expect(r.quote).toBeNull();
    expect(store.renderQuote(T, contract)).toBeNull();
  });

  it('newest observation wins when both sources hold the ticker; neither is made to look newer', async () => {
    const { relay, feed, store } = setup();
    relay.ageBy.set(T, 5 * 60_000); // stale on the relay
    feed.ageBy.set(T, 4 * 60_000); // newer than the relay's, but still over the 60 s contract limit
    const r = await store.refreshContract(T, FAR);
    expect(r.quote).toBeNull();
    expect(store.quote(T)?.source).toBe('quote-feed'); // 4 min beats 5 min
    const held = store.quote(T)!.observedAt;
    feed.ageBy.set(T, 9 * 60_000); // the feed now serves an even older publication
    await store.refreshContract(T, FAR);
    expect(store.quote(T)!.observedAt).toBe(held); // never replaced by an older observation
    expect(store.renderQuote(T, contract)).toBeNull();
  });

  it('stale on both: the call is an answer (no error, no backoff), the ticker is unusable and counted', async () => {
    const { clock, relay, feed, store } = setup();
    relay.staleBy = 5 * 60_000;
    feed.staleBy = 6 * 60_000;
    store.addRowsScope([T, U], FAR);
    await clock.advance(0);
    expect(store.refreshHistory().at(-1)).toMatchObject({ outcome: 'over_limit', unusableTickers: 2 });
    expect(store.diagnostics().consecutiveFailures).toBe(0);
    expect(store.renderQuote(T, rows)).toBeNull();
    expect(store.renderQuote(U, rows)).toBeNull();
  });

  it('refreshContract: stale relay answer, then the feed erroring: the stale quote is held but never displayed', async () => {
    const { relay, feed, store } = setup();
    relay.staleBy = 5 * 60_000;
    feed.failWith = new ProviderError('http', 'HTTP 503', 503);
    const r = await store.refreshContract(T, FAR);
    expect(r.quote).toBeNull();
    expect(r.usability).toMatchObject({ usable: false, reason: 'too_old', ageMs: 5 * 60_000 });
  });
});

describe('delisted and closed markets', () => {
  it('a delisted market (no source lists it) is missing and unusable; its neighbours are unaffected', async () => {
    const { clock, relay, feed, store } = setup();
    relay.prices.delete(T);
    feed.prices.delete(T);
    feed.staleBy = 20 * SEC;
    store.addRowsScope([T, U], FAR);
    await clock.advance(0);
    expect(store.renderQuote(T, rows)).toBeNull();
    expect(store.renderQuote(U, rows)?.source).toBe('kalshi-relay');
    expect(store.ticker(T)?.missing).toBe(true);
  });

  it('refreshContract on a delisted market: missing-price state, never an older quote', async () => {
    const { clock, relay, feed, store } = setup();
    expect((await store.refreshContract(T, FAR)).quote).not.toBeNull(); // it traded fine
    const original = store.quote(T)!.observedAt;
    await clock.advance(5 * 60_000); // the market is delisted in between
    relay.prices.delete(T);
    feed.prices.delete(T);
    const r = await store.refreshContract(T, FAR);
    expect(r.quote).toBeNull();
    expect(r.usability).toMatchObject({ usable: false, reason: 'too_old' });
    expect(r.result.missing).toEqual([T]);
    expect(store.quote(T)!.observedAt).toBe(original); // held with its own time, never re-stamped
    expect(store.renderQuote(T, contract)).toBeNull();
  });

  it('a closed market the relay still lists is a fresh observation: usable by age, with its CLOSED availability kept', async () => {
    const { relay, store } = setup();
    relay.status.set(T, 'CLOSED');
    const r = await store.refreshContract(T, FAR);
    expect(r.usability.usable).toBe(true);
    expect(r.quote?.availability).toBe('CLOSED'); // the screen's own availability handling decides what a closed market shows
  });

  it('a closed market the relay no longer lists and the feed holds from minutes ago: unusable', async () => {
    const { relay, feed, store } = setup();
    relay.omit = new Set([T]);
    feed.status.set(T, 'CLOSED');
    feed.staleBy = 3 * 60_000;
    const r = await store.refreshContract(T, FAR);
    expect(r.quote).toBeNull();
    expect(r.usability).toMatchObject({ usable: false, reason: 'too_old' });
    expect(store.quote(T)?.availability).toBe('CLOSED'); // held, with its true age
  });
});

describe('refreshContract against every source failure, per requested ticker', () => {
  it('relay success: fresh, the feed is never asked', async () => {
    const { feed, store } = setup();
    expect((await store.refreshContract(T, FAR)).quote?.source).toBe('kalshi-relay');
    expect(feed.calls).toHaveLength(0);
  });

  it('relay 429 and the feed omits the ticker: unusable (and the relay is skipped next time)', async () => {
    const { clock, relay, feed, store } = setup();
    relay.failWith = new ProviderError('rate_limited', 'rate limited (HTTP 429)', 429, 60_000);
    feed.omit = new Set([T]);
    const r = await store.refreshContract(T, FAR);
    expect(r.quote).toBeNull();
    expect(r.result.missing).toEqual([T]);
    await clock.advance(10 * SEC);
    await store.refreshContract(T, FAR);
    expect(relay.tickerCalls()).toHaveLength(1); // not hammered inside Retry-After
  });

  it('relay timeout and the feed returns only unrelated fresh tickers: the contract is unusable', async () => {
    const { clock, relay, feed, store } = setup();
    relay.delayMs = 60_000;
    feed.omit = new Set([T]);
    feed.unrelated = [OTHER];
    const p = store.refreshContract(T, FAR);
    await clock.advance(4_000);
    const r = await p;
    expect(r.quote).toBeNull();
    expect(store.quote(OTHER)).toBeUndefined();
    expect(r.usability.reason).toBe('no_quote');
  });

  it('both failing: unusable, error reported, and a held older quote is not reused as fresh', async () => {
    const { clock, relay, feed, store } = setup();
    await store.refreshContract(T, FAR);
    const original = store.quote(T)!.observedAt;
    await clock.advance(2 * 60_000);
    relay.failWith = new ProviderError('network', 'network error: offline');
    feed.failWith = new ProviderError('http', 'HTTP 503', 503);
    const r = await store.refreshContract(T, FAR);
    expect(r.result.failed).toEqual([T]);
    expect(r.quote).toBeNull();
    expect(store.quote(T)!.observedAt).toBe(original);
  });

  it('an untimed relay answer (arrival time only) is not an observation: the feed is asked', async () => {
    const { relay, feed, store } = setup();
    relay.untimed = true;
    feed.staleBy = 10 * SEC;
    const r = await store.refreshContract(T, FAR);
    expect(r.quote?.source).toBe('quote-feed');
    expect(store.refreshHistory().at(-1)!.fallbackReason).toMatch(/untimed|no usable observation/);
  });
});

describe('the chain on its own', () => {
  it('does not mutate observation times: merged quotes carry exactly the provider\'s own observedAt', async () => {
    const { relay, feed, chain, clock } = setup();
    relay.omit = new Set([U]);
    feed.ageBy.set(U, 30 * SEC);
    const r = await chain.fetchQuotes([T, U], undefined, { maxAgeByTicker: { [T]: 180_000, [U]: 180_000 }, maxAgeMs: 180_000 });
    const u = r.quotes.find((q) => q.ticker === U)!;
    expect(Date.parse(u.observedAt)).toBe(clock.now() - 30 * SEC);
    expect(r.answeredBy).toBe('quote-feed');
    expect(r.fallback?.error).toMatch(/^stale: HTTP 200 but 1 of 2/);
  });

  it('with no limits supplied every believable observation counts and the second provider is not asked', async () => {
    const { relay, feed, chain } = setup();
    relay.staleBy = 30 * 60_000;
    const r = await chain.fetchQuotes([T, U]);
    expect(r.quotes).toHaveLength(2);
    expect(feed.calls).toHaveLength(0);
  });

  it('an untimed observation never beats a timed one', async () => {
    const { clock, relay, feed, chain } = setup();
    relay.untimed = true; // relay: untimed (arrival time), feed: timed but old
    feed.ageBy.set(T, 20 * 60_000);
    const r = await chain.fetchQuotes([T], undefined, { maxAgeByTicker: { [T]: 60_000 }, maxAgeMs: 60_000 });
    expect(r.quotes).toHaveLength(1);
    expect(r.quotes[0].source).toBe('quote-feed');
    expect(quoteUsable(r.quotes[0], contract, clock.now())).toMatchObject({ usable: false, reason: 'too_old' });
  });

  it('an aborted call throws aborted rather than answering', async () => {
    const { chain } = setup();
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(chain.fetchQuotes([T], ctrl.signal)).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('nobody answering throws the first provider\'s error', async () => {
    const { relay, feed, chain } = setup();
    relay.failWith = new ProviderError('http', 'HTTP 502', 502);
    feed.failWith = new ProviderError('http', 'HTTP 503', 503);
    await expect(chain.fetchQuotes([T])).rejects.toMatchObject({ kind: 'http', status: 502 });
  });
});
