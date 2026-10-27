// Measures Prop Discovery on real published documents: documents fetched on first paint, first render time, and what one expanded row
// and one scroll cost. Prints a JSON report. Usage (dev server running):
//   BASE=http://localhost:5178/sift-sports-intelligence/ V3_REAL_FEEDS=live node --experimental-strip-types scripts/v3-qa/props-perf.mjs
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const base = process.env.BASE ?? 'http://localhost:5173/sift-sports-intelligence/';
const exe = process.env.SIFT_CHROMIUM ?? ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find(existsSync);
const { useRealFeeds, feedNow, freshQuotes } = await import('../../e2e/support/realFeeds.ts');
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.clock.setFixedTime(feedNow());
await useRealFeeds(page);
if (process.env.FRESH === '1') await freshQuotes(page);
await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
const urls = [];
page.on('request', (r) => { const u = r.url(); if (/\.json(\?|$)/.test(u) && !/\/src\//.test(u)) urls.push({ t: Date.now(), u }); });
const kind = (u) => (/\/history\/players\//.test(u) ? 'nfl-history-log' : /profiles?\//.test(u) || /entity_profile|\/profiles\//.test(u) ? 'profile' : /ranking/.test(u) ? 'ranking' : /event_detail|events\//.test(u) ? 'event' : /live-quotes/.test(u) ? 'quote-feed' : 'other');
const summarize = (from) => { const o = {}; for (const x of urls.slice(from)) { const k = kind(x.u); o[k] = (o[k] ?? 0) + 1; } return { total: urls.length - from, ...o }; };

const route = process.env.ROUTE ?? '/v3/props?view=list';
const t0 = Date.now();
await page.goto(`${base}#${route}`);
await page.waitForSelector('.pd-row, .pd-card', { timeout: 120000 });
const firstRender = Date.now() - t0;
await page.waitForTimeout(3000);
const first = summarize(0);
const n = await page.evaluate(() => Number(document.querySelector('.pd-list')?.getAttribute('aria-rowcount') ?? 0));
const dom = await page.evaluate(() => document.querySelectorAll('.pd-row').length);
// Expand the first row.
const before = urls.length;
await page.locator('.pd-row__hit').first().click();
await page.waitForSelector('.pd-peek');
await page.waitForTimeout(2500);
const expand = summarize(before);
// Scroll the whole list with a frame probe.
const frames = await page.evaluate(async () => {
  const dts = []; let last = performance.now(); let stop = false;
  const loop = () => { const t = performance.now(); dts.push(t - last); last = t; if (!stop) requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  const total = document.documentElement.scrollHeight;
  for (let y = 0; y < total; y += 220) { window.scrollTo(0, y); await new Promise((r) => requestAnimationFrame(() => r(null))); }
  stop = true;
  dts.sort((a, c) => a - c);
  return { frames: dts.length, p50: dts[Math.floor(dts.length / 2)], p95: dts[Math.floor(dts.length * 0.95)], max: dts[dts.length - 1], total };
});
const afterScroll = summarize(before);
if (process.env.URLS_OUT) (await import('node:fs')).writeFileSync(process.env.URLS_OUT, urls.map((x) => `${x.t - t0}\t${x.u}`).join('\n'));
console.log(JSON.stringify({ route, rowsInList: n, rowsInDomAtRest: dom, firstRenderMs: firstRender, documentsFirstPaintPlus3s: first, expandOneRow: expand, scroll: frames, afterScrollTotal: afterScroll }, null, 2));
await b.close();
