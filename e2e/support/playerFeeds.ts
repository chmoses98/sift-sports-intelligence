// Real published documents for the Player Research tests, with the one thing a stored capture cannot keep: a price that is current.
// The display gate (src/v3/data/quoteGate.ts) shows a quote only while its observation is recent, so a stored capture would (correctly) show
// "—" a few minutes after it was taken. This helper answers feed requests exactly like e2e/support/realFeeds.ts (the committed `player` family, or curl
// with V3_REAL_FEEDS=live), then does two things and nothing else: it stamps every market's `captured_at` (and the live-quote feed's `observed_at`) with the
// family's pinned instant, and it fixes the page's clock a few seconds after that instant. Every price, line, ladder and document is the real publication's; only the age is pinned,
// so the same test passes today and next month. Nothing is invented: a document the source does not have answers 404.
import type { Page } from '@playwright/test';
import { feedClock, feedSource, recordRequest } from './feedSource';

/** The instant every captured quote is stamped with: the `player` family's clock pin in fixtures/real/MANIFEST.json (V3_FEED_NOW overrides it). */
export const CAPTURED_AT = feedClock('player');
/** The (fixed) time the page believes it is, a few seconds after the stamp. */
export const PAGE_NOW = Date.parse(CAPTURED_AT) + 5_000;

function stamp(body: Buffer, status?: (ticker: string) => string | null | undefined): Buffer {
  let j: { kind?: string; schema?: string; generated_at?: string; markets?: { captured_at?: string | null; observed_at?: string | null; ticker?: string; status?: string }[] };
  try { j = JSON.parse(body.toString('utf8')); } catch { return body; }
  if (!Array.isArray(j?.markets)) return body;
  // the publication's event document, and the live-quote feed's per-game file (the same market observed by a later job)
  if (j.kind === 'event_detail') for (const m of j.markets) { if (m.captured_at) m.captured_at = CAPTURED_AT; }
  else if (j.schema === 'sift.live_quotes.v1') { j.generated_at = CAPTURED_AT; for (const m of j.markets) { if (m.observed_at) m.observed_at = CAPTURED_AT; const w = status?.(String(m.ticker ?? '')); if (w === null) delete m.status; else if (w) m.status = w; } }
  else return body;
  return Buffer.from(JSON.stringify(j));
}

/** `status`: a controlled modification for the states no captured market is in: a live-feed market whose function returns a word has its `status` REPLACED by it (null removes it). */
export async function usePlayerFeeds(page: Page, o: { live?: boolean; pinClock?: boolean; hosts?: RegExp; status?: (ticker: string) => string | null | undefined } = {}): Promise<{ served: string[]; missed: string[]; probed: string[] }> {
  const src = feedSource('player', { live: o.live });
  const hosts = o.hosts ?? /^https:\/\/raw\.githubusercontent\.com\//;
  const log = { served: [] as string[], missed: [] as string[], probed: [] as string[] };
  if (o.pinClock !== false) await page.clock.setFixedTime(PAGE_NOW);
  await page.route(hosts, async (route) => {
    const url = route.request().url();
    const head = route.request().method() === 'HEAD';
    const doc = await src.get(url).catch(() => null);
    recordRequest(url, !!doc);
    if (doc) {
      (head ? log.probed : log.served).push(url);
      await route.fulfill({ status: 200, body: stamp(doc.body, o.status), headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
    } else {
      if (!head) log.missed.push(url);
      await route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
    }
  });
  return log;
}
