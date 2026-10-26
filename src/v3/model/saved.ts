// Saved research: the existing record (an in-app route with its query, a title, a subtitle, an optional frozen snapshot) extended,
// never replaced. Version 1 is the record as first shipped (no `v` field). Version 2 adds `v`, `kind`, `sport`, `chips` and the URL
// vocabulary version the route was saved under (`sv`). Every record read from storage passes through `reviveSaved`, which
// validates it, upgrades it, and keeps anything that can still be opened.
import { canonicalRoute, migrateQuery, schemaForPath } from '../state/url';
import '../nav/schemas';

export const SAVED_VERSION = 2;

export type SavedKind = 'player' | 'team' | 'stat' | 'game' | 'props' | 'other';

export interface SnapshotItem { label: string; value: string; asOf: string | null }

export interface SavedResearch {
  /** Record version (absent on records saved before versioning: treated as 1). */
  v: number;
  id: string;
  kind: SavedKind;
  /** Sport slug when the route names one ("nfl"). */
  sport: string | null;
  title: string;
  subtitle: string;
  /** Short state summary shown as chips on the saved card ("L10", "Away", "6+"). */
  chips: string[];
  /** The in-app route including its query string: reopening it restores stat, line, window, filters and tab. */
  route: string;
  /** The URL vocabulary version the route was written under (0 = before versioning). */
  sv: number;
  savedAt: number;
  /** Frozen at save time and always labelled as such next to the live read. */
  snapshot?: SnapshotItem[];
}

export type SavedInput = Pick<SavedResearch, 'title' | 'subtitle' | 'route'> & Partial<Pick<SavedResearch, 'chips' | 'snapshot' | 'kind' | 'sport'>>;

const str = (x: unknown, max: number): string => (typeof x === 'string' ? x.slice(0, max) : '');

/** `#/v3/x`, `/v3/x` and `v3/x` all name the same in-app route. Anything outside /v3 is not ours to open. */
export function normalizeRoute(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let r = raw.trim();
  if (r.startsWith('#')) r = r.slice(1);
  if (!r.startsWith('/')) r = `/${r}`;
  if (r.startsWith('//')) return null;
  if (!/^\/v3(\/|\?|$)/.test(r)) return null;
  return r.slice(0, 600);
}

export function kindOfRoute(route: string): SavedKind {
  const p = route.split('?')[0];
  if (/^\/v3\/player\//.test(p)) return 'player';
  if (/^\/v3\/team\//.test(p)) return 'team';
  if (/^\/v3\/stat\//.test(p)) return 'stat';
  if (/^\/v3\/game\//.test(p)) return 'game';
  if (/^\/v3\/props(\/|$)/.test(p)) return 'props';
  return 'other';
}

export const sportOfRoute = (route: string): string | null => /^\/v3\/(?:player|team|stat|game)\/([a-z]{2,5})\//.exec(route.split('?')[0])?.[1] ?? null;

/** The vocabulary version a route's query was written under (0 when it carries none). */
function routeVersion(route: string): number {
  const q = route.indexOf('?');
  if (q < 0) return 0;
  const search = route.slice(q + 1);
  const schema = schemaForPath(route.slice(0, q));
  return schema ? migrateQuery(schema, search).from : 0;
}

const cleanSnapshot = (raw: unknown): SnapshotItem[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({ label: str(x.label, 40), value: str(x.value, 40), asOf: typeof x.asOf === 'string' ? x.asOf.slice(0, 40) : null }))
    .filter((x) => x.label && x.value)
    .slice(0, 6);
  return out.length ? out : undefined;
};

/**
 * One stored record to the current shape, or null when it cannot be opened (no usable route). Never throws.
 * The route is brought to the current URL vocabulary; the version it was saved under is kept in `sv` so the card can be audited.
 */
export function reviveSaved(raw: unknown, now = Date.now()): SavedResearch | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const route0 = normalizeRoute(r.route);
  if (!route0) return null;
  const sv = routeVersion(route0);
  const route = canonicalRoute(route0);
  const title = str(r.title, 120).trim();
  const kind = (['player', 'team', 'stat', 'game', 'props', 'other'] as const).find((k) => k === r.kind) ?? kindOfRoute(route);
  return {
    v: SAVED_VERSION,
    id: str(r.id, 40) || `r${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    kind,
    sport: typeof r.sport === 'string' ? r.sport.slice(0, 8) : sportOfRoute(route),
    title: title || 'Saved research',
    subtitle: str(r.subtitle, 160),
    chips: Array.isArray(r.chips) ? r.chips.filter((c): c is string => typeof c === 'string' && c.length > 0).map((c) => c.slice(0, 24)).slice(0, 6) : [],
    route,
    sv,
    savedAt: typeof r.savedAt === 'number' && Number.isFinite(r.savedAt) ? r.savedAt : now,
    snapshot: cleanSnapshot(r.snapshot),
  };
}

/** A whole stored list: invalid entries dropped, ids made unique, duplicate routes collapsed (the newest save wins). */
export function reviveSavedList(raw: unknown): SavedResearch[] {
  if (!Array.isArray(raw)) return [];
  const seenId = new Set<string>();
  const seenRoute = new Set<string>();
  const out: SavedResearch[] = [];
  for (const x of raw) {
    let s = reviveSaved(x);
    if (!s || seenRoute.has(s.route)) continue;
    if (seenId.has(s.id)) s = { ...s, id: `${s.id}-${out.length}` };
    seenId.add(s.id); seenRoute.add(s.route);
    out.push(s);
  }
  return out;
}

/** The saved record for a route, however the route is spelled (legacy vocabulary, `#` prefix, parameter order). */
export function findSaved(list: SavedResearch[], route: string): SavedResearch | undefined {
  const r = normalizeRoute(route);
  if (!r) return undefined;
  const c = canonicalRoute(r);
  return list.find((s) => s.route === c);
}
