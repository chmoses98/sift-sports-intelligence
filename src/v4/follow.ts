// Teams a viewer follows on this device. Stored locally (localStorage); nothing about it leaves the browser.
// A team is `${sport}:${abbr}` using the publication's own short name, the same key a game row carries.
import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'sift.v4.follow';
const listeners = new Set<() => void>();
let cache: string[] | null = null;

function read(): string[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: string[]) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable: the choice holds for this visit */ }
  listeners.forEach((l) => l());
}

export const teamKey = (sport: string, abbr: string | null | undefined): string | null => (abbr ? `${sport}:${abbr}` : null);

export function useFollowing() {
  const list = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, read, () => []);
  const toggle = useCallback((key: string) => write(read().includes(key) ? read().filter((k) => k !== key) : [...read(), key]), []);
  return { list, has: (key: string | null) => !!key && list.includes(key), toggle };
}

/** Test seam: forget the in-memory copy so a test that edits localStorage is read again. */
export function resetFollowCache() { cache = null; }
