// Screenshot routes of the running v3 app at phone size (Chromium; WebKitGTK is scripts/v3-qa/wk.py).
//   node scripts/v3-qa/shot.mjs OUT_DIR "/v3?demo=1" "/v3/games" ...      (BASE=http://localhost:5173/sift-sports-intelligence/)
// SIFT_CHROMIUM overrides the browser binary (the sandbox's pre-installed Chromium has a different build number than the pinned Playwright).
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

const [out, ...routes] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173/sift-sports-intelligence/';
const exe = process.env.SIFT_CHROMIUM ?? ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find(existsSync);
mkdirSync(out, { recursive: true });
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport: { width: Number(process.env.W ?? 390), height: Number(process.env.H ?? 844) }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
let i = 0;
for (const r of routes) {
  await page.goto(`${base}#${r}`);
  await page.waitForSelector('[data-v3-shell]');
  await page.waitForTimeout(Number(process.env.WAIT ?? 700));
  const file = `${out}/${String(++i).padStart(2, '0')}_${r.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.png`;
  await page.screenshot({ path: file, fullPage: process.env.FULL === '1' });
  console.log(file);
}
await b.close();
