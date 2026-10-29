// The Date wrapper in relay/core.ts must (1) never throw or alter a Response it cannot alter, (2) stamp the relay's
// CURRENT clock at serve time on cached and shared answers while X-Sift-Observed-At keeps naming the original Kalshi
// observation, and (3) never leak one caller's Date or CORS headers into another caller's answer or into the stored
// copy. The full old-versus-new comparison lives in tests/relayDifferential.test.ts. See docs/relay-date/README.md.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { handleRelay, MemoryRelayCache, withRelayDate, type RelayCache } from '../relay/core';

const SIFT = 'https://chmoses98.github.io';
const LOCAL = 'http://localhost:5173';
const T0 = Date.parse('2026-10-26T18:00:30Z');
const UP_DATE = 'Mon, 26 Oct 2026 18:00:10 GMT'; // Kalshi's own clock when it answered
const OBSERVED = '2026-10-26T18:00:08.000Z'; // UP_DATE minus Age: 2
const LISTING = JSON.stringify({ markets: [{ ticker: 'KXNFLGAME-26OCT26AABB-AA' }], cursor: '' });
const Q = '/markets?series_ticker=KXNFLGAME&status=open&limit=2';
const rq = (origin: string | null = SIFT, method = 'GET', path = Q) => new Request(`https://relay.test${path}`, { method, headers: origin ? { Origin: origin } : {} });
const kalshi = (calls: { n: number }) => (async () => {
  calls.n++;
  return new Response(LISTING, { headers: { 'content-type': 'application/json', date: UP_DATE, age: '2' } });
}) as typeof fetch;
const utc = (ms: number) => new Date(ms).toUTCString();

describe('withRelayDate: never throws, never alters what it cannot alter', () => {
  const immutables: [string, () => Response][] = [
    ['Response.error()', () => Response.error()],
    ['Response.redirect()', () => Response.redirect('https://elsewhere.example/', 302)],
  ];

  it.each(immutables)('%s: headers.set throws TypeError in this runtime, and the wrapper still does not', (_n, make) => {
    expect(() => make().headers.set('date', 'x')).toThrow(TypeError); // precondition: this really is an immutable Headers
    expect(() => withRelayDate(make(), () => T0)).not.toThrow();
  });

  it('a redirect (immutable headers, valid status) is copied into a new Response with the Date added and everything else kept', () => {
    const src = Response.redirect('https://elsewhere.example/x', 302);
    const out = withRelayDate(src, () => T0);
    expect(out).not.toBe(src);
    expect(out.status).toBe(302);
    expect(out.headers.get('location')).toBe('https://elsewhere.example/x');
    expect(out.headers.get('date')).toBe(utc(T0));
    expect(src.headers.get('date')).toBeNull(); // the original is untouched
  });

  it('Response.error() (status 0 cannot be rebuilt) is returned as it is, without a Date and without throwing', () => {
    const src = Response.error();
    expect(withRelayDate(src, () => T0)).toBe(src);
  });

  it('a Response from a real fetch() (immutable headers, body unread) is copied; body, status and headers survive', async () => {
    const server = http.createServer((_q, res) => { res.writeHead(201, { 'content-type': 'application/json', 'x-keep': 'yes', date: UP_DATE }); res.end('{"a":1}'); });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const src = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
      expect(() => src.headers.set('date', 'x')).toThrow(TypeError);
      const out = withRelayDate(src, () => T0);
      expect(out.status).toBe(201);
      expect(out.headers.get('x-keep')).toBe('yes');
      expect(out.headers.get('content-type')).toBe('application/json');
      expect(out.headers.get('date')).toBe(utc(T0)); // replaces the upstream's own Date
      expect(await out.json()).toEqual({ a: 1 });
      // immutable AND its body already read: cannot be copied either, so it goes out as it is (no Date, no throw)
      const spent = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
      await spent.text();
      expect(withRelayDate(spent, () => T0)).toBe(spent);
      expect(spent.headers.get('date')).toBe(UP_DATE);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('a mutable Response is stamped in place; status, statusText, body and other headers untouched; any earlier Date is replaced', async () => {
    const src = new Response('body', { status: 418, statusText: 'teapot', headers: { 'content-type': 'text/plain', 'x-a': '1', date: 'Sat, 01 Jan 2000 00:00:00 GMT' } });
    const out = withRelayDate(src, () => T0);
    expect(out).toBe(src);
    expect([out.status, out.statusText, out.headers.get('x-a'), out.headers.get('content-type'), out.headers.get('date')]).toEqual([418, 'teapot', '1', 'text/plain', utc(T0)]);
    expect(await out.text()).toBe('body');
  });

  it('null-body statuses stay null-body', () => {
    for (const status of [204, 205, 304]) {
      const out = withRelayDate(new Response(null, { status }), () => T0);
      expect(out.status).toBe(status);
      expect(out.body).toBeNull();
      expect(out.headers.get('date')).toBe(utc(T0));
    }
  });

  it('a clock that throws or returns NaN/Infinity cannot make it throw (throwing: no Date, the host adds its own; non-finite: host wall clock)', () => {
    const boom = withRelayDate(new Response('x'), () => { throw new Error('clock'); });
    expect(boom.headers.get('date')).toBeNull();
    for (const bad of [NaN, Infinity, -Infinity]) {
      const d = Date.parse(withRelayDate(new Response('x'), () => bad).headers.get('date') ?? '');
      expect(Math.abs(d - Date.now())).toBeLessThan(2_000);
    }
  });

  it('a runtime that silently ignores headers.set on an immutable response (instead of throwing) is detected and the response copied', async () => {
    const src = new Response('x', { status: 200, headers: { 'content-type': 'text/plain' } });
    const real = src.headers;
    const ignoring = new Proxy(real, { get: (t, k) => (k === 'set' ? () => undefined : (typeof t[k as keyof Headers] === 'function' ? (t[k as 'get'] as (...a: unknown[]) => unknown).bind(t) : t[k as keyof Headers])) });
    Object.defineProperty(src, 'headers', { value: ignoring });
    const out = withRelayDate(src, () => T0);
    expect(out).not.toBe(src);
    expect(out.headers.get('date')).toBe(utc(T0));
    expect(await out.text()).toBe('x');
  });
});

describe('cached and shared answers: Date is the relay clock at serve time, X-Sift-Observed-At is the original observation', () => {
  type Mk = (clock: { t: number }) => RelayCache;
  const memory: Mk = (c) => new MemoryRelayCache(5_000, () => c.t);
  /** The Cloudflare Cache API shape: put keeps a copy, get returns a fresh copy. */
  const cloneCache: Mk = (c) => {
    const m = new Map<string, { until: number; res: Response }>();
    return { get: async (k) => { const e = m.get(k); return e && e.until > c.t ? e.res.clone() : undefined; }, put: async (k, r) => { m.set(k, { until: c.t + 5_000, res: r }); } };
  };

  for (const [name, mk] of [['MemoryRelayCache (Vercel)', memory], ['Cache-API style (Cloudflare)', cloneCache]] as [string, Mk][]) {
    it(`${name}: miss, then hits 1 s, 3 s and 4.9 s later, then expiry`, async () => {
      const clock = { t: T0 };
      const calls = { n: 0 };
      const opts = { fetchImpl: kalshi(calls), cache: mk(clock), now: () => clock.t };
      const seen: { date: string; observed: string; age: number }[] = [];
      for (const dt of [0, 1_000, 2_000, 1_900, 100]) {
        clock.t += dt;
        const res = await handleRelay(rq(), opts);
        expect(res.status).toBe(200);
        const date = res.headers.get('date')!;
        const observed = res.headers.get('x-sift-observed-at')!;
        seen.push({ date, observed, age: Date.parse(date) - Date.parse(observed) });
      }
      // calls: first (miss), 3 hits served from the cache, then the 5 s ttl has passed so one more upstream call
      expect(calls.n).toBe(2);
      expect(seen.map((s) => s.date)).toEqual([T0, T0 + 1_000, T0 + 3_000, T0 + 4_900, T0 + 5_000].map(utc)); // the relay clock at each serve, never the first answer's
      expect(seen.slice(0, 4).every((s) => s.observed === OBSERVED)).toBe(true); // the hit still names Kalshi's observation
      // the age a client computes (Date - observed) grows on every hit; it is never reset to "fresh"
      expect(seen.slice(0, 4).map((s) => s.age)).toEqual([22_000, 23_000, 25_000, 26_900].map((v) => Math.floor(v / 1000) * 1000));
      // the fifth call refetched: observation is again Kalshi's (the fake upstream answers with the same fixed Date), served at T0+5 s
      expect(seen[4].observed).toBe(OBSERVED);
      expect(seen[4].date).toBe(utc(T0 + 5_000));
    });

    it(`${name}: a hit for a different origin carries that origin's CORS headers and the current Date, and the first caller's are not stored`, async () => {
      const clock = { t: T0 };
      const opts = { fetchImpl: kalshi({ n: 0 }), cache: mk(clock), now: () => clock.t };
      const a = await handleRelay(rq(SIFT), opts);
      clock.t += 2_000;
      const b = await handleRelay(rq(LOCAL), opts);
      clock.t += 1_000;
      const c = await handleRelay(rq(null), opts);
      clock.t += 1_000;
      const d = await handleRelay(rq('https://evil.example'), opts);
      expect([a, b, c, d].map((r) => r.headers.get('access-control-allow-origin'))).toEqual([SIFT, LOCAL, null, null]);
      expect([a, b, c, d].map((r) => r.headers.get('date'))).toEqual([T0, T0 + 2_000, T0 + 3_000, T0 + 4_000].map(utc));
      expect(c.headers.get('access-control-expose-headers')).toBeNull();
      expect(c.headers.get('vary')).toBe('Origin');
      expect([b.status, c.status, d.status]).toEqual([200, 200, 403]);
      expect(await b.text()).toBe(LISTING);
    });
  }

  it('the stored copy is never touched: what the cache holds has no Date and no CORS header after serving several callers', async () => {
    const clock = { t: T0 };
    const stored: Response[] = [];
    const cache: RelayCache = {
      get: async () => stored[0]?.clone(),
      put: async (_k, r) => { stored.push(r); },
    };
    const opts = { fetchImpl: kalshi({ n: 0 }), cache, now: () => clock.t };
    await handleRelay(rq(SIFT), opts);
    for (const o of [SIFT, LOCAL, null]) { clock.t += 1_000; await handleRelay(rq(o), opts); }
    expect(stored).toHaveLength(1);
    const h = Object.fromEntries(stored[0].headers);
    expect(Object.keys(h).sort()).toEqual(['content-type', 'x-sift-observed-at']);
    expect(h['x-sift-observed-at']).toBe(OBSERVED);
  });

  it('concurrent callers share one upstream call but each gets its own Date and its own origin headers; nobody sees another caller\'s', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const calls = { n: 0 };
    const fetchImpl = (async () => { calls.n++; await gate; return new Response(LISTING, { headers: { 'content-type': 'application/json', date: UP_DATE, age: '2' } }); }) as typeof fetch;
    let tick = 0;
    const now = () => T0 + 1_000 * tick++; // a different instant for every Date stamped
    const callers = [SIFT, LOCAL, null, 'https://evil.example', SIFT] as (string | null)[];
    const pending = callers.map((o) => handleRelay(rq(o), { fetchImpl, now }));
    await new Promise((r) => setTimeout(r, 5));
    release();
    const out = await Promise.all(pending);
    expect(calls.n).toBe(1);
    expect(out.map((r) => r.status)).toEqual([200, 200, 200, 403, 200]);
    expect(out.map((r) => r.headers.get('access-control-allow-origin'))).toEqual([SIFT, LOCAL, null, null, SIFT]);
    const dates = out.map((r) => r.headers.get('date'));
    expect(new Set(dates).size).toBe(dates.length); // five answers, five distinct serve instants: no Date shared between callers
    for (const r of out.filter((x) => x.status === 200)) {
      expect(r.headers.get('x-sift-observed-at')).toBe(OBSERVED);
      expect(await r.text()).toBe(LISTING); // every sharer can read its own full body
    }
    // each Date is the clock reading made when that answer was stamped, in call order of the stamping (monotonic)
    const ms = dates.map((d) => Date.parse(d!));
    expect(ms.every((v) => v >= T0)).toBe(true);
  });

  it('a 429 shared by concurrent callers: Retry-After kept, no-store kept, each stamped with its own Date', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const fetchImpl = (async () => { await gate; return new Response('{"e":"slow"}', { status: 429, headers: { 'retry-after': '9', date: UP_DATE } }); }) as typeof fetch;
    let tick = 0;
    const now = () => T0 + 1_000 * tick++;
    const pending = [SIFT, LOCAL].map((o) => handleRelay(rq(o), { fetchImpl, now }));
    await new Promise((r) => setTimeout(r, 5));
    release();
    const [a, b] = await Promise.all(pending);
    expect([a.status, b.status]).toEqual([429, 429]);
    expect([a.headers.get('retry-after'), b.headers.get('retry-after')]).toEqual(['9', '9']);
    expect([a.headers.get('cache-control'), b.headers.get('cache-control')]).toEqual(['no-store', 'no-store']);
    expect(a.headers.get('date')).not.toBe(b.headers.get('date'));
    expect([a.headers.get('access-control-allow-origin'), b.headers.get('access-control-allow-origin')]).toEqual([SIFT, LOCAL]);
  });
});

describe('intermediary caches: what stops a Date being replayed', () => {
  it('every answer a client reads data from is `Cache-Control: no-store` (200, 429, 4xx, 5xx, 502, 504, 403); only the CORS preflight lacks it', async () => {
    const mk = (status: number, body = LISTING, headers: Record<string, string> = {}) => (async () => new Response(body, { status, headers: { 'content-type': 'application/json', date: UP_DATE, ...headers } })) as typeof fetch;
    const boom = (name: string) => (async () => { throw Object.assign(new Error(name), { name }); }) as typeof fetch;
    const answers: [string, Response][] = [
      ['200', await handleRelay(rq(), { fetchImpl: mk(200), now: () => T0 })],
      ['200 cached', await (async () => { const c = new MemoryRelayCache(5_000, () => T0); const o = { fetchImpl: mk(200), cache: c, now: () => T0 }; await handleRelay(rq(), o); return handleRelay(rq(), o); })()],
      ['429', await handleRelay(rq(), { fetchImpl: mk(429, '{}', { 'retry-after': '3' }), now: () => T0 })],
      ['500', await handleRelay(rq(), { fetchImpl: mk(500, '{}'), now: () => T0 })],
      ['502 malformed', await handleRelay(rq(), { fetchImpl: mk(200, '<html>'), now: () => T0 })],
      ['502 unreachable', await handleRelay(rq(), { fetchImpl: boom('TypeError'), now: () => T0 })],
      ['504', await handleRelay(rq(), { fetchImpl: boom('TimeoutError'), now: () => T0 })],
      ['400', await handleRelay(rq(SIFT, 'GET', '/nope'), { now: () => T0 })],
      ['405', await handleRelay(rq(SIFT, 'POST'), { now: () => T0 })],
      ['403', await handleRelay(rq('https://evil.example'), { now: () => T0 })],
    ];
    for (const [n, r] of answers) expect([n, r.headers.get('cache-control')]).toEqual([n, 'no-store']);
    const pre = await handleRelay(rq(SIFT, 'OPTIONS'), { now: () => T0 });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('cache-control')).toBeNull(); // unchanged from main; the browser keeps a preflight 24 h (Access-Control-Max-Age) and never reads its Date
    expect(pre.headers.get('date')).toBe(utc(T0));
  });
});
