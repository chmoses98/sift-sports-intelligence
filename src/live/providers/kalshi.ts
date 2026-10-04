// Kalshi Trade API v2 public market data (GET /markets), read-only, no credentials.
//
// Evidence (scripts/kalshi-probe.mjs on a GitHub runner, 2026-10-04): Kalshi enforces an Origin
// allowlist. A request with no Origin answers 200; Origin https://chmoses98.github.io (or localhost)
// answers 403 with no CORS headers; only https://kalshi.com is allowed. Real Chromium and WebKit pages
// on the GitHub Pages origin fail the fetch. So a browser can never call Kalshi directly: this provider
// talks to Kalshi's API *shape* through a read-only relay (relay/kalshi-quote-relay.js) that forwards
// the same GET without an Origin. The relay holds no secret, because the data is public.
//
//   GET {base}/markets?tickers=A,B,...   up to 100 tickers (250 -> HTTP 414, URL too long)
//   GET {base}/markets?event_ticker=E    one event per request (a comma list returns 0 markets)
import { normalizeKalshiMarket } from '../normalize';
import { ProviderError, type LiveQuote, type ProviderResult, type QuoteProvider } from '../types';

export const KALSHI_MAX_TICKERS = 100;
/** Kept under typical proxy/CDN URL limits; 100 NFL tickers measured ~4.4 KB. */
const MAX_URL = 7000;
const MAX_PAGES = 5;

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface KalshiProviderOptions {
  baseUrl: string;
  id?: string;
  label?: string;
  fetchImpl?: FetchFn;
  now?: () => number;
  minIntervalMs?: number;
}

export function chunkTickers(tickers: string[], base: string, max = KALSHI_MAX_TICKERS): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  const overhead = `${base}/markets?tickers=&limit=1000`.length;
  for (const t of tickers) {
    const add = encodeURIComponent(t).length + 3; // %2C
    if (cur.length && (cur.length >= max || overhead + len + add > MAX_URL)) {
      out.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(t);
    len += add;
  }
  if (cur.length) out.push(cur);
  return out;
}

export class KalshiApiProvider implements QuoteProvider {
  readonly id: string;
  readonly label: string;
  readonly maxBatch = KALSHI_MAX_TICKERS;
  readonly minIntervalMs: number;
  private base: string;
  private fetchImpl: FetchFn;
  private now: () => number;

  constructor(o: KalshiProviderOptions) {
    this.base = o.baseUrl.replace(/\/+$/, '');
    this.id = o.id ?? 'kalshi-relay';
    this.label = o.label ?? `Kalshi public market data via relay (${safeHost(this.base)})`;
    this.fetchImpl = o.fetchImpl ?? ((u, i) => fetch(u, i));
    this.now = o.now ?? Date.now;
    this.minIntervalMs = o.minIntervalMs ?? 10_000;
  }

  private async page(url: string, signal?: AbortSignal): Promise<{ markets: Record<string, unknown>[]; cursor: string | null; observedAt: string }> {
    let res: Response;
    try {
      // A simple GET (no custom headers) so no CORS preflight; never from the HTTP cache.
      res = await this.fetchImpl(url, { cache: 'no-store', signal, credentials: 'omit' });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw new ProviderError('aborted', 'request aborted');
      throw new ProviderError('network', `network error: ${(e as Error)?.message ?? e}`);
    }
    if (res.status === 429) {
      const ra = Number(res.headers.get('retry-after'));
      throw new ProviderError('rate_limited', 'rate limited (HTTP 429)', 429, Number.isFinite(ra) && ra > 0 ? ra * 1000 : null);
    }
    if (res.status === 403) throw new ProviderError('blocked', 'provider refused the request (HTTP 403)', 403);
    if (!res.ok) throw new ProviderError('http', `HTTP ${res.status}`, res.status);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new ProviderError('schema', 'response is not JSON');
    }
    const markets = (body as { markets?: unknown })?.markets;
    if (!Array.isArray(markets)) throw new ProviderError('schema', 'response has no markets[]');
    // The relay stamps Kalshi's own response time (Date minus Age) and exposes it; otherwise the
    // moment this device received the answer is the observation time.
    const stamped = res.headers.get('x-sift-observed-at');
    const observedAt = stamped && !Number.isNaN(Date.parse(stamped)) ? new Date(stamped).toISOString() : new Date(this.now()).toISOString();
    const cursor = (body as { cursor?: unknown }).cursor;
    return { markets: markets as Record<string, unknown>[], cursor: typeof cursor === 'string' && cursor ? cursor : null, observedAt };
  }

  private async list(query: string, signal?: AbortSignal): Promise<{ quotes: LiveQuote[]; requests: number }> {
    const quotes: LiveQuote[] = [];
    let cursor: string | null = null;
    let requests = 0;
    do {
      const url = `${this.base}/markets?${query}&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const p = await this.page(url, signal);
      requests++;
      for (const m of p.markets) {
        const q = normalizeKalshiMarket(m, p.observedAt, this.id);
        if (q) quotes.push(q);
      }
      cursor = p.cursor;
    } while (cursor && requests < MAX_PAGES);
    return { quotes, requests };
  }

  async fetchQuotes(tickers: string[], signal?: AbortSignal): Promise<ProviderResult> {
    const t0 = this.now();
    const want = [...new Set(tickers)];
    const quotes: LiveQuote[] = [];
    let requests = 0;
    for (const chunk of chunkTickers(want, this.base, this.maxBatch)) {
      const r = await this.list(`tickers=${chunk.map(encodeURIComponent).join(',')}`, signal);
      quotes.push(...r.quotes);
      requests += r.requests;
    }
    const got = new Set(quotes.map((q) => q.ticker));
    return { quotes, missing: want.filter((t) => !got.has(t)), requests, latencyMs: this.now() - t0 };
  }

  async fetchEventMarkets(eventTickers: string[], signal?: AbortSignal): Promise<ProviderResult> {
    const t0 = this.now();
    const quotes: LiveQuote[] = [];
    let requests = 0;
    for (const e of [...new Set(eventTickers)]) {
      const r = await this.list(`event_ticker=${encodeURIComponent(e)}`, signal);
      quotes.push(...r.quotes);
      requests += r.requests;
    }
    return { quotes, missing: [], requests, latencyMs: this.now() - t0 };
  }
}

export function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'relay';
  }
}
