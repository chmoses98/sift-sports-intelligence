// A tiny persisted external store: one JSON value in localStorage under a `sift3.` key, readable synchronously and
// subscribable from React. Storage that throws (private window, blocked site data) degrades to memory for the page view.
import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(next: T | ((cur: T) => T)): void;
  subscribe(cb: () => void): () => void;
}

/** `revive` validates and upgrades whatever storage holds (another tab, an older build) before it is trusted. */
export function createStore<T>(key: string, initial: T, revive?: (raw: unknown) => T): Store<T> {
  const k = `sift3.${key}`;
  let value: T = initial;
  try {
    const raw = localStorage.getItem(k);
    if (raw != null) value = { ...(typeof initial === 'object' && !Array.isArray(initial) ? initial : {}), ...JSON.parse(raw) } as T;
    if (Array.isArray(initial) && raw != null) value = JSON.parse(raw) as T;
    if (revive && raw != null) value = revive(JSON.parse(raw));
  } catch { /* memory only */ }
  const subs = new Set<() => void>();
  const persist = () => { try { localStorage.setItem(k, JSON.stringify(value)); } catch { /* memory only */ } };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== k) return;
    try { value = e.newValue == null ? initial : revive ? revive(JSON.parse(e.newValue)) : (JSON.parse(e.newValue) as T); } catch { return; }
    subs.forEach((f) => f());
  };
  return {
    get: () => value,
    set(next) {
      value = typeof next === 'function' ? (next as (c: T) => T)(value) : next;
      persist();
      subs.forEach((f) => f());
    },
    subscribe(cb) {
      subs.add(cb);
      if (subs.size === 1 && typeof window !== 'undefined') window.addEventListener('storage', onStorage);
      return () => { subs.delete(cb); if (!subs.size && typeof window !== 'undefined') window.removeEventListener('storage', onStorage); };
    },
  };
}

export const useStore = <T,>(s: Store<T>): T => useSyncExternalStore(s.subscribe, s.get, s.get);
