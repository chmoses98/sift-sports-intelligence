// Finds player routes on the current slate for a sport (to point the Player tests at real players): node ... find-players.mjs nba
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
const sport = process.argv[2] ?? 'nba';
const base = process.env.BASE ?? 'http://localhost:5175/sift-sports-intelligence/';
const { usePlayerFeeds } = await import('../../e2e/support/playerFeeds.ts');
const b = await chromium.launch({ executablePath: process.env.SIFT_CHROMIUM ?? ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find(existsSync) });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York' })).newPage();
await usePlayerFeeds(page);
await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
await page.goto(`${base}#/v3/games`); await page.waitForTimeout(6000);
const games = await page.evaluate((s) => [...new Set([...document.querySelectorAll(`a[href*="/v3/game/${s}/"]`)].map((a) => a.getAttribute('href')))], sport);
console.log('games', games.length, games.slice(0, 5));
for (const g of games.slice(0, 3)) {
  const href = g.replace(/^#?\/?/, '/').replace(/^\/\//, '/');
  await page.goto(`${base}#${href.split('?')[0]}?tab=props`); await page.waitForTimeout(5000);
  const ps = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[data-tap="player"]')].map((a) => a.getAttribute('data-dest')))]);
  console.log(href, ps.slice(0, 6));
}
await b.close();
