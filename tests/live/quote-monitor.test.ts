// The independent quote monitor (scripts/quote-monitor.mjs): every failure row of the spec, each boundary, the
// honest "heartbeat not published yet" state, and the CLI's exit code against a local server. Injected fetch,
// clock and sleep: no network, no waiting.
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { report, relayTickers, openTickers, runMonitor, summaryMarkdown, advanced, type MonitorResult } from '../../scripts/quote-monitor.mjs';

const FEED = 'https://feed.test/live-quotes';
const RELAY = 'https://relay.test/kalshi';
const T0 = Date.parse('2026-10-26T18:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const TICKERS = ['KXNHLGOAL-26OCT26TORCGY-TOR19', 'KXNHLGOAL-26OCT26TORCGY-CGY7', 'KXNHLPTS-26OCT26TORCGY-TOR19-2'];

interface RelaySpec { status: number; retryAfter?: string; observedAgeMs?: number | null; markets?: number; network?: boolean; /** answer with the requested tickers (minus relayDelisted) instead of `markets` canned ones */ echo?: boolean; /** answer 200 with markets for tickers nobody asked about */ unrelated?: boolean }

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
  relay: RelaySpec = { status: 200, observedAgeMs: 2_000, markets: 3 };
  /** One entry is consumed per relay call (then `relay` applies again): scripts a failure followed by a recovery. */
  relayQueue: RelaySpec[] = [];
  /** Tickers the relay answers nothing for (a delisted or closed contract), for specs with `echo`. */
  relayDelisted = new Set<string>();
  /** More games in the feed: each with its own tickers (all `active` unless `status` says otherwise). */
  extraGames: { key: string; tickers: string[]; status?: string }[] = [];
  gameStatus = 'active';
  /** Heartbeat poll period override in seconds (so a poll never equals a retry wait). */
  pollS: number | null = null;
  relayCalls: { url: string; origin: string | null }[] = [];
  private slept = 0;

  now = () => this.t;
  sleep = async (ms: number) => {
    this.sleeps.push(ms);
    this.t += ms;
    this.slept += ms;
  };

  gen = () => iso(this.t - this.feedAge);
  indexDoc = () => ({
    schema: 'sift.live_quotes.index.v1', generated_at: this.gen(), status: 'CURRENT_SLATE',
    games: [{ key: '26OCT26TORCGY', file: 'games/26OCT26TORCGY.json', markets: 3 }, ...this.extraGames.map((g) => ({ key: g.key, file: `games/${g.key}.json`, markets: g.tickers.length }))],
  });
  gameDoc = () => ({
    schema: 'sift.live_quotes.v1', game_key: '26OCT26TORCGY', generated_at: this.gen(), tickers_checked: TICKERS,
    markets: TICKERS.map((ticker) => ({ ticker, status: this.gameStatus, observed_at: iso(this.t - this.feedAge - 4_000) })),
  });
  extraDoc = (g: { key: string; tickers: string[]; status?: string }) => ({
    schema: 'sift.live_quotes.v1', game_key: g.key, generated_at: this.gen(), tickers_checked: g.tickers,
    markets: g.tickers.map((ticker) => ({ ticker, status: g.status ?? 'active', observed_at: iso(this.t - this.feedAge - 4_000) })),
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
      const spec = this.relayQueue.shift() ?? this.relay;
      if (spec.network) throw new TypeError('fetch failed');
      if (spec.status !== 200) return new Response('slow down', { status: spec.status, headers: spec.retryAfter ? { 'retry-after': spec.retryAfter } : {} });
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (spec.observedAgeMs !== null && spec.observedAgeMs !== undefined) headers['x-sift-observed-at'] = iso(this.t - spec.observedAgeMs);
      if (spec.echo || spec.unrelated) {
        const asked = decodeURIComponent(new URL(url).searchParams.get('tickers') ?? '').split(',').filter(Boolean);
        const markets = spec.unrelated ? [{ ticker: 'KXNHLGOAL-26OCT26ZZZ-OTHER1' }] : asked.filter((t) => !this.relayDelisted.has(t)).map((ticker) => ({ ticker }));
        return new Response(JSON.stringify({ markets }), { headers });
      }
      return new Response(JSON.stringify({ markets: Array.from({ length: spec.markets ?? 0 }, (_, i) => ({ ticker: TICKERS[i % 3] })) }), { headers });
    }
    if (url === `${FEED}/index.json`) return this.pick(this.index, this.indexDoc);
    if (url === `${FEED}/health.json`) {
      if (this.health === 'absent') return new Response('404: Not Found', { status: 404 });
      return this.pick(this.health, this.healthDoc);
    }
    if (url === `${FEED}/games/26OCT26TORCGY.json`) return this.pick(this.game, this.gameDoc);
    const extra = this.extraGames.find((g) => url === `${FEED}/games/${g.key}.json`);
    if (extra) return this.json(this.extraDoc(extra));
    return new Response('?', { status: 404 });
  };

  run(env: Record<string, string> = {}) {
    return runMonitor({ env: { SIFT_FEED_URL: FEED, SIFT_QUOTE_RELAY_URL: RELAY, ...(this.pollS != null ? { SIFT_MONITOR_POLL_S: String(this.pollS) } : {}), ...env }, fetchImpl: this.fetchImpl, now: this.now, sleep: this.sleep });
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
    expect(status(await empty.run(), 'relay').detail).toMatch(/no market for any of the 3 requested open contracts/);
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

describe('one transient failure inside a run is retried once; a recovered state passes', () => {
  const healthy = () => {
    const w = new World();
    w.pollS = 7;
    w.advanceEveryMs = 7_000;
    return w;
  };
  const retrySleeps = (w: World) => w.sleeps.filter((ms) => ms !== 7_000);

  it('relay 503, then 200: PASS, says so, one notice and no error annotation', async () => {
    const w = healthy();
    w.relayQueue = [{ status: 503 }];
    const r = await w.run();
    expect(r.ok).toBe(true);
    expect(r.status).toBe('PASS');
    expect(status(r, 'relay')).toMatchObject({ status: 'pass', recovered: true });
    expect(status(r, 'relay').detail).toMatch(/recovered on the single retry after 5s \(first attempt: relay answered HTTP 503/);
    expect(w.relayCalls).toHaveLength(2);
    expect(retrySleeps(w)).toEqual([5_000]);
    const text = report(r);
    expect(text).toMatch(/::notice title=Quote monitor: transient failure recovered::/);
    expect(text).not.toMatch(/::error/);
    expect(text).toMatch(/RESULT: PASS$/);
  });

  it('relay unreachable once, then fine: PASS', async () => {
    const w = healthy();
    w.relayQueue = [{ status: 200, network: true }];
    const r = await w.run();
    expect(r.ok).toBe(true);
    expect(status(r, 'relay').detail).toMatch(/first attempt: relay unreachable: fetch failed/);
  });

  it('relay 429 with Retry-After: waits the Retry-After (not less than 5 s, never more than 30 s), then passes', async () => {
    for (const [header, waited] of [['12', 12_000], ['2', 5_000], ['120', 30_000], [undefined, 5_000]] as const) {
      const w = healthy();
      w.relayQueue = [{ status: 429, retryAfter: header }];
      const r = await w.run();
      expect(r.ok, String(header)).toBe(true);
      expect(retrySleeps(w), String(header)).toEqual([waited]);
      expect(status(r, 'relay').detail).toMatch(header ? /first attempt: relay answered HTTP 429 \(Retry-After/ : /first attempt: relay answered HTTP 429/);
    }
  });

  it('429 on both attempts fails, reporting Retry-After and both attempts; there is no third attempt', async () => {
    const w = healthy();
    w.relay = { status: 429, retryAfter: '10' };
    const r = await w.run();
    expect(r.ok).toBe(false);
    expect(w.relayCalls).toHaveLength(2);
    expect(status(r, 'relay').detail).toMatch(/HTTP 429 \(Retry-After 10\).*the same on the single retry after 10s/);
  });

  it('5xx on both attempts fails with both reasons when they differ', async () => {
    const w = healthy();
    w.relayQueue = [{ status: 502 }, { status: 504 }];
    const r = await w.run();
    expect(r.ok).toBe(false);
    expect(status(r, 'relay').detail).toMatch(/HTTP 504.*the single retry after 5s failed too \(first attempt: relay answered HTTP 502/);
    expect(w.relayCalls).toHaveLength(2);
  });

  it('a configuration error (403, 404) is not transient: no retry, fails at once', async () => {
    for (const code of [403, 404]) {
      const w = healthy();
      w.relay = { status: code };
      const r = await w.run();
      expect(r.ok).toBe(false);
      expect(w.relayCalls).toHaveLength(1);
      expect(retrySleeps(w)).toEqual([]);
    }
  });

  it('an old observation (90 s) on the first attempt and a young one on the retry passes; old on both fails', async () => {
    const ok = healthy();
    ok.relayQueue = [{ status: 200, observedAgeMs: 90_000, markets: 3 }];
    const r1 = await ok.run();
    expect(r1.ok).toBe(true);
    expect(status(r1, 'relay').detail).toMatch(/first attempt: relay answered HTTP 200 but its newest observation .* is 90s old/);
    const bad = healthy();
    bad.relay = { status: 200, observedAgeMs: 90_000, markets: 3 };
    const r2 = await bad.run();
    expect(r2.ok).toBe(false);
    expect(bad.relayCalls).toHaveLength(2);
  });

  it('an unparseable relay body is transient too', async () => {
    const w = healthy();
    const real = w.fetchImpl;
    let n = 0;
    const r = await runMonitor({
      env: { SIFT_FEED_URL: FEED, SIFT_QUOTE_RELAY_URL: RELAY }, now: w.now, sleep: w.sleep,
      fetchImpl: async (u, i) => (u.startsWith(RELAY) && n++ === 0 ? new Response('<html>bad gateway page</html>', { status: 200 }) : real(u, i)),
    });
    expect(r.ok).toBe(true);
    expect(status(r, 'relay').detail).toMatch(/first attempt: relay answered HTTP 200 but the body has no markets/);
  });

  it('SIFT_MONITOR_RETRY_DELAY_S shortens the wait', async () => {
    const w = healthy();
    w.relayQueue = [{ status: 503 }];
    await w.run({ SIFT_MONITOR_RETRY_DELAY_S: '1' });
    expect(retrySleeps(w)).toEqual([1_000]);
  });

  it('a healthy run makes exactly one relay request and never mentions a retry', async () => {
    const w = healthy();
    const r = await w.run();
    expect(w.relayCalls).toHaveLength(1);
    expect(r.checks.some((c) => c.recovered)).toBe(false);
    expect(report(r)).not.toMatch(/retry|::notice/);
  });

  it('feed reads keep their own single retry (network blip on index.json, 5xx on the game file)', async () => {
    const w = healthy();
    const real = w.fetchImpl;
    const seen = new Set<string>();
    const r = await runMonitor({
      env: { SIFT_FEED_URL: FEED, SIFT_QUOTE_RELAY_URL: RELAY }, now: w.now, sleep: w.sleep,
      fetchImpl: async (u, i) => {
        if ((u.endsWith('/index.json') || u.includes('/games/')) && !seen.has(u)) {
          seen.add(u);
          if (u.endsWith('/index.json')) throw new TypeError('fetch failed');
          return new Response('oops', { status: 502 });
        }
        return real(u, i);
      },
    });
    expect(r.ok).toBe(true);
    expect(status(r, 'feed_index').status).toBe('pass');
    expect(status(r, 'game_file').status).toBe('pass');
  });
});

describe('empty and delisted markets (HTTP 200 with no usable requested ticker)', () => {
  const healthy = () => {
    const w = new World();
    w.advanceEveryMs = 30_000;
    w.relay = { status: 200, observedAgeMs: 2_000, echo: true };
    return w;
  };
  const askedTickers = (w: World, i: number) => decodeURIComponent(new URL(w.relayCalls[i].url).searchParams.get('tickers')!).split(',');

  it('a relay that answers 200 with nothing for the only game fails, after exactly one retry', async () => {
    const w = healthy();
    TICKERS.forEach((t) => w.relayDelisted.add(t));
    const r = await w.run();
    expect(r.ok).toBe(false);
    expect(w.relayCalls).toHaveLength(2);
    expect(status(r, 'relay').detail).toMatch(/HTTP 200 with no markets for the 1 game\(s\) tried, though the feed lists their contracts as open.*the same on the single retry/);
  });

  it('a delisted game is tolerated while another game answers: PASS, noted, and no retry is spent', async () => {
    const w = healthy();
    w.extraGames = [{ key: '26OCT26BOSNYR', tickers: ['KXNHLGOAL-26OCT26BOSNYR-BOS1', 'KXNHLGOAL-26OCT26BOSNYR-NYR2'] }];
    TICKERS.forEach((t) => w.relayDelisted.add(t)); // the first game's contracts are gone from the relay
    const r = await w.run();
    expect(r.ok).toBe(true);
    expect(w.relayCalls).toHaveLength(2); // game 1 (empty), then game 2 (answered): one round
    expect(askedTickers(w, 1)).toEqual(['KXNHLGOAL-26OCT26BOSNYR-BOS1', 'KXNHLGOAL-26OCT26BOSNYR-NYR2']);
    expect(status(r, 'relay').detail).toMatch(/2 of 2 requested markets from games\/26OCT26BOSNYR\.json.*1 other game\(s\) came back empty and are treated as delisted or closed/);
    expect(status(r, 'relay').recovered).toBeUndefined();
  });

  it('every game empty fails: three games tried, each file read once, one retry of the whole round', async () => {
    const w = healthy();
    w.extraGames = [
      { key: '26OCT26BOSNYR', tickers: ['KXNHLGOAL-26OCT26BOSNYR-BOS1'] },
      { key: '26OCT26MTLOTT', tickers: ['KXNHLGOAL-26OCT26MTLOTT-MTL1'] },
      { key: '26OCT26VANSEA', tickers: ['KXNHLGOAL-26OCT26VANSEA-VAN1'] },
    ];
    [...TICKERS, 'KXNHLGOAL-26OCT26BOSNYR-BOS1', 'KXNHLGOAL-26OCT26MTLOTT-MTL1', 'KXNHLGOAL-26OCT26VANSEA-VAN1'].forEach((t) => w.relayDelisted.add(t));
    const r = await w.run();
    expect(r.ok).toBe(false);
    expect(w.relayCalls).toHaveLength(6); // 3 games, twice; the fourth game is never tried
    expect(w.calls.filter((u) => u.endsWith('26OCT26BOSNYR.json'))).toHaveLength(1);
    expect(w.calls.filter((u) => u.endsWith('26OCT26VANSEA.json'))).toHaveLength(0);
    expect(status(r, 'relay').detail).toMatch(/no markets for the 3 game\(s\) tried/);
  });

  it('SIFT_MONITOR_RELAY_GAMES=1 judges the first game only', async () => {
    const w = healthy();
    w.extraGames = [{ key: '26OCT26BOSNYR', tickers: ['KXNHLGOAL-26OCT26BOSNYR-BOS1'] }];
    TICKERS.forEach((t) => w.relayDelisted.add(t));
    const r = await w.run({ SIFT_MONITOR_RELAY_GAMES: '1' });
    expect(r.ok).toBe(false);
    expect(w.relayCalls).toHaveLength(2);
  });

  it('a relay that answers only unrelated markets counts as empty', async () => {
    const w = healthy();
    w.relay = { status: 200, observedAgeMs: 1_000, unrelated: true };
    const r = await w.run();
    expect(r.ok).toBe(false);
    expect(status(r, 'relay').detail).toMatch(/no market for any of the 3 requested open contracts \(1 unrelated\)/);
  });

  it('a closed or settled market is never asserted: only open contracts are asked, and with none open the check is skipped', async () => {
    const mixed = healthy();
    mixed.relay = { status: 200, observedAgeMs: 1_000, echo: true };
    const real = mixed.gameDoc;
    mixed.game = { ...real(), markets: [{ ticker: TICKERS[0], status: 'active', observed_at: iso(T0 - 64_000) }, { ticker: TICKERS[1], status: 'closed', observed_at: iso(T0 - 64_000) }, { ticker: TICKERS[2], status: 'settled', observed_at: iso(T0 - 64_000) }] };
    const r1 = await mixed.run();
    expect(r1.ok).toBe(true);
    expect(askedTickers(mixed, 0)).toEqual([TICKERS[0]]);

    const none = healthy();
    none.gameStatus = 'closed';
    const r2 = await none.run();
    expect(none.relayCalls).toHaveLength(0);
    expect(status(r2, 'relay')).toMatchObject({ status: 'skip' });
    expect(status(r2, 'relay').detail).toMatch(/the feed lists no open contract/);
    expect(r2.ok).toBe(true); // a skip is reported as a skip, never as a pass
    expect(report(r2)).toMatch(/\[SKIP\] Relay quote batch/);
  });

  it('a partial answer (some requested contracts present) passes and says how many', async () => {
    const w = healthy();
    w.relayDelisted.add(TICKERS[1]);
    const r = await w.run();
    expect(r.ok).toBe(true);
    expect(status(r, 'relay').detail).toMatch(/HTTP 200, 2 of 3 requested markets/);
  });

  it('openTickers returns only open contracts, de-duplicated and capped', () => {
    const doc = { markets: [{ ticker: 'A', status: 'active' }, { ticker: 'A', status: 'active' }, { ticker: 'B', status: 'closed' }, { ticker: 'C', status: 'open' }, { ticker: 'D' }] };
    expect(openTickers(doc)).toEqual(['A', 'C']);
    expect(openTickers(doc, 1)).toEqual(['A']);
    expect(openTickers(null)).toEqual([]);
  });
});

describe('recovery on the next run: no false alarm (the monitor keeps no state between runs)', () => {
  it('an outage run fails; the next run, after recovery, passes with nothing left over from the outage', async () => {
    const w = new World();
    w.index = 503;
    w.relay = { status: 503 };
    const down = await w.run();
    expect(down.ok).toBe(false);
    expect(down.status).toBe('FAIL');

    w.index = null; // recovered
    w.relay = { status: 200, observedAgeMs: 2_000, markets: 3 };
    w.advanceEveryMs = 30_000;
    const up = await w.run();
    expect(up.ok).toBe(true);
    expect(up.status).toBe('PASS');
    expect(up.checks.every((c) => c.status === 'pass')).toBe(true);
    expect(up.checks.some((c) => c.recovered)).toBe(false);
    expect(report(up)).not.toMatch(/FAIL|::error|::notice|retry/i);
  });

  it('a relay 429 with Retry-After in one run does not affect the next run', async () => {
    const w = new World();
    w.advanceEveryMs = 30_000;
    w.relay = { status: 429, retryAfter: '600' };
    expect((await w.run()).ok).toBe(false);
    w.relay = { status: 200, observedAgeMs: 2_000, markets: 3 };
    w.relayCalls.length = 0;
    const next = await w.run();
    expect(next.ok).toBe(true);
    expect(w.relayCalls).toHaveLength(1); // asked at once: Retry-After is not remembered across runs
  });

  it('a stalled heartbeat fails one run; once the loop has been handed over (new run id) the next run passes', async () => {
    const w = new World();
    const stalled = await w.run();
    expect(status(stalled, 'heartbeat_advance').status).toBe('fail');
    w.advanceEveryMs = 60_000;
    const healed = await w.run();
    expect(healed.ok).toBe(true);
    expect(status(healed, 'heartbeat_advance').status).toBe('pass');
  });

  it('a stale feed fails; a fresh one passes on the next run', async () => {
    const w = new World();
    w.feedAge = 25 * 60_000;
    expect((await w.run()).ok).toBe(false);
    w.feedAge = 60_000;
    w.advanceEveryMs = 30_000;
    expect((await w.run()).ok).toBe(true);
  });

  it('two healthy runs in a row behave identically', async () => {
    const w = new World();
    w.advanceEveryMs = 30_000;
    const a = await w.run();
    const b = await w.run();
    expect(b.checks.map((c) => [c.id, c.status])).toEqual(a.checks.map((c) => [c.id, c.status]));
  });
});

describe('heartbeat sequence behaviour', () => {
  it('a jump of several sequences counts as advanced', async () => {
    const w = new World();
    w.advanceEveryMs = 10_000; // seven polls of 30 s are not needed: it moves by 3 on the first poll
    const r = await w.run();
    expect(status(r, 'heartbeat_advance').detail).toMatch(/sequence 7 -> run 9001 sequence 10 after 30s/);
  });

  it('the sequence is the signal: a newer generated_at with the same sequence and run id is NOT progress', async () => {
    const w = new World();
    const base = w.healthDoc;
    let reads = 0;
    w.health = undefined; // use the default builder via override below
    const real = w.fetchImpl;
    const r = await runMonitor({
      env: { SIFT_FEED_URL: FEED, SIFT_MONITOR_SEQUENCE_WINDOW_S: '120' }, now: w.now, sleep: w.sleep,
      fetchImpl: async (u, i) => (u === `${FEED}/health.json` ? new Response(JSON.stringify({ ...base(), generated_at: iso(w.t - 1_000 * ++reads) }), { headers: { 'content-type': 'application/json' } }) : real(u, i)),
    });
    expect(status(r, 'heartbeat_advance').status).toBe('fail');
    expect(status(r, 'heartbeat_advance').detail).toMatch(/run 9001 is still at sequence 7/);
  });

  it('polls every 30 s, ends the moment it moves, and never waits when the feed is already stale', async () => {
    const moving = new World();
    moving.advanceEveryMs = 90_000;
    await moving.run();
    expect(moving.sleeps.filter((ms) => ms === 30_000)).toHaveLength(3);
    const stale = new World();
    stale.feedAge = 30 * 60_000;
    await stale.run();
    expect(stale.sleeps).toEqual([]);
  });

  it('a 5xx on a re-read is retried once and does not break the wait', async () => {
    const w = new World();
    w.advanceEveryMs = 30_000;
    const real = w.fetchImpl;
    let reads = 0;
    const r = await runMonitor({
      env: { SIFT_FEED_URL: FEED }, now: w.now, sleep: w.sleep,
      fetchImpl: async (u, i) => (u === `${FEED}/health.json` && ++reads === 2 ? new Response('upstream', { status: 502 }) : real(u, i)),
    });
    expect(status(r, 'heartbeat_advance').status).toBe('pass');
  });

  it('health.json disappearing mid-window is named in the failure when the sequence never moved', async () => {
    const w = new World();
    const real = w.fetchImpl;
    let reads = 0;
    const r = await runMonitor({
      env: { SIFT_FEED_URL: FEED, SIFT_MONITOR_SEQUENCE_WINDOW_S: '90' }, now: w.now, sleep: w.sleep,
      fetchImpl: async (u, i) => (u === `${FEED}/health.json` && ++reads > 1 ? new Response('404: Not Found', { status: 404 }) : real(u, i)),
    });
    expect(status(r, 'heartbeat_advance').status).toBe('fail');
    expect(status(r, 'heartbeat_advance').detail).toMatch(/last re-read: health.json disappeared \(HTTP 404\)/);
  });

  it('advancing exactly at the end of the window passes; one poll later fails', async () => {
    const edge = new World();
    edge.advanceEveryMs = 540_000; // moves at 9 minutes
    expect(status(await edge.run(), 'heartbeat_advance').status).toBe('pass');
    const late = new World();
    late.advanceEveryMs = 570_000; // would move at 9.5 minutes
    expect(status(await late.run(), 'heartbeat_advance').status).toBe('fail');
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
