// Sift's read-only Kalshi quote relay (Cloudflare Worker, free tier).
//
// Why it exists: Kalshi's public market-data API refuses any request carrying a browser Origin other
// than https://kalshi.com (HTTP 403, no CORS headers; measured 2026-10-04 by scripts/kalshi-probe.mjs).
// A browser always sends Origin, so Sift on GitHub Pages cannot read quotes directly. This worker
// forwards the same public GET without an Origin and answers with CORS for Sift only.
//
// What it is NOT: it holds no credential (the data is public), it forwards only GET /markets with an
// allow-listed set of parameters, it is not an open proxy (unknown origins get 403), and it cannot
// reach any order, portfolio or account endpoint.
//
// Deploy: see relay/README.md (one `npx wrangler deploy`), then set the repository variable
// SIFT_QUOTE_RELAY_URL to the worker URL and redeploy Sift.

export const UPSTREAM = 'https://api.elections.kalshi.com/trade-api/v2';
export const ALLOWED_ORIGINS = ['https://chmoses98.github.io', 'http://localhost:4173', 'http://localhost:5173'];
/** Identical requests from every Sift user within this window share one upstream call. */
export const EDGE_CACHE_SECONDS = 5;

const TICKER = /^[A-Z0-9][A-Z0-9._-]{0,80}$/;
const STATUSES = new Set(['open', 'closed', 'settled', 'unopened', 'paused']);

interface Env {
  ALLOWED_ORIGINS?: string;
}

function cors(origin: string | null, allowed: string[]): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin' };
  if (origin && allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    h['Access-Control-Expose-Headers'] = 'X-Sift-Observed-At';
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
      if (!ts.length || ts.length > 100 || !ts.every((t) => TICKER.test(t))) return null;
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

export function observedAtFrom(res: Response, fallbackMs: number): string {
  const d = Date.parse(res.headers.get('date') ?? '');
  const age = Number(res.headers.get('age') ?? 0);
  return new Date(Number.isNaN(d) ? fallbackMs : d - (Number.isFinite(age) ? age * 1000 : 0)).toISOString();
}

export default {
  async fetch(request: Request, env: Env = {}, ctx?: { waitUntil(p: Promise<unknown>): void }, deps: { fetchImpl?: typeof fetch; cache?: Cache | null; now?: () => number } = {}): Promise<Response> {
    const allowed = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()) : ALLOWED_ORIGINS;
    const origin = request.headers.get('Origin');
    const h = cors(origin, allowed);
    if (origin && !allowed.includes(origin)) return deny(403, 'origin not allowed', h);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (request.method !== 'GET') return deny(405, 'read-only relay: GET only', h);
    const target = upstreamUrl(new URL(request.url));
    if (!target) return deny(400, 'only GET /markets with tickers (<=100), event_ticker or series_ticker', h);

    const fetchImpl = deps.fetchImpl ?? fetch;
    const now = deps.now ?? Date.now;
    const cache = deps.cache !== undefined ? deps.cache : ((globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null);
    const key = new Request(target);
    let upstream = cache ? await cache.match(key) : undefined;
    if (!upstream) {
      const res = await fetchImpl(target, { headers: { Accept: 'application/json', 'User-Agent': 'sift-quote-relay/1.0 (+https://github.com/chmoses98/sift-sports-intelligence)' } });
      const body = await res.text();
      upstream = new Response(body, {
        status: res.status,
        headers: {
          'content-type': res.headers.get('content-type') ?? 'application/json',
          'x-sift-observed-at': observedAtFrom(res, now()),
          'cache-control': `public, max-age=${EDGE_CACHE_SECONDS}`,
          ...(res.headers.get('retry-after') ? { 'retry-after': res.headers.get('retry-after')! } : {}),
        },
      });
      if (cache && res.ok) {
        const put = cache.put(key, upstream.clone());
        if (ctx) ctx.waitUntil(put);
        else await put;
      }
    }
    if (upstream.status === 429) {
      return new Response(await upstream.text(), { status: 429, headers: { ...h, 'retry-after': upstream.headers.get('retry-after') ?? '30', 'cache-control': 'no-store' } });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...h, 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'x-sift-observed-at': upstream.headers.get('x-sift-observed-at') ?? new Date(now()).toISOString(), 'cache-control': 'no-store' },
    });
  },
};
