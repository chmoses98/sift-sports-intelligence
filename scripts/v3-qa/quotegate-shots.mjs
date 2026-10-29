// Quote-gate QA screenshots (milestone 8a): Home, Games and Game Detail with prices, under real published documents and a pinned clock, so a
// build before the change and a build after it can be compared pixel for pixel. A withheld price must look like a priced one (same slot).
//   SIFT_CHROMIUM=... BASE=http://localhost:5179/sift-sports-intelligence/ node --experimental-strip-types scripts/v3-qa/quotegate-shots.mjs OUT_DIR [prefix]
// Default: the clock is the cache's capture instant and the real quote feed's observation times are re-stamped to it (a test transformation,
// prices untouched; e2e/support/realFeeds.ts freshQuotes), so list prices pass the gate. WITHHELD=1 serves the real feed as captured, which is
// older than every list limit, so every price slot reads "—".
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const root = process.cwd();
const { useRealFeeds, freshQuotes, feedNow } = await import(root + '/e2e/support/realFeeds.ts');
const out = process.argv[2]; mkdirSync(out, { recursive: true });
const prefix = process.argv[3] ?? 'shot';
const base = process.env.BASE;
const G = '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3';
const states = [
  ['home', '/v3', '[data-v3-shell] .v3-feat, .v3-state'],
  ['games-nfl', '/v3/games?sport=nfl&state=upcoming', '.v3-gc'],
  ['games-nhl', '/v3/games?sport=nhl', '.v3-gc'],
  ['game-overview', G, '.mx-sec, .x-card'],
  ['game-props', `${G}?tab=props`, '.v3-props'],
];
const b = await chromium.launch({ executablePath: process.env.SIFT_CHROMIUM });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await useRealFeeds(page);
await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
await page.clock.setFixedTime(feedNow());
if (process.env.WITHHELD !== '1') await freshQuotes(page);
for (const [name, route, ready] of states) {
  await page.goto(`${base}#${route}`);
  await page.waitForSelector('[data-v3-shell]');
  await page.waitForSelector(ready, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${prefix}-${name}.png` });
  console.log(`${prefix}-${name}`);
}
await b.close();
