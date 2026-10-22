// Which real score feeds this device reads. A score feed is a third party's data shown to this device's own user, so it is switched on
// per device, remembered here, and one tap turns it off. Nothing is requested while it is off.
//
// Two separate switches, because the feeds sit on different footing:
//   * live scores:  the feeds whose OWN terms cover this use (SportScore's written free tier; MLB's "individual, non-commercial" notice);
//   * ESPN:         ESPN's unofficial scoreboard covers more (NFL, college football, NHL) but its terms do not grant automated access.
//                   It is off unless the viewer turns it on here, and it only does anything while live scores are on.
import { useSyncExternalStore } from 'react';

const KEY = 'sift.v4.livescores';
const ESPN_KEY = 'sift.v4.livescores.espn';
const read = (k: string) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
let on = read(KEY);
let espn = read(ESPN_KEY);
let snapshot = `${on}|${espn}`;
const subs = new Set<() => void>();
const store = (k: string, v: boolean) => { try { if (v) localStorage.setItem(k, '1'); else localStorage.removeItem(k); } catch { /* the choice lasts for this page view only */ } };
const changed = () => { snapshot = `${on}|${espn}`; subs.forEach((f) => f()); };

export const feedEnabled = () => on;
export const espnEnabled = () => on && espn;
export const enableFeed = () => { on = true; store(KEY, true); changed(); };
export const disableFeed = () => { on = false; store(KEY, false); changed(); };
export const setEspn = (v: boolean) => { espn = v; store(ESPN_KEY, v); changed(); };

export function subscribeFeed(cb: () => void): () => void {
  subs.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY || e.key === ESPN_KEY || e.key === null) { on = read(KEY); espn = read(ESPN_KEY); changed(); } };
  window.addEventListener('storage', onStorage);
  return () => { subs.delete(cb); window.removeEventListener('storage', onStorage); };
}
const snap = () => snapshot;
export const useFeedEnabled = (): boolean => { useSyncExternalStore(subscribeFeed, snap, () => 'false|false'); return on; };
export const useEspnEnabled = (): boolean => { useSyncExternalStore(subscribeFeed, snap, () => 'false|false'); return on && espn; };
