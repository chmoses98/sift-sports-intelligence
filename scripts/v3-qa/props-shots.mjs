// Prop Discovery screenshots on real published documents (cached; fixed clock; quote observation times re-stamped: see e2e/support/realFeeds.ts).
//   BASE=http://localhost:5178/sift-sports-intelligence/ V3_REAL_FEEDS=live node --experimental-strip-types scripts/v3-qa/props-shots.mjs OUT_DIR [W H]
// Writes pd1-home, pd2-list, pd3-peek, pd4-filters, pd5-compare, pd6-contract, pd6-missing, pd2-missing-price (PNG at 2x).
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

const [out, W = '390', H = '844'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173/sift-sports-intelligence/';
const exe = process.env.SIFT_CHROMIUM ?? ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find(existsSync);
const { useRealFeeds, freshQuotes, feedNow } = await import('../../e2e/support/realFeeds.ts');
mkdirSync(out, { recursive: true });
const b = await chromium.launch(exe ? { executablePath: exe } : {});
let failQuotes = false;
async function session() {
  const ctx = await b.newContext({ viewport: { width: Number(W), height: Number(H) }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.clock.setFixedTime(feedNow());
  await useRealFeeds(page);
  await freshQuotes(page, { fail: () => failQuotes });
  return page;
}
const go = async (page, path, sel = '.pd-row, .pd-card') => { await page.goto(`${base}#${path}`); await page.waitForSelector(sel, { timeout: 120000 }); await page.waitForTimeout(2500); };
const shot = async (page, name) => { await page.screenshot({ path: `${out}/${name}-${W}.png` }); console.log(`${out}/${name}-${W}.png`); };
const ids = async (page, n) => page.evaluate((k) => [...document.querySelectorAll('.pd-row[data-prop]')].slice(0, k).map((e) => e.getAttribute('data-prop')), n);

let page = await session();
await go(page, '/v3/props');
await shot(page, 'pd1-home');

await go(page, '/v3/props?v=1&view=list&sport=nhl&fam=points');
await shot(page, 'pd2-list');
// PD3: expand the first row that has a player page.
const row = page.locator('.pd-row:has(a.pd-av)').first();
await row.evaluate((e) => e.scrollIntoView({ block: 'start' }));
await row.locator('.pd-row__hit').click({ position: { x: 250, y: 85 } });
await page.waitForSelector('.pd-peek');
await page.waitForTimeout(1500);
await page.evaluate(() => window.scrollTo(0, Math.max(0, document.querySelector('.pd-row.is-open').getBoundingClientRect().top + scrollY - 70)));
await page.waitForTimeout(500);
await shot(page, 'pd3-peek');
await page.locator('.pd-peek .pd-acts a[data-tap="price"]').click();
await page.waitForSelector('.v3c');
await page.waitForTimeout(1500);
await shot(page, 'pd6-contract');

await go(page, '/v3/props?v=1&view=list&sport=nhl&fam=points&sort=price');
await page.getByRole('button', { name: /Open sort and filters/ }).click();
await page.waitForSelector('.pd-fs');
await page.waitForTimeout(800);
await shot(page, 'pd4-filters');

// PD5: three props across sports (the first of each of two football rungs and one hockey).
await go(page, '/v3/props?v=1&view=list&sport=nfl&fam=receptions');
const nfl = await ids(page, 2);
await go(page, '/v3/props?v=1&view=list&sport=nhl&fam=points');
const nhl = await ids(page, 1);
await go(page, `/v3/props?v=1&view=compare&cmp=${[...nfl, ...nhl].join(',')}`, '.pd-compare');
await shot(page, 'pd5-compare');

// Missing quote: list prices are "—"; the contract says so plainly with Retry.
failQuotes = true;
await page.close();
page = await session();
await go(page, '/v3/props?v=1&view=list&sport=nfl&fam=receptions');
await shot(page, 'pd2-missing-price');
await page.locator('.pd-row a.pd-px').first().click();
await page.waitForSelector('.v3c');
await page.waitForTimeout(2500);
await shot(page, 'pd6-missing');
await b.close();
