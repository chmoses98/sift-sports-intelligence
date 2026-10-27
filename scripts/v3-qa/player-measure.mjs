// Where each block of the Player screen sits (y range, height) at a given phone size: W=375 H=667 BASE=... node --experimental-strip-types scripts/v3-qa/player-measure.mjs
import { chromium } from '@playwright/test';
const { usePlayerFeeds } = await import('../../e2e/support/playerFeeds.ts');
const b = await chromium.launch({ executablePath: process.env.SIFT_CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const ctx = await b.newContext({ viewport: { width: Number(process.env.W||375), height: Number(process.env.H||667) }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/New_York' });
const page = await ctx.newPage();
await usePlayerFeeds(page);
await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
await page.goto(process.env.BASE + '#/v3/player/nfl/prt_4c661ae8b854ff5f66dd');
await page.waitForSelector('.v3p-hb', { timeout: 30000 }); await page.waitForTimeout(800);
const sel = ['.v3p-hero', '.v3p-strip-g', '.x-tabs', '.v3p-pills', '.v3p-decide', '.v3p-chartc', '.v3p-wins', '.v3p-hb', '.v3p-sum', '.v3-tabbar, nav[aria-label], [data-v3-nav]'];
for (const s of sel) { const bb = await page.locator(s).first().boundingBox().catch(() => null); console.log(s.padEnd(30), bb ? `${Math.round(bb.y)}..${Math.round(bb.y + bb.height)} (h ${Math.round(bb.height)})` : 'none'); }
await page.screenshot({ path: process.env.OUT || '/tmp/m.png' });
await b.close();
