// Sift's read-only Kalshi quote relay: the host-neutral core. The Vercel function (api/markets.ts) and
// the original Cloudflare Worker (kalshi-quote-relay.ts) are thin adapters over handleRelay().
//
// Why a relay exists: Kalshi's public market-data API refuses any request carrying a browser Origin
// other than https://kalshi.com (HTTP 403, no CORS headers; measured 2026-10-04 by
// scripts/kalshi-probe.mjs). A browser always sends Origin, so Sift on GitHub Pages cannot read quotes
// directly. The relay forwards the same public GET without an Origin and answers with CORS for Sift only.
//
// What it is NOT: it holds no credential (the data is public), it forwards only GET /markets with an
// allow-listed set of parameters, it is not an open proxy (unknown origins get 403), and it cannot
// reach any order, portfolio or account endpoint.

export const UPSTREAM = 'https://api.elections.kalshi.com/trade-api/v2';
export const ALLOWED_ORIGINS = ['https://chmoses98.github.io', 'http://localhost:4173', 'http://localhost:5173'];
/** Identical requests from every Sift user within this window share one upstream call. */
export const EDGE_CACHE_SECONDS = 5;
/** Kalshi's own limit for one request (and Sift's batch size). */
export const MAX_TICKERS = 100;
/** Past this the relay answers 504 and Sift falls back to the quote feed. */
export const UPSTREAM_TIMEOUT_MS = 8_000;
const USER_AGENT = 'sift-quote-relay/1.0 (+https://github.com/chmoses98/sift-sports-intelligence)';

const TICKER = /^[A-Z0-9][A-Z0-9._-]{0,80}$/;
const STATUSES = new Set(['open', 'closed', 'settled', 'unopened', 'paused']);

/** Where shared upstream answers live: the edge cache on Cloudflare, process memory on Vercel. */
export interface RelayCache {
  get(key: string): Promise<Response | undefined>;
  put(key: string, res: Response): Promise<void>;
}

export interface RelayOptions {
  allowedOrigins?: string[];
  fetchImpl?: typeof fetch;
  cache?: RelayCache | null;
  now?: () => number;
  /** Lets the response go out before a cache write finishes (Cloudflare ctx.waitUntil). */
  waitUntil?: (p: Promise<unknown>) => void;
}

export function parseOrigins(csv: string | undefined): string[] {
  const list = (csv ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : ALLOWED_ORIGINS;
}

function cors(origin: string | null, allowed: string[]): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin' };
  if (origin && allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    // Retry-After is not CORS-safelisted: without this the browser cannot honour a 429's back-off.
    h['Access-Control-Expose-Headers'] = 'X-Sift-Observed-At, Retry-After';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

const deny = (status: number, msg: string, headers: Record<string, string>) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: { ...headers, 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** Validate and normalise the query; null = refuse. */
export function upstreamUrl(url: URL): string | null {
  if (!/\/markets\/?$/.test(url.pathname)) return null;
  const out = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (k === 'tickers') {
      const ts = v.split(',').filter(Boolean);
      if (!ts.length || ts.length > MAX_TICKERS || !ts.every((t) => TICKER.test(t))) return null;
      out.set('tickers', ts.join(','));
    } else if (k === 'event_ticker' || k === 'series_ticker') {
      if (!TICKER.test(v)) return null;
      out.set(k, v);
    } else if (k === 'status') {
      if (!STATUSES.has(v)) return null;
      out.set(k, v);
    } else if (k === 'limit') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 1000) return null;
      out.set(k, String(n));
    } else if (k === 'cursor') {
      if (v.length > 512) return null;
      out.set(k, v);
    } else {
      return null;
    }
  }
  if (!out.has('tickers') && !out.has('event_ticker') && !out.has('series_ticker')) return null;
  return `${UPSTREAM}/markets?${out.toString()}`;
}

/** When Kalshi produced this answer: its Date minus any cache Age. Never "now" for an old answer. */
export function observedAtFrom(res: Response, fallbackMs: number): string {
  const d = Date.parse(res.headers.get('date') ?? '');
  const age = Number(res.headers.get('age') ?? 0);
  return new Date(Number.isNaN(d) ? fallbackMs : d - (Number.isFinite(age) ? age * 1000 : 0)).toISOString();
}

/** A 2xx that is not a market listing is an upstream fault, not data: never cached, never forwarded. */
function isMarketListing(body: string): boolean {
  try {
    const j = JSON.parse(body) as { markets?: unknown };
    return Array.isArray(j?.markets);
  } catch {
    return false;
  }
}

async function fromUpstream(target: string, o: RelayOptions, now: () => number): Promise<Response> {
  const fetchImpl = o.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(target, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return new Response(JSON.stringify({ error: timeout ? 'upstream timed out' : 'upstream unreachable' }), { status: timeout ? 504 : 502, headers: { 'content-type': 'application/json' } });
  }
  const body = await res.text();
  if (res.ok && !isMarketListing(body)) {
    return new Response(JSON.stringify({ error: 'upstream returned malformed market data' }), { status: 502, headers: { 'content-type': 'application/json' } });
  }
  return new Response(body, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
      'x-sift-observed-at': observedAtFrom(res, now()),
      ...(res.headers.get('retry-after') ? { 'retry-after': res.headers.get('retry-after')! } : {}),
    },
  });
}

/** Identical reads already on their way upstream (one process): later callers share that answer. */
const inflight = new Map<string, Promise<Response>>();

export async function handleRelay(request: Request, o: RelayOptions = {}): Promise<Response> {
  const allowed = o.allowedOrigins ?? ALLOWED_ORIGINS;
  const origin = request.headers.get('Origin');
  const h = cors(origin, allowed);
  if (origin && !allowed.includes(origin)) return deny(403, 'origin not allowed', h);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (request.method !== 'GET') return deny(405, 'read-only relay: GET only', h);
  const target = upstreamUrl(new URL(request.url));
  if (!target) return deny(400, `only GET /markets with tickers (<=${MAX_TICKERS}), event_ticker or series_ticker`, h);

  const now = o.now ?? Date.now;
  const cache = o.cache ?? null;
  let upstream = cache ? await cache.get(target) : undefined;
  if (!upstream) {
    let pending = inflight.get(target);
    const first = !pending;
    if (!pending) {
      pending = fromUpstream(target, o, now).finally(() => inflight.delete(target));
      inflight.set(target, pending);
    }
    upstream = (await pending).clone();
    if (first && cache && upstream.ok) {
      const put = cache.put(target, upstream.clone());
      if (o.waitUntil) o.waitUntil(put);
      else await put;
    }
  }
  if (upstream.status === 429) {
    // Kalshi's rate limit, surfaced as-is so Sift backs off and falls back to the quote feed.
    return new Response(await upstream.text(), { status: 429, headers: { ...h, 'content-type': 'application/json', 'retry-after': upstream.headers.get('retry-after') ?? '30', 'cache-control': 'no-store' } });
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { ...h, 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'x-sift-observed-at': upstream.headers.get('x-sift-observed-at') ?? new Date(now()).toISOString(), 'cache-control': 'no-store' },
  });
}

/**
 * Process-memory cache for hosts without an edge cache (Vercel). Answers live EDGE_CACHE_SECONDS and
 * keep their original X-Sift-Observed-At, so a shared answer is never younger than Kalshi made it.
 */
export class MemoryRelayCache implements RelayCache {
  private m = new Map<string, { until: number; status: number; headers: [string, string][]; body: string }>();
  constructor(private ttlMs = EDGE_CACHE_SECONDS * 1000, private now: () => number = Date.now, private max = 500) {}

  async get(key: string) {
    const e = this.m.get(key);
    if (!e) return undefined;
    if (e.until <= this.now()) {
      this.m.delete(key);
      return undefined;
    }
    return new Response(e.body, { status: e.status, headers: e.headers });
  }

  async put(key: string, res: Response) {
    if (this.m.size >= this.max) for (const [k, e] of this.m) if (e.until <= this.now() || this.m.size >= this.max) this.m.delete(k);
    this.m.set(key, { until: this.now() + this.ttlMs, status: res.status, headers: [...res.headers], body: await res.text() });
  }
}
