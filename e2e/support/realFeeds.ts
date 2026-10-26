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
