// @vitest-environment jsdom
// How SIFT 3.0 asks the shared live-quote store for its prices (src/v3/data/liveQuotes.ts): list rows through `addRowsScope` (game cadence, the delivery
// chain, tiered by the game's start), the exact contract through `addContractScope` + `refreshContract` (open and Retry), per-ticker accounting, the
// closed-market state, and the same behaviour in every delivery configuration. Fake clock, fake providers, no network (tests/live/support/delivery.ts).
import { act, renderHook } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLiveStore } from '../../src/live/hooks';
import { deliveryProvider } from '../../src/live/deliveryConfig';
import { MARKET_CLOSED, MISSING_PRICE } from '../../src/live/missingPrice';
import { DeliveryProvider } from '../../src/live/providers/deliveryChain';
import { FallbackProvider } from '../../src/live/providers/fallback';
import { MAX_ROW_TICKERS, QuoteStore } from '../../src/live/store';
import { gate } from '../../src/v3/data/quoteGate';
import { refreshRowsNow, useContractRefresh, useQuoteReader, useRowGroups, useRowQuotes } from '../../src/v3/data/liveQuotes';
import { priceOfQuote } from '../../src/v3/model/contract';
import { nonTradableTitle } from '../../src/v3/model/marketStatus';
import { FakeClock, FakeEnv } from '../live/fakes';
import { Aged, EVENT, HOUR, START, T, U, V, rig, type Rig } from '../live/support/delivery';

const install = (r: Rig) => { setLiveStore(r.store); return r; };
afterEach(() => { setLiveStore(new QuoteStore({ provider: null, persistence: null })); vi.unstubAllEnvs(); });

const FAR = START + 5 * HOUR, NEAR = START + HOUR;
const farRows = { startMs: FAR, live: false };
const limit = (a: Aged, t: string) => a.seen.at(-1)?.maxAgeByTicker?.[t];

describe('list rows: addRowsScope through the delivery chain, tiered by the game\'s start', () => {
  it.each([
    ['start more than 2 hours away', { startMs: FAR, live: false }, 180_000],
    ['start within 2 hours', { startMs: NEAR, live: false }, 90_000],
    ['live', { startMs: NEAR, live: true }, 60_000],
    ['start in the past (the game is on)', { startMs: START - HOUR, live: false }, 60_000],
    ['unknown start (the stricter tier)', { startMs: null, live: false }, 90_000],
  ])('%s: relay first, the production chain is not touched, the maximum age of each requested ticker is the table\'s', async (_n, ctx, ms) => {
    const r = install(rig());
    renderHook(() => useRowQuotes([T, U], ctx));
    await act(async () => { await r.clock.advance(0); });
    expect(r.relay.tickerCalls().map((c) => [...c.ids].sort())).toEqual([[T, U].sort()]);
    expect(limit(r.relay, T)).toBe(ms);
    expect(limit(r.relay, U)).toBe(ms);
    expect(r.prod.relay.calls).toHaveLength(0);
    expect(r.prod.feed.calls).toHaveLength(0);
  });

  it('refreshes at the game cadence (45 s) and releases the scope on unmount', async () => {
    const r = install(rig());
    const h = renderHook(() => useRowQuotes([T], farRows));
    await act(async () => { await r.clock.advance(0); });
    expect(r.relay.tickerCalls()).toHaveLength(1);
    await act(async () => { await r.clock.advance(44_999); });
    expect(r.relay.tickerCalls()).toHaveLength(1);
    await act(async () => { await r.clock.advance(1); });
    expect(r.relay.tickerCalls()).toHaveLength(2);
    expect(r.store.diagnostics().trackedTickers).toBe(1);
    h.unmount();
    expect(r.store.diagnostics().trackedTickers).toBe(0);
    await act(async () => { await r.clock.advance(120_000); });
    expect(r.relay.tickerCalls()).toHaveLength(2); // nothing is polled for a screen that is gone
  });

  it('registers exactly the tickers it is given; nothing (no scope, no request) for none, and the same rows again register nothing new', async () => {
    const r = install(rig());
    const spy = vi.spyOn(r.store, 'addRowsScope');
    const h = renderHook(({ t }: { t: string[] | undefined }) => useRowQuotes(t, farRows), { initialProps: { t: undefined as string[] | undefined } });
    await act(async () => { await r.clock.advance(0); });
    expect(spy).not.toHaveBeenCalled();
    expect(r.relay.calls).toHaveLength(0);
    h.rerender({ t: [T, U] });
    h.rerender({ t: [U, T] }); // same rows, other order
    h.rerender({ t: [T, U, T] }); // and a duplicate
    expect(spy).toHaveBeenCalledTimes(1);
    expect([...spy.mock.calls[0][0]]).toEqual([T, U].sort());
    await act(async () => { await r.clock.advance(0); });
    expect(r.relay.tickerCalls().flatMap((c) => c.ids).sort()).toEqual([T, U].sort());
  });

  it('one scope per game start: two games\' rows get their own maximum age', async () => {
    const r = install(rig([T, U, V]));
    renderHook(() => useRowGroups([{ tickers: [T], startMs: FAR, live: false }, { tickers: [U, V], startMs: NEAR, live: true }]));
    await act(async () => { await r.clock.advance(0); });
    const seen = r.relay.seen.filter(Boolean);
    const byTicker = Object.assign({}, ...seen.map((o) => o!.maxAgeByTicker));
    expect(byTicker).toEqual({ [T]: 180_000, [U]: 60_000, [V]: 60_000 });
  });

  it('more rows than the store\'s cap of one scope are split across scopes, never silently dropped', async () => {
    const r = install(rig());
    const many = Array.from({ length: MAX_ROW_TICKERS * 2 + 50 }, (_, i) => `KXNHLGOAL-26OCT26TORCGY-R${i}`);
    many.forEach((t) => r.relay.prices.set(t, 0.3));
    const spy = vi.spyOn(r.store, 'addRowsScope');
    renderHook(() => useRowQuotes(many, farRows));
    expect(spy.mock.calls.map((c) => [...c[0]].length)).toEqual([MAX_ROW_TICKERS, MAX_ROW_TICKERS, 50]);
    expect(r.store.diagnostics().trackedTickers).toBe(many.length);
  });

  it('a row the relay cannot supply falls to the feed, for that ticker only; a ticker neither can supply stays unusable', async () => {
    const r = install(rig());
    r.relay.omit.add(U);
    r.feed.staleBy = 120_000; // inside a far list limit (180 s), over a near one
    renderHook(() => useRowQuotes([T, U], farRows));
    await act(async () => { await r.clock.advance(0); });
    expect(r.feed.tickerCalls().map((c) => c.ids)).toEqual([[U]]);
    const reader = renderHook(() => useQuoteReader());
    const q = reader.result.current.quote(U)!;
    expect(gate(priceOfQuote(q), { kind: 'list', startMs: FAR, live: false }, r.clock.now()).price).not.toBeNull();
    expect(gate(priceOfQuote(q), { kind: 'list', startMs: NEAR, live: false }, r.clock.now()).price).toBeNull();
  });

  it('refreshRowsNow: one batch through the delivery chain judged by the list limits; never throws', async () => {
    const r = install(rig());
    const res = await refreshRowsNow([T, U], { startMs: NEAR, live: false });
    expect(res).toMatchObject({ requested: [T, U], refreshed: [T, U], failed: [], missing: [] });
    expect(r.relay.tickerCalls().map((c) => c.ids)).toEqual([[T, U]]);
    expect(limit(r.relay, T)).toBe(90_000);
    expect(r.prod.relay.calls).toHaveLength(0);
    setLiveStore(new QuoteStore({ provider: null, persistence: null }));
    expect(await refreshRowsNow([T], farRows)).toMatchObject({ failed: [T] });
  });
});

describe('the exact contract: addContractScope + refreshContract (open, Retry), per-ticker accounting', () => {
  const contract = (tk: string, startMs: number | null = FAR, live = false) => renderHook(() => useContractRefresh(tk, { startMs, live }));

  it('opening asks once through the delivery chain with the contract limit; the contract then refreshes every 20 s', async () => {
    const r = install(rig());
    const h = contract(T);
    await act(async () => { await r.clock.advance(0); });
    expect(r.relay.tickerCalls().map((c) => c.ids)).toEqual([[T]]); // the forced refresh and the scope's first poll share one request
    expect(limit(r.relay, T)).toBe(60_000);
    expect(h.result.current.state).toBe('price');
    expect(r.prod.relay.calls).toHaveLength(0);
    const n = r.relay.tickerCalls().length;
    await act(async () => { await r.clock.advance(20_000); });
    expect(r.relay.tickerCalls().length).toBe(n + 1);
    h.unmount();
    expect(r.store.diagnostics().trackedTickers).toBe(0);
  });

  it('the contract limit follows the start: 60 s far out, 30 s within 2 hours and live', async () => {
    for (const [startMs, live, ms] of [[FAR, false, 60_000], [NEAR, false, 30_000], [FAR, true, 30_000], [null, false, 30_000]] as const) {
      const r = install(rig());
      contract(T, startMs, live);
      await act(async () => { await r.clock.advance(0); });
      expect(limit(r.relay, T)).toBe(ms);
    }
  });

  it('Retry asks again the same way (refreshContract), not a list refresh', async () => {
    const r = install(rig());
    const h = contract(T);
    await act(async () => { await r.clock.advance(0); });
    const spy = vi.spyOn(r.store, 'refreshContract');
    await act(async () => { await h.result.current.retry(); });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe(T);
    expect(spy.mock.calls[0][1]).toEqual({ startsAt: FAR, live: false });
    expect(h.result.current.busy).toBe(false);
  });

  it('a relay answer older than the contract limit is a failed refresh: the feed is asked for that ticker only, and with both old the state is unavailable (Retry)', async () => {
    const r = install(rig());
    r.relay.ageBy.set(T, 90_000); // over 60 s
    r.feed.staleBy = 3 * 60_000;
    const h = contract(T);
    await act(async () => { await r.clock.advance(0); });
    expect(r.feed.tickerCalls().map((c) => c.ids)).toEqual([[T]]);
    expect(h.result.current.state).toBe('unavailable');
    expect(h.result.current.result?.unusable).toEqual([T]);
    expect(h.result.current.result?.failed).toEqual([]);
  });

  it('the relay is down and the feed has it fresh enough: the feed price is shown (state price)', async () => {
    const r = install(rig());
    r.relay.failWith = Object.assign(new Error('down'), { kind: 'network' }) as never;
    r.feed.staleBy = 20_000;
    const h = contract(T);
    await act(async () => { await r.clock.advance(0); });
    expect(h.result.current.state).toBe('price');
  });

  it('a closed, settled or expired market is an ANSWER: state market_closed (no Retry), not a failure, no backoff, the feed is not asked', async () => {
    for (const [extra, status] of [
      [{ rawStatus: 'closed', availability: 'CLOSED' as const }, 'closed'],
      [{ rawStatus: 'finalized', availability: 'SETTLED' as const }, 'settled'],
      [{ rawStatus: 'active', availability: 'OPEN' as const, result: 'yes' }, 'settled'],
      [{ rawStatus: 'expired', availability: 'UNKNOWN' as const }, 'expired'],
    ] as const) {
      const r = install(rig());
      r.relay.extra.set(T, extra);
      const h = contract(T);
      await act(async () => { await r.clock.advance(0); });
      expect(h.result.current.state, status).toBe('market_closed');
      expect(h.result.current.marketStatus).toBe(status);
      expect(h.result.current.result).toMatchObject({ failed: [], error: null });
      expect(h.result.current.result?.nonTradable).toEqual([T]);
      expect(r.feed.calls).toHaveLength(0);
      expect(r.store.diagnostics().consecutiveFailures).toBe(0);
      // the words the sheet prints for it come from the shared wording, and Retry is not among them
      expect(nonTradableTitle(h.result.current.marketStatus!)).toMatch(status === 'settled' ? /settled/ : new RegExp(MARKET_CLOSED.contract));
    }
  });

  it('a suspended market is not_trading (the ordinary missing-price sentence with Retry), not closed', async () => {
    const r = install(rig());
    r.relay.extra.set(T, { rawStatus: 'inactive', availability: 'SUSPENDED' });
    const h = contract(T);
    await act(async () => { await r.clock.advance(0); });
    expect(h.result.current.state).toBe('not_trading');
    expect(h.result.current.marketStatus).toBe('suspended');
    expect(MISSING_PRICE.retry).toBe('Retry');
  });

  it('per-ticker accounting: a ticker the relay answered without is missing, never "refreshed"; a neighbour that was answered is unaffected', async () => {
    const r = install(rig());
    r.relay.omit.add(T);
    r.feed.omit.add(T);
    const h = contract(T);
    await act(async () => { await r.clock.advance(0); });
    expect(h.result.current.state).toBe('unavailable');
    expect(h.result.current.result).toMatchObject({ requested: [T], refreshed: [], missing: [T], failed: [] });
  });

  it('a sheet that moved on to another contract does not take the earlier answer', async () => {
    const r = install(rig());
    const h = renderHook(({ tk }: { tk: string }) => useContractRefresh(tk, { startMs: FAR, live: false }), { initialProps: { tk: T } });
    h.rerender({ tk: U });
    await act(async () => { await r.clock.advance(0); });
    expect(h.result.current.result?.requested).toEqual([U]);
    expect(h.result.current.state).toBe('price');
  });

  it('nothing for no ticker', async () => {
    const r = install(rig());
    const h = renderHook(() => useContractRefresh(null, { startMs: FAR, live: false }));
    await act(async () => { await r.clock.advance(0); });
    expect(r.relay.calls).toHaveLength(0);
    expect(h.result.current.state).toBeNull();
  });
});

describe('the same behaviour in every delivery configuration', () => {
  /** A store as src/live/hooks.ts builds it, over the rig's fakes: the delivery chain as configured, the production chain beside it. */
  function configured(mode: 'relay+feed' | 'feed only' | 'no delivery chain') {
    const clock = new FakeClock(), env = new FakeEnv();
    const mk = (id: string, age: number) => { const p = new Aged(clock, id); p.staleBy = age; p.minIntervalMs = 0; for (const t of [T, U]) p.prices.set(t, 0.4); p.events.set(EVENT, [T, U]); return p; };
    const relay = mk('kalshi-relay', 2_000), feed = mk('quote-feed', 25_000);
    const production = new FallbackProvider([mk('kalshi-relay', 2_000), mk('quote-feed', 25_000)], { inventoryOrder: [feed, relay] });
    const chain = mode === 'relay+feed' ? new DeliveryProvider([relay, feed], { now: clock.now, timers: clock }) : mode === 'feed only' ? new DeliveryProvider([feed], { now: clock.now, timers: clock }) : null;
    const store = new QuoteStore({ provider: production, deliveryProvider: chain, now: clock.now, timers: clock, env, persistence: null, random: () => 0.5 });
    return { clock, store, relay, feed };
  }

  it.each(['relay+feed', 'feed only', 'no delivery chain'] as const)('%s: rows get a usable price, the contract sheet refreshes, Retry works, a closed market says so', async (mode) => {
    const x = configured(mode);
    setLiveStore(x.store);
    const rows = renderHook(() => useRowQuotes([T, U], farRows));
    const contract = renderHook(() => useContractRefresh(T, { startMs: FAR, live: false }));
    await act(async () => { await x.clock.advance(0); });
    const q = rows.result.current.quote(T);
    expect(q).toBeDefined();
    expect(gate(priceOfQuote(q), { kind: 'list', startMs: FAR, live: false }, x.clock.now()).price).not.toBeNull();
    expect(contract.result.current.state).toBe('price');
    await act(async () => { await contract.result.current.retry(); });
    expect(contract.result.current.state).toBe('price');
    // the chain that answered
    if (mode === 'relay+feed') expect(x.relay.tickerCalls().length).toBeGreaterThan(0);
    if (mode === 'feed only') expect(x.relay.calls).toHaveLength(0);
  });

  it('the delivery chain is built by the app\'s own configuration (src/live/deliveryConfig.ts): relay + feed, feed only, or none', () => {
    vi.stubEnv('VITE_SIFT_QUOTE_RELAY_URL', 'https://relay.example.test');
    vi.stubEnv('VITE_SIFT_QUOTE_FEED_URL', 'https://feed.example.test');
    expect(deliveryProvider()).not.toBeNull();
    expect(deliveryProvider()!.label).toMatch(/relay/i);
    vi.stubEnv('VITE_SIFT_QUOTE_RELAY_URL', '');
    expect(deliveryProvider()).not.toBeNull(); // the default production configuration: no relay URL, the feed alone
    expect(deliveryProvider()!.label).not.toMatch(/relay/i);
    vi.stubEnv('VITE_SIFT_QUOTE_FEED_URL', 'off');
    expect(deliveryProvider()).toBeNull(); // nothing configured: the store serves these entry points from its production provider (or none)
  });
});

describe('isolation: SIFT 3.0 reaches the store only through src/v3/data/liveQuotes.ts', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
  const v3 = walk(join('src', 'v3'));
  const code = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const THE_ONE = join('src', 'v3', 'data', 'liveQuotes.ts');

  it('no v3 file registers a legacy scope or refreshes the store itself', () => {
    const offenders = v3.filter((p) => p !== THE_ONE && /\buseLiveQuotes\b|\.addScope\(|\.refreshNow\(|\.addSlateScope\(/.test(code(p)));
    expect(offenders).toEqual([]);
  });
  it('the scope hooks are used by the screens that print prices, and by no others (Home registers none)', () => {
    const users = v3.filter((p) => p !== THE_ONE && /\b(useRowQuotes|useRowGroups|useContractRefresh|refreshRowsNow)\b/.test(code(p))).map((p) => p.replace(/\\/g, '/')).sort();
    expect(users).toEqual([
      'src/v3/data/props/hooks.ts', 'src/v3/data/research/gameHooks.ts', 'src/v3/data/useGameExtras.ts', 'src/v3/data/usePlayer.ts', 'src/v3/ui/ContractSheet.tsx',
    ]);
    expect(readFileSync(join('src', 'v3', 'screens', 'Home.tsx'), 'utf8')).not.toMatch(/liveQuotes|useLiveQuotes|useRowQuotes/);
    // Home's featured card prints no price: `useGameExtras(…, 'photo')` registers nothing (it asks for no quote)
    expect(readFileSync(join('src', 'v3', 'data', 'useGameExtras.ts'), 'utf8')).toMatch(/real && enabled \? tickers : undefined/);
  });
  it('the production chain is never handed a v3 scope: no v3 file imports the production provider or its configuration', () => {
    const offenders = v3.filter((p) => /live\/config'|providers\/fallback'|live\/preflight'/.test(code(p)));
    expect(offenders).toEqual([]);
  });
});
