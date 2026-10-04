// The read-only quote relay: allow-listed reads only, CORS for Sift only, no Origin upstream,
// observation time stamped, edge sharing, 429 passed through.
import { describe, expect, it } from 'vitest';
import * as vercel from '../relay/api/markets';
import { handleRelay, MAX_TICKERS, MemoryRelayCache, parseOrigins } from '../relay/core';
import relay, { upstreamUrl, UPSTREAM } from '../relay/kalshi-quote-relay';

const SIFT = 'https://chmoses98.github.io';
const req = (path: string, init: RequestInit & { origin?: string | null } = {}) =>
  new Request(`https://relay.test${path}`, { ...init, headers: init.origin === null ? {} : { Origin: init.origin ?? SIFT } });

function upstreamFake(calls: { url: string; headers: Headers }[], status = 200) {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: new Headers(init?.headers) });
    return new Response(JSON.stringify({ markets: [], cursor: '' }), { status, headers: { 'content-type': 'application/json', date: 'Sun, 04 Oct 2026 15:00:10 GMT', age: '3', ...(status === 429 ? { 'retry-after': '12' } : {}) } });
  }) as typeof fetch;
}

class MemCache {
  m = new Map<string, Response>();
  async match(r: Request) {
    return this.m.get(r.url)?.clone();
  }
  async put(r: Request, res: Response) {
    this.m.set(r.url, res);
  }
}

describe('quote relay', () => {
  it('forwards an allowed read without an Origin and answers with CORS for Sift', async () => {
    const calls: { url: string; headers: Headers }[] = [];
    const res = await relay.fetch(req('/markets?tickers=KXNFLGAME-26OCT04NEBUF-BUF,KXNFLGAME-26OCT04NEBUF-NE&limit=1000'), {}, undefined, { fetchImpl: upstreamFake(calls), cache: null });
    expect(res.status).toBe(200);
    expect(calls[0].url).toBe(`${UPSTREAM}/markets?tickers=KXNFLGAME-26OCT04NEBUF-BUF%2CKXNFLGAME-26OCT04NEBUF-NE&limit=1000`);
    expect(calls[0].headers.get('origin')).toBeNull();
    expect(res.headers.get('access-control-allow-origin')).toBe(SIFT);
    expect(res.headers.get('access-control-expose-headers')).toBe('X-Sift-Observed-At, Retry-After');
    expect(res.headers.get('x-sift-observed-at')).toBe('2026-10-04T15:00:07.000Z');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it.each([
    ['/portfolio/orders', 'no trading endpoints'],
    ['/markets/KXNFLGAME-26OCT04NEBUF-BUF/orderbook', 'only /markets'],
    ['/markets?limit=10', 'needs a ticker, event or series'],
    ['/markets?tickers=a;drop', 'ticker syntax'],
    ['/markets?tickers=A&api_key=x', 'unknown parameter'],
    ['/markets?series_ticker=KXNFLGAME&limit=5000', 'limit'],
  ])('refuses %s (%s)', async (path) => {
    const res = await relay.fetch(req(path), {}, undefined, { fetchImpl: upstreamFake([]), cache: null });
    expect(res.status).toBe(400);
  });

  it('refuses more than 100 tickers', () => {
    const many = Array.from({ length: 101 }, (_, i) => `T-${i}`).join(',');
    expect(upstreamUrl(new URL(`https://r/markets?tickers=${many}`))).toBeNull();
  });

  it('is not an open proxy: other origins get 403; writes get 405', async () => {
    expect((await relay.fetch(req('/markets?series_ticker=KXNFLGAME', { origin: 'https://evil.example' }), {}, undefined, { fetchImpl: upstreamFake([]), cache: null })).status).toBe(403);
    expect((await relay.fetch(req('/markets?series_ticker=KXNFLGAME', { method: 'POST' }), {}, undefined, { fetchImpl: upstreamFake([]), cache: null })).status).toBe(405);
    expect((await relay.fetch(req('/markets?series_ticker=KXNFLGAME', { method: 'OPTIONS' }), {}, undefined, { cache: null })).status).toBe(204);
  });

  it('shares identical reads at the edge', async () => {
    const calls: { url: string; headers: Headers }[] = [];
    const cache = new MemCache() as unknown as Cache;
    for (let i = 0; i < 3; i++) await relay.fetch(req('/markets?event_ticker=KXNFLSPREAD-26OCT04NEBUF'), {}, undefined, { fetchImpl: upstreamFake(calls), cache });
    expect(calls).toHaveLength(1);
  });

  it('passes a 429 through with Retry-After and never caches it', async () => {
    const res = await relay.fetch(req('/markets?series_ticker=KXNFLGAME'), {}, undefined, { fetchImpl: upstreamFake([], 429), cache: new MemCache() as unknown as Cache });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('12');
  });
});

// The same relay on Vercel (relay/api/markets.ts): the host Sift now uses, because Kalshi rate-limits
// Cloudflare Workers' shared egress. Every check runs through the exported route handlers.

const OK_BODY = JSON.stringify({ markets: [{ ticker: 'KXNFLGAME-26OCT04NEBUF-BUF', yes_bid_dollars: '0.5100' }], cursor: '' });
function kalshi(status = 200, body = OK_BODY, extra: Record<string, string> = {}) {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    return new Response(body, { status, headers: { 'content-type': 'application/json', date: 'Sun, 04 Oct 2026 15:00:10 GMT', ...extra } });
  }) as typeof fetch;
  return { f, calls };
}
const vreq = (path: string, origin: string | null = SIFT, method = 'GET') => new Request(`https://sift-quote-relay.vercel.app${path}`, { method, headers: origin ? { Origin: origin } : {} });

describe('quote relay on Vercel', () => {
  it('serves /markets (rewrite) and /api/markets with CORS for Sift and the real observation time', async () => {
    const real = globalThis.fetch;
    const k = kalshi(200, OK_BODY, { age: '2' });
    globalThis.fetch = k.f;
    try {
      for (const path of ['/markets?series_ticker=KXNFLGAME&status=open&limit=2', '/api/markets?series_ticker=KXNFLTOTAL&status=open&limit=2']) {
        const res = await vercel.GET(vreq(path));
        expect(res.status).toBe(200);
        expect(res.headers.get('access-control-allow-origin')).toBe(SIFT);
        expect(res.headers.get('x-sift-observed-at')).toBe('2026-10-04T15:00:08.000Z');
        expect(((await res.json()) as { markets: unknown[] }).markets).toHaveLength(1);
      }
      expect(k.calls.every((u) => u.startsWith(`${UPSTREAM}/markets?`))).toBe(true);
    } finally {
      globalThis.fetch = real;
    }
  });

  it('answers the CORS preflight for Sift, and only for Sift', async () => {
    const ok = await vercel.OPTIONS(vreq('/markets?series_ticker=KXNFLGAME', SIFT, 'OPTIONS'));
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(SIFT);
    expect(ok.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
    expect(ok.headers.get('access-control-expose-headers')).toContain('Retry-After');
    const bad = await vercel.OPTIONS(vreq('/markets?series_ticker=KXNFLGAME', 'https://evil.example', 'OPTIONS'));
    expect(bad.status).toBe(403);
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('is read-only: every write method is refused before anything goes upstream', async () => {
    for (const [m, h] of [['POST', vercel.POST], ['PUT', vercel.PUT], ['PATCH', vercel.PATCH], ['DELETE', vercel.DELETE]] as const) {
      expect((await h(vreq('/markets?series_ticker=KXNFLGAME', SIFT, m))).status).toBe(405);
    }
  });

  it.each(['/portfolio/balance', '/portfolio/orders', '/markets/X/orderbook', '/exchange/status', '/events?series_ticker=KXNFLGAME', '/markets?tickers=A&api_key=x'])('refuses %s', async (path) => {
    expect((await vercel.GET(vreq(path))).status).toBe(400);
  });

  it(`allows exactly ${MAX_TICKERS} tickers in one read and refuses ${MAX_TICKERS + 1}`, async () => {
    const k = kalshi();
    const t = (n: number) => Array.from({ length: n }, (_, i) => `KXNFLGAME-26OCT04NEBUF-T${i}`).join(',');
    expect((await handleRelay(vreq(`/markets?tickers=${t(MAX_TICKERS)}`), { fetchImpl: k.f })).status).toBe(200);
    expect((await handleRelay(vreq(`/markets?tickers=${t(MAX_TICKERS + 1)}`), { fetchImpl: k.f })).status).toBe(400);
    expect(k.calls).toHaveLength(1);
  });

  it('passes Kalshi 429 through with Retry-After readable by the browser, and does not cache it', async () => {
    const k = kalshi(429, '{"error":{"code":"too_many_requests","message":"too many requests"}}', { 'retry-after': '7' });
    const cache = new MemoryRelayCache();
    for (let i = 0; i < 2; i++) {
      const res = await handleRelay(vreq('/markets?series_ticker=KXNFLGAME'), { fetchImpl: k.f, cache });
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('7');
      expect(res.headers.get('access-control-expose-headers')).toContain('Retry-After');
      expect(await res.text()).toContain('too_many_requests');
    }
    expect(k.calls).toHaveLength(2);
  });

  it('answers 502 for a malformed upstream answer and never caches it', async () => {
    const cache = new MemoryRelayCache();
    for (const body of ['<html>gateway</html>', '{"no":"markets"}']) {
      const k = kalshi(200, body);
      const res = await handleRelay(vreq(`/markets?series_ticker=${body.length}`), { fetchImpl: k.f, cache });
      expect(res.status).toBe(502);
      expect(res.headers.get('access-control-allow-origin')).toBe(SIFT);
      expect(await res.json()).toEqual({ error: 'upstream returned malformed market data' });
    }
  });

  it('answers 502/504 with CORS when Kalshi is unreachable or slow (so Sift can fall back)', async () => {
    const down = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
    const slow = (async () => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); }) as typeof fetch;
    const a = await handleRelay(vreq('/markets?series_ticker=KXNFLGAME'), { fetchImpl: down });
    const b = await handleRelay(vreq('/markets?series_ticker=KXNFLGAME'), { fetchImpl: slow });
    expect([a.status, b.status]).toEqual([502, 504]);
    expect(a.headers.get('access-control-allow-origin')).toBe(SIFT);
  });

  it('shares identical reads for 5 s and keeps the original observation time (true quote age)', async () => {
    let t = Date.parse('2026-10-04T15:00:12Z');
    const now = () => t;
    const k = kalshi(200, OK_BODY, { age: '1' });
    const cache = new MemoryRelayCache(5_000, now);
    const r1 = await handleRelay(vreq('/markets?event_ticker=KXNFLSPREAD-26OCT04NEBUF'), { fetchImpl: k.f, cache, now });
    t += 4_000;
    const r2 = await handleRelay(vreq('/markets?event_ticker=KXNFLSPREAD-26OCT04NEBUF'), { fetchImpl: k.f, cache, now });
    expect(k.calls).toHaveLength(1);
    expect(r2.headers.get('x-sift-observed-at')).toBe(r1.headers.get('x-sift-observed-at'));
    expect(r2.headers.get('x-sift-observed-at')).toBe('2026-10-04T15:00:09.000Z');
    t += 2_000;
    await handleRelay(vreq('/markets?event_ticker=KXNFLSPREAD-26OCT04NEBUF'), { fetchImpl: k.f, cache, now });
    expect(k.calls).toHaveLength(2);
  });

  it('coalesces concurrent identical reads into one upstream call', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      await gate;
      return new Response(OK_BODY, { status: 200, headers: { date: 'Sun, 04 Oct 2026 15:00:10 GMT' } });
    }) as typeof fetch;
    const all = Promise.all(Array.from({ length: 5 }, () => handleRelay(vreq('/markets?series_ticker=KXNFLCOALESCE'), { fetchImpl: f })));
    release();
    const res = await all;
    expect(calls).toHaveLength(1);
    for (const r of res) expect(((await r.json()) as { markets: unknown[] }).markets).toHaveLength(1);
  });

  it('takes allowed origins from configuration, defaulting to Sift and local dev', () => {
    expect(parseOrigins(undefined)).toContain(SIFT);
    expect(parseOrigins('https://a.example, https://b.example')).toEqual(['https://a.example', 'https://b.example']);
  });
});
