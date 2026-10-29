// Differential test: the relay core on this branch (with the Date wrapper) against a frozen copy of the core on
// origin/main (tests/fixtures/relay/coreBaseline.ts). Both are driven with the SAME requests, the SAME fake upstream
// and the SAME clock, and every answer is compared: status, statusText, ALL headers and the body bytes. The only
// differences allowed are the ones the change is meant to make:
//   1. the branch adds `Date` (and it must be the relay clock at the moment the answer was served);
//   2. on allowed-origin answers `Access-Control-Expose-Headers` gains `, Date` and nothing else.
// A request that makes the old core throw must make the new one throw the same error. The outgoing upstream
// requests (URL and headers) must be identical too. See docs/relay-date/README.md.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as current from '../relay/core';
import type { RelayCache, RelayOptions } from '../relay/core';
import * as baseline from './fixtures/relay/coreBaseline';

// The two cores each declare their own MemoryRelayCache class with a private member, so the classes are nominally
// distinct types. The comparison only needs what both expose, so describe that structurally: the same handleRelay
// signature and a constructor that yields something satisfying the public RelayCache interface. Both modules are
// still driven through exactly the same calls; nothing about the behaviour comparison is loosened.
interface Core {
  handleRelay(request: Request, o?: RelayOptions): Promise<Response>;
  MemoryRelayCache: new (ttlMs?: number, now?: () => number, max?: number) => RelayCache;
}
const CORES: [string, Core][] = [['baseline', baseline], ['branch', current]];

const SIFT = 'https://chmoses98.github.io';
const T0 = Date.parse('2026-10-26T18:00:30Z');
const UP_DATE = 'Mon, 26 Oct 2026 18:00:10 GMT';
const LISTING = JSON.stringify({ markets: [{ ticker: 'KXNFLGAME-26OCT26AABB-AA', yes_bid_dollars: '0.5100' }], cursor: '' });
const J = { 'content-type': 'application/json' };

// ---------------------------------------------------------------------------------------------- snapshots
interface Snap { threw?: string; status?: number; statusText?: string; headers?: [string, string][]; body?: string }

async function snap(p: Promise<Response>): Promise<Snap> {
  try {
    const r = await p;
    const body = Buffer.from(await r.arrayBuffer()).toString('hex');
    return { status: r.status, statusText: r.statusText, headers: [...r.headers].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)), body };
  } catch (e) {
    return { threw: `${(e as Error).name}: ${(e as Error).message}` };
  }
}

/**
 * Take the allowed differences out of a branch snapshot. `date` says what the Date header must be:
 * an exact string, 'valid' (any parseable HTTP-date) or null (none, when the clock itself is unusable).
 * Returns the stripped snapshot and the problems found.
 */
function normalizeBranch(s: Snap, date: string | 'valid' | null): { snap: Snap; problems: string[] } {
  if (s.threw) return { snap: s, problems: [] };
  const problems: string[] = [];
  const headers: [string, string][] = [];
  let sawDate = false;
  const hasCors = s.headers!.some(([k]) => k === 'access-control-allow-origin');
  for (const [k, v] of s.headers!) {
    if (k === 'date') {
      sawDate = true;
      if (date === null) problems.push(`Date present but the clock was unusable: ${v}`);
      else if (date === 'valid' ? Number.isNaN(Date.parse(v)) : v !== date) problems.push(`Date ${JSON.stringify(v)} != expected ${JSON.stringify(date)}`);
      continue;
    }
    if (k === 'access-control-expose-headers') {
      if (v !== 'X-Sift-Observed-At, Retry-After, Date') problems.push(`expose list is ${JSON.stringify(v)}`);
      headers.push([k, 'X-Sift-Observed-At, Retry-After']);
      continue;
    }
    headers.push([k, v]);
  }
  if (!sawDate && date !== null) problems.push('no Date header');
  if (!hasCors && s.headers!.some(([k]) => k === 'access-control-expose-headers')) problems.push('expose header without allow-origin');
  return { snap: { ...s, headers }, problems };
}

// ---------------------------------------------------------------------------------------------- environment
interface Call { url: string; headers: Record<string, string> }
type Behaviour = () => Response | Promise<Response>;

interface Env {
  clock: { t: number };
  calls: Call[];
  opts: RelayOptions;
  pending: Promise<unknown>[];
}

function makeEnv(core: Core, behaviour: Behaviour, cache: 'none' | 'memory' | RelayCache, over: Partial<RelayOptions> = {}): Env {
  const clock = { t: T0 };
  const calls: Call[] = [];
  const pending: Promise<unknown>[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: Object.fromEntries(new Headers(init?.headers)) });
    return behaviour();
  }) as typeof fetch;
  const c = cache === 'none' ? null : cache === 'memory' ? new core.MemoryRelayCache(5_000, () => clock.t) : cache;
  return { clock, calls, pending, opts: { fetchImpl, cache: c, now: () => clock.t, ...over } };
}

/** A cache the way Cloudflare's behaves: stores a copy, hands out a fresh copy on every get. */
class CloneCache implements RelayCache {
  m = new Map<string, { until: number; res: Response }>();
  constructor(private now: () => number) {}
  async get(k: string) {
    const e = this.m.get(k);
    return e && e.until > this.now() ? e.res.clone() : undefined;
  }
  async put(k: string, res: Response) {
    this.m.set(k, { until: this.now() + 5_000, res });
  }
}

const upstreamHeaders = (extra: Record<string, string> = {}) => ({ ...J, date: UP_DATE, ...extra });
const BEHAVIOURS: [string, Behaviour][] = [
  ['200 listing', () => new Response(LISTING, { headers: upstreamHeaders() })],
  ['200 listing with Age 3', () => new Response(LISTING, { headers: upstreamHeaders({ age: '3' }) })],
  ['200 listing with Age junk', () => new Response(LISTING, { headers: upstreamHeaders({ age: 'x' }) })],
  ['200 listing without Date', () => new Response(LISTING, { headers: J })],
  ['200 listing with junk Date', () => new Response(LISTING, { headers: upstreamHeaders({ date: 'yesterday-ish' }) })],
  ['200 listing with Retry-After', () => new Response(LISTING, { headers: upstreamHeaders({ 'retry-after': '11' }) })],
  ['200 listing, charset content-type', () => new Response(LISTING, { headers: upstreamHeaders({ 'content-type': 'application/json; charset=utf-8' }) })],
  ['200 listing, no content-type header sent', () => new Response(LISTING)],
  ['200 listing with upstream cache/vary/cors/set-cookie headers', () => new Response(LISTING, { headers: upstreamHeaders({ 'cache-control': 'public, max-age=60', vary: 'Accept', 'access-control-allow-origin': '*', 'set-cookie': 'a=b', etag: '"x"', 'x-sift-observed-at': '2000-01-01T00:00:00.000Z' }) })],
  ['200 empty markets', () => new Response('{"markets":[],"cursor":""}', { headers: upstreamHeaders() })],
  ['200 multibyte body', () => new Response(JSON.stringify({ markets: [{ title: 'Ünïcode ✓ 🏈' }] }), { headers: upstreamHeaders() })],
  ['200 invalid utf-8 bytes', () => new Response(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]), { headers: upstreamHeaders() })],
  ['200 large body (200 KB)', () => new Response(JSON.stringify({ markets: [{ pad: 'x'.repeat(200_000) }] }), { headers: upstreamHeaders() })],
  ['200 html (malformed)', () => new Response('<html>blocked</html>', { headers: upstreamHeaders({ 'content-type': 'text/html' }) })],
  ['200 json without markets', () => new Response('{"ok":true}', { headers: upstreamHeaders() })],
  ['200 markets not an array', () => new Response('{"markets":{}}', { headers: upstreamHeaders() })],
  ['200 empty body', () => new Response('', { headers: upstreamHeaders() })],
  ['204 no content', () => new Response(null, { status: 204, headers: upstreamHeaders() })],
  ['429 with Retry-After 7', () => new Response('{"error":"slow"}', { status: 429, headers: upstreamHeaders({ 'retry-after': '7' }) })],
  ['429 without Retry-After', () => new Response('{"error":"slow"}', { status: 429, headers: upstreamHeaders() })],
  ['429 Retry-After junk', () => new Response('{}', { status: 429, headers: upstreamHeaders({ 'retry-after': 'abc' }) })],
  ['429 Retry-After 0', () => new Response('{}', { status: 429, headers: upstreamHeaders({ 'retry-after': '0' }) })],
  ['429 html body', () => new Response('<h1>429</h1>', { status: 429, headers: { 'content-type': 'text/html', 'retry-after': '2' } })],
  ['500 json', () => new Response('{"error":"x"}', { status: 500, headers: upstreamHeaders() })],
  ['503 html', () => new Response('<h1>down</h1>', { status: 503, headers: { 'content-type': 'text/html' } })],
  ['502 from a gateway', () => new Response('bad gateway', { status: 502 })],
  ['404', () => new Response('{"error":"nf"}', { status: 404, headers: upstreamHeaders() })],
  ['403', () => new Response('forbidden', { status: 403 })],
  ['301 redirect status', () => new Response('moved', { status: 301, headers: { location: 'https://elsewhere.example/' } })],
  ['304 (null-body status with text())', () => new Response(null, { status: 304 })],
  ['fetch rejects TypeError (unreachable)', () => { throw new TypeError('fetch failed'); }],
  ['fetch rejects TimeoutError', () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); }],
  ['fetch rejects AbortError', () => { throw Object.assign(new Error('a'), { name: 'AbortError' }); }],
  ['fetch rejects a non-Error', () => { throw 'boom'; }],
  ['fetch resolves Response.error() (immutable headers, status 0)', () => Response.error()],
  ['fetch resolves Response.redirect() (immutable headers, 302)', () => Response.redirect('https://elsewhere.example/', 302)],
];

// ---------------------------------------------------------------------------------------------- request matrix
const METHODS = ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'];
const ORIGINS: (string | null)[] = [SIFT, 'http://localhost:5173', 'http://localhost:4173', 'https://evil.example', 'null', `${SIFT}/`, 'HTTPS://CHMOSES98.GITHUB.IO', null];
const ALLOWED = new Set([SIFT, 'http://localhost:5173', 'http://localhost:4173']);
const TICKERS = 'KXNFLGAME-26OCT26AABB-AA';
const PATHS: [string, boolean][] = [
  [`/markets?tickers=${TICKERS}`, true],
  [`/markets?tickers=${TICKERS},KXNHLGOAL-26OCT26TORCGY-TOR19&status=open`, true],
  ['/markets?series_ticker=KXNFLGAME&status=open&limit=2', true],
  ['/markets?event_ticker=KXNFLGAME-26OCT26AABB&limit=1000&cursor=abc123', true],
  ['/markets/?series_ticker=KXNFLGAME', true],
  ['/api/markets?series_ticker=KXNFLGAME&status=settled', true],
  [`/markets?tickers=${TICKERS}&tickers=KXOTHER-1`, true],
  ['/portfolio/orders', false],
  ['/markets', false],
  ['/markets?status=open', false],
  ['/markets?series_ticker=KXNFLGAME&status=bogus', false],
  ['/markets?series_ticker=KXNFLGAME&limit=0', false],
  ['/markets?series_ticker=KXNFLGAME&limit=1001', false],
  ['/markets?series_ticker=kxlower', false],
  ['/markets?series_ticker=KXNFLGAME&evil=1', false],
  [`/markets?tickers=${Array.from({ length: 101 }, (_, i) => `T${i}`).join(',')}`, false],
  [`/markets?series_ticker=KXNFLGAME&cursor=${'c'.repeat(513)}`, false],
  ['/', false],
];

function request(method: string, path: string, origin: string | null, extra: Record<string, string> = {}): Request {
  const headers: Record<string, string> = { ...extra };
  if (origin !== null) headers.Origin = origin;
  const init: RequestInit = { method, headers };
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') init.body = '{"x":1}';
  return new Request(`https://relay.test${path}`, init);
}

interface Outcome { snaps: Snap[]; calls: Call[]; dates: (string | 'valid' | null)[] }
type Scenario = (core: Core, env: Env) => Promise<{ snaps: Snap[]; dates: (string | 'valid' | null)[] }>;

async function runBoth(behaviour: Behaviour, cache: 'none' | 'memory' | ((clock: { t: number }) => RelayCache), scenario: Scenario, over: Partial<RelayOptions> = {}) {
  const out: Record<string, Outcome> = {};
  for (const [name, core] of CORES) {
    // make the cache inside the loop: nothing is shared between the two cores (each has its own module-level in-flight map too)
    const env = makeEnv(core, behaviour, 'none', over);
    if (cache !== 'none') env.opts.cache = cache === 'memory' ? new core.MemoryRelayCache(5_000, () => env.clock.t) : cache(env.clock);
    const r = await scenario(core, env);
    await Promise.allSettled(env.pending);
    out[name] = { ...r, calls: env.calls };
  }
  return out;
}

/** Compare; returns problems (empty when the branch differs from the baseline only by the allowed changes). */
function compare(label: string, o: Record<string, Outcome>): string[] {
  const problems: string[] = [];
  const b = o.baseline;
  const n = o.branch;
  if (JSON.stringify(b.calls) !== JSON.stringify(n.calls)) problems.push(`${label}: upstream requests differ: ${JSON.stringify(b.calls)} vs ${JSON.stringify(n.calls)}`);
  if (b.snaps.length !== n.snaps.length) problems.push(`${label}: number of answers differ`);
  b.snaps.forEach((bs, i) => {
    const ns = normalizeBranch(n.snaps[i], n.dates[i]);
    for (const p of ns.problems) problems.push(`${label} [#${i}]: ${p}`);
    if (JSON.stringify(bs) !== JSON.stringify(ns.snap)) problems.push(`${label} [#${i}]: baseline ${JSON.stringify(bs).slice(0, 400)}\n   branch   ${JSON.stringify(ns.snap).slice(0, 400)}`);
    // the baseline never had a Date of its own (so any Date on the branch is the new one)
    if (bs.headers?.some(([k]) => k === 'date')) problems.push(`${label} [#${i}]: baseline unexpectedly has a Date header`);
  });
  return problems;
}

const single = (method: string, path: string, origin: string | null, extra?: Record<string, string>): Scenario => async (core, env) => {
  const s = await snap(core.handleRelay(request(method, path, origin, extra), env.opts));
  return { snaps: [s], dates: [new Date(env.clock.t).toUTCString()] };
};

// ---------------------------------------------------------------------------------------------- tests
describe('differential: single requests, every method x origin x query x upstream outcome x cache', () => {
  let compared = 0;
  for (const method of METHODS) {
    it(`${method}`, async () => {
      const problems: string[] = [];
      for (const origin of ORIGINS) {
        for (const [path, valid] of PATHS) {
          const reachesUpstream = method === 'GET' && valid && (origin === null || ALLOWED.has(origin));
          for (const [bname, behaviour] of reachesUpstream ? BEHAVIOURS : BEHAVIOURS.slice(0, 1)) {
            for (const cache of reachesUpstream ? (['none', 'memory'] as const) : (['none'] as const)) {
              const label = `${method} ${path.slice(0, 60)} origin=${origin} upstream=[${bname}] cache=${cache}`;
              const o = await runBoth(behaviour, cache, single(method, path, origin));
              problems.push(...compare(label, o));
              compared++;
              if (!reachesUpstream && o.baseline.calls.length) problems.push(`${label}: reached upstream`);
            }
          }
        }
      }
      expect(problems).toEqual([]);
    }, 60_000);
  }
  it('compared a broad matrix', () => {
    expect(compared).toBeGreaterThan(2_500);
    console.log(`relay differential: ${compared} single-request cases compared (baseline vs branch)`);
  });
});

describe('differential: preflight and HEAD/OPTIONS details', () => {
  it('OPTIONS preflight with Access-Control-Request-* headers, allowed and disallowed origins, valid and invalid paths', async () => {
    const problems: string[] = [];
    for (const origin of ORIGINS) {
      for (const [path] of PATHS) {
        const extra = { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-sift, content-type' };
        problems.push(...compare(`OPTIONS ${path.slice(0, 40)} ${origin}`, await runBoth(BEHAVIOURS[0][1], 'memory', single('OPTIONS', path, origin, extra))));
      }
    }
    expect(problems).toEqual([]);
  });
  it('HEAD, even on a path GET would serve, is the 405 it always was (CORS headers on allowed origins)', async () => {
    const o = await runBoth(BEHAVIOURS[0][1], 'memory', single('HEAD', `/markets?tickers=${TICKERS}`, SIFT));
    expect(o.baseline.snaps[0].status).toBe(405);
    expect(compare('HEAD', o)).toEqual([]);
    expect(o.baseline.calls).toEqual([]);
  });
});

describe('differential: sequences with the clock moving (cached and shared answers)', () => {
  const step = (core: Core, env: Env, origin: string | null, advanceMs = 0, path = '/markets?series_ticker=KXNFLGAME&status=open&limit=2') => {
    env.clock.t += advanceMs;
    return snap(core.handleRelay(request('GET', path, origin), env.opts)).then((s) => ({ s, d: new Date(env.clock.t).toUTCString() }));
  };

  const caches: [string, 'memory' | ((clock: { t: number }) => RelayCache)][] = [['MemoryRelayCache', 'memory'], ['clone-on-get cache (Cloudflare-like)', (clock) => new CloneCache(() => clock.t)]];

  for (const [cname, cache] of caches) {
    for (const [bname, behaviour] of BEHAVIOURS) {
      it(`miss, hit, hit, expiry (cache: ${cname}; upstream: ${bname})`, async () => {
        const o = await runBoth(behaviour, cache, async (core, env) => {
          const snaps: Snap[] = [];
          const dates: string[] = [];
          for (const [origin, adv] of [[SIFT, 0], [SIFT, 2_000], [null, 2_000], ['http://localhost:5173', 1_500], [SIFT, 6_000]] as [string | null, number][]) {
            const r = await step(core, env, origin, adv);
            snaps.push(r.s);
            dates.push(r.d);
          }
          return { snaps, dates };
        });
        expect(compare(`${bname}/${cname}`, o)).toEqual([]);
      });
    }
  }

  it('an error is not cached: failure, then success, then hit', async () => {
    let n = 0;
    const flaky: Behaviour = () => (n++ === 0 ? new Response('{"e":1}', { status: 500, headers: J }) : new Response(LISTING, { headers: upstreamHeaders() }));
    const results: Record<string, Outcome> = {};
    for (const [name, core] of CORES) {
      n = 0;
      const env = makeEnv(core, flaky, 'memory');
      const snaps: Snap[] = [];
      const dates: string[] = [];
      for (const adv of [0, 1_000, 1_000]) {
        const r = await step(core, env, SIFT, adv);
        snaps.push(r.s);
        dates.push(r.d);
      }
      results[name] = { snaps, dates, calls: env.calls };
    }
    expect(compare('flaky', results)).toEqual([]);
    expect(results.baseline.snaps.map((s) => s.status)).toEqual([500, 200, 200]);
  });
});

describe('differential: identical reads in flight at the same time share one upstream call', () => {
  const callers: [string, string | null, string][] = [
    ['GET', SIFT, `/markets?tickers=${TICKERS}`],
    ['GET', 'http://localhost:5173', `/markets?tickers=${TICKERS}`],
    ['GET', null, `/markets?tickers=${TICKERS}`],
    ['GET', 'https://evil.example', `/markets?tickers=${TICKERS}`],
    ['GET', SIFT, `/markets?tickers=${TICKERS}`],
    ['OPTIONS', SIFT, `/markets?tickers=${TICKERS}`],
  ];
  for (const cacheKind of ['none', 'memory'] as const) {
    for (const [bname, behaviour] of BEHAVIOURS.filter(([n]) => /^(200 listing$|200 listing with Age 3|429 with Retry|500 json|200 html|fetch rejects TypeError|fetch rejects Timeout|fetch resolves Response\.error|304)/.test(n))) {
      it(`${callers.length} callers at once, one gate (cache: ${cacheKind}; upstream: ${bname})`, async () => {
        const o: Record<string, Outcome> = {};
        for (const [name, core] of CORES) {
          let release!: () => void;
          const gate = new Promise<void>((r) => { release = r; });
          const gated: Behaviour = async () => { await gate; return behaviour(); };
          const env = makeEnv(core, gated, cacheKind);
          const inflight = callers.map(([m, origin, path]) => snap(core.handleRelay(request(m, path, origin), env.opts)));
          await new Promise((r) => setTimeout(r, 5));
          release();
          o[name] = { snaps: await Promise.all(inflight), calls: env.calls, dates: callers.map(() => new Date(env.clock.t).toUTCString()) };
        }
        expect(compare(bname, o)).toEqual([]);
        expect(o.baseline.calls.length).toBe(1); // sharing really happened in both
      });
    }
  }
});

describe('differential: immutable Response objects from a REAL fetch(), served and cached', () => {
  let server: http.Server;
  let port = 0;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const limited = req.url?.includes('KXRATE');
      res.writeHead(limited ? 429 : 200, { 'content-type': 'application/json', date: UP_DATE, age: '2', ...(limited ? { 'retry-after': '9' } : {}) });
      res.end(limited ? '{"error":"too_many_requests"}' : LISTING);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('fetch()-sourced upstream answers (immutable headers, real Date from Node) and a cache that returns a stored fetch() Response', async () => {
    for (const q of ['/markets?series_ticker=KXNFLGAME&status=open', '/markets?series_ticker=KXRATE&status=open']) {
      for (const cacheKind of ['memory', 'raw-fetch-response-cache'] as const) {
        const o: Record<string, Outcome> = {};
        for (const [name, core] of CORES) {
          const clock = { t: T0 };
          const calls: Call[] = [];
          const realFetch = (async (url: string, init?: RequestInit) => {
            calls.push({ url: String(url).replace(String(port), 'PORT'), headers: Object.fromEntries(new Headers(init?.headers)) });
            return fetch(String(url).replace(current.UPSTREAM, `http://127.0.0.1:${port}`), init);
          }) as typeof fetch;
          // a cache that keeps a Response taken straight from fetch() and returns clones of it (immutable-header objects)
          const stored = new Map<string, Response>();
          const rawCache: RelayCache = {
            get: async (k) => stored.get(k)?.clone(),
            put: async (k, res) => { stored.set(k, await fetch(`http://127.0.0.1:${port}/markets?tickers=X`)); void res; },
          };
          const cache = cacheKind === 'memory' ? new core.MemoryRelayCache(5_000, () => clock.t) : rawCache;
          const opts: RelayOptions = { fetchImpl: realFetch, cache, now: () => clock.t };
          const snaps: Snap[] = [];
          for (let i = 0; i < 3; i++) {
            clock.t += i * 1_000;
            snaps.push(await snap(core.handleRelay(request('GET', q, SIFT), opts)));
          }
          o[name] = { snaps, calls, dates: snaps.map(() => 'valid') };
        }
        expect(compare(`${q}/${cacheKind}`, o)).toEqual([]);
      }
    }
  });
});

describe('differential: an unusable injected clock changes nothing but the (omitted or fallback) Date', () => {
  const clocks: [string, () => number][] = [['NaN', () => NaN], ['Infinity', () => Infinity], ['throws', () => { throw new Error('clock broke'); }]];
  for (const [cname, now] of clocks) {
    it(`now() = ${cname}: same answers as the baseline, including the baseline's own failures`, async () => {
      const problems: string[] = [];
      for (const method of ['GET', 'OPTIONS', 'POST']) {
        for (const origin of [SIFT, 'https://evil.example', null]) {
          for (const [path] of PATHS.slice(0, 9)) {
            for (const [bname, behaviour] of BEHAVIOURS.slice(0, 5)) {
              const o: Record<string, Outcome> = {};
              for (const [name, core] of CORES) {
                const env = makeEnv(core, behaviour, 'memory', { now });
                const s = await snap(core.handleRelay(request(method, path, origin), env.opts));
                o[name] = { snaps: [s], calls: env.calls, dates: ['valid'] };
              }
              // with a broken clock the branch may serve with the host's wall clock (NaN/Infinity) or no Date (throws): either way never an error the baseline did not have
              const b = o.baseline.snaps[0];
              const n = o.branch.snaps[0];
              if (!!b.threw !== !!n.threw) problems.push(`${method} ${path} ${origin} ${bname}: threw differs ${b.threw} / ${n.threw}`);
              if (b.threw) { if (b.threw !== n.threw) problems.push(`${method} ${path} ${origin} ${bname}: different error`); continue; }
              const hasDate = n.headers!.some(([k]) => k === 'date');
              if (cname === 'throws' && hasDate) problems.push(`${method} ${path} ${origin} ${bname}: Date set from a clock that throws`);
              const norm = normalizeBranch(n, hasDate ? 'valid' : null);
              problems.push(...norm.problems);
              if (JSON.stringify(norm.snap) !== JSON.stringify(b)) problems.push(`${method} ${path} ${origin} ${bname}: differs beyond Date`);
            }
          }
        }
      }
      expect(problems).toEqual([]);
    });
  }
});
