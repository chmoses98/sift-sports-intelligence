// Versioned URL state: the single mechanism for durable, shareable research state (selected entity, statistic, line, filters,
// window, tab, comparison, game selection). A screen declares a schema; the address is the state. Rules:
//  - Decoding never throws and never trusts the address: an unknown or invalid value falls back to the field's default.
//  - Encoding omits defaults and is deterministic (declaration order), so the same state is always the same string. That is what
//    makes scroll memory, de-duplication of saved research and shared links reliable.
//  - `v` names the vocabulary version. An address with parameters but no `v` is the pre-versioning vocabulary (version 0) and is
//    migrated forward, so links and saved research made before this existed keep opening.
//  - Parameters the schema does not own (`sheet`, `demo`, anything future) pass through untouched.
import { useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from '../../routing';
import { sheetBridge } from '../nav/sheetBridge';

export const VERSION_PARAM = 'v';

export interface Field<T> {
  def: T;
  parse(raw: string): T | undefined;
  format(v: T): string;
  same(a: T, b: T): boolean;
}

const eq = <T,>(a: T, b: T) => a === b;

export const f = {
  /** Free text. `max` bounds what an address can carry (a typed search is capped, never unbounded). */
  str: (def: string | null = null, max = 80): Field<string | null> => ({
    def, same: eq,
    parse: (r) => (r === '' ? undefined : r.slice(0, max)),
    format: (v) => v ?? '',
  }),
  oneOf: <K extends string>(opts: readonly K[], def: K): Field<K> => ({
    def, same: eq,
    parse: (r) => ((opts as readonly string[]).includes(r) ? (r as K) : undefined),
    format: (v) => v,
  }),
  num: (def: number | null = null, o: { min?: number; max?: number } = {}): Field<number | null> => ({
    def, same: eq,
    parse: (r) => { const n = Number(r); return r !== '' && Number.isFinite(n) && n >= (o.min ?? -Infinity) && n <= (o.max ?? Infinity) ? n : undefined; },
    format: (v) => (v == null ? '' : String(v)),
  }),
  int: (def: number | null = null, o: { min?: number; max?: number } = {}): Field<number | null> => ({
    def, same: eq,
    parse: (r) => { const n = Number(r); return /^-?\d+$/.test(r) && n >= (o.min ?? -Infinity) && n <= (o.max ?? Infinity) ? n : undefined; },
    format: (v) => (v == null ? '' : String(v)),
  }),
  bool: (def = false): Field<boolean> => ({
    def, same: eq,
    parse: (r) => (r === '1' ? true : r === '0' ? false : undefined),
    format: (v) => (v ? '1' : '0'),
  }),
  /** A comma list of tokens (comparison selections, expanded rows). Tokens may not contain commas; the list is capped. */
  list: (def: string[] = [], max = 12): Field<string[]> => ({
    def,
    same: (a, b) => a.length === b.length && a.every((x, i) => x === b[i]),
    parse: (r) => { const l = r.split(',').map((x) => x.trim()).filter(Boolean).slice(0, max); return l.length ? l : undefined; },
    format: (v) => v.join(','),
  }),
};

export type Fields = Record<string, Field<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type StateOf<F extends Fields> = { [K in keyof F]: F[K] extends Field<infer T> ? T : never };

export interface Schema<F extends Fields = Fields> {
  /** Which screen owns the vocabulary ("player", "stat", …). */
  screen: string;
  /** The current vocabulary version. */
  version: number;
  fields: F;
  /** `migrations[n]` rewrites a version-n query into version n+1 (renames, re-coded values, dropped parameters). */
  migrations?: Record<number, (q: URLSearchParams) => URLSearchParams>;
}

export const defineSchema = <F extends Fields>(s: Schema<F>): Schema<F> => s;

const toParams = (search: string | URLSearchParams) => new URLSearchParams(typeof search === 'string' ? search : search.toString());

/** Bring any address's query up to the schema's current version. Missing `v` with parameters present is version 0. */
export function migrateQuery(schema: Schema, search: string | URLSearchParams): { query: URLSearchParams; from: number; future: boolean } {
  let q = toParams(search);
  const raw = q.get(VERSION_PARAM);
  const parsed = raw == null ? (q.size ? 0 : schema.version) : Number(raw);
  const from = Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  if (from > schema.version) return { query: q, from, future: true };
  for (let v = from; v < schema.version; v++) {
    const step = schema.migrations?.[v];
    if (step) q = step(new URLSearchParams(q));
  }
  q.delete(VERSION_PARAM);
  return { query: q, from, future: false };
}

export function decode<F extends Fields>(schema: Schema<F>, search: string | URLSearchParams): StateOf<F> {
  const { query } = migrateQuery(schema, search);
  const out: Record<string, unknown> = {};
  for (const [k, field] of Object.entries(schema.fields)) {
    const raw = query.get(k);
    const v = raw == null ? undefined : field.parse(raw);
    out[k] = v === undefined ? field.def : v;
  }
  return out as StateOf<F>;
}

/** The query string for `state` merged onto `base` (foreign parameters kept). Defaults are omitted; `v` is written only when a field is. */
export function encode<F extends Fields>(schema: Schema<F>, patch: Partial<StateOf<F>>, base: string | URLSearchParams = ''): string {
  const cur = decode(schema, base) as Record<string, unknown>;
  const next = { ...cur, ...patch } as Record<string, unknown>;
  const foreign = migrateQuery(schema, base).query;
  for (const k of Object.keys(schema.fields)) foreign.delete(k);
  const out = new URLSearchParams();
  const body: [string, string][] = [];
  for (const [k, field] of Object.entries(schema.fields)) {
    const v = next[k];
    if (v == null || field.same(v, field.def)) continue;
    const s = field.format(v);
    if (s !== '') body.push([k, s]);
  }
  if (body.length) { out.set(VERSION_PARAM, String(schema.version)); body.forEach(([k, v]) => out.set(k, v)); }
  [...foreign.keys()].sort().forEach((k) => foreign.getAll(k).forEach((v) => out.append(k, v)));
  const s = out.toString();
  return s ? `?${s}` : '';
}

/** Canonical form of an address's query: legacy vocabulary migrated, invalid values dropped, deterministic order. */
export const canonicalSearch = <F extends Fields>(schema: Schema<F>, search: string): string => encode(schema, {}, search);

// --------------------------------------------------------------------------- the registry (which schema owns which path)

const registry: { test: RegExp; schema: Schema }[] = [];
export function registerSchema(test: RegExp, schema: Schema) {
  const i = registry.findIndex((r) => r.schema.screen === schema.screen);
  if (i >= 0) registry[i] = { test, schema }; else registry.push({ test, schema });
}
export const schemaForPath = (path: string): Schema | null => registry.find((r) => r.test.test(path))?.schema ?? null;

/** An in-app route ("/v3/player/nfl/x?stat=rec") brought to its canonical, current-version form. Unknown screens pass through. */
export function canonicalRoute(route: string): string {
  const q = route.indexOf('?');
  const path = q < 0 ? route : route.slice(0, q);
  const schema = schemaForPath(path);
  if (!schema) return route;
  return `${path}${canonicalSearch(schema, q < 0 ? '' : route.slice(q + 1))}`;
}

// --------------------------------------------------------------------------- React

export interface UpdateOptions {
  /** Add a history entry (a durable step the viewer would expect Back to undo). Default: replace, so Back leaves the screen. */
  push?: boolean;
}

/** Apply `patch` (a null/empty value removes the parameter) to the current address. Same history and sheet rules as `useRouteState`. */
export type QueryPatch = Record<string, string | null | undefined>;
export function useQueryPatch(): (patch: QueryPatch | ((cur: URLSearchParams) => URLSearchParams), o?: UpdateOptions) => void {
  const loc = useLocation();
  const nav = useNavigate();
  // The address is read at call time (never a render's closure): a sheet's callbacks outlive the render that created them, and
  // several updates in one event handler must compose.
  const live = useRef({ loc, nav, search: loc.search, key: loc.key });
  if (live.current.key !== loc.key || live.current.search !== loc.search) live.current.search = loc.search;
  live.current.key = loc.key; live.current.loc = loc; live.current.nav = nav;
  const apply = useRef<(patch: QueryPatch | ((cur: URLSearchParams) => URLSearchParams), o?: UpdateOptions) => void>(() => {});
  apply.current = (patch, o) => {
    const { loc: l, nav: go } = live.current;
    let q = new URLSearchParams(live.current.search);
    if (typeof patch === 'function') q = patch(q);
    else for (const [k, v] of Object.entries(patch)) { if (v == null || v === '') q.delete(k); else q.set(k, v); }
    const search = q.toString() ? `?${q}` : '';
    live.current.search = search;
    go({ pathname: l.pathname, search }, { replace: !o?.push, state: l.state, preventScrollReset: true });
  };
  return useCallback((patch, o) => {
    const inSheet = !!(live.current.loc.state as Record<string, unknown> | null)?.v3sheet;
    // From inside a sheet the change belongs to the screen underneath: close the sheet, then apply it there.
    if (inSheet && sheetBridge.afterClose(() => apply.current(patch, o))) return;
    apply.current(patch, o);
  }, []);
}

/**
 * The screen's state, read from and written to the address.
 * Updates replace the current entry by default: tabs, windows, lines, filters, sorts and typed text never pile up in history,
 * so Back returns to the previous screen exactly as it was left (its entry holds its own state).
 */
export function useRouteState<F extends Fields>(schema: Schema<F>): [StateOf<F>, (patch: Partial<StateOf<F>>, o?: UpdateOptions) => void] {
  const loc = useLocation();
  const patch = useQueryPatch();
  const state = useMemo(() => decode(schema, loc.search), [schema, loc.search]);
  const update = useCallback((p: Partial<StateOf<F>>, o?: UpdateOptions) => patch((cur) => new URLSearchParams(encode(schema, p, cur).replace(/^\?/, '')), o), [patch, schema]);
  return [state, update];
}
