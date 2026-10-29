// Home / Games / Welcome screenshots at 320, 375, 390 and 430 pt (real published documents, fixed clock, viewer time zone America/New_York).
//   BASE=http://localhost:5181/sift-sports-intelligence/ node --experimental-strip-types scripts/v3-qa/homegames-shots.mjs docs/sift3/qa/impl/homegames before
// TZ_ID overrides the viewer zone. The first-run welcome only opens for a viewer who has not seen it, so it gets its own fresh context.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

const [out, tag = 'after'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5181/sift-sports-intelligence/';
const exe = process.env.SIFT_CHROMIUM ?? ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find(existsSync);
const { useRealFeeds, feedNow } = await import('../../e2e/support/realFeeds.ts');
mkdirSync(out, { recursive: true });
const b = await chromium.launch(exe ? { executablePath: exe } : {});

async function shoot(w, name, route, sel, onboarded) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: process.env.TZ_ID ?? 'America/New_York', locale: 'en-US' });
  if (onboarded) await ctx.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ onboarded: true })); } catch { /* */ } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(feedNow());
  await useRealFeeds(page);
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.goto(`${base}#${route}`);
  await page.waitForSelector('[data-v3-shell]');
  await page.waitForSelector(sel, { timeout: 20000 }).catch(() => console.log('missing', sel, w));
  await page.waitForTimeout(900);
  const file = `${out}/${tag}-${name}-${w}.png`;
  await page.screenshot({ path: file });
  console.log(file, 'overflow', await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await ctx.close();
}

for (const w of [320, 375, 390, 430]) {
  await shoot(w, 'games', '/v3/games', '.v3-gclist .v3-gc', true);
  await shoot(w, 'home', '/v3', '.v3-feat', true);
  await shoot(w, 'welcome', '/v3', '.v3-welcome', false);
}
await b.close();
