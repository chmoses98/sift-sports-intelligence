// Whether this device reads the real score feed. In v4 early access it is ON unless the viewer turns it off: one tap turns it off, the
// choice is remembered on this device, and nothing is requested while it is off. Only v4 screens ever observe games, so SIFT 2.0 never
// reaches the feed. The one feed is SportScore, whose own published free tier covers this use. (An earlier build had a second, ESPN switch;
// ESPN's terms do not permit automated access, so it was removed and the stale setting is cleared below.)
import { useSyncExternalStore } from 'react';

const KEY = 'sift.v4.livescores';
/** On unless the viewer has turned it off here ('0'). Storage that cannot be read means the default: on. */
const read = (k: string) => { try { return localStorage.getItem(k) !== '0'; } catch { return true; } };
try { localStorage.removeItem('sift.v4.livescores.espn'); } catch { /* storage unavailable: nothing to clear */ }
let on = read(KEY);
const subs = new Set<() => void>();
const store = (v: boolean) => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* the choice lasts for this page view only */ } };
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
export const useFeedEnabled = (): boolean => useSyncExternalStore(subscribeFeed, feedEnabled, () => true);
