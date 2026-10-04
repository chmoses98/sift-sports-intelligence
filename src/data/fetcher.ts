// One JSON reader for every published document. Requests are de-duplicated and memoised for the
// session (the service worker adds the cross-session cache), so moving back and forth through the
// research graph never re-downloads a document.

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

let impl: FetchJson = defaultFetchJson;
const inflight = new Map<string, Promise<unknown>>();
const settled = new Map<string, unknown>();

/** Tests swap in a disk reader; the app never calls this. */
export function setFetchJson(fn: FetchJson | null): void {
  impl = fn ?? defaultFetchJson;
  inflight.clear();
  settled.clear();
}

export function peekJson<T>(url: string): T | undefined {
  return settled.get(url) as T | undefined;
}

export function getJson<T>(url: string): Promise<T> {
  const hit = inflight.get(url);
  if (hit) return hit as Promise<T>;
  const p = impl(url).then(
    (doc) => {
      const v = (doc as { schema_version?: unknown } | null)?.schema_version;
      // A consumer rejects any other version rather than rendering it (app contract §2).
      if (v !== undefined && v !== 'edge_finder.app.v1') throw new SchemaVersionError(url, v);
      settled.set(url, doc);
      return doc;
    },
    (err) => {
      inflight.delete(url);
      throw err;
    },
  );
  p.catch(() => inflight.delete(url));
  inflight.set(url, p);
  return p as Promise<T>;
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
