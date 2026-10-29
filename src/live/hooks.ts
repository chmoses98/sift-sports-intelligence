// React access to the shared live-quote store.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { defaultProvider } from './config';
import { deliveryProvider } from './deliveryConfig';
import { localPersistence, QuoteStore, type Cadence } from './store';
import type { LiveQuote } from './types';

let singleton: QuoteStore | null = null;

export function liveStore(): QuoteStore {
  if (!singleton) singleton = new QuoteStore({ provider: defaultProvider(), deliveryProvider: deliveryProvider(), persistence: localPersistence() });
  return singleton;
}

/** Tests swap the store (a fixture provider, a fake clock). */
export function setLiveStore(s: QuoteStore | null): void {
  singleton?.dispose();
  singleton = s;
}

/** Re-render whenever any quote or provider state changes. */
export function useLiveVersion(): number {
  const s = liveStore();
  return useSyncExternalStore(s.subscribe, s.getVersion, s.getVersion);
}

const key = (xs: Iterable<string> | undefined) => [...new Set(xs ?? [])].sort().join(',');

/**
 * True once the store has an outcome for every one of these tickers: a quote, an explicit "not listed", or a failure. (A ticker with nothing to ask
 * about counts as answered.) A screen that lays out content from quotes waits for this, or accepts the content arriving later and moving things.
 */
export function useLiveAnswered(tickers: Iterable<string> | undefined): boolean {
  const s = liveStore();
  useLiveVersion();
  const tk = key(tickers);
  return !tk || tk.split(',').every((t) => { const st = s.ticker(t); return !!st && (st.lastSuccessAt != null || st.lastError != null); });
}

/**
 * Keep these tickers (and, optionally, these provider events for inventory) refreshed while the
 * calling screen is mounted. Returns a lookup that always reads the newest quote.
 */
export function useLiveQuotes(tickers: Iterable<string> | undefined, cadence: Cadence, events?: Iterable<string>): {
  quote: (ticker: string) => LiveQuote | undefined;
  version: number;
} {
  const s = liveStore();
  const tk = key(tickers);
  const ek = key(events);
  useEffect(() => {
    if (!tk && !ek) return;
    return s.addScope({ tickers: tk ? tk.split(',') : [], events: ek ? ek.split(',') : [], cadence });
  }, [s, tk, ek, cadence]);
  const version = useLiveVersion();
  return useMemo(() => ({ quote: (t: string) => s.quote(t), version }), [s, version]);
}

/** A clock for ages on screen: ticks every `ms` while visible, so "4m" becomes "5m" on its own. */
export function useNow(ms = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') setNow(Date.now());
    };
    const id = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ms]);
  return now;
}
