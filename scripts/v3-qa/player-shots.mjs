// Phone screenshots of every Player Research state (P1 to P4, the contract sheet) from REAL published documents with the page's clock pinned
// to the capture (see e2e/support/playerFeeds.ts), so prices show exactly as they would on a live phone.
//   BASE=http://localhost:5391/sift-sports-intelligence/ node --experimental-strip-types scripts/v3-qa/player-shots.mjs OUT_DIR [scene,scene] [route]
// Scenes: p1 p1full p2 p3 p4 contract props trends log replay. Default player: CeeDee Lamb (NFL). W/H set the viewport (default 390x844).
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

const [out, only, routeArg] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173/sift-sports-intelligence/';
const route = routeArg ?? '/v3/player/nfl/prt_4c661ae8b854ff5f66dd';
const exe = process.env.SIFT_CHROMIUM ?? ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find(existsSync);
const W = Number(process.env.W ?? 390), H = Number(process.env.H ?? 844);
mkdirSync(out, { recursive: true });
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const want = (only ?? 'p1,p1full,p2,p3,p4,contract,props,trends,log,replay').split(',');

async function fresh() {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const { usePlayerFeeds } = await import('../../e2e/support/playerFeeds.ts');
  await usePlayerFeeds(page);
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  return { ctx, page };
}
const open = async (page, r) => { await page.goto(`${base}#${r}`); await page.waitForSelector('[data-v3-shell]'); await page.waitForTimeout(Number(process.env.WAIT ?? 4500)); };
const shot = async (page, name, o = {}) => { const f = `${out}/${name}.png`; await page.screenshot({ path: f, ...o }); console.log(f); };

for (const scene of want) {
  const { ctx, page } = await fresh();
  try {
    if (scene === 'p1') { await open(page, route); await shot(page, 'p1'); }
    if (scene === 'p1full') { await open(page, route); await shot(page, 'p1full', { fullPage: true }); }
    if (scene === 'p2') {
      await open(page, route);
      // a real touch drag on the line's label, captured mid-drag (the readout replaces the window chips)
      const g = page.locator('.v3p-hb__grab');
      const bb = await g.boundingBox();
      const cdp = await ctx.newCDPSession(page);
      const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 8 }] });
      await page.waitForTimeout(250);
      await shot(page, 'p2-drag');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(400);
      await page.evaluate(() => window.scrollTo(0, 560));
      await page.waitForTimeout(500);
      await shot(page, 'p2-ladder');
    }
    if (scene === 'p3') {
      await open(page, route);
      await page.locator('.v3p-pill--f').click();
      await page.waitForTimeout(1500);
      const away = page.getByRole('button', { name: /^Away/ });
      if (await away.count()) await away.first().click();
      await page.waitForTimeout(400);
      await shot(page, 'p3');
      await page.locator('.v3-sheet__body').evaluate((el) => { el.scrollTop = 9999; });
      await page.waitForTimeout(300);
      await shot(page, 'p3-bottom');
    }
    if (scene === 'p4') {
      await open(page, `${route}?tab=matchup`);
      await shot(page, 'p4');
      await page.evaluate(() => window.scrollTo(0, 600)); await page.waitForTimeout(400);
      await shot(page, 'p4-2');
    }
    if (scene === 'trends') { await open(page, `${route}?tab=trends`); await shot(page, 'trends'); await page.evaluate(() => window.scrollTo(0, 700)); await page.waitForTimeout(400); await shot(page, 'trends-2'); }
    if (scene === 'log') { await open(page, `${route}?tab=log`); await shot(page, 'log'); await page.evaluate(() => window.scrollTo(0, 700)); await page.waitForTimeout(400); await shot(page, 'log-2'); }
    if (scene === 'replay') { await open(page, `${route}?tab=trends&view=replay`); await shot(page, 'replay'); await page.evaluate(() => window.scrollTo(0, 700)); await page.waitForTimeout(400); await shot(page, 'replay-2'); }
    if (scene === 'props') { await open(page, `${route}?tab=props`); await shot(page, 'props'); }
    if (scene === 'contract') {
      await open(page, route);
      await page.locator('.v3p-dl__r').click();
      await page.waitForTimeout(1500);
      await shot(page, 'contract');
    }
  } catch (e) { console.log(scene, 'FAILED', String(e).split('\n')[0]); await shot(page, `${scene}-failed`).catch(() => {}); }
  await ctx.close();
}
await b.close();
