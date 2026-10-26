// The relay's `Date` header must be readable by the browser (CORS Access-Control-Expose-Headers) and present
// on every answer, because the quote-usability rule corrects a wrong device clock with it. See docs/relay-date/.
import { describe, expect, it } from 'vitest';
import * as vercel from '../relay/api/markets';
import { handleRelay, MemoryRelayCache } from '../relay/core';
import worker from '../relay/kalshi-quote-relay';

const SIFT = 'https://chmoses98.github.io';
const NOW = Date.parse('2026-10-26T18:00:30Z');
const NOW_DATE = 'Mon, 26 Oct 2026 18:00:30 GMT';
const OK = JSON.stringify({ markets: [{ ticker: 'KXNFLGAME-26OCT26AABB-AA' }], cursor: '' });
const Q = '/markets?series_ticker=KXNFLGAME&status=open&limit=2';
const rq = (path = Q, origin: string | null = SIFT, method = 'GET') => new Request(`https://relay.test${path}`, { method, headers: origin ? { Origin: origin } : {} });
const upstream = (status = 200, body = OK, extra: Record<string, string> = {}) => (async () => new Response(body, { status, headers: { 'content-type': 'application/json', date: 'Mon, 26 Oct 2026 18:00:10 GMT', ...extra } })) as typeof fetch;
const exposed = (res: Response) => (res.headers.get('access-control-expose-headers') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

describe('relay Date header: exposed to the browser', () => {
  it('the exposed list contains Date and still X-Sift-Observed-At and Retry-After, and nothing else', async () => {
    const res = await handleRelay(rq(), { fetchImpl: upstream(), now: () => NOW });
    expect(exposed(res).sort()).toEqual(['date', 'retry-after', 'x-sift-observed-at']);
  });
});

describe('relay Date header: every response path', () => {
  const opts = (over: Parameters<typeof handleRelay>[1] = {}) => ({ fetchImpl: upstream(), now: () => NOW, ...over });
  const cases: [string, () => Promise<Response>, number, boolean][] = [
    // [path, call, status, CORS-allowed origin (so the browser may read the exposed headers)]
    ['200 fresh from upstream', () => handleRelay(rq(), opts()), 200, true],
    ['200 from the shared cache', async () => {
      const cache = new MemoryRelayCache(5_000, () => NOW);
      await handleRelay(rq(), opts({ cache }));
      return handleRelay(rq(), opts({ cache, fetchImpl: upstream(500) })); // would be 500 if it reached upstream
    }, 200, true],
    ['429 passthrough', () => handleRelay(rq(), opts({ fetchImpl: upstream(429, '{"error":"slow"}', { 'retry-after': '7' }) })), 429, true],
    ['429 without upstream Retry-After', () => handleRelay(rq(), opts({ fetchImpl: upstream(429, '{}') })), 429, true],
    ['upstream 500 passed on', () => handleRelay(rq(), opts({ fetchImpl: upstream(500, '{"error":"x"}') })), 500, true],
    ['502 malformed upstream', () => handleRelay(rq(), opts({ fetchImpl: upstream(200, '<html>') })), 502, true],
    ['502 upstream unreachable', () => handleRelay(rq(), opts({ fetchImpl: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch })), 502, true],
    ['504 upstream timeout', () => handleRelay(rq(), opts({ fetchImpl: (async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); }) as typeof fetch })), 504, true],
    ['204 CORS preflight', () => handleRelay(rq(Q, SIFT, 'OPTIONS'), opts()), 204, true],
    ['400 refused query', () => handleRelay(rq('/portfolio/orders'), opts()), 400, true],
    ['405 write', () => handleRelay(rq(Q, SIFT, 'POST'), opts()), 405, true],
    ['403 disallowed origin', () => handleRelay(rq(Q, 'https://evil.example'), opts()), 403, false],
    ['403 disallowed origin preflight', () => handleRelay(rq(Q, 'https://evil.example', 'OPTIONS'), opts()), 403, false],
    ['200 with no Origin (curl, server to server)', () => handleRelay(rq(Q, null), opts()), 200, false],
  ];

  it.each(cases)('%s: Date from the relay clock; exposed to allowed origins only', async (_n, call, status, allowedOrigin) => {
    const res = await call();
    expect(res.status).toBe(status);
    expect(res.headers.get('date')).toBe(NOW_DATE);
    if (allowedOrigin) {
      expect(res.headers.get('access-control-allow-origin')).toBe(SIFT);
      expect(exposed(res)).toContain('date');
    } else {
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
      expect(res.headers.get('access-control-expose-headers')).toBeNull();
    }
  });

  it('Date is the relay clock, not Kalshi\'s (upstream Date stays only as the basis of X-Sift-Observed-At)', async () => {
    const res = await handleRelay(rq(), opts());
    expect(res.headers.get('date')).toBe(NOW_DATE);
    expect(res.headers.get('x-sift-observed-at')).toBe('2026-10-26T18:00:10.000Z');
  });

  it('a 429 still carries Retry-After and no-store alongside Date', async () => {
    const res = await handleRelay(rq(), opts({ fetchImpl: upstream(429, '{}', { 'retry-after': '7' }) }));
    expect(res.headers.get('retry-after')).toBe('7');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('uses the real server clock when no clock is injected', async () => {
    const before = Date.now() - 1000;
    const res = await handleRelay(rq(), { fetchImpl: upstream() });
    const d = Date.parse(res.headers.get('date') ?? '');
    expect(d).toBeGreaterThanOrEqual(before);
    expect(d).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('the Cloudflare Worker host and the Vercel host both go through the core', async () => {
    const w = await worker.fetch(rq(), {}, undefined, { fetchImpl: upstream(), cache: null, now: () => NOW });
    expect(w.headers.get('date')).toBe(NOW_DATE);
    expect(exposed(w)).toContain('date');
    const w2 = await worker.fetch(rq(Q, SIFT, 'OPTIONS'), {}, undefined, { cache: null, now: () => NOW });
    expect(w2.headers.get('date')).toBe(NOW_DATE);
    const real = globalThis.fetch;
    globalThis.fetch = upstream();
    try {
      for (const call of [() => vercel.GET(rq()), () => vercel.OPTIONS(rq(Q, SIFT, 'OPTIONS')), () => vercel.POST(rq(Q, SIFT, 'POST')), () => vercel.GET(rq(Q, 'https://evil.example'))]) {
        const res = await call();
        expect(res.headers.get('date')).not.toBeNull();
        expect(Number.isNaN(Date.parse(res.headers.get('date')!))).toBe(false);
      }
      const ok = await vercel.GET(rq());
      expect(exposed(ok)).toContain('date');
    } finally {
      globalThis.fetch = real;
    }
  });
});
