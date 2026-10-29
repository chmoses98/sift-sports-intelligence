// CHARACTERISATION of the production quote path (defaultProvider() -> QuoteStore.refreshNow -> packet preflight ->
// buildPacket), pinned against what `origin/main` does today.
//
// Written FIRST against main and run there (all green), then run unchanged on the quote-track branch: the packet
// preflight path must not move. It uses only APIs that exist on main (defaultProvider, QuoteStore, preflightQuotes,
// packetLiveInputs, buildPacket), the real provider classes and a fake network (relay + feed behind a stubbed
// global fetch), and it records the observable outcome of every step: which URLs were asked and in what order,
// the quote that was kept per ticker (source, observation offset, price), fallback provenance, preflight
// classifications, the packet notes and a hash of the whole rendered packet.
//
// Scenarios: relay 429 (Retry-After), recovery after Retry-After, feed fallback (relay down / 503), a relay 200
// with old data, a partial 200, an empty 200, a relay answer without X-Sift-Observed-At, both sources failing, and
// the inventory order. The expectations are inline snapshots taken from main.
import { createHash } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventDetailDoc } from '../../src/contract/types';
import { defaultProvider } from '../../src/live/config';
import { packetLiveInputs, preflightQuotes } from '../../src/live/preflight';
import { QuoteStore } from '../../src/live/store';
import { buildPacket, packetScopeMarkets } from '../../src/packet/build';
import { renderText } from '../../src/packet/render';
import { nflRepo, readSnapshot, useDiskFetch } from '../helpers';
import { FakeEnv } from './fakes';

const GAME = 'evt_0cb333291f580a201a70'; // NE @ BUF
const detail = readSnapshot<EventDetailDoc>(`event_detail/${GAME}.json`);
const ML = detail.markets.find((m) => m.kalshi_ticker === 'KXNFLGAME-26OCT04NEBUF-BUF') ?? detail.markets[0];
const BASE = Date.parse(ML.captured_at!) + 15 * 3600e3; // 15 h after the publication capture
const RELAY = 'https://relay.example/kalshi';
const FEED = 'https://feed.example/q';
const EVENT = 'KXNFLGAME-26OCT04NEBUF';
const ALL = detail.markets.map((m) => m.kalshi_ticker);

type RelayMode = 'ok' | '429' | 'down' | '503' | 'empty' | 'partial' | 'noheader';
type FeedMode = 'ok' | '404' | 'down';
interface World {
  relay: RelayMode;
  relayAgeMs: number;
  retryAfter: number | null;
  feed: FeedMode;
  feedAgeMs: number;
}
const world: World = { relay: 'ok', relayAgeMs: 2_000, retryAfter: null, feed: 'ok', feedAgeMs: 150_000 };
let calls: string[] = [];
let stepNow = BASE;

const iso = (ms: number) => new Date(ms).toISOString();
const raw = (t: string) => ({
  ticker: t, event_ticker: EVENT, series_ticker: 'KXNFLGAME', status: 'active',
  yes_bid_dollars: '0.4100', yes_ask_dollars: '0.4300', no_bid_dollars: '0.5700', no_ask_dollars: '0.5900', last_price_dollars: '0.4200',
  volume_fp: '100.00', open_interest_fp: '50.00', title: t,
});
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

async function fakeFetch(input: unknown): Promise<Response> {
  const url = String(input);
  const at = Math.round((Date.now() - stepNow) / 1000);
  if (url.startsWith(RELAY)) {
    const q = new URL(url).searchParams;
    const wanted = (q.get('tickers') ?? '').split(',').filter(Boolean);
    const label = q.get('tickers') ? `relay tickers=${wanted.length}` : `relay ${q.get('series_ticker') ? 'series' : 'other'}`;
    calls.push(`+${at}s ${label}`);
    switch (world.relay) {
      case '429': return new Response('{"error":"rate limited"}', { status: 429, headers: world.retryAfter != null ? { 'retry-after': String(world.retryAfter) } : {} });
      case '503': return new Response('upstream', { status: 503 });
      case 'down': throw new TypeError('fetch failed');
      case 'empty': return json({ markets: [], cursor: '' }, { headers: { 'x-sift-observed-at': iso(Date.now() - world.relayAgeMs) } });
      default: {
        const listed = q.get('series_ticker') ? ALL : wanted;
        const subset = world.relay === 'partial' ? listed.filter((_, i) => i % 2 === 0) : listed;
        const headers: Record<string, string> = world.relay === 'noheader' ? {} : { 'x-sift-observed-at': iso(Date.now() - world.relayAgeMs) };
        return json({ markets: subset.map(raw), cursor: '' }, { headers });
      }
    }
  }
  if (url.startsWith(FEED)) {
    calls.push(`+${at}s feed ${url.slice(FEED.length)}`);
    if (world.feed === 'down') throw new TypeError('fetch failed');
    if (world.feed === '404') return new Response('Not Found', { status: 404 });
    return json({
      schema: 'sift.live_quotes.v1', game_key: '26OCT04NEBUF', generated_at: iso(Date.now() - world.feedAgeMs), source: 'test',
      tickers_checked: ALL, markets: ALL.map((t) => ({ ...raw(t), observed_at: iso(Date.now() - world.feedAgeMs) })),
    });
  }
  throw new Error(`unexpected network call ${url}`);
}

interface Step { afterSec: number; set?: Partial<World>; inventory?: boolean }

async function play(steps: Step[]) {
  const store = new QuoteStore({ provider: defaultProvider(), env: new FakeEnv(), persistence: null, random: () => 0.5 });
  const repo = nflRepo();
  const markets = await packetScopeMarkets(repo, { scope: 'GAME', eventId: GAME });
  const out: unknown[] = [];
  for (const s of steps) {
    stepNow = BASE + s.afterSec * 1000;
    vi.setSystemTime(stepNow);
    Object.assign(world, s.set ?? {});
    calls = [];
    let inv: unknown = null;
    if (s.inventory) {
      const r = await store.refreshNow([], { events: [EVENT], timeoutMs: 8_000 });
      inv = { failed: r.failed.length, error: r.error };
    }
    const summary = await preflightQuotes(markets, store, { timeoutMs: 8_000 });
    const live = packetLiveInputs(markets, store, summary);
    const pkt = await buildPacket(repo, { scope: 'GAME', eventId: GAME, generatedAt: iso(stepNow), live });
    const bySource: Record<string, number> = {};
    const offsets = new Set<number>();
    for (const t of ALL) {
      const q = store.quote(t);
      if (!q) continue;
      bySource[q.source] = (bySource[q.source] ?? 0) + 1;
      offsets.add(Math.round((Date.parse(q.observedAt) - stepNow) / 1000));
    }
    const ml = store.quote(ML.kalshi_ticker);
    const d = store.diagnostics();
    out.push({
      afterSec: s.afterSec,
      calls: summariseCalls(calls),
      inventory: inv,
      preflight: {
        status: summary.status, provider: summary.provider, markets: summary.markets, refreshed: summary.refreshed, failed: summary.failed,
        missing: summary.missing, live: summary.live, counts: summary.counts, availability: summary.availability,
        oldestAgeSec: summary.oldestAgeMs == null ? null : Math.round(summary.oldestAgeMs / 1000), error: summary.error, timedOut: summary.timedOut,
      },
      kept: { bySource, observedOffsetsSec: [...offsets].sort((a, b) => a - b), ml: ml && { yesBid: ml.yesBid, source: ml.source, offsetSec: Math.round((Date.parse(ml.observedAt) - stepNow) / 1000), availability: ml.availability } },
      diagnostics: {
        answeredBy: d.answeredBy, fallback: d.fallback && { provider: d.fallback.provider, status: d.fallback.status, error: d.fallback.error },
        requests: d.requests, batches: d.batches, tickersRequested: d.tickersRequested, tickersRefreshed: d.tickersRefreshed, tickersFailed: d.tickersFailed,
        tickersMissing: d.tickersMissing, consecutiveFailures: d.consecutiveFailures, lastError: d.lastError,
        inventoryAnsweredBy: d.inventoryAnsweredBy, inventoryFallback: d.inventoryFallback && { provider: d.inventoryFallback.provider, status: d.inventoryFallback.status, error: d.inventoryFallback.error },
      },
      packet: {
        notes: live.notes, sources: live.sources, marketFreshness: pkt.quality.market_freshness, qualitySources: pkt.quality.sources,
        mlRow: { yes_bid: pkt.markets.find((m) => m.kalshi_ticker === ML.kalshi_ticker)!.yes_bid, freshness: pkt.markets.find((m) => m.kalshi_ticker === ML.kalshi_ticker)!.freshness },
        sha256: createHash('sha256').update(renderText(pkt)).digest('hex').slice(0, 16),
      },
    });
  }
  store.dispose();
  return out;
}

/** Order of the first calls, then the total and a count per distinct call (796 tickers = 8 relay batches). */
function summariseCalls(c: string[]) {
  const byCall: Record<string, number> = {};
  for (const x of c) byCall[x] = (byCall[x] ?? 0) + 1;
  return { total: c.length, firstSix: c.slice(0, 6), byCall };
}

beforeAll(() => useDiskFetch());
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(BASE);
  vi.stubGlobal('fetch', fakeFetch);
  vi.stubEnv('VITE_SIFT_QUOTE_RELAY_URL', RELAY);
  vi.stubEnv('VITE_SIFT_QUOTE_FEED_URL', FEED);
  Object.assign(world, { relay: 'ok', relayAgeMs: 2_000, retryAfter: null, feed: 'ok', feedAgeMs: 150_000 } satisfies World);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('production chain on origin/main (characterisation)', () => {
  it('relay answers: the relay quote is kept, the feed is never asked', async () => {
    expect(await play([{ afterSec: 0 }])).toMatchInlineSnapshot(`
      [
        {
          "afterSec": 0,
          "calls": {
            "byCall": {
              "+0s relay tickers=100": 7,
              "+0s relay tickers=96": 1,
            },
            "firstSix": [
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
            ],
            "total": 8,
          },
          "diagnostics": {
            "answeredBy": "kalshi-relay",
            "batches": 8,
            "consecutiveFailures": 0,
            "fallback": null,
            "inventoryAnsweredBy": null,
            "inventoryFallback": null,
            "lastError": null,
            "requests": 8,
            "tickersFailed": 0,
            "tickersMissing": 0,
            "tickersRefreshed": 796,
            "tickersRequested": 796,
          },
          "inventory": null,
          "kept": {
            "bySource": {
              "kalshi-relay": 796,
            },
            "ml": {
              "availability": "OPEN",
              "offsetSec": -2,
              "source": "kalshi-relay",
              "yesBid": 0.41,
            },
            "observedOffsetsSec": [
              -2,
            ],
          },
          "packet": {
            "marketFreshness": "FRESH",
            "mlRow": {
              "freshness": "FRESH",
              "yes_bid": 0.41,
            },
            "notes": [],
            "qualitySources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
              "kalshi markets",
              "model prices",
              "packet.game_script_inputs.player_opportunity",
              "packet.simulation.player_projections",
              "packet.team_profiles",
              "packet.team_profiles.adjusted",
              "schedule_cache.csv",
            ],
            "sha256": "d6b771f6be786a3d",
            "sources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
            ],
          },
          "preflight": {
            "availability": {
              "CLOSED": 0,
              "OPEN": 796,
              "SETTLED": 0,
              "SUSPENDED": 0,
              "UNKNOWN": 0,
              "UNOPENED": 0,
            },
            "counts": {
              "AGING": 0,
              "FRESH": 796,
              "STALE": 0,
              "UNKNOWN": 0,
            },
            "error": null,
            "failed": 0,
            "live": 796,
            "markets": 796,
            "missing": 0,
            "oldestAgeSec": 2,
            "provider": "Kalshi public market data via relay (relay.example), then Sift quote feed (Kalshi public data via GitHub Actions, every 3 min)",
            "refreshed": 796,
            "status": "PASS",
            "timedOut": false,
          },
        },
      ]
    `);
  });

  it('relay 429 with Retry-After: the feed answers; the relay is asked again on every later refresh', async () => {
    const trace = await play([
      { afterSec: 0, set: { relay: '429', retryAfter: 60 } },
      { afterSec: 20 }, // still inside Retry-After
      { afterSec: 45 },
    ]);
    expect(trace).toMatchInlineSnapshot(`
      [
        {
          "afterSec": 0,
          "calls": {
            "byCall": {
              "+0s feed /games/26OCT04NEBUF.json": 8,
              "+0s relay tickers=100": 7,
              "+0s relay tickers=96": 1,
            },
            "firstSix": [
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
            ],
            "total": 16,
          },
          "diagnostics": {
            "answeredBy": "quote-feed",
            "batches": 8,
            "consecutiveFailures": 0,
            "fallback": {
              "error": "rate_limited: rate limited (HTTP 429)",
              "provider": "kalshi-relay",
              "status": 429,
            },
            "inventoryAnsweredBy": null,
            "inventoryFallback": null,
            "lastError": null,
            "requests": 8,
            "tickersFailed": 0,
            "tickersMissing": 0,
            "tickersRefreshed": 796,
            "tickersRequested": 796,
          },
          "inventory": null,
          "kept": {
            "bySource": {
              "quote-feed": 796,
            },
            "ml": {
              "availability": "OPEN",
              "offsetSec": -150,
              "source": "quote-feed",
              "yesBid": 0.41,
            },
            "observedOffsetsSec": [
              -150,
            ],
          },
          "packet": {
            "marketFreshness": "FRESH",
            "mlRow": {
              "freshness": "FRESH",
              "yes_bid": 0.41,
            },
            "notes": [],
            "qualitySources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
              "kalshi markets",
              "model prices",
              "packet.game_script_inputs.player_opportunity",
              "packet.simulation.player_projections",
              "packet.team_profiles",
              "packet.team_profiles.adjusted",
              "schedule_cache.csv",
            ],
            "sha256": "8dcf098e9811eae9",
            "sources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
            ],
          },
          "preflight": {
            "availability": {
              "CLOSED": 0,
              "OPEN": 796,
              "SETTLED": 0,
              "SUSPENDED": 0,
              "UNKNOWN": 0,
              "UNOPENED": 0,
            },
            "counts": {
              "AGING": 0,
              "FRESH": 796,
              "STALE": 0,
              "UNKNOWN": 0,
            },
            "error": null,
            "failed": 0,
            "live": 796,
            "markets": 796,
            "missing": 0,
            "oldestAgeSec": 150,
            "provider": "Kalshi public market data via relay (relay.example), then Sift quote feed (Kalshi public data via GitHub Actions, every 3 min)",
            "refreshed": 796,
            "status": "PASS",
            "timedOut": false,
          },
        },
        {
          "afterSec": 20,
          "calls": {
            "byCall": {
              "+0s feed /games/26OCT04NEBUF.json": 8,
              "+0s relay tickers=100": 7,
              "+0s relay tickers=96": 1,
            },
            "firstSix": [
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
            ],
            "total": 16,
          },
          "diagnostics": {
            "answeredBy": "quote-feed",
            "batches": 16,
            "consecutiveFailures": 0,
            "fallback": {
              "error": "rate_limited: rate limited (HTTP 429)",
              "provider": "kalshi-relay",
              "status": 429,
            },
            "inventoryAnsweredBy": null,
            "inventoryFallback": null,
            "lastError": null,
            "requests": 16,
            "tickersFailed": 0,
            "tickersMissing": 0,
            "tickersRefreshed": 1592,
            "tickersRequested": 1592,
          },
          "inventory": null,
          "kept": {
            "bySource": {
              "quote-feed": 796,
            },
            "ml": {
              "availability": "OPEN",
              "offsetSec": -150,
              "source": "quote-feed",
              "yesBid": 0.41,
            },
            "observedOffsetsSec": [
              -150,
            ],
          },
          "packet": {
            "marketFreshness": "FRESH",
            "mlRow": {
              "freshness": "FRESH",
              "yes_bid": 0.41,
            },
            "notes": [],
            "qualitySources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
              "kalshi markets",
              "model prices",
              "packet.game_script_inputs.player_opportunity",
              "packet.simulation.player_projections",
              "packet.team_profiles",
              "packet.team_profiles.adjusted",
              "schedule_cache.csv",
            ],
            "sha256": "bfeb8602517a6a0e",
            "sources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
            ],
          },
          "preflight": {
            "availability": {
              "CLOSED": 0,
              "OPEN": 796,
              "SETTLED": 0,
              "SUSPENDED": 0,
              "UNKNOWN": 0,
              "UNOPENED": 0,
            },
            "counts": {
              "AGING": 0,
              "FRESH": 796,
              "STALE": 0,
              "UNKNOWN": 0,
            },
            "error": null,
            "failed": 0,
            "live": 796,
            "markets": 796,
            "missing": 0,
            "oldestAgeSec": 150,
            "provider": "Kalshi public market data via relay (relay.example), then Sift quote feed (Kalshi public data via GitHub Actions, every 3 min)",
            "refreshed": 796,
            "status": "PASS",
            "timedOut": false,
          },
        },
        {
          "afterSec": 45,
          "calls": {
            "byCall": {
              "+0s feed /games/26OCT04NEBUF.json": 8,
              "+0s relay tickers=100": 7,
              "+0s relay tickers=96": 1,
            },
            "firstSix": [
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
            ],
            "total": 16,
          },
          "diagnostics": {
            "answeredBy": "quote-feed",
            "batches": 24,
            "consecutiveFailures": 0,
            "fallback": {
              "error": "rate_limited: rate limited (HTTP 429)",
              "provider": "kalshi-relay",
              "status": 429,
            },
            "inventoryAnsweredBy": null,
            "inventoryFallback": null,
            "lastError": null,
            "requests": 24,
            "tickersFailed": 0,
            "tickersMissing": 0,
            "tickersRefreshed": 2388,
            "tickersRequested": 2388,
          },
          "inventory": null,
          "kept": {
            "bySource": {
              "quote-feed": 796,
            },
            "ml": {
              "availability": "OPEN",
              "offsetSec": -150,
              "source": "quote-feed",
              "yesBid": 0.41,
            },
            "observedOffsetsSec": [
              -150,
            ],
          },
          "packet": {
            "marketFreshness": "FRESH",
            "mlRow": {
              "freshness": "FRESH",
              "yes_bid": 0.41,
            },
            "notes": [],
            "qualitySources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
              "kalshi markets",
              "model prices",
              "packet.game_script_inputs.player_opportunity",
              "packet.simulation.player_projections",
              "packet.team_profiles",
              "packet.team_profiles.adjusted",
              "schedule_cache.csv",
            ],
            "sha256": "d071d2e756465d6c",
            "sources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
            ],
          },
          "preflight": {
            "availability": {
              "CLOSED": 0,
              "OPEN": 796,
              "SETTLED": 0,
              "SUSPENDED": 0,
              "UNKNOWN": 0,
              "UNOPENED": 0,
            },
            "counts": {
              "AGING": 0,
              "FRESH": 796,
              "STALE": 0,
              "UNKNOWN": 0,
            },
            "error": null,
            "failed": 0,
            "live": 796,
            "markets": 796,
            "missing": 0,
            "oldestAgeSec": 150,
            "provider": "Kalshi public market data via relay (relay.example), then Sift quote feed (Kalshi public data via GitHub Actions, every 3 min)",
            "refreshed": 796,
            "status": "PASS",
            "timedOut": false,
          },
        },
      ]
    `);
  });

  it('recovery after Retry-After: the relay answers again and its newer observation wins', async () => {
    const trace = await play([
      { afterSec: 0, set: { relay: '429', retryAfter: 30 } },
      { afterSec: 31, set: { relay: 'ok' } },
    ]);
    expect(trace).toMatchInlineSnapshot(`
      [
        {
          "afterSec": 0,
          "calls": {
            "byCall": {
              "+0s feed /games/26OCT04NEBUF.json": 8,
              "+0s relay tickers=100": 7,
              "+0s relay tickers=96": 1,
            },
            "firstSix": [
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
            ],
            "total": 16,
          },
          "diagnostics": {
            "answeredBy": "quote-feed",
            "batches": 8,
            "consecutiveFailures": 0,
            "fallback": {
              "error": "rate_limited: rate limited (HTTP 429)",
              "provider": "kalshi-relay",
              "status": 429,
            },
            "inventoryAnsweredBy": null,
            "inventoryFallback": null,
            "lastError": null,
            "requests": 8,
            "tickersFailed": 0,
            "tickersMissing": 0,
            "tickersRefreshed": 796,
            "tickersRequested": 796,
          },
          "inventory": null,
          "kept": {
            "bySource": {
              "quote-feed": 796,
            },
            "ml": {
              "availability": "OPEN",
              "offsetSec": -150,
              "source": "quote-feed",
              "yesBid": 0.41,
            },
            "observedOffsetsSec": [
              -150,
            ],
          },
          "packet": {
            "marketFreshness": "FRESH",
            "mlRow": {
              "freshness": "FRESH",
              "yes_bid": 0.41,
            },
            "notes": [],
            "qualitySources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
              "kalshi markets",
              "model prices",
              "packet.game_script_inputs.player_opportunity",
              "packet.simulation.player_projections",
              "packet.team_profiles",
              "packet.team_profiles.adjusted",
              "schedule_cache.csv",
            ],
            "sha256": "8dcf098e9811eae9",
            "sources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
            ],
          },
          "preflight": {
            "availability": {
              "CLOSED": 0,
              "OPEN": 796,
              "SETTLED": 0,
              "SUSPENDED": 0,
              "UNKNOWN": 0,
              "UNOPENED": 0,
            },
            "counts": {
              "AGING": 0,
              "FRESH": 796,
              "STALE": 0,
              "UNKNOWN": 0,
            },
            "error": null,
            "failed": 0,
            "live": 796,
            "markets": 796,
            "missing": 0,
            "oldestAgeSec": 150,
            "provider": "Kalshi public market data via relay (relay.example), then Sift quote feed (Kalshi public data via GitHub Actions, every 3 min)",
            "refreshed": 796,
            "status": "PASS",
            "timedOut": false,
          },
        },
        {
          "afterSec": 31,
          "calls": {
            "byCall": {
              "+0s relay tickers=100": 7,
              "+0s relay tickers=96": 1,
            },
            "firstSix": [
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
            ],
            "total": 8,
          },
          "diagnostics": {
            "answeredBy": "kalshi-relay",
            "batches": 16,
            "consecutiveFailures": 0,
            "fallback": null,
            "inventoryAnsweredBy": null,
            "inventoryFallback": null,
            "lastError": null,
            "requests": 16,
            "tickersFailed": 0,
            "tickersMissing": 0,
            "tickersRefreshed": 1592,
            "tickersRequested": 1592,
          },
          "inventory": null,
          "kept": {
            "bySource": {
              "kalshi-relay": 796,
            },
            "ml": {
              "availability": "OPEN",
              "offsetSec": -2,
              "source": "kalshi-relay",
              "yesBid": 0.41,
            },
            "observedOffsetsSec": [
              -2,
            ],
          },
          "packet": {
            "marketFreshness": "FRESH",
            "mlRow": {
              "freshness": "FRESH",
              "yes_bid": 0.41,
            },
            "notes": [],
            "qualitySources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
              "kalshi markets",
              "model prices",
              "packet.game_script_inputs.player_opportunity",
              "packet.simulation.player_projections",
              "packet.team_profiles",
              "packet.team_profiles.adjusted",
              "schedule_cache.csv",
            ],
            "sha256": "c4e613e5f125b936",
            "sources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
            ],
          },
          "preflight": {
            "availability": {
              "CLOSED": 0,
              "OPEN": 796,
              "SETTLED": 0,
              "SUSPENDED": 0,
              "UNKNOWN": 0,
              "UNOPENED": 0,
            },
            "counts": {
              "AGING": 0,
              "FRESH": 796,
              "STALE": 0,
              "UNKNOWN": 0,
            },
            "error": null,
            "failed": 0,
            "live": 796,
            "markets": 796,
            "missing": 0,
            "oldestAgeSec": 2,
            "provider": "Kalshi public market data via relay (relay.example), then Sift quote feed (Kalshi public data via GitHub Actions, every 3 min)",
            "refreshed": 796,
            "status": "PASS",
            "timedOut": false,
          },
        },
      ]
    `);
  });

  it('feed fallback when the relay is unreachable, then a feed 404 for the game as well', async () => {
    const trace = await play([
      { afterSec: 0, set: { relay: 'down' } },
      { afterSec: 30, set: { feedAgeMs: 200_000 } },
      { afterSec: 60, set: { feed: '404' } },
    ]);
    expect(trace).toMatchInlineSnapshot(`
      [
        {
          "afterSec": 0,
          "calls": {
            "byCall": {
              "+0s feed /games/26OCT04NEBUF.json": 8,
              "+0s relay tickers=100": 7,
              "+0s relay tickers=96": 1,
            },
            "firstSix": [
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
            ],
            "total": 16,
          },
          "diagnostics": {
            "answeredBy": "quote-feed",
            "batches": 8,
            "consecutiveFailures": 0,
            "fallback": {
              "error": "network: network error: fetch failed",
              "provider": "kalshi-relay",
              "status": null,
            },
            "inventoryAnsweredBy": null,
            "inventoryFallback": null,
            "lastError": null,
            "requests": 8,
            "tickersFailed": 0,
            "tickersMissing": 0,
            "tickersRefreshed": 796,
            "tickersRequested": 796,
          },
          "inventory": null,
          "kept": {
            "bySource": {
              "quote-feed": 796,
            },
            "ml": {
              "availability": "OPEN",
              "offsetSec": -150,
              "source": "quote-feed",
              "yesBid": 0.41,
            },
            "observedOffsetsSec": [
              -150,
            ],
          },
          "packet": {
            "marketFreshness": "FRESH",
            "mlRow": {
              "freshness": "FRESH",
              "yes_bid": 0.41,
            },
            "notes": [],
            "qualitySources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
              "kalshi markets",
              "model prices",
              "packet.game_script_inputs.player_opportunity",
              "packet.simulation.player_projections",
              "packet.team_profiles",
              "packet.team_profiles.adjusted",
              "schedule_cache.csv",
            ],
            "sha256": "8dcf098e9811eae9",
            "sources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
            ],
          },
          "preflight": {
            "availability": {
              "CLOSED": 0,
              "OPEN": 796,
              "SETTLED": 0,
              "SUSPENDED": 0,
              "UNKNOWN": 0,
              "UNOPENED": 0,
            },
            "counts": {
              "AGING": 0,
              "FRESH": 796,
              "STALE": 0,
              "UNKNOWN": 0,
            },
            "error": null,
            "failed": 0,
            "live": 796,
            "markets": 796,
            "missing": 0,
            "oldestAgeSec": 150,
            "provider": "Kalshi public market data via relay (relay.example), then Sift quote feed (Kalshi public data via GitHub Actions, every 3 min)",
            "refreshed": 796,
            "status": "PASS",
            "timedOut": false,
          },
        },
        {
          "afterSec": 30,
          "calls": {
            "byCall": {
              "+0s feed /games/26OCT04NEBUF.json": 8,
              "+0s relay tickers=100": 7,
              "+0s relay tickers=96": 1,
            },
            "firstSix": [
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
            ],
            "total": 16,
          },
          "diagnostics": {
            "answeredBy": "quote-feed",
            "batches": 16,
            "consecutiveFailures": 0,
            "fallback": {
              "error": "network: network error: fetch failed",
              "provider": "kalshi-relay",
              "status": null,
            },
            "inventoryAnsweredBy": null,
            "inventoryFallback": null,
            "lastError": null,
            "requests": 16,
            "tickersFailed": 0,
            "tickersMissing": 0,
            "tickersRefreshed": 1592,
            "tickersRequested": 1592,
          },
          "inventory": null,
          "kept": {
            "bySource": {
              "quote-feed": 796,
            },
            "ml": {
              "availability": "OPEN",
              "offsetSec": -180,
              "source": "quote-feed",
              "yesBid": 0.41,
            },
            "observedOffsetsSec": [
              -180,
            ],
          },
          "packet": {
            "marketFreshness": "FRESH",
            "mlRow": {
              "freshness": "FRESH",
              "yes_bid": 0.41,
            },
            "notes": [],
            "qualitySources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
              "kalshi markets",
              "model prices",
              "packet.game_script_inputs.player_opportunity",
              "packet.simulation.player_projections",
              "packet.team_profiles",
              "packet.team_profiles.adjusted",
              "schedule_cache.csv",
            ],
            "sha256": "8dcf098e9811eae9",
            "sources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
            ],
          },
          "preflight": {
            "availability": {
              "CLOSED": 0,
              "OPEN": 796,
              "SETTLED": 0,
              "SUSPENDED": 0,
              "UNKNOWN": 0,
              "UNOPENED": 0,
            },
            "counts": {
              "AGING": 0,
              "FRESH": 796,
              "STALE": 0,
              "UNKNOWN": 0,
            },
            "error": null,
            "failed": 0,
            "live": 796,
            "markets": 796,
            "missing": 0,
            "oldestAgeSec": 180,
            "provider": "Kalshi public market data via relay (relay.example), then Sift quote feed (Kalshi public data via GitHub Actions, every 3 min)",
            "refreshed": 796,
            "status": "PASS",
            "timedOut": false,
          },
        },
        {
          "afterSec": 60,
          "calls": {
            "byCall": {
              "+0s feed /games/26OCT04NEBUF.json": 8,
              "+0s relay tickers=100": 7,
              "+0s relay tickers=96": 1,
            },
            "firstSix": [
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
            ],
            "total": 16,
          },
          "diagnostics": {
            "answeredBy": "quote-feed",
            "batches": 24,
            "consecutiveFailures": 0,
            "fallback": {
              "error": "network: network error: fetch failed",
              "provider": "kalshi-relay",
              "status": null,
            },
            "inventoryAnsweredBy": null,
            "inventoryFallback": null,
            "lastError": null,
            "requests": 24,
            "tickersFailed": 0,
            "tickersMissing": 0,
            "tickersRefreshed": 1592,
            "tickersRequested": 2388,
          },
          "inventory": null,
          "kept": {
            "bySource": {
              "quote-feed": 796,
            },
            "ml": {
              "availability": "OPEN",
              "offsetSec": -210,
              "source": "quote-feed",
              "yesBid": 0.41,
            },
            "observedOffsetsSec": [
              -210,
            ],
          },
          "packet": {
            "marketFreshness": "FRESH",
            "mlRow": {
              "freshness": "FRESH",
              "yes_bid": 0.41,
            },
            "notes": [
              "live market refresh: 796 of 796 markets could not be refreshed at 2026-10-04T15:16:06Z (no answer); they show their last known quote with its real capture time",
            ],
            "qualitySources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
              "kalshi markets",
              "model prices",
              "packet.game_script_inputs.player_opportunity",
              "packet.simulation.player_projections",
              "packet.team_profiles",
              "packet.team_profiles.adjusted",
              "schedule_cache.csv",
            ],
            "sha256": "a1c17d1dcfe066a5",
            "sources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
            ],
          },
          "preflight": {
            "availability": {
              "CLOSED": 0,
              "OPEN": 796,
              "SETTLED": 0,
              "SUSPENDED": 0,
              "UNKNOWN": 0,
              "UNOPENED": 0,
            },
            "counts": {
              "AGING": 0,
              "FRESH": 796,
              "STALE": 0,
              "UNKNOWN": 0,
            },
            "error": null,
            "failed": 796,
            "live": 796,
            "markets": 796,
            "missing": 0,
            "oldestAgeSec": 210,
            "provider": "Kalshi public market data via relay (relay.example), then Sift quote feed (Kalshi public data via GitHub Actions, every 3 min)",
            "refreshed": 0,
            "status": "FAIL",
            "timedOut": false,
          },
        },
      ]
    `);
  });

  it('relay 503 then both sources failing: the last-known-good quote keeps its true age', async () => {
    const trace = await play([
      { afterSec: 0 },
      { afterSec: 600, set: { relay: '503', feed: 'down' } },
    ]);
    expect(trace).toMatchInlineSnapshot(`
      [
        {
          "afterSec": 0,
          "calls": {
            "byCall": {
              "+0s relay tickers=100": 7,
              "+0s relay tickers=96": 1,
            },
            "firstSix": [
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
            ],
            "total": 8,
          },
          "diagnostics": {
            "answeredBy": "kalshi-relay",
            "batches": 8,
            "consecutiveFailures": 0,
            "fallback": null,
            "inventoryAnsweredBy": null,
            "inventoryFallback": null,
            "lastError": null,
            "requests": 8,
            "tickersFailed": 0,
            "tickersMissing": 0,
            "tickersRefreshed": 796,
            "tickersRequested": 796,
          },
          "inventory": null,
          "kept": {
            "bySource": {
              "kalshi-relay": 796,
            },
            "ml": {
              "availability": "OPEN",
              "offsetSec": -2,
              "source": "kalshi-relay",
              "yesBid": 0.41,
            },
            "observedOffsetsSec": [
              -2,
            ],
          },
          "packet": {
            "marketFreshness": "FRESH",
            "mlRow": {
              "freshness": "FRESH",
              "yes_bid": 0.41,
            },
            "notes": [],
            "qualitySources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
              "kalshi markets",
              "model prices",
              "packet.game_script_inputs.player_opportunity",
              "packet.simulation.player_projections",
              "packet.team_profiles",
              "packet.team_profiles.adjusted",
              "schedule_cache.csv",
            ],
            "sha256": "d6b771f6be786a3d",
            "sources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
            ],
          },
          "preflight": {
            "availability": {
              "CLOSED": 0,
              "OPEN": 796,
              "SETTLED": 0,
              "SUSPENDED": 0,
              "UNKNOWN": 0,
              "UNOPENED": 0,
            },
            "counts": {
              "AGING": 0,
              "FRESH": 796,
              "STALE": 0,
              "UNKNOWN": 0,
            },
            "error": null,
            "failed": 0,
            "live": 796,
            "markets": 796,
            "missing": 0,
            "oldestAgeSec": 2,
            "provider": "Kalshi public market data via relay (relay.example), then Sift quote feed (Kalshi public data via GitHub Actions, every 3 min)",
            "refreshed": 796,
            "status": "PASS",
            "timedOut": false,
          },
        },
        {
          "afterSec": 600,
          "calls": {
            "byCall": {
              "+0s feed /games/26OCT04NEBUF.json": 8,
              "+0s relay tickers=100": 7,
              "+0s relay tickers=96": 1,
            },
            "firstSix": [
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay tickers=100",
              "+0s feed /games/26OCT04NEBUF.json",
            ],
            "total": 16,
          },
          "diagnostics": {
            "answeredBy": "kalshi-relay",
            "batches": 16,
            "consecutiveFailures": 8,
            "fallback": null,
            "inventoryAnsweredBy": null,
            "inventoryFallback": null,
            "lastError": "http: HTTP 503",
            "requests": 8,
            "tickersFailed": 796,
            "tickersMissing": 0,
            "tickersRefreshed": 796,
            "tickersRequested": 1592,
          },
          "inventory": null,
          "kept": {
            "bySource": {
              "kalshi-relay": 796,
            },
            "ml": {
              "availability": "OPEN",
              "offsetSec": -602,
              "source": "kalshi-relay",
              "yesBid": 0.41,
            },
            "observedOffsetsSec": [
              -602,
            ],
          },
          "packet": {
            "marketFreshness": "FRESH",
            "mlRow": {
              "freshness": "FRESH",
              "yes_bid": 0.41,
            },
            "notes": [
              "live market refresh: 796 of 796 markets could not be refreshed at 2026-10-04T15:25:06Z (http: HTTP 503); they show their last known quote with its real capture time",
            ],
            "qualitySources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
              "kalshi markets",
              "model prices",
              "packet.game_script_inputs.player_opportunity",
              "packet.simulation.player_projections",
              "packet.team_profiles",
              "packet.team_profiles.adjusted",
              "schedule_cache.csv",
            ],
            "sha256": "72006329609fa712",
            "sources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
            ],
          },
          "preflight": {
            "availability": {
              "CLOSED": 0,
              "OPEN": 796,
              "SETTLED": 0,
              "SUSPENDED": 0,
              "UNKNOWN": 0,
              "UNOPENED": 0,
            },
            "counts": {
              "AGING": 0,
              "FRESH": 796,
              "STALE": 0,
              "UNKNOWN": 0,
            },
            "error": "http: HTTP 503",
            "failed": 796,
            "live": 796,
            "markets": 796,
            "missing": 0,
            "oldestAgeSec": 602,
            "provider": "Kalshi public market data via relay (relay.example), then Sift quote feed (Kalshi public data via GitHub Actions, every 3 min)",
            "refreshed": 0,
            "status": "FAIL",
            "timedOut": false,
          },
        },
      ]
    `);
  });

  it('a relay 200 whose observations are 10 minutes old is accepted as the relay answer (feed not asked)', async () => {
    expect(await play([{ afterSec: 0, set: { relayAgeMs: 600_000 } }])).toMatchInlineSnapshot(`
      [
        {
          "afterSec": 0,
          "calls": {
            "byCall": {
              "+0s relay tickers=100": 7,
              "+0s relay tickers=96": 1,
            },
            "firstSix": [
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
            ],
            "total": 8,
          },
          "diagnostics": {
            "answeredBy": "kalshi-relay",
            "batches": 8,
            "consecutiveFailures": 0,
            "fallback": null,
            "inventoryAnsweredBy": null,
            "inventoryFallback": null,
            "lastError": null,
            "requests": 8,
            "tickersFailed": 0,
            "tickersMissing": 0,
            "tickersRefreshed": 796,
            "tickersRequested": 796,
          },
          "inventory": null,
          "kept": {
            "bySource": {
              "kalshi-relay": 796,
            },
            "ml": {
              "availability": "OPEN",
              "offsetSec": -600,
              "source": "kalshi-relay",
              "yesBid": 0.41,
            },
            "observedOffsetsSec": [
              -600,
            ],
          },
          "packet": {
            "marketFreshness": "FRESH",
            "mlRow": {
              "freshness": "FRESH",
              "yes_bid": 0.41,
            },
            "notes": [],
            "qualitySources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
              "kalshi markets",
              "model prices",
              "packet.game_script_inputs.player_opportunity",
              "packet.simulation.player_projections",
              "packet.team_profiles",
              "packet.team_profiles.adjusted",
              "schedule_cache.csv",
            ],
            "sha256": "011e65f83bf43279",
            "sources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
            ],
          },
          "preflight": {
            "availability": {
              "CLOSED": 0,
              "OPEN": 796,
              "SETTLED": 0,
              "SUSPENDED": 0,
              "UNKNOWN": 0,
              "UNOPENED": 0,
            },
            "counts": {
              "AGING": 0,
              "FRESH": 796,
              "STALE": 0,
              "UNKNOWN": 0,
            },
            "error": null,
            "failed": 0,
            "live": 796,
            "markets": 796,
            "missing": 0,
            "oldestAgeSec": 600,
            "provider": "Kalshi public market data via relay (relay.example), then Sift quote feed (Kalshi public data via GitHub Actions, every 3 min)",
            "refreshed": 796,
            "status": "PASS",
            "timedOut": false,
          },
        },
      ]
    `);
  });

  it('a partial relay 200 (some requested tickers absent) is the answer; missing tickers are reported', async () => {
    expect(await play([{ afterSec: 0, set: { relay: 'partial' } }])).toMatchInlineSnapshot(`
      [
        {
          "afterSec": 0,
          "calls": {
            "byCall": {
              "+0s relay tickers=100": 7,
              "+0s relay tickers=96": 1,
            },
            "firstSix": [
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
            ],
            "total": 8,
          },
          "diagnostics": {
            "answeredBy": "kalshi-relay",
            "batches": 8,
            "consecutiveFailures": 0,
            "fallback": null,
            "inventoryAnsweredBy": null,
            "inventoryFallback": null,
            "lastError": null,
            "requests": 8,
            "tickersFailed": 0,
            "tickersMissing": 398,
            "tickersRefreshed": 398,
            "tickersRequested": 796,
          },
          "inventory": null,
          "kept": {
            "bySource": {
              "kalshi-relay": 398,
            },
            "ml": {
              "availability": "OPEN",
              "offsetSec": -2,
              "source": "kalshi-relay",
              "yesBid": 0.41,
            },
            "observedOffsetsSec": [
              -2,
            ],
          },
          "packet": {
            "marketFreshness": "STALE",
            "mlRow": {
              "freshness": "FRESH",
              "yes_bid": 0.41,
            },
            "notes": [
              "live market refresh: 398 markets are not listed by the provider now (delisted or replaced); they show the publication's capture",
              "market quotes older than 30 minutes or without a capture time: 398 STALE, 0 UNKNOWN (oldest 15h 00m, KXNFL2QBTTS-26OCT04NEBUF-Y); treat those prices as references, not executable",
            ],
            "qualitySources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
              "kalshi markets",
              "model prices",
              "packet.game_script_inputs.player_opportunity",
              "packet.simulation.player_projections",
              "packet.team_profiles",
              "packet.team_profiles.adjusted",
              "schedule_cache.csv",
            ],
            "sha256": "b42f310573c0619a",
            "sources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
            ],
          },
          "preflight": {
            "availability": {
              "CLOSED": 0,
              "OPEN": 796,
              "SETTLED": 0,
              "SUSPENDED": 0,
              "UNKNOWN": 0,
              "UNOPENED": 0,
            },
            "counts": {
              "AGING": 0,
              "FRESH": 398,
              "STALE": 398,
              "UNKNOWN": 0,
            },
            "error": null,
            "failed": 0,
            "live": 398,
            "markets": 796,
            "missing": 398,
            "oldestAgeSec": 54000,
            "provider": "Kalshi public market data via relay (relay.example), then Sift quote feed (Kalshi public data via GitHub Actions, every 3 min)",
            "refreshed": 398,
            "status": "PASS",
            "timedOut": false,
          },
        },
      ]
    `);
  });

  it('an empty relay 200: every ticker is missing, the feed is not asked', async () => {
    expect(await play([{ afterSec: 0, set: { relay: 'empty' } }])).toMatchInlineSnapshot(`
      [
        {
          "afterSec": 0,
          "calls": {
            "byCall": {
              "+0s relay tickers=100": 7,
              "+0s relay tickers=96": 1,
            },
            "firstSix": [
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
            ],
            "total": 8,
          },
          "diagnostics": {
            "answeredBy": "kalshi-relay",
            "batches": 8,
            "consecutiveFailures": 0,
            "fallback": null,
            "inventoryAnsweredBy": null,
            "inventoryFallback": null,
            "lastError": null,
            "requests": 8,
            "tickersFailed": 0,
            "tickersMissing": 796,
            "tickersRefreshed": 0,
            "tickersRequested": 796,
          },
          "inventory": null,
          "kept": {
            "bySource": {},
            "ml": undefined,
            "observedOffsetsSec": [],
          },
          "packet": {
            "marketFreshness": "STALE",
            "mlRow": {
              "freshness": "STALE",
              "yes_bid": 0.73,
            },
            "notes": [
              "live market refresh: 796 markets are not listed by the provider now (delisted or replaced); they show the publication's capture",
              "market quotes older than 30 minutes or without a capture time: 796 STALE, 0 UNKNOWN (oldest 15h 00m, KXNFL1QBTTS-26OCT04NEBUF-Y); treat those prices as references, not executable",
            ],
            "qualitySources": [
              "kalshi markets",
              "model prices",
              "packet.game_script_inputs.player_opportunity",
              "packet.simulation.player_projections",
              "packet.team_profiles",
              "packet.team_profiles.adjusted",
              "schedule_cache.csv",
            ],
            "sha256": "31e8d961c8baa8a0",
            "sources": [],
          },
          "preflight": {
            "availability": {
              "CLOSED": 0,
              "OPEN": 796,
              "SETTLED": 0,
              "SUSPENDED": 0,
              "UNKNOWN": 0,
              "UNOPENED": 0,
            },
            "counts": {
              "AGING": 0,
              "FRESH": 0,
              "STALE": 796,
              "UNKNOWN": 0,
            },
            "error": null,
            "failed": 0,
            "live": 0,
            "markets": 796,
            "missing": 796,
            "oldestAgeSec": 54000,
            "provider": "Kalshi public market data via relay (relay.example), then Sift quote feed (Kalshi public data via GitHub Actions, every 3 min)",
            "refreshed": 0,
            "status": "PASS",
            "timedOut": false,
          },
        },
      ]
    `);
  });

  it('a relay answer without X-Sift-Observed-At is stamped with its arrival time', async () => {
    expect(await play([{ afterSec: 0, set: { relay: 'noheader' } }])).toMatchInlineSnapshot(`
      [
        {
          "afterSec": 0,
          "calls": {
            "byCall": {
              "+0s relay tickers=100": 7,
              "+0s relay tickers=96": 1,
            },
            "firstSix": [
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
            ],
            "total": 8,
          },
          "diagnostics": {
            "answeredBy": "kalshi-relay",
            "batches": 8,
            "consecutiveFailures": 0,
            "fallback": null,
            "inventoryAnsweredBy": null,
            "inventoryFallback": null,
            "lastError": null,
            "requests": 8,
            "tickersFailed": 0,
            "tickersMissing": 0,
            "tickersRefreshed": 796,
            "tickersRequested": 796,
          },
          "inventory": null,
          "kept": {
            "bySource": {
              "kalshi-relay": 796,
            },
            "ml": {
              "availability": "OPEN",
              "offsetSec": 0,
              "source": "kalshi-relay",
              "yesBid": 0.41,
            },
            "observedOffsetsSec": [
              0,
            ],
          },
          "packet": {
            "marketFreshness": "FRESH",
            "mlRow": {
              "freshness": "FRESH",
              "yes_bid": 0.41,
            },
            "notes": [],
            "qualitySources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
              "kalshi markets",
              "model prices",
              "packet.game_script_inputs.player_opportunity",
              "packet.simulation.player_projections",
              "packet.team_profiles",
              "packet.team_profiles.adjusted",
              "schedule_cache.csv",
            ],
            "sha256": "382c409bd60d04b5",
            "sources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
            ],
          },
          "preflight": {
            "availability": {
              "CLOSED": 0,
              "OPEN": 796,
              "SETTLED": 0,
              "SUSPENDED": 0,
              "UNKNOWN": 0,
              "UNOPENED": 0,
            },
            "counts": {
              "AGING": 0,
              "FRESH": 796,
              "STALE": 0,
              "UNKNOWN": 0,
            },
            "error": null,
            "failed": 0,
            "live": 796,
            "markets": 796,
            "missing": 0,
            "oldestAgeSec": 0,
            "provider": "Kalshi public market data via relay (relay.example), then Sift quote feed (Kalshi public data via GitHub Actions, every 3 min)",
            "refreshed": 796,
            "status": "PASS",
            "timedOut": false,
          },
        },
      ]
    `);
  });

  it('inventory: feed first, the relay only when the feed has no file for the game', async () => {
    const trace = await play([
      { afterSec: 0, inventory: true },
      { afterSec: 30, inventory: true, set: { feed: '404' } },
    ]);
    expect(trace).toMatchInlineSnapshot(`
      [
        {
          "afterSec": 0,
          "calls": {
            "byCall": {
              "+0s feed /games/26OCT04NEBUF.json": 1,
              "+0s relay tickers=100": 7,
              "+0s relay tickers=96": 1,
            },
            "firstSix": [
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
              "+0s relay tickers=100",
            ],
            "total": 9,
          },
          "diagnostics": {
            "answeredBy": "kalshi-relay",
            "batches": 9,
            "consecutiveFailures": 0,
            "fallback": null,
            "inventoryAnsweredBy": "quote-feed",
            "inventoryFallback": null,
            "lastError": null,
            "requests": 9,
            "tickersFailed": 0,
            "tickersMissing": 0,
            "tickersRefreshed": 796,
            "tickersRequested": 796,
          },
          "inventory": {
            "error": null,
            "failed": 0,
          },
          "kept": {
            "bySource": {
              "kalshi-relay": 796,
            },
            "ml": {
              "availability": "OPEN",
              "offsetSec": -2,
              "source": "kalshi-relay",
              "yesBid": 0.41,
            },
            "observedOffsetsSec": [
              -2,
            ],
          },
          "packet": {
            "marketFreshness": "FRESH",
            "mlRow": {
              "freshness": "FRESH",
              "yes_bid": 0.41,
            },
            "notes": [],
            "qualitySources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
              "kalshi markets",
              "model prices",
              "packet.game_script_inputs.player_opportunity",
              "packet.simulation.player_projections",
              "packet.team_profiles",
              "packet.team_profiles.adjusted",
              "schedule_cache.csv",
            ],
            "sha256": "d6b771f6be786a3d",
            "sources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
            ],
          },
          "preflight": {
            "availability": {
              "CLOSED": 0,
              "OPEN": 796,
              "SETTLED": 0,
              "SUSPENDED": 0,
              "UNKNOWN": 0,
              "UNOPENED": 0,
            },
            "counts": {
              "AGING": 0,
              "FRESH": 796,
              "STALE": 0,
              "UNKNOWN": 0,
            },
            "error": null,
            "failed": 0,
            "live": 796,
            "markets": 796,
            "missing": 0,
            "oldestAgeSec": 2,
            "provider": "Kalshi public market data via relay (relay.example), then Sift quote feed (Kalshi public data via GitHub Actions, every 3 min)",
            "refreshed": 796,
            "status": "PASS",
            "timedOut": false,
          },
        },
        {
          "afterSec": 30,
          "calls": {
            "byCall": {
              "+0s feed /games/26OCT04NEBUF.json": 1,
              "+0s relay series": 1,
            },
            "firstSix": [
              "+0s feed /games/26OCT04NEBUF.json",
              "+0s relay series",
            ],
            "total": 2,
          },
          "diagnostics": {
            "answeredBy": "kalshi-relay",
            "batches": 10,
            "consecutiveFailures": 0,
            "fallback": null,
            "inventoryAnsweredBy": "kalshi-relay",
            "inventoryFallback": {
              "error": "http: no inventory for KXNFLGAME-26OCT04NEBUF",
              "provider": "quote-feed",
              "status": 404,
            },
            "lastError": null,
            "requests": 10,
            "tickersFailed": 0,
            "tickersMissing": 0,
            "tickersRefreshed": 796,
            "tickersRequested": 796,
          },
          "inventory": {
            "error": null,
            "failed": 0,
          },
          "kept": {
            "bySource": {
              "kalshi-relay": 796,
            },
            "ml": {
              "availability": "OPEN",
              "offsetSec": -2,
              "source": "kalshi-relay",
              "yesBid": 0.41,
            },
            "observedOffsetsSec": [
              -2,
            ],
          },
          "packet": {
            "marketFreshness": "FRESH",
            "mlRow": {
              "freshness": "FRESH",
              "yes_bid": 0.41,
            },
            "notes": [],
            "qualitySources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
              "kalshi markets",
              "model prices",
              "packet.game_script_inputs.player_opportunity",
              "packet.simulation.player_projections",
              "packet.team_profiles",
              "packet.team_profiles.adjusted",
              "schedule_cache.csv",
            ],
            "sha256": "f4e4353fe1cc4931",
            "sources": [
              "kalshi live quotes (kalshi-relay>quote-feed)",
            ],
          },
          "preflight": {
            "availability": {
              "CLOSED": 0,
              "OPEN": 796,
              "SETTLED": 0,
              "SUSPENDED": 0,
              "UNKNOWN": 0,
              "UNOPENED": 0,
            },
            "counts": {
              "AGING": 0,
              "FRESH": 796,
              "STALE": 0,
              "UNKNOWN": 0,
            },
            "error": null,
            "failed": 0,
            "live": 796,
            "markets": 796,
            "missing": 0,
            "oldestAgeSec": 2,
            "provider": "Kalshi public market data via relay (relay.example), then Sift quote feed (Kalshi public data via GitHub Actions, every 3 min)",
            "refreshed": 796,
            "status": "PASS",
            "timedOut": false,
          },
        },
      ]
    `);
  });
});
