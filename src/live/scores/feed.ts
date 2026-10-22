// Whether this device reads the real score feed. A score feed is a third party's data shown to this device's own user, so it is
// switched on per device, remembered here, and one tap turns it off. Nothing is requested while it is off. The one feed is SportScore,
// whose own written free tier covers this use. (An earlier build had a second, ESPN switch; ESPN's terms do not permit automated access,
// so it was removed and the stale setting is cleared below.)
import { useSyncExternalStore } from 'react';

const KEY = 'sift.v4.livescores';
const read = (k: string) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
try { localStorage.removeItem('sift.v4.livescores.espn'); } catch { /* storage unavailable: nothing to clear */ }
let on = read(KEY);
const subs = new Set<() => void>();
const store = (v: boolean) => { try { if (v) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* the choice lasts for this page view only */ } };
const changed = () => { subs.forEach((f) => f()); };

export const feedEnabled = () => on;
export const enableFeed = () => { on = true; store(true); changed(); };
export const disableFeed = () => { on = false; store(false); changed(); };

export function subscribeFeed(cb: () => void): () => void {
  subs.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY || e.key === null) { on = read(KEY); changed(); } };
  window.addEventListener('storage', onStorage);
  return () => { subs.delete(cb); window.removeEventListener('storage', onStorage); };
}
export const useFeedEnabled = (): boolean => useSyncExternalStore(subscribeFeed, feedEnabled, () => false);
