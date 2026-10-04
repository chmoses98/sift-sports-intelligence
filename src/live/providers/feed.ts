// The live-quote FEED: a GitHub Actions job (scripts/publish-live-quotes.mjs, every 5 minutes) reads
// Kalshi's public market data from a runner, where no browser Origin is involved, and force-pushes one
// small JSON file per game to the `live-quotes` branch of this repository. The browser reads it from
// raw.githubusercontent.com (CORS *). It needs no account, no secret and no server, but it is only
// near-live: GitHub's cron fires every ~5-15 minutes and raw.githubusercontent.com caches for up to
// 5 minutes (a query string does not bypass it, measured 2026-10-04). Every quote carries the time
// Kalshi answered the job, so its age — and freshness — is always the true one.
//
//   {base}/games/<EVENT-SUFFIX>.json   e.g. games/26OCT04NEBUF.json for every KX*-26OCT04NEBUF market
import { normalizeKalshiMarket } from '../normalize';
import { ProviderError, type LiveQuote, type ProviderResult, type QuoteProvider } from '../types';

export const FEED_SCHEMA = 'sift.live_quotes.v1';

export interface FeedGameDoc {
  schema: string;
  game_key: string;
  generated_at: string;
  source: string;
  /** Every ticker the publisher looked up for this game (published + newly listed). */
  tickers_checked: string[];
  markets: (Record<string, unknown> & { observed_at: string })[];
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Kalshi tickers are SERIES-EVENTSUFFIX-OUTCOME; event tickers are SERIES-EVENTSUFFIX. */
export const gameKeyOf = (ticker: string): string | null => ticker.split('-')[1] || null;

export class FeedQuoteProvider implements QuoteProvider {
  readonly id = 'quote-feed';
  readonly label: string;
  readonly maxBatch = 2000;
  /** The feed cannot change faster than its CDN; polling it faster only costs bandwidth. */
  readonly minIntervalMs = 60_000;
  private base: string;
  private fetchImpl: FetchFn;
  private now: () => number;

  constructor(o: { baseUrl: string; fetchImpl?: FetchFn; now?: () => number }) {
    this.base = o.baseUrl.replace(/\/+$/, '');
    this.label = 'Sift quote feed (Kalshi public data via GitHub Actions, ~5-15 min)';
    this.fetchImpl = o.fetchImpl ?? ((u, i) => fetch(u, i));
    this.now = o.now ?? Date.now;
  }

  private async game(key: string, signal?: AbortSignal): Promise<FeedGameDoc | null> {
    let res: Response;
    try {
      // Revalidate with the CDN (ETag) instead of trusting the browser's 5-minute HTTP cache.
      res = await this.fetchImpl(`${this.base}/games/${encodeURIComponent(key)}.json`, { cache: 'no-cache', signal, credentials: 'omit' });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw new ProviderError('aborted', 'request aborted');
      throw new ProviderError('network', `network error: ${(e as Error)?.message ?? e}`);
    }
    if (res.status === 404) return null;
    if (res.status === 429) throw new ProviderError('rate_limited', 'rate limited (HTTP 429)', 429);
    if (!res.ok) throw new ProviderError('http', `HTTP ${res.status}`, res.status);
    let doc: FeedGameDoc;
    try {
      doc = (await res.json()) as FeedGameDoc;
    } catch {
      throw new ProviderError('schema', 'feed file is not JSON');
    }
    if (doc?.schema !== FEED_SCHEMA || !Array.isArray(doc.markets)) throw new ProviderError('schema', `unsupported feed schema ${String(doc?.schema)}`);
    return doc;
  }

  private async byGames(keys: string[], signal?: AbortSignal) {
    const docs = new Map<string, FeedGameDoc | null>();
    for (const k of [...new Set(keys)]) docs.set(k, await this.game(k, signal));
    const quotes: LiveQuote[] = [];
    for (const d of docs.values()) {
      for (const m of d?.markets ?? []) {
        const q = normalizeKalshiMarket(m, m.observed_at ?? d!.generated_at, this.id);
        if (q) quotes.push(q);
      }
    }
    return { docs, quotes, requests: docs.size };
  }

  async fetchQuotes(tickers: string[], signal?: AbortSignal): Promise<ProviderResult> {
    const t0 = this.now();
    const want = [...new Set(tickers)];
    const keys = want.map(gameKeyOf).filter((k): k is string => !!k);
    const { docs, quotes, requests } = await this.byGames(keys, signal);
    const wanted = new Set(want);
    const got = new Set(quotes.map((q) => q.ticker));
    // "missing" only where the feed says it looked the ticker up and Kalshi had nothing; a game the
    // feed does not cover is simply not refreshed (its quotes keep their true age).
    const checked = new Set([...docs.values()].flatMap((d) => d?.tickers_checked ?? []));
    return {
      quotes: quotes.filter((q) => wanted.has(q.ticker)),
      missing: want.filter((t) => !got.has(t) && checked.has(t)),
      requests,
      latencyMs: this.now() - t0,
    };
  }

  async fetchEventMarkets(eventTickers: string[], signal?: AbortSignal): Promise<ProviderResult> {
    const t0 = this.now();
    const events = new Set(eventTickers);
    const { quotes, requests } = await this.byGames(eventTickers.map(gameKeyOf).filter((k): k is string => !!k), signal);
    return { quotes: quotes.filter((q) => q.eventTicker != null && events.has(q.eventTicker)), missing: [], requests, latencyMs: this.now() - t0 };
  }
}
