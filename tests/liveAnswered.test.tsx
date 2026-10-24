// @vitest-environment jsdom
// useLiveAnswered: a screen that lays out content from quotes can tell when every ticker it asked about has an outcome (a quote, "not listed" or a
// failure), so it does not draw controls and then move them when the answer arrives.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLiveStore, useLiveAnswered } from '../src/live/hooks';
import { QuoteStore } from '../src/live/store';
import type { ProviderResult, QuoteProvider } from '../src/live/types';

const result = (over: Partial<ProviderResult> = {}): ProviderResult => ({ quotes: [], missing: [], requests: 1, latencyMs: 1, ...over });
const quote = (ticker: string) => ({ ticker, eventTicker: null, seriesTicker: null, yesBid: 0.4, yesAsk: 0.42, noBid: 0.58, noAsk: 0.6, lastPrice: 0.41, volume: null, openInterest: null, availability: 'OPEN', rawStatus: 'active', closeTime: null, observedAt: new Date().toISOString() }) as ProviderResult['quotes'][number];
const provider = (fetchQuotes: QuoteProvider['fetchQuotes']): QuoteProvider => ({ id: 'test', label: 'test', maxBatch: 50, fetchQuotes, fetchEventMarkets: async () => result() });

let store: QuoteStore;
const install = (p: QuoteProvider) => { store = new QuoteStore({ provider: p, persistence: null }); setLiveStore(store); };
beforeEach(() => install(provider(async (t) => result({ quotes: t.filter((x) => x !== 'GONE').map(quote), missing: t.filter((x) => x === 'GONE') }))));
afterEach(() => setLiveStore(new QuoteStore({ provider: null, persistence: null })));

describe('useLiveAnswered', () => {
  it('is true when there is nothing to ask about', () => {
    expect(renderHook(() => useLiveAnswered([])).result.current).toBe(true);
    expect(renderHook(() => useLiveAnswered(undefined)).result.current).toBe(true);
  });
  it('is false until every ticker has an outcome, then true', async () => {
    const { result: r } = renderHook(() => useLiveAnswered(['A', 'B']));
    expect(r.current).toBe(false);
    await act(async () => { await store.refreshNow(['A']); });
    expect(r.current).toBe(false);                                  // B has not been answered
    await act(async () => { await store.refreshNow(['B']); });
    expect(r.current).toBe(true);
  });
  it('counts "the provider does not list it" as an answer', async () => {
    const { result: r } = renderHook(() => useLiveAnswered(['GONE']));
    await act(async () => { await store.refreshNow(['GONE']); });
    expect(r.current).toBe(true);
  });
  it('counts a failed request as an outcome, so a down relay does not hold a screen forever', async () => {
    install(provider(async () => { throw Object.assign(new Error('relay down'), { kind: 'network' }); }));
    const { result: r } = renderHook(() => useLiveAnswered(['A']));
    expect(r.current).toBe(false);
    await act(async () => { await store.refreshNow(['A']); });
    expect(r.current).toBe(true);
  });
});
