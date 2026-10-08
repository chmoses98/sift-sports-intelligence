// REVIEW AID (never shipped): renders the hero gallery (#/design/heroes) of every sport, desktop and phone, and tiles
// each team's hero into labelled review sheets, so a person can check the whole set without opening game pages.
//
//   npm run build && npx vite preview --port 4173 &   (the app at http://localhost:4173/sift-sports-intelligence/)
//   node scripts/heroes/review-sheets.mjs <out dir> [NFL,MLB,…]
//
// Writes <out>/<sport>-<desktop|phone>-<n>.jpg (12 heroes per desktop sheet, 16 per phone sheet), <out>/cases-*.jpg
// (the edge cases) and <out>/coverage.json (per sport: teams, photos, branded heroes, photo ids).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'hero-review';
const SPORTS = (process.argv[3] ?? 'NFL,MLB,NHL,CFB,CBB').split(',');
const BASE = process.env.SIFT_URL ?? 'http://localhost:4173/sift-sports-intelligence/';
const TMP = join(OUT, '.tiles');
mkdirSync(TMP, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const coverage = {};

async function render(route, label, viewport, per) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (r) => r.abort());
  await page.goto(`${BASE}#${route}`);
  await page.waitForSelector('.hg__item');
  await page.evaluate(() => document.fonts.ready);
  const items = await page.locator('.hg__item').all();
  const tiles = [];
  const rows = [];
  for (const [i, item] of items.entries()) {
    await item.scrollIntoViewIfNeeded();
    const hero = item.locator('header.gh');
    // Let its art settle: the photo (when it has one) and every logo decoded.
    await page.waitForFunction((el) => [...el.querySelectorAll('img')].every((im) => im.complete && im.naturalWidth > 0) && (el.getAttribute('data-hero-kind') !== 'photo' || el.querySelector('.hart.is-loaded')), await hero.elementHandle(), { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(420);
    const f = join(TMP, `${label}-${String(i).padStart(3, '0')}.png`);
    await item.screenshot({ path: f });
    tiles.push(f);
    rows.push({ team: await item.getAttribute('data-gallery-team'), kind: await hero.getAttribute('data-hero-kind'), context: await hero.getAttribute('data-hero-context'), photo: (await hero.getAttribute('data-hero-photo')) || null, reason: await hero.getAttribute('data-hero-reason') });
  }
  await page.close();
  const w = viewport.width < 600 ? 4 : 2;
  for (let s = 0; s * per < tiles.length; s++) {
    const chunk = tiles.slice(s * per, (s + 1) * per);
    execFileSync('montage', [...chunk, '-tile', `${w}x`, '-geometry', '+8+8', '-background', '#010b13', '-quality', '82', join(OUT, `${label}-${s + 1}.jpg`)]);
  }
  return rows;
}

for (const sport of SPORTS) {
  const s = sport.toLowerCase();
  const rows = await render(`/design/heroes?sport=${sport}`, `${s}-desktop`, { width: 1280, height: 900 }, 12);
  await render(`/design/heroes?sport=${sport}`, `${s}-phone`, { width: 390, height: 844 }, 16);
  coverage[sport] = { teams: rows.length, photos: rows.filter((r) => r.kind === 'photo').length, branded: rows.filter((r) => r.kind === 'branded').length, notHome: rows.filter((r) => r.context !== 'home').map((r) => r.team), photoIds: rows.filter((r) => r.photo).map((r) => `${r.team}:${r.photo}`) };
  console.log(sport, JSON.stringify({ ...coverage[sport], photoIds: coverage[sport].photoIds.length }));
}
coverage.cases = await render('/design/heroes', 'cases-desktop', { width: 1280, height: 900 }, 12);
await render('/design/heroes', 'cases-phone', { width: 390, height: 844 }, 16);
writeFileSync(join(OUT, 'coverage.json'), JSON.stringify(coverage, null, 1) + '\n');
rmSync(TMP, { recursive: true, force: true });
await browser.close();
