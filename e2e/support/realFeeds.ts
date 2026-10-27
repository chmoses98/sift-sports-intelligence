// Real published documents for browser tests. The app reads research and quote feeds from raw.githubusercontent.com; a browser in a
// locked-down environment cannot reach them, so the requests are answered by the test process: from a disk cache when it has the
// document, otherwise (V3_REAL_FEEDS=live) fetched with curl, which honours the environment's proxy and CA bundle, and cached.
// Nothing is invented: a miss without live access answers 404, the same as a missing document. The cache is never committed.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Page } from '@playwright/test';

const run = promisify(execFile);
const dir = process.env.V3_FEED_CACHE ?? join(process.cwd(), '.v3-feed-cache');

export const feedCacheKey = (url: string) => createHash('sha1').update(url).digest('hex');

export async function useRealFeeds(page: Page, o: { live?: boolean; hosts?: RegExp } = {}): Promise<{ served: string[]; missed: string[] }> {
  const live = o.live ?? process.env.V3_REAL_FEEDS === 'live';
  const hosts = o.hosts ?? /^https:\/\/raw\.githubusercontent\.com\//;
  mkdirSync(dir, { recursive: true });
  const log = { served: [] as string[], missed: [] as string[] };
  await page.route(hosts, async (route) => {
    const url = route.request().url();
    const f = join(dir, feedCacheKey(url));
    if (!existsSync(f) && live) {
      try { const { stdout } = await run('curl', ['-sS', '--fail', '-m', '40', '-o', f, url], { maxBuffer: 1 << 20 }); void stdout; } catch { /* fall through to a miss */ }
    }
    if (existsSync(f)) {
      log.served.push(url);
      await route.fulfill({ status: 200, body: readFileSync(f), headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
    } else {
      log.missed.push(url);
      await route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
    }
  });
  return log;
}

export const writeFeedFixture = (url: string, body: string | Buffer) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, feedCacheKey(url)), body); };

/** The cached bytes of a real document (null when it was never fetched). */
export const readFeedCache = (url: string): Buffer | null => { const f = join(dir, feedCacheKey(url)); return existsSync(f) ? readFileSync(f) : null; };

/**
 * TEST TRANSFORMATION, not data: re-stamps the observation time of every market in the real quote-feed game files to "now", so the
 * priced states (a price inside the list's maximum age) can be exercised against the real contract list while the real feed, 3.5 minutes
 * plus a 5-minute CDN cache behind, is older than the display rule allows. Only timestamps change; every price is the published one.
 * Call after `useRealFeeds` (the later route wins). With `omit`, those tickers are removed from the answer; with `fail`, the feed answers 503 (no reliable quote can be obtained);
 * with `status`, a ticker whose function returns a word has its market `status` REPLACED by it (a controlled modification, for the states no captured market is in:
 * the real feed does carry `inactive` and `determined` markets, but not a `closed` or `settled` one that still has an ask).
 */
export async function freshQuotes(page: Page, o: { omit?: (ticker: string) => boolean; fail?: () => boolean; live?: boolean; status?: (ticker: string) => string | undefined } = {}): Promise<void> {
  const live = o.live ?? process.env.V3_REAL_FEEDS === 'live';
  await page.route(/^https:\/\/raw\.githubusercontent\.com\/chmoses98\/sift-sports-intelligence\/live-quotes\/games\/[^/]+\.json/, async (route) => {
    if (o.fail?.()) { await route.fulfill({ status: 503, body: 'unavailable', headers: { 'access-control-allow-origin': '*' } }); return; }
    const url = route.request().url();
    let body = readFeedCache(url);
    if (!body && live) {
      try { await run('curl', ['-sS', '--fail', '-m', '40', '-o', join(dir, feedCacheKey(url)), url]); body = readFeedCache(url); } catch { /* a miss */ }
    }
    if (!body) { await route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } }); return; }
    const doc = JSON.parse(body.toString('utf8')) as { generated_at?: string; markets: { observed_at?: string; ticker?: string; kalshi_ticker?: string; status?: string }[] };
    const now = feedNow().toISOString();
    doc.generated_at = now;
    doc.markets = doc.markets.filter((m) => !o.omit?.(String(m.ticker ?? m.kalshi_ticker ?? ''))).map((m) => ({ ...m, observed_at: now, ...(o.status?.(String(m.ticker ?? m.kalshi_ticker ?? '')) ? { status: o.status!(String(m.ticker ?? m.kalshi_ticker ?? '')) } : {}) }));
    await route.fulfill({ status: 200, body: JSON.stringify(doc), headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
  });
}

/**
 * The instant the cached real documents describe. A slate captured at 22:50 UTC lists games that start at 00:15 UTC; read at 00:40 UTC the
 * same documents describe games already played. Browser tests therefore run on a fixed clock: `.v3-feed-cache/captured_at.txt` (an ISO time,
 * written when the cache is filled) or V3_FEED_NOW; with neither, the real clock (a live fetch is as current as it is). Pass it to
 * `page.clock.setFixedTime`.
 */
export function feedNow(): Date {
  const env = process.env.V3_FEED_NOW;
  if (env && Number.isFinite(Date.parse(env))) return new Date(env);
  const f = join(dir, 'captured_at.txt');
  if (existsSync(f)) { const t = Date.parse(readFileSync(f, 'utf8').trim()); if (Number.isFinite(t)) return new Date(t); }
  return new Date();
}
