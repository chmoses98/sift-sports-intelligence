// Whether this device reads real scores. A score feed is a third party's data shown to this device's own user, so it is switched on per
// device (one tap in v4 early access, or `#/v4?livescores=1`), remembered here, and one tap turns it off. Nothing is requested while it is off.
import { useSyncExternalStore } from 'react';

const KEY = 'sift.v4.livescores';
const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
let on = read();
const subs = new Set<() => void>();
const set = (v: boolean) => {
  on = v;
  try { if (v) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* the choice lasts for this page view only */ }
  subs.forEach((f) => f());
};

export const feedEnabled = () => on;
export const enableFeed = () => set(true);
export const disableFeed = () => set(false);

export function subscribeFeed(cb: () => void): () => void {
  subs.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY || e.key === null) { on = read(); cb(); } };
  window.addEventListener('storage', onStorage);
  return () => { subs.delete(cb); window.removeEventListener('storage', onStorage); };
}
export const useFeedEnabled = (): boolean => useSyncExternalStore(subscribeFeed, feedEnabled, () => false);
