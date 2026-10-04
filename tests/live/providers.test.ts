// Provider parsing against a real Kalshi market object, request shapes, and error mapping.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { availabilityOf, normalizeKalshiMarket } from '../../src/live/normalize';
import { FallbackProvider } from '../../src/live/providers/fallback';
import { FEED_SCHEMA, FeedQuoteProvider, gameKeyOf } from '../../src/live/providers/feed';
import { chunkTickers, KalshiApiProvider } from '../../src/live/providers/kalshi';
import { ProviderError } from '../../src/live/types';

const real = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'kalshi-market.json'), 'utf-8'));
const OBS = '2026-10-04T15:21:32.000Z';
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

describe('normalizeKalshiMarket (real payload)', () => {
  it('reads dollar strings and fixed-point sizes', () => {
    const q = normalizeKalshiMarket(real, OBS, 'kalshi-relay')!;
    expect(q).toMatchObject({
      ticker: 'KXNFLGAME-26OCT12BUFLAR-LAR', eventTicker: 'KXNFLGAME-26OCT12BUFLAR', seriesTicker: 'KXNFLGAME',
      yesBid: 0.54, yesAsk: 0.56, noBid: 0.44, noAsk: 0.46, lastPrice: 0.56, volume: 1106.24, openInterest: 860.67,
      availability: 'OPEN', rawStatus: 'active', observedAt: OBS, title: 'Los Angeles R wins', yesSubTitle: 'Los Angeles R',
    });
  });

  it('does not take updated_time (a metadata timestamp) as the quote time', () => {
    expect(normalizeKalshiMarket(real, OBS, 'x')!.observedAt).toBe(OBS);
  });

  it('falls back to legacy integer cents; treats a 0 bid / 100 ask as no quote', () => {
    const q = normalizeKalshiMarket({ ticker: 'T-1-X', yes_bid: 0, yes_ask: 100, no_bid: 41, no_ask: 59, last_price: 0, status: 'active' }, OBS, 'x')!;
    expect(q.yesBid).toBeNull();
    expect(q.yesAsk).toBeNull();
    expect(q.noBid).toBe(0.41);
    expect(q.lastPrice).toBeNull();
    expect(normalizeKalshiMarket({ no_ticker: true }, OBS, 'x')).toBeNull();
  });

  it('maps every Kalshi status word to an availability', () => {
    expect(['active', 'open'].map(availabilityOf)).toEqual(['OPEN', 'OPEN']);
    expect(['initialized', 'unopened'].map(availabilityOf)).toEqual(['UNOPENED', 'UNOPENED']);
    expect(['inactive', 'paused'].map(availabilityOf)).toEqual(['SUSPENDED', 'SUSPENDED']);
    expect(['closed', 'determined', 'disputed', 'amended'].map(availabilityOf)).toEqual(['CLOSED', 'CLOSED', 'CLOSED', 'CLOSED']);
    expect(['settled', 'finalized'].map(availabilityOf)).toEqual(['SETTLED', 'SETTLED']);
    expect(availabilityOf('???')).toBe('UNKNOWN');
  });
});

describe('KalshiApiProvider (through the relay)', () => {
  it('batches at 100 tickers and stays under URL limits (250 tickers -> 414 measured)', () => {
    const many = Array.from({ length: 250 }, (_, i) => `KXNFLRECYDS-26OCT04NEBUF-BUFJCOOK4-${i}`);
    const chunks = chunkTickers(many, 'https://relay.example/kalshi');
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(chunks.flat()).toEqual(many);
  });

  it('asks with a simple GET (no custom headers, no cache) and reports tickers Kalshi does not list', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const p = new KalshiApiProvider({
      baseUrl: 'https://relay.example/kalshi/',
      fetchImpl: async (url, init) => {
        seen.push({ url, init });
        return json({ markets: [real], cursor: '' }, { headers: { 'x-sift-observed-at': OBS } });
      },
    });
    const r = await p.fetchQuotes(['KXNFLGAME-26OCT12BUFLAR-LAR', 'KXNFLGAME-26OCT12BUFLAR-GONE']);
    expect(seen[0].url).toBe('https://relay.example/kalshi/markets?tickers=KXNFLGAME-26OCT12BUFLAR-LAR,KXNFLGAME-26OCT12BUFLAR-GONE&limit=1000');
    expect(seen[0].init?.cache).toBe('no-store');
    expect(seen[0].init?.headers).toBeUndefined();
    expect(r.quotes[0].observedAt).toBe('2026-10-04T15:21:32Z'); // second precision, rounded down
    expect(r.missing).toEqual(['KXNFLGAME-26OCT12BUFLAR-GONE']);
  });

  it('lists inventory by series (one request per series, cursor followed), keeping only the asked events', async () => {
    const urls: string[] = [];
    const other = { ...real, ticker: 'KXNFLGAME-26OCT12KCDEN-KC', event_ticker: 'KXNFLGAME-26OCT12KCDEN' };
    const p = new KalshiApiProvider({
      baseUrl: 'https://relay.example/kalshi',
      fetchImpl: async (url) => {
        urls.push(url);
        return json(url.includes('cursor=') ? { markets: [{ ...real, ticker: 'KXNFLGAME-26OCT12BUFLAR-BUF' }], cursor: '' } : { markets: [real, other], cursor: 'abc' });
      },
    });
    const r = await p.fetchEventMarkets(['KXNFLGAME-26OCT12BUFLAR', 'KXNFLGAME-26OCT12BUFLAR']);
    expect(urls[0]).toBe('https://relay.example/kalshi/markets?series_ticker=KXNFLGAME&status=open&limit=1000');
    expect(urls).toHaveLength(2);
    expect(r.quotes.map((q) => q.ticker)).toEqual(['KXNFLGAME-26OCT12BUFLAR-LAR', 'KXNFLGAME-26OCT12BUFLAR-BUF']);
  });

  it.each([
    [new Response('', { status: 429, headers: { 'retry-after': '30' } }), 'rate_limited'],
    [new Response('', { status: 403 }), 'blocked'],
    [new Response('oops', { status: 502 }), 'http'],
    [new Response('<html>', { status: 200 }), 'schema'],
    [json({ data: [] }), 'schema'],
  ])('maps %#', async (res, kind) => {
    const p = new KalshiApiProvider({ baseUrl: 'https://relay.example', fetchImpl: async () => res });
    await expect(p.fetchQuotes(['A-B-C'])).rejects.toMatchObject({ kind });
  });

  it('maps a network failure', async () => {
    const p = new KalshiApiProvider({ baseUrl: 'https://relay.example', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
    await expect(p.fetchQuotes(['A-B-C'])).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('FeedQuoteProvider (GitHub Actions feed on raw.githubusercontent.com)', () => {
  const doc = {
    schema: FEED_SCHEMA, game_key: '26OCT12BUFLAR', generated_at: '2026-10-04T15:20:00Z', source: 'kalshi-public via github-actions',
    tickers_checked: ['KXNFLGAME-26OCT12BUFLAR-LAR', 'KXNFLGAME-26OCT12BUFLAR-GONE'],
    markets: [{ ...real, observed_at: '2026-10-04T15:19:58Z' }],
  };

  it('maps tickers to per-game files and keeps each market\'s own observation time', async () => {
    const urls: string[] = [];
    const p = new FeedQuoteProvider({ baseUrl: 'https://raw.example/live-quotes', fetchImpl: async (u) => (urls.push(u), json(doc)) });
    const r = await p.fetchQuotes(['KXNFLGAME-26OCT12BUFLAR-LAR', 'KXNFLGAME-26OCT12BUFLAR-GONE', 'KXNFLGAME-26OCT12BUFLAR-BUF']);
    expect(urls).toEqual(['https://raw.example/live-quotes/games/26OCT12BUFLAR.json']);
    expect(r.quotes).toHaveLength(1);
    expect(r.quotes[0].observedAt).toBe('2026-10-04T15:19:58Z');
    expect(r.missing).toEqual(['KXNFLGAME-26OCT12BUFLAR-GONE']); // checked and absent; -BUF was never checked
  });

  it('treats an uncovered game as "not refreshed", and rejects an unknown schema', async () => {
    const none = new FeedQuoteProvider({ baseUrl: 'https://raw.example', fetchImpl: async () => new Response('', { status: 404 }) });
    expect(await none.fetchQuotes(['KXNFLGAME-26OCT12BUFLAR-LAR'])).toMatchObject({ quotes: [], missing: [] });
    const bad = new FeedQuoteProvider({ baseUrl: 'https://raw.example', fetchImpl: async () => json({ ...doc, schema: 'other.v9' }) });
    await expect(bad.fetchQuotes(['KXNFLGAME-26OCT12BUFLAR-LAR'])).rejects.toMatchObject({ kind: 'schema' });
  });

  it('derives the game key from tickers and event tickers', () => {
    expect(gameKeyOf('KXNFLFIRSTTD-26OCT04NEBUF-NENO-TD')).toBe('26OCT04NEBUF');
    expect(gameKeyOf('KXNFLSPREAD-26OCT04NEBUF')).toBe('26OCT04NEBUF');
  });
});

describe('FallbackProvider', () => {
  it('uses the relay when it answers and the feed when it does not', async () => {
    const relay = { id: 'relay', label: 'r', maxBatch: 100, fetchQuotes: async () => { throw new ProviderError('http', '503'); }, fetchEventMarkets: async () => ({ quotes: [], missing: [], requests: 1, latencyMs: 0 }) };
    const feed = { id: 'feed', label: 'f', maxBatch: 100, fetchQuotes: async () => ({ quotes: [], missing: ['X'], requests: 1, latencyMs: 0 }), fetchEventMarkets: async () => ({ quotes: [], missing: [], requests: 1, latencyMs: 0 }) };
    const p = new FallbackProvider([relay, feed]);
    expect((await p.fetchQuotes(['X'])).missing).toEqual(['X']);
    expect(p.lastAnswered).toBe('feed');
    await p.fetchEventMarkets(['E']);
    expect(p.lastAnswered).toBe('relay');
  });

  it('fails with the primary provider\'s error when every provider fails', async () => {
    const bad = (id: string, kind: 'http' | 'network') => ({ id, label: id, maxBatch: 1, fetchQuotes: async () => { throw new ProviderError(kind, id); }, fetchEventMarkets: async () => { throw new ProviderError(kind, id); } });
    await expect(new FallbackProvider([bad('relay', 'http'), bad('feed', 'network')]).fetchQuotes(['X'])).rejects.toMatchObject({ message: 'relay', kind: 'http' });
  });
});

describe('relay on a new host: Sift needs only the URL', () => {
  it('labels the source with the relay host and the feed as fallback', () => {
    const relay = new KalshiApiProvider({ baseUrl: 'https://sift-quote-relay.vercel.app/' });
    const feed = new FeedQuoteProvider({ baseUrl: 'https://raw.githubusercontent.com/chmoses98/sift-sports-intelligence/live-quotes' });
    const chain = new FallbackProvider([relay, feed]);
    expect(chain.id).toBe('kalshi-relay>quote-feed');
    expect(chain.label).toMatch(/^Kalshi public market data via relay \(sift-quote-relay\.vercel\.app\), then Sift quote feed/);
  });

  it('turns a relay 429 into a rate-limit error that honours Retry-After', async () => {
    const p = new KalshiApiProvider({ baseUrl: 'https://sift-quote-relay.vercel.app', fetchImpl: async () => new Response('{"error":{"code":"too_many_requests"}}', { status: 429, headers: { 'retry-after': '7' } }) });
    await expect(p.fetchQuotes(['X'])).rejects.toMatchObject({ kind: 'rate_limited', status: 429, retryAfterMs: 7000 });
  });
});

describe('FallbackProvider keeps the primary failure visible', () => {
  const ok = { quotes: [], missing: [], requests: 1, latencyMs: 0 };
  it('records the relay 429 behind a feed answer, and clears it once the relay answers again', async () => {
    let relayDown = true;
    const relay = { id: 'kalshi-relay', label: 'r', maxBatch: 100, fetchQuotes: async () => { if (relayDown) throw new ProviderError('rate_limited', 'rate limited (HTTP 429)', 429, 7000); return ok; }, fetchEventMarkets: async () => ok };
    const feed = { id: 'quote-feed', label: 'f', maxBatch: 100, fetchQuotes: async () => ok, fetchEventMarkets: async () => ok };
    const p = new FallbackProvider([relay, feed]);
    await p.fetchQuotes(['X']);
    expect(p.lastAnswered).toBe('quote-feed');
    expect(p.lastFallback).toMatchObject({ provider: 'kalshi-relay', status: 429, error: 'rate_limited: rate limited (HTTP 429)' });
    relayDown = false;
    await p.fetchQuotes(['X']);
    expect(p.lastAnswered).toBe('kalshi-relay');
    expect(p.lastFallback).toBeNull();
  });
});
