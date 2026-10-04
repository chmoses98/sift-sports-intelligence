// The read-only quote relay: allow-listed reads only, CORS for Sift only, no Origin upstream,
// observation time stamped, edge sharing, 429 passed through.
import { describe, expect, it } from 'vitest';
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
    expect(res.headers.get('access-control-expose-headers')).toBe('X-Sift-Observed-At');
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
