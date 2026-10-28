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

/**
 * A bound on how long one research document may take (headers and body). OFF by default: SIFT 2.0 and classic keep their behaviour. SIFT 3.0 turns it
 * on while it is mounted (`setFetchTimeout`, src/v3/V3Root.tsx), so a request that never answers becomes an ordinary failure (an honest state with a
 * Retry) instead of a skeleton that never goes away. Quotes have their own clock and bounds (src/live/).
 */
let timeoutMs: number | null = null;
export const RESEARCH_FETCH_TIMEOUT_MS = 25_000;
export function setFetchTimeout(ms: number | null): void {
  timeoutMs = ms != null && ms > 0 ? ms : null;
}
export class FetchTimeoutError extends Error {
  constructor(public url: string, public ms: number) {
    super(`timed out after ${Math.round(ms / 1000)} s: ${url}`);
    this.name = 'FetchTimeoutError';
  }
}

/** Runs one request-and-read under the timeout (if one is set). The request is aborted at the bound, and the caller is released at the bound even if a body read ignores the abort. */
async function within<T>(url: string, run: (signal: AbortSignal | undefined) => Promise<T>): Promise<T> {
  if (timeoutMs == null) return run(undefined);
  const ms = timeoutMs;
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { ac.abort(); reject(new FetchTimeoutError(url, ms)); }, ms);
  });
  try {
    return await Promise.race([run(ac.signal), bound]);
  } catch (e) {
    if (e instanceof FetchTimeoutError) throw e;
    if (ac.signal.aborted) throw new FetchTimeoutError(url, ms);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function defaultFetchJson(url: string): Promise<unknown> {
  return within(url, async (signal) => {
    const res = await fetch(url, { cache: 'no-cache', signal });
    if (res.status === 404) throw new NotFoundError(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  });
}

/**
 * SIFT 3.0 asks "is this document published?" with a HEAD request (a few hundred bytes) instead of reading it (`documentExists`). OFF by default:
 * SIFT 2.0 and classic keep reading the document. Turned on by src/v3/V3Root.tsx while SIFT 3.0 is mounted, like the fetch bound above.
 */
let lightProbe = false;
export function setExistenceProbe(on: boolean): void {
  lightProbe = on;
}
/** True when `documentExists` is a HEAD request (SIFT 3.0, the browser's own fetch). */
export const existenceProbeIsLight = (): boolean => lightProbe && impl === defaultFetchJson;

/**
 * Resolves when the document is published, rejects with NotFoundError when it is not (any other failure rejects with an ordinary error).
 * Where a probe is allowed (SIFT 3.0, the browser's own fetch) this is a HEAD request: the source decision (src/data/source.ts) only needs to know
 * that a sport's explorer index exists, and the index of one league is 450 KB on the wire. Anywhere else (SIFT 2.0, tests that swap the reader) it
 * reads the document through `getJson`, validating its schema version as before. The document itself is still read, once, by the screen that needs it.
 */
export async function documentExists(url: string): Promise<void> {
  if (!existenceProbeIsLight()) {
    await getJson(url);
    return;
  }
  const headOnly = await within(url, async (signal) => {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-cache', signal });
    if (res.status === 404) throw new NotFoundError(url);
    // A host or proxy that does not answer HEAD says so (405/501): then the document is read, as everywhere else.
    if (res.status === 405 || res.status === 501) return false;
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return true;
  });
  if (!headOnly) await getJson(url);
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

/**
 * Drop a memoised document (its parsed JSON can be megabytes). A reader that took what it needs from a document it will not open again
 * (Prop Discovery reading games far beyond the initial horizon) lets it go; asking for the url later simply reads it again.
 */
export function forgetJson(url: string): void {
  inflight.delete(url);
  settled.delete(url);
  settledAt.delete(url);
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

// ---- raw text (integrity-checked documents)
//
// A document whose publisher binds it by the sha256 of its bytes (the CFB Script Engine research sidecar) is
// read as text, so the digest is checked over exactly what was served before it is parsed.

type FetchText = (url: string) => Promise<string>;

async function defaultFetchText(url: string): Promise<string> {
  return within(url, async (signal) => {
    const res = await fetch(url, { cache: 'no-cache', signal });
    if (res.status === 404) throw new NotFoundError(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
  });
}

let textImpl: FetchText = defaultFetchText;
const textInflight = new Map<string, Promise<string>>();

/** Tests swap in a disk reader; the app never calls this. */
export function setFetchText(fn: FetchText | null): void {
  textImpl = fn ?? defaultFetchText;
  textInflight.clear();
}

/** Memoised per session; a failure is not memoised, so the next read retries. */
export function getText(url: string): Promise<string> {
  const hit = textInflight.get(url);
  if (hit) return hit;
  const p = textImpl(url);
  p.catch(() => {
    if (textInflight.get(url) === p) textInflight.delete(url);
  });
  textInflight.set(url, p);
  return p;
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
