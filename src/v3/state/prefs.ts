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
/** The hosted-page preview (no network access to the research feeds) is built sample-only: real mode cannot work there, so it is not offered. */
declare const __SIFT_SAMPLE_ONLY__: boolean | undefined;
export const SAMPLE_ONLY = typeof __SIFT_SAMPLE_ONLY__ !== 'undefined' && __SIFT_SAMPLE_ONLY__ === true;
export function demoOn(): boolean {
  if (SAMPLE_ONLY) return true;
  try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}
export function applyDemoParam(search: string): void {
  if (SAMPLE_ONLY) return;
  const q = new URLSearchParams(search).get('demo');
  try {
    if (q === '1') sessionStorage.setItem(KEY, '1');
    else if (q === '0') sessionStorage.removeItem(KEY);
  } catch { /* unavailable: demo cannot be switched on */ }
}

/** Recently opened entities (the Explore "Recent research" list): the route, a title and one line of context. */
export interface Visit { route: string; title: string; subtitle: string; kind: 'player' | 'team' | 'game' | 'stat'; slug: string; logo?: string | null; abbr?: string }
const visits = createStore<Visit[]>('visits', []);
export const useVisits = () => useStore(visits);
export const pushVisit = (v: Visit) => visits.set((l) => (l[0]?.route === v.route && l[0].title === v.title ? l : [v, ...l.filter((x) => x.route.split('?')[0] !== v.route.split('?')[0])].slice(0, 12)));
export const clearVisits = () => visits.set([]);

/** Wipe everything this device keeps (follows, alerts, saved research, recents, preferences). */
export function clearAllLocal() {
  follows.set({ teams: [], players: [], games: [] }); alerts.set({}); saved.set([]); recents.set([]); visits.set([]);
}
