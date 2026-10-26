// The independent quote monitor (scripts/quote-monitor.mjs): every failure row of the spec, each boundary, the
// honest "heartbeat not published yet" state, and the CLI's exit code against a local server. Injected fetch,
// clock and sleep: no network, no waiting.
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { report, relayTickers, runMonitor, summaryMarkdown, advanced, type MonitorResult } from '../../scripts/quote-monitor.mjs';

const FEED = 'https://feed.test/live-quotes';
const RELAY = 'https://relay.test/kalshi';
const T0 = Date.parse('2026-10-26T18:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const TICKERS = ['KXNHLGOAL-26OCT26TORCGY-TOR19', 'KXNHLGOAL-26OCT26TORCGY-CGY7', 'KXNHLPTS-26OCT26TORCGY-TOR19-2'];

/** A scripted world: the feed files, the relay's behaviour and the clock. */
class World {
  t = T0;
  sleeps: number[] = [];
  calls: string[] = [];
  /** Age of the feed's generated_at, ms. */
  feedAge = 60_000;
  index: unknown | 'network' | number = null; // override: number = HTTP status, 'network' = throws
  health: unknown | 'network' | number | 'absent' = null;
  game: unknown | number = null;
  /** health.json advances by one sequence every this many ms of sleeping; 0 = never. */
  advanceEveryMs = 0;
  seq = 7;
  relay: { status: number; retryAfter?: string; observedAgeMs?: number | null; markets?: number; network?: boolean } = { status: 200, observedAgeMs: 2_000, markets: 3 };
  relayCalls: { url: string; origin: string | null }[] = [];
  private slept = 0;

  now = () => this.t;
  sleep = async (ms: number) => {
    this.sleeps.push(ms);
    this.t += ms;
    this.slept += ms;
  };

  gen = () => iso(this.t - this.feedAge);
  indexDoc = () => ({ schema: 'sift.live_quotes.index.v1', generated_at: this.gen(), status: 'CURRENT_SLATE', games: [{ key: '26OCT26TORCGY', file: 'games/26OCT26TORCGY.json', markets: 3 }] });
  gameDoc = () => ({
    schema: 'sift.live_quotes.v1', game_key: '26OCT26TORCGY', generated_at: this.gen(), tickers_checked: TICKERS,
    markets: TICKERS.map((ticker) => ({ ticker, status: 'active', observed_at: iso(this.t - this.feedAge - 4_000) })),
  });
  healthDoc = () => ({
    schema: 'sift.live_quotes.health.v1', generated_at: this.gen(), run_id: '9001', sequence: this.seq + (this.advanceEveryMs ? Math.floor(this.slept / this.advanceEveryMs) : 0),
    cycle_started_at: this.gen(), cycle_finished_at: this.gen(), sweep_duration_ms: 9000, requests: 70, errors: 0, last_success_at: this.gen(),
  });

  private json(body: unknown, init: ResponseInit = {}) {
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init });
  }
  private pick(over: unknown, normal: () => unknown) {
    if (over === 'network') throw new TypeError('fetch failed');
    if (typeof over === 'number') return new Response('boom', { status: over });
    return this.json(over ?? normal());
  }

  fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    this.calls.push(url);
    if (url.startsWith(RELAY)) {
      this.relayCalls.push({ url, origin: new Headers(init?.headers).get('origin') });
      if (this.relay.network) throw new TypeError('fetch failed');
      if (this.relay.status !== 200) return new Response('slow down', { status: this.relay.status, headers: this.relay.retryAfter ? { 'retry-after': this.relay.retryAfter } : {} });
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (this.relay.observedAgeMs !== null && this.relay.observedAgeMs !== undefined) headers['x-sift-observed-at'] = iso(this.t - this.relay.observedAgeMs);
      return new Response(JSON.stringify({ markets: Array.from({ length: this.relay.markets ?? 0 }, (_, i) => ({ ticker: TICKERS[i % 3] })) }), { headers });
    }
    if (url === `${FEED}/index.json`) return this.pick(this.index, this.indexDoc);
    if (url === `${FEED}/health.json`) {
      if (this.health === 'absent') return new Response('404: Not Found', { status: 404 });
      return this.pick(this.health, this.healthDoc);
    }
    if (url === `${FEED}/games/26OCT26TORCGY.json`) return this.pick(this.game, this.gameDoc);
    return new Response('?', { status: 404 });
  };

  run(env: Record<string, string> = {}) {
    return runMonitor({ env: { SIFT_FEED_URL: FEED, SIFT_QUOTE_RELAY_URL: RELAY, ...env }, fetchImpl: this.fetchImpl, now: this.now, sleep: this.sleep });
  }
}

const status = (r: MonitorResult, id: string) => r.checks.find((c) => c.id === id)!;

describe('healthy', () => {
  it('passes every check: fresh feed, heartbeat advancing, relay quote young', async () => {
    const w = new World();
    w.advanceEveryMs = 60_000; // the sequence moves while the monitor waits
    const r = await w.run();
    expect(r.status).toBe('PASS');
    expect(r.ok).toBe(true);
    expect(r.checks.map((c) => [c.id, c.status])).toEqual([
      ['feed_index', 'pass'], ['heartbeat', 'pass'], ['game_file', 'pass'], ['feed_fresh', 'pass'], ['heartbeat_advance', 'pass'], ['relay', 'pass'],
    ]);
    expect(status(r, 'heartbeat_advance').detail).toMatch(/sequence 7 -> run 9001 sequence 8 after 60s/);
    expect(w.sleeps).toEqual([30_000, 30_000]); // polls every 30 s and stops as soon as the sequence moves
    // The relay is asked for tickers the feed lists, with the SIFT origin, in ONE batch.
    expect(w.relayCalls).toHaveLength(1);
    expect(w.relayCalls[0].url).toBe(`${RELAY}/markets?tickers=${TICKERS.map(encodeURIComponent).join(',')}&limit=1000`);
    expect(w.relayCalls[0].origin).toBe('https://chmoses98.github.io');
  });

  it('only ever issues GETs of public files (read-only)', async () => {
    const w = new World();
    w.advanceEveryMs = 30_000;
    const methods: string[] = [];
    await runMonitor({ env: { SIFT_FEED_URL: FEED, SIFT_QUOTE_RELAY_URL: RELAY }, now: w.now, sleep: w.sleep, fetchImpl: async (u, i) => { methods.push(i?.method ?? 'GET'); return w.fetchImpl(u, i); } });
    expect(new Set(methods)).toEqual(new Set(['GET']));
  });
});

describe('failure row 1: the newest feed generated_at is more than 10 minutes old', () => {
  it('10 minutes exactly passes; 10 min 1 s fails', async () => {
    const ok = new World();
    ok.feedAge = 600_000;
    ok.advanceEveryMs = 30_000;
    expect(status(await ok.run(), 'feed_fresh').status).toBe('pass');
    const bad = new World();
    bad.feedAge = 601_000;
    const r = await bad.run();
    expect(r.ok).toBe(false);
    expect(status(r, 'feed_fresh')).toMatchObject({ status: 'fail' });
    expect(status(r, 'feed_fresh').detail).toMatch(/601s old; limit 600s.*stalled/);
  });

  it('judges the NEWEST stamp across index, heartbeat and game file', async () => {
    const w = new World();
    w.advanceEveryMs = 30_000;
    w.index = { ...w.indexDoc(), generated_at: iso(T0 - 3_600_000) }; // an old index...
    const r = await w.run(); // ...but the heartbeat and game file are fresh
    expect(status(r, 'feed_fresh').status).toBe('pass');
  });

  it('a stalled feed fails without waiting out the sequence window', async () => {
    const w = new World();
    w.feedAge = 20 * 60_000;
    const r = await w.run();
    expect(status(r, 'feed_fresh').status).toBe('fail');
    expect(status(r, 'heartbeat_advance')).toMatchObject({ status: 'fail' });
    expect(status(r, 'heartbeat_advance').detail).toMatch(/not waited: the feed is already stale/);
    expect(w.sleeps).toEqual([]); // no minutes of useless polling
  });

  it('a generated_at in the future of the runner clock is a failure too', async () => {
    const w = new World();
    w.feedAge = -60_000;
    expect(status(await w.run(), 'feed_fresh').detail).toMatch(/in the future/);
  });

  it('feed unreachable (network), HTTP 5xx, HTTP 404, not JSON, wrong schema: each fails with a clear message', async () => {
    const cases: [unknown, RegExp][] = [
      ['network', /network error/],
      [503, /HTTP 503/],
      [404, /HTTP 404/],
      [{ schema: 'something.else' }, /unexpected index schema/],
    ];
    for (const [index, re] of cases) {
      const w = new World();
      w.index = index;
      w.health = 'absent';
      const r = await w.run();
      expect(r.ok).toBe(false);
      expect(status(r, 'feed_index').status).toBe('fail');
      expect(status(r, 'feed_index').detail).toMatch(re);
    }
  });

  it('a transient network error on the feed is retried once before it counts', async () => {
    const w = new World();
    w.advanceEveryMs = 30_000;
    let n = 0;
    const flaky = w.fetchImpl;
    const r = await runMonitor({ env: { SIFT_FEED_URL: FEED }, now: w.now, sleep: w.sleep, fetchImpl: async (u, i) => { if (u.endsWith('/index.json') && n++ === 0) throw new TypeError('fetch failed'); return flaky(u, i); } });
    expect(status(r, 'feed_index').status).toBe('pass');
    expect(w.sleeps[0]).toBe(2_000);
  });

  it('with nothing readable there is no generated_at to judge, and that is a failure', async () => {
    const w = new World();
    w.index = 503;
    w.health = 'absent';
    expect(status(await w.run(), 'feed_fresh').detail).toMatch(/no feed file could be read/);
  });
});

describe('failure row 2: the heartbeat sequence has not advanced', () => {
  it('fails after the whole window (default 9 min) with the stuck sequence in the message', async () => {
    const w = new World();
    const r = await w.run(); // advanceEveryMs = 0: the sequence never moves
    const c = status(r, 'heartbeat_advance');
    expect(c.status).toBe('fail');
    expect(c.detail).toMatch(/run 9001 is still at sequence 7.*after waiting 540s/);
    expect(w.sleeps.reduce((a, b) => a + b, 0)).toBe(540_000);
    expect(r.ok).toBe(false);
  });

  it('passes when it advances just inside the window, fails just outside', async () => {
    const inside = new World();
    inside.advanceEveryMs = 510_000; // the worst healthy case: publish interval + CDN cache
    expect(status(await inside.run(), 'heartbeat_advance').status).toBe('pass');
    const outside = new World();
    outside.advanceEveryMs = 600_000;
    expect(status(await outside.run(), 'heartbeat_advance').status).toBe('fail');
  });

  it('a new run id (the loop was handed over) counts as advanced even though the sequence restarted', async () => {
    expect(advanced({ run_id: '1', sequence: 17 }, { run_id: '2', sequence: 1 })).toBe(true);
    expect(advanced({ run_id: '1', sequence: 17 }, { run_id: '1', sequence: 18 })).toBe(true);
    expect(advanced({ run_id: '1', sequence: 17 }, { run_id: '1', sequence: 17 })).toBe(false);
    expect(advanced({ run_id: '1', sequence: 17 }, { run_id: '1', sequence: 3 })).toBe(false);
  });

  it('a sequence that goes backwards within a run is reported as such', async () => {
    const w = new World();
    let n = 0;
    const base = w.fetchImpl;
    const r = await runMonitor({
      env: { SIFT_FEED_URL: FEED }, now: w.now, sleep: w.sleep,
      fetchImpl: async (u, i) => (u === `${FEED}/health.json` && n++ > 0 ? new Response(JSON.stringify({ ...w.healthDoc(), sequence: 2 }), { status: 200 }) : base(u, i)),
    });
    expect(status(r, 'heartbeat_advance').detail).toMatch(/BACKWARDS.*7 -> 2/);
  });

  it('SIFT_MONITOR_SEQUENCE_WINDOW_S=0 does not wait (and says it did not)', async () => {
    const w = new World();
    const r = await w.run({ SIFT_MONITOR_SEQUENCE_WINDOW_S: '0' });
    expect(w.sleeps).toEqual([]);
    expect(status(r, 'heartbeat_advance').detail).toMatch(/not waited/);
  });

  it('a malformed health.json fails (it exists, so it must be right)', async () => {
    for (const health of [{ schema: 'other' }, { schema: 'sift.live_quotes.health.v1', run_id: 7 }, 500, 'network'] as const) {
      const w = new World();
      w.health = health;
      const r = await w.run();
      expect(status(r, 'heartbeat').status).toBe('fail');
      expect(status(r, 'heartbeat_advance').status).toBe('skip');
    }
  });
});

describe('degrading honestly: no heartbeat on the live branch yet', () => {
  it('is its own state, HEARTBEAT_NOT_PUBLISHED: not a failure, clearly labelled, sequence check skipped', async () => {
    const w = new World();
    w.health = 'absent';
    const r = await w.run();
    expect(r.ok).toBe(true);
    expect(r.status).toBe('PASS_HEARTBEAT_NOT_PUBLISHED');
    expect(status(r, 'heartbeat')).toMatchObject({ status: 'note' });
    expect(status(r, 'heartbeat').detail).toMatch(/HEARTBEAT_NOT_PUBLISHED.*Not a failure/);
    expect(status(r, 'heartbeat_advance')).toMatchObject({ status: 'skip' });
    expect(w.sleeps).toEqual([]);
    const text = report(r);
    expect(text).toMatch(/\[NOTE\] Heartbeat published: HEARTBEAT_NOT_PUBLISHED/);
    expect(text).toMatch(/RESULT: PASS \(heartbeat not published yet: not a failure\)/);
    expect(text).toMatch(/::notice title=Quote monitor: heartbeat not published yet::/);
    expect(text).not.toMatch(/::error/);
  });

  it('feed staleness is still caught while the heartbeat is missing (index.json carries generated_at)', async () => {
    const w = new World();
    w.health = 'absent';
    w.feedAge = 15 * 60_000;
    const r = await w.run();
    expect(r.ok).toBe(false);
    expect(r.status).toBe('FAIL');
    expect(status(r, 'feed_fresh').status).toBe('fail');
  });

  it('SIFT_MONITOR_REQUIRE_HEARTBEAT=1 turns the missing heartbeat into a failure (set after the heartbeat is deployed)', async () => {
    const w = new World();
    w.health = 'absent';
    const r = await w.run({ SIFT_MONITOR_REQUIRE_HEARTBEAT: '1' });
    expect(r.ok).toBe(false);
    expect(status(r, 'heartbeat')).toMatchObject({ status: 'fail' });
  });
});

describe('failure row 3: the relay', () => {
  const healthy = () => {
    const w = new World();
    w.advanceEveryMs = 30_000;
    return w;
  };

  it('a non-200 fails: 503, 500, 403', async () => {
    for (const code of [503, 500, 403]) {
      const w = healthy();
      w.relay = { status: code };
      const r = await w.run();
      expect(r.ok).toBe(false);
      expect(status(r, 'relay').detail).toMatch(new RegExp(`relay answered HTTP ${code}`));
    }
  });

  it('a 429 fails and reports Retry-After', async () => {
    const w = healthy();
    w.relay = { status: 429, retryAfter: '30' };
    expect(status(await w.run(), 'relay').detail).toMatch(/HTTP 429 \(Retry-After 30\)/);
  });

  it('an unreachable relay fails', async () => {
    const w = healthy();
    w.relay = { status: 200, network: true };
    expect(status(await w.run(), 'relay').detail).toMatch(/relay unreachable: fetch failed/);
  });

  it('a 200 whose newest observation is older than 60 s fails; exactly 60 s passes', async () => {
    const edge = healthy();
    edge.relay = { status: 200, observedAgeMs: 60_000, markets: 3 };
    expect(status(await edge.run(), 'relay').status).toBe('pass');
    const old = healthy();
    old.relay = { status: 200, observedAgeMs: 61_000, markets: 3 };
    const r = await old.run();
    expect(r.ok).toBe(false);
    expect(status(r, 'relay').detail).toMatch(/HTTP 200 but its newest observation .* is 61s old; limit 60s/);
  });

  it('a 200 without an observation time fails (nothing to judge), as does an empty answer', async () => {
    const noStamp = healthy();
    noStamp.relay = { status: 200, observedAgeMs: null, markets: 3 };
    expect(status(await noStamp.run(), 'relay').detail).toMatch(/without a usable X-Sift-Observed-At/);
    const empty = healthy();
    empty.relay = { status: 200, observedAgeMs: 1_000, markets: 0 };
    expect(status(await empty.run(), 'relay').detail).toMatch(/no markets for 3 tickers/);
  });

  it('an observation stamped in the future fails', async () => {
    const w = healthy();
    w.relay = { status: 200, observedAgeMs: -30_000, markets: 3 };
    expect(status(await w.run(), 'relay').detail).toMatch(/in the future/);
  });

  it('SIFT_QUOTE_RELAY_URL unset: the relay part is skipped cleanly, not passed and not failed', async () => {
    const w = healthy();
    const r = await runMonitor({ env: { SIFT_FEED_URL: FEED }, fetchImpl: w.fetchImpl, now: w.now, sleep: w.sleep });
    expect(status(r, 'relay')).toMatchObject({ status: 'skip', detail: 'skipped: SIFT_QUOTE_RELAY_URL is not set' });
    expect(r.ok).toBe(true);
    expect(w.relayCalls).toHaveLength(0);
    const r2 = await w.run({ SIFT_QUOTE_RELAY_URL: '   ' });
    expect(status(r2, 'relay').status).toBe('skip');
  });

  it('a relay URL that is not https fails (misconfiguration should be loud)', async () => {
    const w = healthy();
    expect(status(await w.run({ SIFT_QUOTE_RELAY_URL: 'http://relay.test' }), 'relay').status).toBe('fail');
  });

  it('skips, with a reason, when the feed has no game to take tickers from', async () => {
    const w = healthy();
    w.index = { schema: 'sift.live_quotes.index.v1', generated_at: w.gen(), status: 'NO_CURRENT_GAMES', games: [] };
    const r = await w.run();
    expect(status(r, 'game_file').status).toBe('skip');
    expect(status(r, 'relay').detail).toMatch(/no game file/);
    expect(r.ok).toBe(true); // a quiet day is not an outage
  });
});

describe('the game file', () => {
  it('fails when it cannot be read or is not a feed document', async () => {
    for (const game of [404, 'network', { schema: 'nope', markets: [] }] as const) {
      const w = new World();
      w.advanceEveryMs = 30_000;
      w.game = game;
      const r = await w.run();
      expect(status(r, 'game_file').status).toBe('fail');
      expect(r.ok).toBe(false);
    }
  });
  it('relayTickers prefers open markets and caps the batch', () => {
    const doc = { markets: [{ ticker: 'C', status: 'closed' }, ...Array.from({ length: 40 }, (_, i) => ({ ticker: `O${i}`, status: 'active' }))] };
    const t = relayTickers(doc, 25);
    expect(t).toHaveLength(25);
    expect(t).not.toContain('C');
    expect(relayTickers(undefined)).toEqual([]);
    expect(relayTickers({ markets: [{ ticker: 'C', status: 'closed' }] })).toEqual(['C']);
  });
});

describe('diagnostics', () => {
  it('every failure becomes a GitHub error annotation and the report ends with the verdict', async () => {
    const w = new World();
    w.feedAge = 25 * 60_000;
    w.relay = { status: 503 };
    const r = await w.run();
    const text = report(r);
    expect(text).toMatch(/::error title=Quote monitor: Feed generated_at is recent::newest generated_at is .* 1500s old; limit 600s/);
    expect(text).toMatch(/::error title=Quote monitor: Relay quote batch::relay answered HTTP 503/);
    expect(text.trim().split('\n').at(-1)).toBe('RESULT: FAIL');
    expect(summaryMarkdown(r)).toMatch(/### Quote monitor: FAIL[\s\S]*\*\*FAIL\*\*/);
  });
});

describe('CLI exit code (real process, local HTTP server standing in for the feed)', () => {
  let server: Server | null = null;
  afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

  async function serve(feedAgeMs: number, healthSeq: () => number) {
    server = createServer((req, res) => {
      const gen = new Date(Date.now() - feedAgeMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const send = (body: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
      if (req.url === '/index.json') return send({ schema: 'sift.live_quotes.index.v1', generated_at: gen, status: 'NO_CURRENT_GAMES', games: [] });
      if (req.url === '/health.json') return send({ schema: 'sift.live_quotes.health.v1', generated_at: gen, run_id: '1', sequence: healthSeq() });
      res.statusCode = 404;
      res.end('nope');
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  const cli = (url: string, extra: Record<string, string> = {}) =>
    new Promise<{ code: number | null; out: string }>((resolve) => {
      // An async child: a synchronous one would block the in-process server it talks to.
      const p = spawn(process.execPath, [join(__dirname, '..', '..', 'scripts', 'quote-monitor.mjs')], {
        env: { PATH: process.env.PATH ?? '', SIFT_FEED_URL: url, SIFT_MONITOR_SEQUENCE_WINDOW_S: '5', SIFT_MONITOR_POLL_S: '0.05', ...extra },
      });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (out += d));
      p.on('close', (code) => resolve({ code, out }));
    });

  it('exits 0 for a healthy feed whose heartbeat advances (relay part skipped: no URL)', async () => {
    let n = 0;
    const url = await serve(30_000, () => 1 + Math.floor(n++ / 2));
    const r = await cli(url);
    expect(r.out).toMatch(/RESULT: PASS/);
    expect(r.out).toMatch(/\[SKIP\] Relay quote batch: skipped: SIFT_QUOTE_RELAY_URL is not set/);
    expect(r.code).toBe(0);
  }, 20_000);

  it('exits 1 for a stalled feed', async () => {
    const url = await serve(30 * 60_000, () => 1);
    const r = await cli(url);
    expect(r.out).toMatch(/::error title=Quote monitor: Feed generated_at is recent::/);
    expect(r.code).toBe(1);
  }, 20_000);

  it('exits 1 when the sequence does not advance', async () => {
    const url = await serve(30_000, () => 1);
    const r = await cli(url, { SIFT_MONITOR_SEQUENCE_WINDOW_S: '0.3' });
    expect(r.out).toMatch(/\[FAIL\] Heartbeat sequence advances: run 1 is still at sequence 1/);
    expect(r.code).toBe(1);
  }, 20_000);
});
