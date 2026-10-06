// Shared Playwright fixtures for every Sift acceptance spec.
//
// * `market`: a controllable stand-in for the read-only Kalshi relay (and the quote feed). Every
//   e2e build points VITE_SIFT_QUOTE_RELAY_URL at https://relay.sift.invalid/kalshi — a reserved TLD
//   that can never reach a real network — and this fixture answers it from the bundled NFL
//   publication's own markets, with prices/status/failures the test sets. The browser runs the real
//   KalshiApiProvider parser against Kalshi-shaped JSON.
// * `errors`: fails the test on any unexpected console error, uncaught page error, crashed render or
//   failed same-origin asset load. The allowlist is narrow: only network errors for the external hosts
//   a test deliberately blocks or fails.
// * External hosts are blocked (deterministic runs): Sift falls back to the bundled same-run NFL
//   research snapshot, exactly as production does while NFL's live explorer is unpublished.
import { test as base, expect, type Page, type Request } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELAY = 'https://relay.sift.invalid/kalshi';
export const FEED_PATH = '/chmoses98/sift-sports-intelligence/live-quotes/';
/** A fixed "now" for clock-controlled specs: game day, 14h45m after the publication's capture. */
export const NOW = new Date('2026-10-04T15:00:00Z');

const SNAPSHOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public', 'data', 'nfl', 'app', 'latest');

interface PubMarket {
  kalshi_ticker: string;
  kalshi_event_ticker?: string | null;
  yes_bid: number | null;
  yes_ask: number | null;
  no_bid?: number | null;
  no_ask?: number | null;
  last_price?: number | null;
  volume?: number | null;
  open_interest?: number | null;
}

let published: Map<string, PubMarket> | null = null;
function publication(): Map<string, PubMarket> {
  if (published) return published;
  published = new Map();
  const dir = join(SNAPSHOT, 'event_detail');
  for (const f of readdirSync(dir)) {
    const d = JSON.parse(readFileSync(join(dir, f), 'utf-8')) as { markets: PubMarket[] };
    for (const m of d.markets) published.set(m.kalshi_ticker, m);
  }
  return published;
}

const dollars = (v: number | null | undefined) => (v == null ? undefined : v.toFixed(4));

export type FailMode = null | { status: number; retryAfter?: number } | 'abort' | 'hang';

export class MarketMock {
  /** YES bid overrides (dollars); the ask is bid + 2¢ unless set. */
  prices = new Map<string, number>();
  asks = new Map<string, number>();
  status = new Map<string, string>();
  /** Tickers the provider does not list (delisted / unknown). */
  hidden = new Set<string>();
  /** Extra contracts listed under an event (inventory: newly listed rungs). */
  extra: Record<string, unknown>[] = [];
  fail: FailMode = null;
  /** Fail only requests whose tickers include one of these. */
  failTickers = new Set<string>();
  /** Stamp responses with this observation time (else the browser stamps receipt time). */
  observedAt: string | null = null;
  requests: { url: string; at: number; tickers: string[]; event: string | null }[] = [];
  feedRequests: string[] = [];
  private hung: (() => void)[] = [];

  set(ticker: string, yesBid: number, yesAsk?: number) {
    this.prices.set(ticker, yesBid);
    if (yesAsk != null) this.asks.set(ticker, yesAsk);
  }

  release() {
    this.hung.forEach((f) => f());
    this.hung = [];
  }

  marketJson(ticker: string): Record<string, unknown> | null {
    if (this.hidden.has(ticker)) return null;
    const p = publication().get(ticker);
    const extra = this.extra.find((e) => e.ticker === ticker);
    if (!p && !extra) return null;
    const bid = this.prices.get(ticker) ?? p?.yes_bid ?? null;
    const ask = this.asks.get(ticker) ?? (this.prices.has(ticker) ? Math.round((bid! + 0.02) * 100) / 100 : p?.yes_ask ?? null);
    return {
      ticker,
      event_ticker: p?.kalshi_event_ticker ?? ticker.split('-').slice(0, 2).join('-'),
      status: this.status.get(ticker) ?? 'active',
      yes_bid_dollars: dollars(bid),
      yes_ask_dollars: dollars(ask),
      no_bid_dollars: dollars(ask != null ? 1 - ask : null),
      no_ask_dollars: dollars(bid != null ? 1 - bid : null),
      last_price_dollars: dollars(p?.last_price ?? bid),
      volume_fp: p?.volume != null ? String(p.volume) : '100.00',
      open_interest_fp: p?.open_interest != null ? String(p.open_interest) : '50.00',
      ...(extra ?? {}),
    };
  }

  async install(page: Page) {
    await page.context().route(`${RELAY}/**`, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const tickers = (url.searchParams.get('tickers') ?? '').split(',').filter(Boolean);
      const event = url.searchParams.get('event_ticker');
      const series = url.searchParams.get('series_ticker');
      this.requests.push({ url: req.url(), at: Date.now(), tickers, event: event ?? (series ? `series:${series}` : null) });
      const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'X-Sift-Observed-At, Retry-After', 'content-type': 'application/json' };
      const failing = this.fail ?? (tickers.some((t) => this.failTickers.has(t)) ? { status: 503 } : null);
      if (failing === 'abort') return route.abort('failed');
      if (failing === 'hang') return new Promise<void>((resolve) => this.hung.push(() => void route.abort('timedout').then(resolve, resolve)));
      if (failing) {
        const retry: Record<string, string> = failing.retryAfter != null ? { 'retry-after': String(failing.retryAfter) } : {};
        const body = failing.status === 429 ? '{"error":{"code":"too_many_requests","message":"too many requests"}}' : '{"error":"mock failure"}';
        return route.fulfill({ status: failing.status, headers: { ...cors, ...retry }, body });
      }
      let markets: Record<string, unknown>[];
      if (event || series) {
        const inScope = (e: string | null | undefined) => (event ? e === event : (e ?? '').split('-')[0] === series);
        const all = [...publication().values()].filter((m) => inScope(m.kalshi_event_ticker)).map((m) => m.kalshi_ticker);
        markets = [...all.map((t) => this.marketJson(t)), ...this.extra.filter((e) => inScope(e.event_ticker as string)).map((e) => this.marketJson(e.ticker as string))]
          .filter((x): x is Record<string, unknown> => !!x)
          .filter((m) => !series || url.searchParams.get('status') !== 'open' || m.status === 'active');
      } else {
        markets = tickers.map((t) => this.marketJson(t)).filter((x): x is Record<string, unknown> => !!x);
      }
      const headers: Record<string, string> = { ...cors };
      if (this.observedAt) headers['x-sift-observed-at'] = this.observedAt;
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ markets, cursor: '' }) });
    });
  }

  tickerRequests() {
    return this.requests.filter((r) => r.tickers.length);
  }

  eventRequests() {
    return this.requests.filter((r) => r.event);
  }
}

/** Hosts a test deliberately blocks or fails; network errors for them are expected noise. */
const EXPECTED_ERROR_HOSTS = ['raw.githubusercontent.com', 'relay.sift.invalid', 'chatgpt.com'];

export interface ErrorLog {
  console: string[];
  page: string[];
  assets: string[];
  /** Allow one more pattern for a single test (keep it narrow; say why at the call site). */
  allow(re: RegExp): void;
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
}

/** The CBB publication root Sift reads (src/data/sports.ts) and the synthetic fixtures served in its place. */
export const CBB_RAW = 'https://raw.githubusercontent.com/chmoses98/cbb-edge-finder/app-data/app/latest/';
const CBB_FIXTURES = join(fileURLToPath(new URL('.', import.meta.url)), 'data', 'cbb');
/** The season fixture's clock (projections archived, a final, an UNSCORABLE game) and the preseason one. */
export const CBB_NOW = { season: new Date('2026-11-02T18:00:00Z'), preseason: new Date('2026-10-20T15:00:00Z') };

export const test = base.extend<{ market: MarketMock; errors: ErrorLog; blockExternal: void; cbbVariant: 'season' | 'preseason'; cbb: void }>({
  blockExternal: [
    async ({ context }, use) => {
      await context.route(/^https:\/\/raw\.githubusercontent\.com\//, (r) => r.abort());
      await use();
    },
    { auto: true },
  ],
  cbbVariant: ['season', { option: true }],
  // The CBB raw root answered from e2e/data/cbb/<variant> (SYNTHETIC TEST FIXTURES built by the CBB repo's
  // own publisher); registered after blockExternal so it takes precedence for that one root only.
  cbb: [
    async ({ context, blockExternal, cbbVariant }, use) => {
      void blockExternal;
      const root = join(CBB_FIXTURES, cbbVariant, 'app', 'latest');
      await context.route(`${CBB_RAW}**`, (r) => {
        const rel = r.request().url().slice(CBB_RAW.length).split('?')[0];
        const file = join(root, rel);
        try {
          return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(file) });
        } catch {
          return r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'not found' });
        }
      });
      await use();
    },
    { auto: true },
  ],
  market: [
    async ({ page }, use) => {
      const m = new MarketMock();
      await m.install(page);
      await use(m);
      m.release();
    },
    { auto: true },
  ],
  errors: [
    async ({ page }, use, info) => {
      const log: ErrorLog = { console: [], page: [], assets: [], allow: () => {} };
      const extra: RegExp[] = [];
      log.allow = (re) => extra.push(re);
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        const where = msg.location()?.url ?? '';
        // A network error for an external host the test blocks/fails on purpose is expected; the app
        // handles it and the test asserts that handling. Anything else is a failure.
        const network = /Failed to load resource|net::ERR_|Fetch API cannot load|due to access control checks|The network connection was lost|Load failed|cancelled|Could not connect/i.test(text);
        if (network && (EXPECTED_ERROR_HOSTS.includes(hostOf(where)) || EXPECTED_ERROR_HOSTS.some((h) => text.includes(h)))) return;
        if (extra.some((re) => re.test(text))) return;
        log.console.push(`${text}${where ? ` @ ${where}` : ''}`);
      });
      page.on('pageerror', (err) => {
        if (extra.some((re) => re.test(err.message))) return;
        // WebKit can surface a blocked cross-origin fetch as a page error; same narrow host rule as above.
        if (/Fetch API cannot load|due to access control checks/.test(err.message) && EXPECTED_ERROR_HOSTS.some((h) => err.message.includes(h))) return;
        log.page.push(`${err.name}: ${err.message}`);
      });
      page.on('requestfailed', (req: Request) => {
        const u = req.url();
        // Internal assets (same origin) must always load; external research/quote hosts may be blocked.
        if (hostOf(u) === 'localhost' && !/\/data\//.test(new URL(u).pathname)) log.assets.push(`${req.failure()?.errorText ?? 'failed'} ${u}`);
      });
      page.on('response', (res) => {
        const u = res.url();
        if (hostOf(u) === 'localhost' && res.status() >= 400 && !/\/data\//.test(new URL(u).pathname)) log.assets.push(`HTTP ${res.status()} ${u}`);
      });
      await use(log);
      const problems = [...log.page.map((x) => `pageerror: ${x}`), ...log.console.map((x) => `console.error: ${x}`), ...log.assets.map((x) => `asset: ${x}`)];
      if (problems.length) await info.attach('browser-errors.txt', { body: problems.join('\n'), contentType: 'text/plain' });
      expect(problems, 'unexpected browser errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Mobile is not a squeezed desktop: no screen may scroll sideways. */
export async function noHorizontalOverflow(page: Page, name: string) {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw, `${name} overflows horizontally`).toBeLessThanOrEqual(cw);
}

/** Simulate the PWA going to the background / coming back (the store listens for this). */
export async function setVisibility(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => s === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

/** Text of the "YES bid / ask" cell on a market screen. */
export async function marketPrice(page: Page): Promise<string> {
  return (await page.locator('.px', { hasText: 'YES bid / ask' }).locator('.px__v').textContent()) ?? '';
}

export const ML = 'KXNFLGAME-26OCT04NEBUF-BUF';
export const ML_ID = `mkt_kalshi_${ML}`;
export const NEBUF = 'evt_0cb333291f580a201a70';
export const BUF = 'prt_16bee2e0460c651b4bca';
export const ALLEN = 'prt_06ec4b4943c66094d6f3';
