// My SIFT's personal workspace, pure: recently viewed pages and the contract watchlist. Both are small device-local lists, newest first,
// de-duplicated, capped, and validated on every read from storage (`revive*`): an entry whose route is not an in-app /v3 route is dropped,
// so a row can never be a broken link. Nothing here sends anything anywhere: a watchlist is a list to look at, not an alert.
import { normalizeRoute } from './saved';

export const RECENT_CAP = 30;
export const WATCH_CAP = 40;

export type VisitKind = 'player' | 'team' | 'game' | 'stat' | 'research';
const KINDS: readonly VisitKind[] = ['player', 'team', 'game', 'stat', 'research'];

/** A page the viewer opened: its route, a title and one line of context. `at` is when (ms); absent on entries from the first build. */
export interface Visit { route: string; title: string; subtitle: string; kind: VisitKind; slug: string; logo?: string | null; abbr?: string; at?: number }

const str = (x: unknown, max: number): string => (typeof x === 'string' ? x.slice(0, max) : '');
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Two visits are the same page when they share a path; research (a Discover prop with its selected line) is told apart by its whole address. */
export function visitKey(v: Pick<Visit, 'route' | 'kind'>): string {
  // The rung in `exp=<id>@<rung>` is the selected line, not another page: opening the same prop at another line replaces its entry.
  return v.kind === 'research' ? v.route.replace(/(exp=[^&#]*?)(?:@|%40)[^&#]*/, '$1') : v.route.split('?')[0];
}

/** Record a view: newest first, any earlier entry for the same page removed, capped. Opening the page already at the top returns the same list. */
export function addVisit(list: readonly Visit[], v: Visit, now = Date.now(), cap = RECENT_CAP): Visit[] {
  const route = normalizeRoute(v.route);
  if (!route || !v.title.trim()) return list as Visit[];
  const next: Visit = { ...v, route, at: now };
  const k = visitKey(next);
  if (list[0] && visitKey(list[0]) === k && list[0].title === next.title && list[0].subtitle === next.subtitle) return list as Visit[];
  return [next, ...list.filter((x) => visitKey(x) !== k)].slice(0, cap);
}

export const removeVisit = (list: readonly Visit[], key: string): Visit[] => list.filter((x) => visitKey(x) !== key);

export function reviveVisit(raw: unknown): Visit | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const route = normalizeRoute(r.route);
  const title = str(r.title, 120).trim();
  if (!route || !title) return null;
  const kind = KINDS.find((k) => k === r.kind);
  if (!kind) return null;
  return {
    route, title, subtitle: str(r.subtitle, 160), kind, slug: str(r.slug, 8),
    ...(typeof r.logo === 'string' ? { logo: r.logo.slice(0, 300) } : {}),
    ...(typeof r.abbr === 'string' ? { abbr: r.abbr.slice(0, 8) } : {}),
    ...(finite(r.at) ? { at: r.at } : {}),
  };
}

export function reviveVisits(raw: unknown): Visit[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Visit[] = [];
  for (const x of raw) {
    const v = reviveVisit(x);
    if (!v) continue;
    const k = visitKey(v);
    if (seen.has(k)) continue;
    seen.add(k); out.push(v);
    if (out.length >= RECENT_CAP) break;
  }
  return out;
}

// ---------------------------------------------------------------- watchlist

/** A Kalshi contract the viewer watches. No price is stored: the price is read live, through the quote gate, whenever the list is shown. */
export interface WatchItem {
  ticker: string;
  title: string;
  subtitle: string;
  /** The in-app address that opens the contract in its context (the screen with the exact-contract sheet open). */
  route: string;
  addedAt: number;
  /** The game's start (ms), which tiers how current a price must be; null when the screen did not know it. */
  startMs: number | null;
}

/** A Kalshi market ticker: letters, digits and . _ - only (no spaces, no URL characters). */
export const isTicker = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(t);

/** The address of a screen with a contract's sheet open (`?sheet=contract&tk=`): where a watched contract takes the viewer. */
export function contractRoute(pathname: string, search: string, ticker: string): string {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  q.delete('sheet'); q.delete('tk');
  q.set('sheet', 'contract'); q.set('tk', ticker);
  return `${pathname}?${q.toString()}`;
}

export function reviveWatchItem(raw: unknown, now = Date.now()): WatchItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isTicker(r.ticker)) return null;
  const route = normalizeRoute(r.route);
  if (!route) return null;
  return {
    ticker: r.ticker, route,
    title: str(r.title, 120).trim() || r.ticker,
    subtitle: str(r.subtitle, 160),
    addedAt: finite(r.addedAt) ? r.addedAt : now,
    startMs: finite(r.startMs) ? r.startMs : null,
  };
}

export function reviveWatchlist(raw: unknown): WatchItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: WatchItem[] = [];
  for (const x of raw) {
    const w = reviveWatchItem(x);
    if (!w || seen.has(w.ticker)) continue;
    seen.add(w.ticker); out.push(w);
    if (out.length >= WATCH_CAP) break;
  }
  return out;
}

/** Add (or move to the top) a watched contract. Invalid input returns the list unchanged. The oldest entries fall off at the cap. */
export function addWatch(list: readonly WatchItem[], w: Omit<WatchItem, 'addedAt'>, now = Date.now(), cap = WATCH_CAP): WatchItem[] {
  const item = reviveWatchItem({ ...w, addedAt: now }, now);
  if (!item) return list as WatchItem[];
  return [item, ...list.filter((x) => x.ticker !== item.ticker)].slice(0, cap);
}

export const removeWatch = (list: readonly WatchItem[], ticker: string): WatchItem[] => list.filter((x) => x.ticker !== ticker);
export const isWatched = (list: readonly WatchItem[], ticker: string | null | undefined): boolean => !!ticker && list.some((x) => x.ticker === ticker);
