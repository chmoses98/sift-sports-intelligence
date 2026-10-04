// Packet preflight acceptance (owner spec K.1-8) on the real NFL publication: a packet never leaves
// Sift with a price that is old only because it was memoised earlier in the session.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { EventDetailDoc } from '../../src/contract/types';
import { preflightQuotes, packetLiveInputs } from '../../src/live/preflight';
import { QuoteStore } from '../../src/live/store';
import { ProviderError } from '../../src/live/types';
import { buildPacket, packetScopeMarkets } from '../../src/packet/build';
import { renderText } from '../../src/packet/render';
import { makeTray, makeTrayItem } from '../../src/packet/tray';
import { nflRepo, readSnapshot, useDiskFetch } from '../helpers';
import { FakeClock, FakeEnv, FakeProvider } from './fakes';

const GAME = 'evt_0cb333291f580a201a70'; // NE @ BUF
const detail = readSnapshot<EventDetailDoc>(`event_detail/${GAME}.json`);
const ML = detail.markets.find((m) => m.kalshi_ticker === 'KXNFLGAME-26OCT04NEBUF-BUF') ?? detail.markets[0];
const PUBLISHED_AT = Date.parse(ML.captured_at!); // 2026-10-04T00:15:06Z

function rig(startOffsetMs = 15 * 3600e3) {
  const clock = new FakeClock(PUBLISHED_AT + startOffsetMs);
  const provider = new FakeProvider(clock);
  for (const m of detail.markets) provider.prices.set(m.kalshi_ticker, m.yes_bid ?? 0.5);
  const store = new QuoteStore({ provider, now: clock.now, timers: clock, env: new FakeEnv(), persistence: null, random: () => 0.5 });
  return { clock, provider, store };
}

async function packetWith(store: QuoteStore, clock: FakeClock, req: Parameters<typeof buildPacket>[1], timeoutMs = 5_000) {
  const repo = nflRepo();
  const markets = await packetScopeMarkets(repo, req);
  const pending = preflightQuotes(markets, store, { timeoutMs, now: clock.now });
  await clock.advance(timeoutMs + 1);
  const summary = await pending;
  const live = packetLiveInputs(markets, store, summary);
  const pkt = await buildPacket(repo, { ...req, generatedAt: new Date(clock.now()).toISOString(), live });
  return { pkt, summary, markets };
}

beforeAll(() => useDiskFetch());

describe('packet preflight', () => {
  it('1. uses the newly refreshed quote, not an older session-cached one', async () => {
    const { clock, provider, store } = rig();
    // Earlier in the session the screen saw 46¢...
    provider.prices.set(ML.kalshi_ticker, 0.46);
    const release = store.addScope({ tickers: [ML.kalshi_ticker], cadence: 'game' });
    await clock.advance(0);
    release();
    expect(store.quote(ML.kalshi_ticker)?.yesBid).toBe(0.46);
    // ...the market moved; no poll has run since. Preflight must fetch, not reuse.
    provider.prices.set(ML.kalshi_ticker, 0.51);
    await clock.advance(60_000);
    const before = provider.tickerCalls().length;
    const { pkt, summary } = await packetWith(store, clock, { scope: 'GAME', eventId: GAME });
    expect(provider.tickerCalls().length).toBeGreaterThan(before);
    const row = pkt.markets.find((m) => m.kalshi_ticker === ML.kalshi_ticker)!;
    expect(row.yes_bid).toBe(0.51);
    expect(row.captured_at).toBe(new Date(clock.now() - 5_001).toISOString());
    expect(row.freshness).toBe('FRESH');
    expect(summary.status).toBe('PASS');
    expect(summary.refreshed).toBe(detail.markets.length);
    expect(pkt.quality.market_freshness).toBe('FRESH');
    expect(pkt.quality.sources).toContain('kalshi live quotes (fake)');
  });

  it('2+3. a failed refresh falls back to the last-known-good quote with its true (STALE) age', async () => {
    const { clock, provider, store } = rig();
    provider.prices.set(ML.kalshi_ticker, 0.51);
    const release = store.addScope({ tickers: [ML.kalshi_ticker], cadence: 'game' });
    await clock.advance(0);
    release();
    const seenAt = store.quote(ML.kalshi_ticker)!.observedAt;
    await clock.advance(34 * 60_000);
    provider.failWith = new ProviderError('http', 'HTTP 503', 503);
    const { pkt, summary } = await packetWith(store, clock, { scope: 'GAME', eventId: GAME });
    const row = pkt.markets.find((m) => m.kalshi_ticker === ML.kalshi_ticker)!;
    expect(row.yes_bid).toBe(0.51); // kept, not blanked
    expect(row.captured_at).toBe(seenAt); // its real time, not the failed attempt's
    expect(row.freshness).toBe('STALE'); // 34 minutes: never presented as current
    expect(summary.status).toBe('FAIL');
    expect(summary.counts.FRESH).toBe(0);
    const text = renderText(pkt);
    expect(text).toMatch(/MISSING: .*live market refresh: \d+ of \d+ markets could not be refreshed/);
    expect(text).toMatch(/older than 30 minutes or without a capture time: \d+ STALE/);
    expect(pkt.quality.market_freshness).toBe('STALE');
  });

  it('4. a market with no trustworthy timestamp is UNKNOWN', async () => {
    const { clock, provider, store } = rig();
    provider.failWith = new ProviderError('network', 'down');
    const repo = nflRepo();
    const markets = (await packetScopeMarkets(repo, { scope: 'GAME', eventId: GAME })).map((m, i) => (i === 0 ? { ...m, captured_at: null } : m));
    const pending = preflightQuotes(markets, store, { timeoutMs: 1_000, now: clock.now });
    await clock.advance(1_001);
    const summary = await pending;
    expect(summary.counts.UNKNOWN).toBe(1);
    const live = packetLiveInputs(markets, store, summary);
    expect(live.marketFreshness(null, new Date(clock.now()).toISOString())).toBe('UNKNOWN');
  });

  it('5. never hangs on a provider that does not answer', async () => {
    const { clock, provider, store } = rig();
    provider.delayMs = 60 * 60_000;
    let settled = false;
    const repo = nflRepo();
    const markets = await packetScopeMarkets(repo, { scope: 'GAME', eventId: GAME });
    const p = preflightQuotes(markets, store, { timeoutMs: 5_000, now: clock.now }).then((s) => ((settled = true), s));
    await clock.advance(4_999);
    expect(settled).toBe(false);
    await clock.advance(1);
    const s = await p;
    expect(settled).toBe(true);
    expect(s.timedOut).toBe(true);
    expect(s.status).toBe('FAIL');
    expect(s.error).toMatch(/timed out/);
  });

  it('6. without live inputs the packet is still byte-identical to the Python builder (golden)', async () => {
    const pkt = await buildPacket(nflRepo(), { scope: 'GAME', eventId: GAME, generatedAt: '2026-10-04T01:00:00Z' });
    expect(renderText(pkt)).toBe(readFileSync(join(__dirname, '..', 'golden', 'game.packet.txt'), 'utf-8'));
  });

  it('6b. live inputs change values only: same sections, same market count, same order', async () => {
    const { clock, store } = rig();
    const { pkt } = await packetWith(store, clock, { scope: 'GAME', eventId: GAME });
    const plain = await buildPacket(nflRepo(), { scope: 'GAME', eventId: GAME, generatedAt: new Date(clock.now()).toISOString() });
    expect(pkt.markets.map((m) => m.market_id)).toEqual(plain.markets.map((m) => m.market_id));
    expect(Object.keys(pkt).sort()).toEqual(Object.keys(plain).sort());
    const heads = (t: string) => t.split('\n').filter((l) => /^[A-Z][A-Z ()-]+:/.test(l)).map((l) => l.split(':')[0]);
    const noMissing = (t: string) => heads(t).filter((h) => h !== 'MISSING');
    expect(noMissing(renderText(pkt))).toEqual(noMissing(renderText(plain)));
  });

  it('7. the saved tray market stays in scope and gets the refreshed quote', async () => {
    const { clock, provider, store } = rig();
    const other = readSnapshot<EventDetailDoc>('event_detail/evt_0e858f7285b411adf630.json').markets[0];
    provider.prices.set(other.kalshi_ticker, 0.33);
    const tray = makeTray([makeTrayItem({ ref_kind: 'MARKET', sport: 'NFL', id: other.market_id, extra: { market_id: other.market_id, event_id: other.event_id }, added_at: '2026-10-04T01:00:00Z' })], '2026-10-04T01:00:00Z');
    const { pkt, markets } = await packetWith(store, clock, { scope: 'CUSTOM', tray });
    expect(markets.map((m) => m.kalshi_ticker)).toContain(other.kalshi_ticker);
    const row = pkt.markets.find((m) => m.kalshi_ticker === other.kalshi_ticker)!;
    expect(row.yes_bid).toBe(0.33);
    expect(pkt.user_focus[0]).toMatchObject({ ref_kind: 'MARKET', resolved: true });
  });

  it('8. freshness is evaluated at packet-build time, not when the quote was fetched', async () => {
    const { clock, store } = rig();
    const release = store.addScope({ tickers: [ML.kalshi_ticker], cadence: 'game' });
    await clock.advance(0);
    release();
    const markets = await packetScopeMarkets(nflRepo(), { scope: 'GAME', eventId: GAME });
    const one = markets.filter((m) => m.kalshi_ticker === ML.kalshi_ticker);
    // No refresh in between: the same quote, built 20 minutes later, is AGING, and 31 minutes later STALE.
    const at = async (ms: number) => {
      await clock.advance(ms);
      const live = packetLiveInputs(one, store, { ...(await preflightQuotesOffline(one, store, clock)) });
      const pkt = await buildPacket(nflRepo(), { scope: 'GAME', eventId: GAME, generatedAt: new Date(clock.now()).toISOString(), live });
      return pkt.markets.find((m) => m.kalshi_ticker === ML.kalshi_ticker)!.freshness;
    };
    expect(await at(20 * 60_000)).toBe('AGING');
    expect(await at(11 * 60_000)).toBe('STALE');
  });
});

/** A summary without a refresh (provider offline) so the test can hold the quote still. */
async function preflightQuotesOffline(markets: Parameters<typeof preflightQuotes>[0], store: QuoteStore, clock: FakeClock) {
  const { summarize } = await import('../../src/live/preflight');
  return summarize(markets, store, null, clock.now());
}
