// MLB in the live-quote feed, and per-sport staleness. The MLB publication (tests/fixtures/mlb: real edge-finder-api
// market rows on a synthesized 2026-10-07 postseason board) is swept against a fake Kalshi; a stale MLB publication
// excludes only MLB (fail closed for itself) while NFL and NHL still publish; the browser overlays MLB quotes by ticker.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Market } from '../../src/contract/types';
import { buildFiles, makeGet, planFeed, readPublication, sweep, unreadablePublication, type Game, type Publication } from '../../scripts/live-quotes/lib.mjs';
import { publicationStatus, sportCoverage, sportEntry } from '../../scripts/live-quotes/slate.mjs';
import { FeedQuoteProvider } from '../../src/live/providers/feed';
import { overlayMarket } from '../../src/live/overlay';
import { MLB_DIR, NHL_DIR, SNAPSHOT_DIR } from '../helpers';

const API = 'https://kalshi.test/v2';
const RAW: Record<string, string> = { 'https://raw.test/nfl': SNAPSHOT_DIR, 'https://raw.test/nhl': NHL_DIR, 'https://raw.test/mlb': MLB_DIR };
const MLB_NOW = Date.parse('2026-10-07T20:10:00Z');
const NFL_NOW = Date.parse('2026-10-04T15:00:00Z');
const DATE = 'Wed, 07 Oct 2026 20:10:05 GMT';
const GAME_KEY = /^\d{2}[A-Z]{3}\d{2}(\d{4})?[A-Z]{4,6}$/;
const LADATL = '26OCT071800LADATL';

/** Every published market of the fixtures, by series: what the fake Kalshi lists as open. */
function inventory(): Map<string, Market[]> {
  const out = new Map<string, Market[]>();
  for (const dir of [MLB_DIR, NHL_DIR, SNAPSHOT_DIR]) {
    for (const f of readdirSync(join(dir, 'event_detail'))) {
      for (const m of (JSON.parse(readFileSync(join(dir, 'event_detail', f), 'utf-8')) as { markets: Market[] }).markets) {
        const s = m.kalshi_ticker.split('-')[0];
        out.set(s, [...(out.get(s) ?? []), m]);
      }
    }
  }
  return out;
}

interface FakeOpts { log?: string[]; boards?: Record<string, unknown>; kalshiDown?: boolean; unreadable?: string[] }

function fakeFetch(o: FakeOpts = {}) {
  const inv = inventory();
  return async (url: string): Promise<Response> => {
    o.log?.push(url);
    const root = Object.keys(RAW).find((r) => url.startsWith(r + '/'));
    if (root) {
      if (o.unreadable?.includes(root)) return new Response('not found', { status: 404 });
      const rel = url.slice(root.length + 1);
      const body = rel === 'board.json' && o.boards?.[root] ? JSON.stringify(o.boards[root]) : readFileSync(join(RAW[root], rel));
      return new Response(body, { headers: { 'content-type': 'application/json' } });
    }
    if (o.kalshiDown) return new Response('{"error":"down"}', { status: 404 });
    const u = new URL(url);
    const headers = { 'content-type': 'application/json', date: DATE, age: '3' };
    const series = u.searchParams.get('series_ticker');
    if (series) {
      const markets = (inv.get(series) ?? []).map((m) => ({
        ticker: m.kalshi_ticker, event_ticker: m.kalshi_event_ticker, status: 'active',
        yes_bid_dollars: (m.yes_bid ?? 0.01).toFixed(4), yes_ask_dollars: (m.yes_ask ?? 0.99).toFixed(4), title: m.yes_description,
      }));
      if (series === 'KXMLBGAME') markets.push({ ticker: 'KXMLBGAME-26OCT089999ZZZYYY-ZZZ', event_ticker: 'KXMLBGAME-26OCT089999ZZZYYY', status: 'active', yes_bid_dollars: '0.5000', yes_ask_dollars: '0.5200', title: 'not in the publication' });
      return new Response(JSON.stringify({ cursor: '', markets }), { headers });
    }
    return new Response(JSON.stringify({ cursor: '', markets: [] }), { headers });
  };
}

/** One full publisher cycle (the same calls scripts/publish-live-quotes.mjs makes). */
async function cycle(sports: string[], now: number, o: FakeOpts = {}) {
  const { get, count } = makeGet({ fetchImpl: fakeFetch(o) as typeof fetch, sleep: async () => {}, now: () => now });
  const games: Game[] = [];
  const publications: Publication[] = [];
  for (const s of sports) {
    const base = `https://raw.test/${s.toLowerCase()}`;
    try {
      const r = await readPublication(base, get, { now: () => now, sport: s });
      games.push(...r.games);
      publications.push(r.publication);
    } catch (e) {
      publications.push(unreadablePublication(s, `${base}/board.json`, e));
    }
  }
  const pre = planFeed(publications, games);
  if (!pre.publish) return { plan: pre, files: null, games, publications };
  const { byKey, errors } = await sweep(pre.games!, get, { api: API });
  const plan = planFeed(publications, pre.games!, byKey);
  const files = plan.publish ? buildFiles(plan.games!, byKey, { generatedAt: '2026-10-07T20:10:12Z', sports, errors, requests: count(), publications, sportStatus: plan.sports }) : null;
  return { plan, files, games, publications };
}

/** The MLB fixture board, its games moved to `start` and still SCHEDULED: a board that stopped refreshing. */
function staleMlbBoard(start: string) {
  const b = JSON.parse(readFileSync(join(MLB_DIR, 'board.json'), 'utf-8'));
  return { ...b, items: b.items.map((it: { start_time_utc: string }) => ({ ...it, start_time_utc: start })) };
}

describe('MLB in the live-quote feed', () => {
  it('maps the MLB publication: game keys carry the ET start, KXMLB* series only, every ticker on its own game', async () => {
    const { get } = makeGet({ fetchImpl: fakeFetch() as typeof fetch, sleep: async () => {}, now: () => MLB_NOW });
    const { games, publication } = await readPublication('https://raw.test/mlb', get, { now: () => MLB_NOW, sport: 'MLB' });
    expect(publication.status).toBe('CURRENT_SLATE');
    expect(games.map((g) => g.key).sort()).toEqual(['26OCT071600CLECWS', LADATL, '26OCT072000TBNYY', '26OCT072200MILSD']);
    for (const g of games) {
      expect(g.key).toMatch(GAME_KEY);
      expect(g.sport).toBe('MLB');
      expect(g.series.every((x) => x.startsWith('KXMLB'))).toBe(true);
      expect(g.tickers.every((t) => t.split('-')[1] === g.key)).toBe(true);
    }
    const lad = games.find((g) => g.key === LADATL)!;
    expect(lad.series).toEqual(expect.arrayContaining(['KXMLBGAME', 'KXMLBKS', 'KXMLBHIT', 'KXMLBTB', 'KXMLBHRR', 'KXMLBRBI', 'KXMLBSB', 'KXMLBOUTS', 'KXMLBF5']));
    expect(lad.tickers).toContain('KXMLBKS-26OCT071800LADATL-LADTGLASNOW31-7');
  });

  it('sweeps MLB against Kalshi and writes games/26OCT071800LADATL.json etc. (props included, unknown games never)', async () => {
    const log: string[] = [];
    const { plan, files } = await cycle(['MLB'], MLB_NOW, { log });
    expect(plan.publish).toBe(true);
    expect([...files!.keys()].sort()).toEqual(['games/26OCT071600CLECWS.json', `games/${LADATL}.json`, 'games/26OCT072000TBNYY.json', 'games/26OCT072200MILSD.json', 'index.json']);
    const doc = files!.get(`games/${LADATL}.json`)!;
    const tickers = doc.markets.map((m: { ticker: string }) => m.ticker);
    expect(tickers).toContain('KXMLBGAME-26OCT071800LADATL-LAD');
    expect(tickers).toContain('KXMLBKS-26OCT071800LADATL-LADTGLASNOW31-7');
    expect(tickers).toContain('KXMLBHIT-26OCT071800LADATL-LADMBETTS50-1');
    expect(tickers.some((t: string) => t.includes('ZZZYYY'))).toBe(false);
    const idx = files!.get('index.json')!;
    expect(idx.status).toBe('CURRENT_SLATE');
    expect(idx.games.every((g: { sport: string }) => g.sport === 'MLB')).toBe(true);
    expect(idx.sport_status).toEqual([expect.objectContaining({ sport: 'MLB', status: 'CURRENT_SLATE', published: true, games: 4 })]);
    expect(idx.excluded_sports).toEqual([]);
    // Only the series the current games use were swept (17 KXMLB* series at most), and only GETs.
    const series = new Set(log.filter((u) => u.includes('series_ticker=')).map((u) => new URL(u).searchParams.get('series_ticker')));
    expect(series.size).toBeLessThanOrEqual(17);
    expect([...series].every((s) => s!.startsWith('KXMLB'))).toBe(true);
  });

  it('the browser overlays MLB feed quotes onto publication markets by kalshi_ticker', async () => {
    const { files } = await cycle(['MLB'], MLB_NOW);
    const provider = new FeedQuoteProvider({
      baseUrl: 'https://raw.test/live-quotes',
      fetchImpl: async (u) => {
        const f = files!.get(u.replace('https://raw.test/live-quotes/', ''));
        return f ? new Response(JSON.stringify(f)) : new Response('', { status: 404 });
      },
    });
    const detail = JSON.parse(readFileSync(join(MLB_DIR, 'event_detail', readdirSync(join(MLB_DIR, 'event_detail')).find((f) => readFileSync(join(MLB_DIR, 'event_detail', f), 'utf-8').includes(LADATL))!), 'utf-8')) as { markets: Market[] };
    const ks = detail.markets.find((m) => m.kalshi_ticker === 'KXMLBKS-26OCT071800LADATL-LADTGLASNOW31-7')!;
    const r = await provider.fetchQuotes([ks.kalshi_ticker, 'KXMLBGAME-26OCT071800LADATL-ATL']);
    const q = r.quotes.find((x) => x.ticker === ks.kalshi_ticker)!;
    expect(q).toMatchObject({ source: 'quote-feed', availability: 'OPEN', observedAt: '2026-10-07T20:10:02Z', yesBid: ks.yes_bid, yesAsk: ks.yes_ask });
    const over = overlayMarket(ks, q);
    expect(over.captured_at).toBe('2026-10-07T20:10:02Z'); // newer than the publication capture (19:53Z): the live quote wins
    expect(over.source).toMatch(/^quote-feed \(live quote/);
    expect(over.extensions).toEqual(ks.extensions); // the research row (player_prop included) is kept
    // A ticker of another game is never answered from this game's file.
    expect(overlayMarket({ ...ks, kalshi_ticker: 'KXMLBKS-26OCT081800LADATL-LADTGLASNOW31-7' }, r.quotes.find((x) => x.ticker === 'KXMLBKS-26OCT081800LADATL-LADTGLASNOW31-7')).source).toBe(ks.source);
  });
});

describe('per-sport staleness: one stale sport never kills the feed', () => {
  it('a stale MLB publication is excluded (its games absent, its status in the index) while NFL and NHL publish', async () => {
    const boards = { 'https://raw.test/mlb': staleMlbBoard('2026-10-03T22:00:00Z') };
    const { plan, files } = await cycle(['NFL', 'NHL', 'MLB'], NFL_NOW, { boards });
    expect(plan.publish).toBe(true);
    const idx = files!.get('index.json')!;
    expect(idx.status).toBe('CURRENT_SLATE');
    expect(idx.excluded_sports).toEqual(['MLB']);
    const mlb = idx.sport_status.find((s: { sport: string }) => s.sport === 'MLB');
    expect(mlb).toMatchObject({ status: 'STALE_PUBLICATION', published: false });
    expect(mlb.reason).toMatch(/stale.*its games are not published/);
    expect(idx.sport_status.filter((s: { published: boolean }) => s.published).map((s: { sport: string }) => s.sport)).toEqual(['NFL', 'NHL']);
    expect(idx.publications.map((p: { sport: string; status: string }) => `${p.sport}:${p.status}`)).toEqual(['NFL:CURRENT_SLATE', 'NHL:CURRENT_SLATE', 'MLB:STALE_PUBLICATION']);
    const keys = [...files!.keys()];
    expect(keys).toContain('games/26OCT04NEBUF.json');
    expect(keys.some((k) => /^games\/26OCT06/.test(k))).toBe(true); // NHL
    expect(keys.some((k) => k.includes('LADATL') || k.includes('KXMLB'))).toBe(false);
    expect(idx.games.some((g: { sport: string }) => g.sport === 'MLB')).toBe(false);
  });

  it('an unreadable MLB publication is excluded the same way', async () => {
    const { plan, files } = await cycle(['NFL', 'MLB'], NFL_NOW, { unreadable: ['https://raw.test/mlb'] });
    expect(plan.publish).toBe(true);
    expect(files!.get('index.json')!.sport_status.find((s: { sport: string }) => s.sport === 'MLB')).toMatchObject({ status: 'UNREADABLE_PUBLICATION', published: false });
  });

  it('every sport stale: refused before any Kalshi request (last-known-good stays)', async () => {
    const log: string[] = [];
    const nflStale = { ...JSON.parse(readFileSync(join(SNAPSHOT_DIR, 'board.json'), 'utf-8')), generated_at: null };
    const { plan, files } = await cycle(['NFL', 'MLB'], NFL_NOW, { log, boards: { 'https://raw.test/nfl': nflStale, 'https://raw.test/mlb': staleMlbBoard('2026-10-03T22:00:00Z') } });
    expect(plan.publish).toBe(false);
    expect(plan.reason).toMatch(/no sport can be published.*last-known-good/);
    expect(files).toBeNull();
    expect(log.some((u) => u.startsWith(API))).toBe(false);
  });

  it('a stale sport and no other sport with a current game: refused (an empty feed never replaces last-known-good)', async () => {
    // MLB quiet (its games long final), NFL stale.
    const nflStale = { ...JSON.parse(readFileSync(join(SNAPSHOT_DIR, 'board.json'), 'utf-8')), generated_at: null };
    const quiet = staleMlbBoard('2026-09-01T22:00:00Z');
    quiet.items = quiet.items.map((it: object) => ({ ...it, status: 'FINAL' }));
    const { plan } = await cycle(['NFL', 'MLB'], NFL_NOW, { boards: { 'https://raw.test/nfl': nflStale, 'https://raw.test/mlb': quiet } });
    expect(plan.publish).toBe(false);
    expect(plan.reason).toMatch(/no other sport carries a current game/);
  });

  it('games > 0 && markets === 0 is judged per sport; Kalshi answering nothing at all still refuses the cycle', async () => {
    const down = await cycle(['MLB'], MLB_NOW, { kalshiDown: true });
    expect(down.plan.publish).toBe(false);
    expect(down.plan.sports[0]).toMatchObject({ sport: 'MLB', published: false, games: 4, markets: 0 });
    // MLB priced, NHL listed but unpriced (its series answer nothing): NHL alone is excluded.
    const p = (sport: string): Publication => ({ sport, status: 'CURRENT_SLATE', source: null, generated_at: '2026-10-07T19:00:00Z', age_seconds: 1, eligible_games: 1, eligible_event_ids: ['e'], latest_event: null, stale_events: [], reasons: [], horizon_days: 10, lookback_hours: 8 });
    const games: Game[] = [{ key: LADATL, sport: 'MLB', event_id: 'e1', tickers: ['KXMLBGAME-26OCT071800LADATL-LAD'], series: ['KXMLBGAME'] }, { key: '26OCT07FLALA', sport: 'NHL', event_id: 'e2', tickers: ['KXNHLGAME-26OCT07FLALA-LA'], series: ['KXNHLGAME'] }];
    const byKey = new Map([[LADATL, new Map([['KXMLBGAME-26OCT071800LADATL-LAD', { ticker: 'KXMLBGAME-26OCT071800LADATL-LAD' }]])], ['26OCT07FLALA', new Map()]]);
    const plan = planFeed([p('MLB'), p('NHL')], games, byKey);
    expect(plan.publish).toBe(true);
    expect(plan.games!.map((g) => g.sport)).toEqual(['MLB']);
    expect(plan.sports.find((s) => s.sport === 'NHL')).toMatchObject({ published: false, reason: 'no market could be read from Kalshi; not publishing an empty feed' });
  });

  it('every sport healthy and quiet still publishes a healthy empty feed', () => {
    const q = (sport: string): Publication => ({ sport, status: 'NO_CURRENT_GAMES', source: null, generated_at: '2026-10-07T19:00:00Z', age_seconds: 1, eligible_games: 0, eligible_event_ids: [], latest_event: null, stale_events: [], reasons: [], horizon_days: 10, lookback_hours: 8 });
    const plan = planFeed([q('NFL'), q('MLB')], [], new Map());
    expect(plan).toMatchObject({ publish: true, reason: 'no current games: a healthy empty feed' });
    const idx = buildFiles([], new Map(), { generatedAt: '2026-10-07T19:30:12Z', publications: [q('NFL'), q('MLB')], sportStatus: plan.sports }).get('index.json')!;
    expect([idx.status, idx.games, idx.excluded_sports]).toEqual(['NO_CURRENT_GAMES', [], []]);
  });
});

describe('Production check, per sport (scripts/production-check.mjs → sportCoverage)', () => {
  const mlbBoard = () => JSON.parse(readFileSync(join(MLB_DIR, 'board.json'), 'utf-8'));
  const tickersOf = () => new Set(readdirSync(join(MLB_DIR, 'event_detail')).flatMap((f) => (JSON.parse(readFileSync(join(MLB_DIR, 'event_detail', f), 'utf-8')) as { markets: Market[] }).markets.map((m) => m.kalshi_ticker)));

  it('a current MLB slate is covered when the index lists MLB and a game file quotes a published ticker', async () => {
    const { files } = await cycle(['MLB'], MLB_NOW);
    const idx = files!.get('index.json')!;
    const docs = new Map([...files!.entries()].filter(([k]) => k.startsWith('games/')));
    const pub = publicationStatus(mlbBoard(), MLB_NOW);
    const cov = sportCoverage('MLB', pub, idx, tickersOf(), docs);
    expect(cov).toMatchObject({ mode: 'CURRENT', ok: true, problems: [] });
    expect(cov.file).toMatch(/^games\/26OCT07\d{4}[A-Z]+\.json$/);
  });

  it('fails as MLB when the feed does not carry it, without touching NFL', async () => {
    const { files } = await cycle(['NFL', 'NHL', 'MLB'], NFL_NOW, { boards: { 'https://raw.test/mlb': staleMlbBoard('2026-10-03T22:00:00Z') } });
    const idx = files!.get('index.json')!;
    // the MLB publication has since recovered (current at MLB_NOW) but this feed still excludes it: an MLB failure
    const cov = sportCoverage('MLB', publicationStatus(mlbBoard(), MLB_NOW), idx, tickersOf(), new Map());
    expect(cov.ok).toBe(false);
    expect(cov.problems.join(' | ')).toMatch(/does not list MLB as published \(STALE_PUBLICATION.*no MLB game file in the feed/);
    // NFL's own entry is unaffected
    expect(sportEntry(idx, 'NFL')).toMatchObject({ status: 'CURRENT_SLATE', published: true });
  });

  it('a quiet MLB board is NOT_APPLICABLE; a stale one fails as MLB; an old-style index is read the old way', () => {
    const quiet = { ...mlbBoard(), items: [] };
    expect(sportCoverage('MLB', publicationStatus(quiet, MLB_NOW), null, [])).toMatchObject({ mode: 'OFF_SLATE', ok: true });
    const stale = sportCoverage('MLB', publicationStatus(staleMlbBoard('2026-10-03T22:00:00Z'), MLB_NOW), null, []);
    expect(stale).toMatchObject({ mode: 'STALE', ok: false });
    expect(stale.problems[0]).toMatch(/^the MLB publication is stale/);
    const legacy = { sports: ['NFL', 'NHL'], status: 'CURRENT_SLATE', games: [{ key: '26OCT04NEBUF', file: 'games/26OCT04NEBUF.json', event_ids: ['e'], markets: 3 }] };
    expect(sportEntry(legacy, 'NFL')).toMatchObject({ status: 'CURRENT_SLATE', published: true, legacy: true });
    expect(sportEntry(legacy, 'MLB')).toBeNull();
  });
});
