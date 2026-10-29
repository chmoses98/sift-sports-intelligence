// The deployed relay's Date header, read the way the app reads it: by a page on the production origin, cross-origin, in a real browser
// (Chromium and WebKit). A header inspection from Node cannot show this: a browser hides every response header the relay does not list in
// Access-Control-Expose-Headers. One cheap GET (the quote read the app sends), a simple request (no preflight), cache: 'no-store', credentials: 'omit'.
//
//   SIFT_QUOTE_RELAY_URL=https://sift-quote-relay.vercel.app node scripts/relay-live-date-check.mjs
//   CHROME_PATH=/path/to/chrome ENGINES=chromium ...   (only for a machine whose Playwright browsers are not installed)
//
// Exit 1 unless every engine reads a Date that agrees with this runner's clock (it is the relay's serve-time clock, not a cached copy).
import { chromium, webkit } from '@playwright/test';

const RELAY = (process.env.SIFT_QUOTE_RELAY_URL ?? '').trim().replace(/\/+$/, '');
const BASE = process.env.SIFT_URL ?? 'https://chmoses98.github.io/sift-sports-intelligence/';
const ENGINES = (process.env.ENGINES ?? 'chromium,webkit').split(',');
const MAX_SKEW_MS = 5 * 60_000;

if (!RELAY) {
  console.log('N/A: SIFT_QUOTE_RELAY_URL is not set, so there is no relay to check');
  process.exit(0);
}

let failed = 0;
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]].filter(([n]) => ENGINES.includes(n))) {
  const browser = await engine.launch(process.env.CHROME_PATH && name === 'chromium' ? { executablePath: process.env.CHROME_PATH } : {});
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE}version.json`); // a real document on the allowed origin
    const r = await page.evaluate(async (url) => {
      try {
        const res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
        await res.arrayBuffer();
        return { status: res.status, date: res.headers.get('date'), expose: res.headers.get('access-control-expose-headers'), origin: location.origin };
      } catch (e) {
        return { error: String(e) };
      }
    }, `${RELAY}/markets?series_ticker=KXNFLGAME&status=open&limit=1000`);
    const skew = r.date ? Date.now() - Date.parse(r.date) : NaN;
    const ok = !r.error && r.status === 200 && Number.isFinite(skew) && Math.abs(skew) <= MAX_SKEW_MS;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: page ${r.origin ?? '?'} read ${RELAY} -> ${r.error ?? `HTTP ${r.status}, Date ${r.date}, skew ${Number.isFinite(skew) ? Math.round(skew / 1000) : 'n/a'} s, Access-Control-Expose-Headers ${r.expose}`}`);
    if (!ok) failed++;
  } finally {
    await browser.close();
  }
}
process.exit(failed ? 1 : 0);
