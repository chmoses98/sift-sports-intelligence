// Real published documents for browser tests. The app reads research and quote feeds from raw.githubusercontent.com; a browser in a
// locked-down environment (or CI) cannot or should not reach them, so the requests are answered by the test process from the COMMITTED fixture
// bundle (fixtures/real, selected by family: see e2e/support/feedSource.ts and fixtures/real/README.md). `V3_REAL_FEEDS=live` refills a scratch
// cache from the network instead. A document the source does not have answers 404, the same as a missing publication. Nothing is invented.
import type { Page } from '@playwright/test';
import { cacheKey } from '../../scripts/v3-fixtures/lib.mjs';
import { feedClock, feedSource, recordRequest, type FeedFamily } from './feedSource';

export type { FeedFamily } from './feedSource';
export const feedCacheKey = cacheKey;

const CORS = { 'access-control-allow-origin': '*' };
const GAME_FEED = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/sift-sports-intelligence\/live-quotes\/games\/[^/]+\.json/;

/**
 * A stored document's body (null when the family does not have it). For tests that edit a real document: `route.fetch()` would go to the NETWORK
 * (it ignores the other routes), so read the document from the fixture family instead and fulfil the edited copy.
 */
export async function feedDocument(family: FeedFamily, url: string, o: { live?: boolean } = {}): Promise<Buffer | null> {
  return (await feedSource(family, o).get(url))?.body ?? null;
}

export async function useRealFeeds(page: Page, o: { family: FeedFamily; live?: boolean; hosts?: RegExp }): Promise<{ served: string[]; missed: string[] }> {
  if (!o?.family) throw new Error('useRealFeeds needs { family }: the real-document specs read one captured family each (stat, team, game, player, props)');
  const src = feedSource(o.family, { live: o.live });
  const hosts = o.hosts ?? /^https:\/\/raw\.githubusercontent\.com\//;
  const log = { served: [] as string[], missed: [] as string[] };
  await page.route(hosts, async (route) => {
    const url = route.request().url();
    const doc = await src.get(url).catch(() => null);
    recordRequest(url, !!doc);
    if (doc) {
      log.served.push(url);
      await route.fulfill({ status: 200, body: doc.body, headers: { 'content-type': 'application/json', ...CORS, 'cache-control': 'no-store' } });
    } else {
      log.missed.push(url);
      await route.fulfill({ status: 404, body: 'not found', headers: CORS });
    }
  });
  return log;
}

/**
 * TEST TRANSFORMATION, not data: re-stamps the observation time of every market in the real quote-feed game files to "now", so the
 * priced states (a price inside the list's maximum age) can be exercised against the real contract list while the real feed, 3.5 minutes
 * plus a 5-minute CDN cache behind, is older than the display rule allows. Only timestamps change; every price is the published one.
 * Call after `useRealFeeds` (the later route wins). With `omit`, those tickers are removed from the answer; with `fail`, the feed answers 503 (no reliable quote can be obtained);
 * with `status`, a ticker whose function returns a word has its market `status` REPLACED by it (a controlled modification, for the states no captured market is in:
 * the real feed does carry `inactive` and `determined` markets, but not a `closed` or `settled` one that still has an ask).
 */
export async function freshQuotes(page: Page, o: { family: FeedFamily; omit?: (ticker: string) => boolean; fail?: () => boolean; live?: boolean; status?: (ticker: string) => string | undefined }): Promise<void> {
  if (!o?.family) throw new Error('freshQuotes needs { family }');
  const src = feedSource(o.family, { live: o.live });
  await page.route(GAME_FEED, async (route) => {
    if (o.fail?.()) { await route.fulfill({ status: 503, body: 'unavailable', headers: CORS }); return; }
    const url = route.request().url();
    const got = await src.get(url).catch(() => null);
    recordRequest(url, !!got);
    if (!got) { await route.fulfill({ status: 404, body: 'not found', headers: CORS }); return; }
    const doc = JSON.parse(got.body.toString('utf8')) as { generated_at?: string; markets: { observed_at?: string; ticker?: string; kalshi_ticker?: string; status?: string }[] };
    const now = feedNow(o.family, o.live).toISOString();
    doc.generated_at = now;
    doc.markets = doc.markets.filter((m) => !o.omit?.(String(m.ticker ?? m.kalshi_ticker ?? ''))).map((m) => {
      const status = o.status?.(String(m.ticker ?? m.kalshi_ticker ?? ''));
      return { ...m, observed_at: now, ...(status ? { status } : {}) };
    });
    await route.fulfill({ status: 200, body: JSON.stringify(doc), headers: { 'content-type': 'application/json', ...CORS, 'cache-control': 'no-store' } });
  });
}

/**
 * The instant a family's documents describe, from the bundle's manifest (fixtures/real/MANIFEST.json, `families.<family>.clock.captured_at`).
 * A slate captured at 22:50 UTC lists games that start at 00:15 UTC; read at 00:40 UTC the same documents describe games already played, so
 * browser tests run on this fixed clock (pass it to `page.clock.setFixedTime`). V3_FEED_NOW overrides it; in a scratch cache (live or
 * V3_FEED_CACHE) `captured_at.txt` in the cache does.
 */
/** The stored bytes of a real document (null when the family does not have it): the successor of the old `readFeedCache(url)`, now per family. */
export const readFeedCache = (family: FeedFamily, url: string, o: { live?: boolean } = {}): Promise<Buffer | null> => feedDocument(family, url, o);

export const feedNow = (family: FeedFamily, live?: boolean): Date => new Date(feedClock(family, live));
