// The GitHub Actions quote-feed publisher against the real NFL publication (from disk) and a fake
// Kalshi: canonical mapping, inventory, closed contracts, observed times — and that the browser's
// FeedQuoteProvider reads exactly what it writes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFiles, makeGet, observedAt, publicationGames, sweep } from '../../scripts/live-quotes/lib.mjs';
import { FeedQuoteProvider } from '../../src/live/providers/feed';
import { NHL_DIR, SNAPSHOT_DIR } from '../helpers';

const RAW = 'https://raw.test/nfl';
const API = 'https://kalshi.test/v2';
const NOW = Date.parse('2026-10-04T15:00:00Z');
const DATE = 'Sun, 04 Oct 2026 15:00:10 GMT';
/** A Kalshi game key: date + teams (NFL 26OCT04NEBUF, NHL 26OCT06FLALA), or date + ET start + teams (MLB 26OCT071800LADATL). */
const GAME_KEY = /^\d{2}[A-Z]{3}\d{2}(\d{4})?[A-Z]{4,6}$/;

function fakeFetch(log: string[]) {
  return async (url: string): Promise<Response> => {
    log.push(url);
    if (url.startsWith(RAW)) {
      return new Response(readFileSync(join(SNAPSHOT_DIR, url.slice(RAW.length + 1))), { headers: { 'content-type': 'application/json' } });
    }
    const u = new URL(url);
    const series = u.searchParams.get('series_ticker');
    const headers = { 'content-type': 'application/json', date: DATE, age: '4' };
    if (series === 'KXNFLGAME') {
      return new Response(JSON.stringify({ cursor: '', markets: [
        { ticker: 'KXNFLGAME-26OCT04NEBUF-BUF', event_ticker: 'KXNFLGAME-26OCT04NEBUF', status: 'active', yes_bid_dollars: '0.6400', yes_ask_dollars: '0.6500', rules_primary: 'long text dropped' },
        { ticker: 'KXNFLGAME-26OCT99ZZZYYY-ZZZ', event_ticker: 'KXNFLGAME-26OCT99ZZZYYY', status: 'active', yes_bid_dollars: '0.5' }, // not in the publication
      ] }), { headers });
    }
    if (series === 'KXNFLSPREAD') {
      return new Response(JSON.stringify({ cursor: '', markets: [
        { ticker: 'KXNFLSPREAD-26OCT04NEBUF-BUF9', event_ticker: 'KXNFLSPREAD-26OCT04NEBUF', status: 'active', yes_bid_dollars: '0.4100', title: 'Buffalo wins by over 9.5 points', floor_strike: 9.5 },
      ] }), { headers });
    }
    if (u.searchParams.get('tickers')) {
      const asked = u.searchParams.get('tickers')!.split(',');
      const closed = asked.filter((t) => t.startsWith('KXNFL1H-26OCT04NEBUF'));
      return new Response(JSON.stringify({ cursor: '', markets: closed.map((t) => ({ ticker: t, status: 'closed', yes_bid_dollars: '0.0000' })) }), { headers });
    }
    return new Response(JSON.stringify({ cursor: '', markets: [] }), { headers });
  };
}

describe('live-quote feed publisher', () => {
  it('takes the observation time from Kalshi (Date minus Age)', () => {
    expect(observedAt(new Response('', { headers: { date: DATE, age: '4' } }), 0)).toBe('2026-10-04T15:00:06Z');
  });

  it('maps only publication games, discovers new rungs, records closed contracts, reads back in the browser', async () => {
    const log: string[] = [];
    const { get, count } = makeGet({ fetchImpl: fakeFetch(log) as typeof fetch, sleep: async () => {}, now: () => NOW });
    const games = await publicationGames(RAW, get, { now: () => NOW });
    expect(games.length).toBeGreaterThan(5);
    const nebuf = games.find((g) => g.key === '26OCT04NEBUF')!;
    expect(nebuf.tickers.length).toBe(796);
    const { byKey, errors } = await sweep(games, get, { api: API });
    expect(errors).toEqual([]);
    const files = buildFiles(games, byKey, { generatedAt: '2026-10-04T15:00:12Z', requests: count() });
    const doc = files.get('games/26OCT04NEBUF.json')!;
    const tickers = doc.markets.map((m: { ticker: string }) => m.ticker);
    expect(tickers).toContain('KXNFLGAME-26OCT04NEBUF-BUF');
    expect(tickers).toContain('KXNFLSPREAD-26OCT04NEBUF-BUF9'); // newly listed, same game
    expect(tickers.some((t: string) => t.includes('ZZZYYY'))).toBe(false); // never maps an unknown game
    expect([...files.keys()].some((k) => k.includes('ZZZYYY'))).toBe(false);
    const ml = doc.markets.find((m: { ticker: string }) => m.ticker === 'KXNFLGAME-26OCT04NEBUF-BUF');
    expect(ml).toEqual({ ticker: 'KXNFLGAME-26OCT04NEBUF-BUF', event_ticker: 'KXNFLGAME-26OCT04NEBUF', status: 'active', yes_bid_dollars: '0.6400', yes_ask_dollars: '0.6500', observed_at: '2026-10-04T15:00:06Z' });
    expect(files.get('index.json')!.games.find((g: { key: string }) => g.key === '26OCT04NEBUF')).toMatchObject({ newly_listed: 1, published: 796 });
    // Only GETs against the publication and Kalshi's public /markets; nothing else.
    expect(log.every((u) => u.startsWith(RAW) || u.startsWith(`${API}/markets?`))).toBe(true);

    const provider = new FeedQuoteProvider({
      baseUrl: 'https://raw.test/live-quotes',
      fetchImpl: async (u) => {
        const rel = u.replace('https://raw.test/live-quotes/', '');
        const f = files.get(rel);
        return f ? new Response(JSON.stringify(f)) : new Response('', { status: 404 });
      },
    });
    const r = await provider.fetchQuotes(['KXNFLGAME-26OCT04NEBUF-BUF', 'KXNFL1H-26OCT04NEBUF-BUF']);
    const byT = new Map(r.quotes.map((q) => [q.ticker, q]));
    expect(byT.get('KXNFLGAME-26OCT04NEBUF-BUF')).toMatchObject({ yesBid: 0.64, yesAsk: 0.65, availability: 'OPEN', observedAt: '2026-10-04T15:00:06Z', source: 'quote-feed' });
    expect(byT.get('KXNFL1H-26OCT04NEBUF-BUF')).toMatchObject({ availability: 'CLOSED', yesBid: null });
    const inv = await provider.fetchEventMarkets(['KXNFLSPREAD-26OCT04NEBUF']);
    expect(inv.quotes.map((q) => q.ticker)).toEqual(['KXNFLSPREAD-26OCT04NEBUF-BUF9']);
  });

  it('maps the NHL publication the same way (one feed, sport-agnostic game keys)', async () => {
    const raw = 'https://raw.test/nhl';
    const fetchImpl = (async (url: string) => new Response(readFileSync(join(NHL_DIR, url.slice(raw.length + 1))), { headers: { 'content-type': 'application/json' } })) as typeof fetch;
    const { get } = makeGet({ fetchImpl, sleep: async () => {}, now: () => Date.parse('2026-10-06T23:30:00Z') });
    const games = await publicationGames(raw, get, { now: () => Date.parse('2026-10-06T23:30:00Z') });
    expect(games.map((g) => g.event_id).sort()).toEqual(['evt_4f20f09608cc97c362a7', 'evt_5938c3f8a7c1b24c0118', 'evt_c4a2cf978d0824a1493a']);
    for (const g of games) {
      expect(g.key).toMatch(GAME_KEY);
      expect(g.series.every((x: string) => x.startsWith('KXNHL'))).toBe(true);
      expect(g.tickers.every((t: string) => t.split('-')[1] === g.key)).toBe(true);
    }
  });
});
