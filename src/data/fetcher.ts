// One JSON reader for every published RESEARCH document. Requests are de-duplicated and memoised so
// moving back and forth through the research graph never re-downloads a document; after
// RESEARCH_REVALIDATE_MS a document is re-read in the background (stale-while-revalidate), so a
// long-lived PWA session picks up a newer publication without a reload. A failed re-read keeps the
// copy already shown. (The service worker adds the cross-session cache.)
//
// Executable market quotes NEVER go through here: they live on their own clock in src/live/.

export class NotFoundError extends Error {
  constructor(public url: string) {
    super(`not published: ${url}`);
    this.name = 'NotFoundError';
  }
}

export class SchemaVersionError extends Error {
  constructor(public url: string, public found: unknown) {
    super(`unsupported schema_version ${String(found)} at ${url}`);
    this.name = 'SchemaVersionError';
  }
}

type FetchJson = (url: string) => Promise<unknown>;

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (res.status === 404) throw new NotFoundError(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** The research clock's in-session revalidation period. */
export const RESEARCH_REVALIDATE_MS = 10 * 60 * 1000;

let impl: FetchJson = defaultFetchJson;
let clock: () => number = Date.now;
const inflight = new Map<string, Promise<unknown>>();
const settled = new Map<string, unknown>();
const settledAt = new Map<string, number>();

/** Tests swap in a disk reader; the app never calls this. */
export function setFetchJson(fn: FetchJson | null, now?: () => number): void {
  impl = fn ?? defaultFetchJson;
  clock = now ?? Date.now;
  inflight.clear();
  settled.clear();
  settledAt.clear();
}

/** True when a memoised document is older than the research revalidation period. */
export function isStale(url: string): boolean {
  const at = settledAt.get(url);
  return at != null && clock() - at > RESEARCH_REVALIDATE_MS;
}

export function peekJson<T>(url: string): T | undefined {
  return settled.get(url) as T | undefined;
}

export function getJson<T>(url: string): Promise<T> {
  const hit = inflight.get(url);
  if (hit && !isStale(url)) return hit as Promise<T>;
  const previous = hit && settled.has(url) ? settled.get(url) : undefined;
  const p = impl(url).then(
    (doc) => {
      const v = (doc as { schema_version?: unknown } | null)?.schema_version;
      // A consumer rejects any other version rather than rendering it (app contract §2).
      if (v !== undefined && v !== 'edge_finder.app.v1') throw new SchemaVersionError(url, v);
      settled.set(url, doc);
      settledAt.set(url, clock());
      return doc;
    },
    (err) => {
      if (previous !== undefined) {
        // Revalidation failed (offline, publication mid-update): keep serving what we had, and
        // try again only after another revalidation period.
        settledAt.set(url, clock());
        inflight.set(url, Promise.resolve(previous));
        return previous;
      }
      inflight.delete(url);
      throw err;
    },
  );
  p.catch(() => {
    if (inflight.get(url) === p) inflight.delete(url);
  });
  inflight.set(url, p);
  return p as Promise<T>;
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
