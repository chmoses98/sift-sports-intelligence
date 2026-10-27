// Real published documents for the Player Research tests, with the one thing a disk cache cannot keep: a price that is current.
// The display gate (src/v3/data/quoteGate.ts) shows a quote only while its observation is recent, so a cached capture would (correctly) show
// "—" a few minutes after it was taken. This helper answers feed requests exactly like e2e/support/realFeeds.ts (disk cache, or curl with
// V3_REAL_FEEDS=live), then does two things and nothing else: it stamps every market's `captured_at` (and the live-quote feed's `observed_at`) with a fixed instant, and it fixes the
// page's clock a few seconds after that instant. Every price, line, ladder and document is the real publication's; only the age is pinned,
// so the same test passes today and next month. Nothing is invented: a document the cache and the network do not have answers 404.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Page } from '@playwright/test';

const run = promisify(execFile);
const dir = process.env.V3_FEED_CACHE ?? join(process.cwd(), '.v3-feed-cache');
/** The same key e2e/support/realFeeds.ts uses, so both helpers share one cache. */
const feedCacheKey = (url: string) => createHash('sha1').update(url).digest('hex');

/** The instant every captured quote is stamped with, and the (fixed) time the page believes it is a few seconds later. */
export const CAPTURED_AT = '2026-10-26T19:00:00Z';
export const PAGE_NOW = Date.parse(CAPTURED_AT) + 5_000;

function stamp(body: Buffer): Buffer {
  let j: { kind?: string; schema?: string; generated_at?: string; markets?: { captured_at?: string | null; observed_at?: string | null }[] };
  try { j = JSON.parse(body.toString('utf8')); } catch { return body; }
  if (!Array.isArray(j?.markets)) return body;
  // the publication's event document, and the live-quote feed's per-game file (the same market observed by a later job)
  if (j.kind === 'event_detail') for (const m of j.markets) { if (m.captured_at) m.captured_at = CAPTURED_AT; }
  else if (j.schema === 'sift.live_quotes.v1') { j.generated_at = CAPTURED_AT; for (const m of j.markets) { if (m.observed_at) m.observed_at = CAPTURED_AT; } }
  else return body;
  return Buffer.from(JSON.stringify(j));
}

export async function usePlayerFeeds(page: Page, o: { live?: boolean; pinClock?: boolean; hosts?: RegExp } = {}): Promise<{ served: string[]; missed: string[] }> {
  const live = o.live ?? process.env.V3_REAL_FEEDS === 'live';
  const hosts = o.hosts ?? /^https:\/\/raw\.githubusercontent\.com\//;
  mkdirSync(dir, { recursive: true });
  const log = { served: [] as string[], missed: [] as string[] };
  if (o.pinClock !== false) await page.clock.setFixedTime(PAGE_NOW);
  await page.route(hosts, async (route) => {
    const url = route.request().url();
    const f = join(dir, feedCacheKey(url));
    if (!existsSync(f) && live) {
      try { await run('curl', ['-sS', '--fail', '-m', '40', '-o', f, url], { maxBuffer: 1 << 20 }); } catch { /* a miss */ }
    }
    if (existsSync(f)) {
      log.served.push(url);
      await route.fulfill({ status: 200, body: stamp(readFileSync(f)), headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
    } else {
      log.missed.push(url);
      await route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
    }
  });
  return log;
}
