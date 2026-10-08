// Reading the CFB research-signals contract. One document for the whole slate, re-read every few minutes while a
// CFB screen is open (the conductor refreshes it as prices are captured). A failed re-read keeps the copy on screen;
// with no copy at all the caller gets the error and shows the board without signals, saying so.
import { useEffect, useState } from 'react';
import { decodeSignals, type SignalsDoc } from '../lib/cfbSignals';
import { NotFoundError } from './fetcher';

/** How often an open CFB screen re-reads the signals document. */
export const SIGNALS_REFRESH_MS = 4 * 60 * 1000;

type Loader = (url: string) => Promise<unknown>;

async function fetchSignals(url: string): Promise<unknown> {
  // no-cache: revalidate with the server every read, so the refresh period is real.
  const res = await fetch(url, { cache: 'no-cache' });
  if (res.status === 404) throw new NotFoundError(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

let loader: Loader = fetchSignals;
const held = new Map<string, { doc: SignalsDoc; at: number }>();
const inflight = new Map<string, Promise<SignalsDoc>>();

/** Tests read the fixture from disk (tests/helpers.ts useDiskFetch); null restores the network reader. */
export function setSignalsLoader(fn: Loader | null): void {
  loader = fn ?? fetchSignals;
  resetSignals();
}

export function resetSignals(): void {
  held.clear();
  inflight.clear();
}

export function loadSignals(url: string): Promise<SignalsDoc> {
  let p = inflight.get(url);
  if (!p) {
    p = loader(url).then((raw) => {
      const doc = decodeSignals(raw);
      held.set(url, { doc, at: Date.now() });
      return doc;
    });
    const done = () => inflight.delete(url);
    p.then(done, done);
    inflight.set(url, p);
  }
  return p;
}

export interface SignalsState {
  doc: SignalsDoc | null;
  error: Error | null;
  loading: boolean;
}

/** The signals document for a sport that publishes one (null url: nothing is read). */
export function useCfbSignals(url: string | null | undefined): SignalsState {
  const [state, setState] = useState<SignalsState>(() => {
    const h = url ? held.get(url) : undefined;
    return { doc: h?.doc ?? null, error: null, loading: !!url && !h };
  });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const read = () =>
      loadSignals(url).then(
        (doc) => alive && setState({ doc, error: null, loading: false }),
        (error: Error) => alive && setState((s) => ({ doc: s.doc ?? held.get(url)?.doc ?? null, error, loading: false })),
      );
    const h = held.get(url);
    if (h) setState({ doc: h.doc, error: null, loading: false });
    if (!h || Date.now() - h.at > SIGNALS_REFRESH_MS) void read();
    const id = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') void read();
    }, SIGNALS_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [url]);
  return state;
}
