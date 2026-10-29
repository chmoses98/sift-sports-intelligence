// Probe a route of the running v3 app: print the outer HTML, box and a few computed styles of the elements a selector matches.
//   BASE=http://localhost:5173/sift-sports-intelligence/ REAL=1 node --experimental-strip-types scripts/v3-qa/probe.mjs "/v3/stat/nfl/adj_off_epa?sel=DAL" ".st-kd.opp"
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const [route, selector] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173/sift-sports-intelligence/';
const exe = process.env.SIFT_CHROMIUM ?? ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find(existsSync);
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport: { width: Number(process.env.W ?? 390), height: Number(process.env.H ?? 844) }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
if (process.env.REAL === '1') {
  const { useRealFeeds } = await import('../../e2e/support/realFeeds.ts');
  await useRealFeeds(page);
}
await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('page error:', String(e).slice(0, 300)));
await page.goto(`${base}#${route}`);
await page.waitForSelector('[data-v3-shell]');
await page.waitForTimeout(Number(process.env.WAIT ?? 2500));
const out = await page.$$eval(selector, (els) => els.slice(0, 5).map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { html: e.outerHTML.slice(0, 400), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], display: cs.display, position: cs.position, width: cs.width, height: cs.height }; }));
console.log(JSON.stringify(out, null, 1));
await b.close();
