// Everything the viewer chooses, kept on this device. Following (the star) and alerts (the bell) are SEPARATE stores:
// starring never subscribes to anything, and nothing here ever asks the platform for notification permission.
import { createStore, useStore } from './store';
import type { PriceFormat } from '../model/format';

export interface Follows { teams: string[]; players: string[]; games: string[] }
const follows = createStore<Follows>('follows', { teams: [], players: [], games: [] });

export type FollowKind = keyof Follows;
export const useFollows = () => useStore(follows);
export const followsNow = () => follows.get();
export const isFollowing = (f: Follows, kind: FollowKind, key: string) => f[kind].includes(key);

/** Toggle a follow. Order is recency (most recently followed first) so Home and the picker pin it first. Returns the new state. */
export function toggleFollow(kind: FollowKind, key: string): boolean {
  let on = false;
  follows.set((f) => {
    on = !f[kind].includes(key);
    return { ...f, [kind]: on ? [key, ...f[kind]] : f[kind].filter((x) => x !== key) };
  });
  return on;
}

/** Alerts are per item and off by default. Recording the choice is all this build does: no permission prompt is made. */
const alerts = createStore<Record<string, string[]>>('alerts', {});
export const useAlerts = () => useStore(alerts);
export const alertTopics = ['Game start', 'Score changes', 'Final', 'Line moves'] as const;
export function setAlertTopics(id: string, topics: string[]) {
  alerts.set((a) => { const n = { ...a }; if (topics.length) n[id] = topics; else delete n[id]; return n; });
}

export interface Prefs { priceFormat: PriceFormat; reduceMotion: boolean; textScale: 'default' | 'large'; onboarded: boolean }
const prefs = createStore<Prefs>('prefs', { priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: false });
export const usePrefs = () => useStore(prefs);
export const setPrefs = (p: Partial<Prefs>) => prefs.set((c) => ({ ...c, ...p }));

/** A saved research setup: the exact route (with every parameter) plus the numbers shown when it was saved. */
export interface SavedResearch {
  id: string;
  title: string;
  subtitle: string;
  /** The in-app route including its query string: reopening it restores stat, line, window, filters and tab. */
  route: string;
  savedAt: number;
  /** Frozen at save time and always labelled as such next to the live read. */
  snapshot?: { label: string; value: string; asOf: string | null }[];
}
const saved = createStore<SavedResearch[]>('saved', []);
export const useSaved = () => useStore(saved);
export const saveResearch = (s: Omit<SavedResearch, 'id' | 'savedAt'>) => saved.set((l) => [{ ...s, id: `r${Date.now().toString(36)}`, savedAt: Date.now() }, ...l.filter((x) => x.route !== s.route)]);
export const removeSaved = (id: string) => saved.set((l) => l.filter((x) => x.id !== id));

const recents = createStore<{ q: string; route?: string }[]>('recents', []);
export const useRecents = () => useStore(recents);
export const pushRecent = (q: string, route?: string) => recents.set((l) => [{ q, route }, ...l.filter((x) => x.q !== q)].slice(0, 8));
export const clearRecents = () => recents.set([]);

/** Sample-data mode: `#/v3?demo=1` turns it on for this tab (sessionStorage), `?demo=0` off. Real data is the default. */
const KEY = 'sift3.demo';
export function demoOn(): boolean {
  try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}
export function applyDemoParam(search: string): void {
  const q = new URLSearchParams(search).get('demo');
  try {
    if (q === '1') sessionStorage.setItem(KEY, '1');
    else if (q === '0') sessionStorage.removeItem(KEY);
  } catch { /* unavailable: demo cannot be switched on */ }
}
