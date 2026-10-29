// Game Detail QA screenshots: the reference game (DAL at PHI) under real published documents and a fixed clock, at 390x844 and 375x667.
//   SIFT_CHROMIUM=... BASE=http://localhost:5177/sift-sports-intelligence/ node --experimental-strip-types scripts/v3-qa/game-shots.mjs OUT_DIR
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const root = process.cwd();
const { useRealFeeds } = await import(root + '/e2e/support/realFeeds.ts');
const out = process.argv[2]; mkdirSync(out, { recursive: true });
const base = process.env.BASE;
const G = '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3';
const states = [
  ['g1', `${G}?v=1&tab=matchup`, 0],
  ['g1dal', `${G}?v=1&tab=matchup&dir=DAL`, 0],
  ['g1dal-b', `${G}?v=1&tab=matchup&dir=DAL`, 700],
  ['g2unit', `${G}?v=1&tab=matchup&dir=DAL&unit=pass`, 0],
  ['g2unit-b', `${G}?v=1&tab=matchup&dir=DAL&unit=pass`, 700],
  ['g3', `${G}?v=1&tab=matchup`, 'lens'],
  ['g3open', `${G}?v=1&tab=matchup&lens=1`, 'lens'],
  ['g3-keys', `${G}?v=1&tab=matchup`, 'keys'],
  ['overview', `${G}`, 0],
  ['overview-b', `${G}`, 650],
  ['recap', `/v3/game/nfl/evt_0e858f7285b411adf630`, 0],
];
for (const [W, H] of [[390, 844], [375, 667]]) {
  const b = await chromium.launch({ executablePath: process.env.SIFT_CHROMIUM });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await useRealFeeds(page);
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.clock.setFixedTime(new Date('2026-10-26T23:06:00Z'));
  for (const [name, route, sc] of states) {
    await page.goto(`${base}#${route}`);
    await page.waitForSelector('[data-v3-shell]');
    await page.waitForSelector('.mx-tug, .mx-sec, .x-card, .v3-state', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    if (sc === 'lens') await page.evaluate(() => document.querySelector('[data-testid=sift-lens]')?.scrollIntoView({ block: 'start' }));
    else if (sc === 'keys') await page.evaluate(() => document.querySelector('[data-testid=game-shape]')?.scrollIntoView({ block: 'start' }));
    else if (sc) await page.evaluate((y) => window.scrollTo(0, y), sc);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${W}-${name}.png` });
    if (name === 'g1' || name === 'g3open' || name === 'g2unit' || name === 'overview') await page.screenshot({ path: `${out}/${W}-${name}-full.png`, fullPage: true });
  }
  await b.close();
}
