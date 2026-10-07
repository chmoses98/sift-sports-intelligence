// The 2026-10-07 Production-check incident, pinned. The NFL board had stopped at the week-4 MNF pregame build
// (ATL@NO still SCHEDULED a day after kickoff); the live-quote feed published an empty index as if healthy; the
// Production check clicked the first NFL card, called it "upcoming", demanded FRESH prices from a historical
// game the feed did not cover, then waited on its own injected 429 backoff for LIVE to return.
import { afterEach, describe, expect, it } from 'vitest';
import { buildFiles, readPublication } from '../../scripts/live-quotes/lib.mjs';
import { honestPublicationStates, isEligibleEvent, publicationStatus, publishVerdict, selectTarget, type Board } from '../../scripts/live-quotes/slate.mjs';
import { liveMode } from '../../src/components/LiveQuote';
import { FallbackProvider } from '../../src/live/providers/fallback';
import { FeedQuoteProvider } from '../../src/live/providers/feed';
import { CADENCE_MS, QuoteStore } from '../../src/live/store';
import { quoteFreshness } from '../../src/live/freshness';
import { ProviderError } from '../../src/live/types';
import { FakeClock, FakeEnv, FakeProvider } from './fakes';

const NOW = Date.parse('2026-10-07T00:28:00Z');
const H = 3600e3;
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const item = (event_id: string, status: string, startMs: number) => ({ event_id, status, start_time_utc: iso(startMs) });

// The board as it was measured: generated at the MNF pregame build, ATL@NO the last event, nothing after it.
const STALE_BOARD: Board = {
  generated_at: '2026-10-06T00:14:18Z',
  items: [item('evt_det_car', 'UNKNOWN', Date.parse('2026-10-05T00:20:00Z')), item('evt_atl_no', 'SCHEDULED', Date.parse('2026-10-06T00:15:00Z')), item('evt_pit_cle', 'FINAL', Date.parse('2026-10-04T17:00:00Z'))],
};
// A healthy board after the rollover: last week's games final/unknown, next week's scheduled.
const freshBoard = (items = [item('evt_atl_no', 'UNKNOWN', NOW - 24 * H), item('evt_tb_dal', 'SCHEDULED', NOW + 48 * H), item('evt_chi_gb', 'SCHEDULED', NOW + 112 * H)]): Board => ({ generated_at: iso(NOW - 10 * 60e3), items });
const index = (games: { key: string; event_ids: string[]; markets: number }[]) => ({ games });

describe('event selection: the board, never the first card', () => {
  it('1. a board with an upcoming game selects that event', () => {
    const s = selectTarget(freshBoard(), NOW, index([{ key: '26OCT08TBDAL', event_ids: ['evt_tb_dal'], markets: 812 }]));
    expect([s.mode, s.target?.event_id, s.feed]).toEqual(['CURRENT', 'evt_tb_dal', { covered: true, key: '26OCT08TBDAL', markets: 812 }]);
  });

  it('2. a historical first card and a later upcoming game: the upcoming game, not the first card', () => {
    const b = freshBoard([item('evt_old', 'SCHEDULED', NOW - 30 * H), item('evt_next', 'SCHEDULED', NOW + 5 * H), item('evt_later', 'SCHEDULED', NOW + 50 * H)]);
    const s = selectTarget(b, NOW, null);
    expect(s.target?.event_id).toBe('evt_next');
    // a started game still inside the lookback is preferred: it is the most "live" target there is
    const live = selectTarget(freshBoard([item('evt_next', 'SCHEDULED', NOW + 5 * H), item('evt_live', 'UNKNOWN', NOW - 2 * H)]), NOW, null);
    expect(live.target?.event_id).toBe('evt_live');
  });

  it('3. no current game on a healthy board: off-slate mode, and the most recent game is the historical page', () => {
    const b = freshBoard([item('evt_a', 'FINAL', NOW - 30 * H), item('evt_b', 'UNKNOWN', NOW - 20 * H), item('evt_far', 'SCHEDULED', NOW + 13 * 24 * H)]);
    const s = selectTarget(b, NOW, index([]));
    expect([s.mode, s.target, s.publication.status, s.historical?.event_id]).toEqual(['OFF_SLATE', null, 'NO_CURRENT_GAMES', 'evt_b']);
  });

  it('6. a SCHEDULED game whose kickoff is past the lookback can never be selected (the incident board)', () => {
    expect(isEligibleEvent(STALE_BOARD.items![1], NOW)).toBe(false);
    const s = selectTarget(STALE_BOARD, NOW, index([]));
    expect([s.mode, s.target]).toEqual(['STALE', null]);
    expect(s.publication.reasons[0]).toMatch(/evt_atl_no.*SCHEDULED|SCHEDULED.*evt_atl_no/);
    for (const st of ['FINAL']) expect(isEligibleEvent(item('x', st, NOW + H), NOW)).toBe(false);
    expect(isEligibleEvent(item('x', 'UNKNOWN', NOW - 9 * H), NOW)).toBe(false);
    expect(isEligibleEvent(item('x', 'SCHEDULED', NOW + 11 * 24 * H), NOW)).toBe(false);
  });

  it('7. a current game the feed carries: the fallback proof has a real target', () => {
    const s = selectTarget(freshBoard(), NOW, index([{ key: 'K', event_ids: ['evt_tb_dal'], markets: 3 }]));
    expect(s.feed?.covered).toBe(true);
  });

  it('8. a current game missing from the feed (or listed with no market) is a production failure, not a skip', () => {
    expect(selectTarget(freshBoard(), NOW, index([])).feed).toEqual({ covered: false, key: null, markets: 0 });
    expect(selectTarget(freshBoard(), NOW, index([{ key: 'K', event_ids: ['evt_tb_dal'], markets: 0 }])).feed?.covered).toBe(false);
    expect(selectTarget(freshBoard(), NOW, null).feed?.covered).toBe(false);
  });
});

describe('publication health: CURRENT_SLATE / NO_CURRENT_GAMES / STALE_PUBLICATION', () => {
  it('the measured incident board is STALE_PUBLICATION, never "zero games"', () => {
    const p = publicationStatus(STALE_BOARD, NOW, { source: 'nfl' });
    expect([p.status, p.eligible_games, p.latest_event?.event_id, p.age_seconds]).toEqual(['STALE_PUBLICATION', 0, 'evt_atl_no', 87222]);
  });

  it('a board with current games is CURRENT_SLATE even if a started game is still marked SCHEDULED (reported)', () => {
    const p = publicationStatus(freshBoard([item('evt_snf', 'SCHEDULED', NOW - 18 * H), item('evt_mnf', 'SCHEDULED', NOW + 6 * H)]), NOW);
    expect([p.status, p.eligible_games, p.stale_events.map((e) => e.event_id)]).toEqual(['CURRENT_SLATE', 1, ['evt_snf']]);
  });

  it('no trustworthy generated_at is stale', () => {
    expect(publicationStatus({ items: [] }, NOW).status).toBe('STALE_PUBLICATION');
  });
});

describe('feed publisher verdict (fail closed on a stale source)', () => {
  const fresh = (b: Board) => publicationStatus(b, NOW);
  it('4. fresh publication + no current games = a healthy empty feed that says so', () => {
    const p = fresh(freshBoard([item('evt_a', 'FINAL', NOW - 30 * H)]));
    expect(publishVerdict(p, 0, 0)).toEqual({ publish: true, reason: 'no current games: a healthy empty feed' });
    const idx = buildFiles([], new Map(), { generatedAt: iso(NOW), publications: [{ sport: 'NFL', ...p }] }).get('index.json')!;
    expect([idx.status, idx.games, idx.publications[0].status, idx.publications[0].eligible_games]).toEqual(['NO_CURRENT_GAMES', [], 'NO_CURRENT_GAMES', 0]);
  });

  it('5. stale publication + no games = refused: the last-known-good feed is not replaced', () => {
    const v = publishVerdict(fresh(STALE_BOARD), 0, 0);
    expect(v.publish).toBe(false);
    expect(v.reason).toMatch(/stale.*not replacing the last-known-good feed/);
  });

  it('fresh publication + games + zero Kalshi markets = refused; + markets = published, index names the events', () => {
    const p = fresh(freshBoard());
    expect(publishVerdict(p, 2, 0).publish).toBe(false);
    expect(publishVerdict(p, 2, 40).publish).toBe(true);
    const games = [{ key: '26OCT08TBDAL', event_id: 'evt_tb_dal', tickers: ['KXNFLGAME-26OCT08TBDAL-TB'], series: ['KXNFLGAME'] }];
    const byKey = new Map([['26OCT08TBDAL', new Map([['KXNFLGAME-26OCT08TBDAL-TB', { ticker: 'KXNFLGAME-26OCT08TBDAL-TB', observed_at: iso(NOW) }]])]]);
    const idx = buildFiles(games, byKey, { generatedAt: iso(NOW), publications: [{ sport: 'NFL', ...p }] }).get('index.json')!;
    expect(idx.status).toBe('CURRENT_SLATE');
    expect(idx.games[0]).toMatchObject({ key: '26OCT08TBDAL', event_ids: ['evt_tb_dal'], markets: 1 });
    // the Production check finds its target through exactly this field
    expect(selectTarget(freshBoard(), NOW, idx).feed?.covered).toBe(true);
  });

  it('without the publications option the index keeps its old shape (backwards compatible)', () => {
    const idx = buildFiles([], new Map(), { generatedAt: iso(NOW) }).get('index.json')!;
    expect('status' in idx || 'publications' in idx).toBe(false);
  });

  it('readPublication reads the board once and returns its health beside the games', async () => {
    const get = async (url: string) => {
      if (url.endsWith('/board.json')) return { body: STALE_BOARD, at: iso(NOW) };
      throw new Error(`unexpected ${url}`);
    };
    const r = await readPublication('https://raw.test/nfl', get, { now: () => NOW, sport: 'NFL' });
    expect([r.games, r.publication.status, r.publication.sport, r.publication.source]).toEqual([[], 'STALE_PUBLICATION', 'NFL', 'https://raw.test/nfl/board.json']);
  });
});

describe('no-current-game mode never demands FRESH prices from a historical page', () => {
  it('12. a publication-only price is never younger than the board that carried it', () => {
    expect(honestPublicationStates('2026-10-06T00:14:18Z', NOW)).toEqual(['STALE', 'UNKNOWN']);
    expect(honestPublicationStates(iso(NOW - 20 * 60e3), NOW)).not.toContain('FRESH');
    expect(honestPublicationStates(null, NOW)).not.toContain('FRESH');
  });
});

let store: QuoteStore | null = null;
afterEach(() => store?.dispose());

describe('forced relay 429 -> feed fallback -> clean restore', () => {
  const A = 'KXNFLGAME-26OCT08TBDAL-TB';
  const E = 'KXNFLGAME-26OCT08TBDAL';
  function chain(clock: FakeClock) {
    const relay = new FakeProvider(clock);
    const feed = new FakeProvider(clock);
    Object.defineProperty(relay, 'id', { value: 'kalshi-relay' });
    Object.defineProperty(feed, 'id', { value: 'quote-feed' });
    for (const p of [relay, feed]) p.events.set(E, [A]);
    relay.prices.set(A, 0.41);
    feed.prices.set(A, 0.4);
    return { relay, feed, provider: new FallbackProvider([relay, feed], { inventoryOrder: [feed, relay] }) };
  }

  it('9. a forced relay 429 is answered by the feed (FEED), with the 429 named', async () => {
    const clock = new FakeClock();
    const { relay, provider } = chain(clock);
    relay.failWith = new ProviderError('rate_limited', 'rate limited (HTTP 429)', 429, 7000);
    store = new QuoteStore({ provider, now: clock.now, timers: clock, env: new FakeEnv(), persistence: null, random: () => 0.5 });
    store.addScope({ tickers: [A], events: [E], cadence: 'game' });
    await clock.advance(0);
    const d = store.diagnostics();
    expect([d.answeredBy, liveMode(d, clock.now()), d.fallback?.status]).toEqual(['quote-feed', 'FEED', 429]);
    expect(store.quote(A)?.yesBid).toBe(0.4);
  });

  it('10. interception removed + clean provider state (a fresh document): LIVE on the first refresh, no wait', async () => {
    const clock = new FakeClock();
    const { provider } = chain(clock);
    store = new QuoteStore({ provider, now: clock.now, timers: clock, env: new FakeEnv(), persistence: null, random: () => 0.5 });
    store.addScope({ tickers: [A], events: [E], cadence: 'game' });
    await clock.advance(0);
    const d = store.diagnostics();
    expect([d.answeredBy, liveMode(d, clock.now()), d.fallback, d.backoffUntil]).toEqual(['kalshi-relay', 'LIVE', null, null]);
  });

  it('the same page also recovers by itself within one game cadence once the relay answers (no backoff left behind)', async () => {
    const clock = new FakeClock();
    const { relay, provider } = chain(clock);
    relay.failWith = new ProviderError('rate_limited', 'rate limited (HTTP 429)', 429, 7000);
    store = new QuoteStore({ provider, now: clock.now, timers: clock, env: new FakeEnv(), persistence: null, random: () => 0.5 });
    store.addScope({ tickers: [A], events: [E], cadence: 'game' });
    await clock.advance(0);
    relay.failWith = null;
    await clock.advance(CADENCE_MS.game);
    expect(liveMode(store.diagnostics(), clock.now())).toBe('LIVE');
  });

  it('11. a feed fallback quote carries the feed\'s observation time; a failed relay attempt never makes it younger', async () => {
    const observed = '2026-10-07T00:21:00Z'; // 7 minutes before NOW
    const doc = { schema: 'sift.live_quotes.v1', game_key: '26OCT08TBDAL', generated_at: '2026-10-07T00:21:30Z', source: 'test', tickers_checked: [A], markets: [{ ticker: A, event_ticker: E, status: 'active', yes_bid_dollars: '0.4000', yes_ask_dollars: '0.4200', observed_at: observed }] };
    const feed = new FeedQuoteProvider({ baseUrl: 'https://raw.test/live-quotes', fetchImpl: async () => new Response(JSON.stringify(doc)) });
    const relay = { id: 'kalshi-relay', label: 'relay', maxBatch: 100, fetchQuotes: async () => { throw new ProviderError('rate_limited', 'rate limited (HTTP 429)', 429, 7000); }, fetchEventMarkets: async () => { throw new ProviderError('rate_limited', 'rate limited (HTTP 429)', 429, 7000); } };
    const clock = new FakeClock(NOW);
    store = new QuoteStore({ provider: new FallbackProvider([relay, feed], { inventoryOrder: [feed, relay] }), now: clock.now, timers: clock, env: new FakeEnv(), persistence: null, random: () => 0.5 });
    store.addScope({ tickers: [A], cadence: 'game' });
    await clock.advance(0);
    expect(store.quote(A)?.observedAt).toBe(observed);
    expect(quoteFreshness(store.quote(A)!.observedAt, clock.now())).toBe('FRESH');
    // 20 more minutes of failed relay attempts and the same feed file: the quote ages honestly (AGING), never reset
    await clock.advance(20 * 60e3);
    expect(store.quote(A)?.observedAt).toBe(observed);
    expect(quoteFreshness(store.quote(A)!.observedAt, clock.now())).toBe('AGING');
  });
});
