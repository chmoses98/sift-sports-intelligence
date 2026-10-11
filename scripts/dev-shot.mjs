// Real-data screenshots of a local build (dev aid, not part of CI).
//   npx vite build && npx vite preview --port 4211 --strictPort &
//   node scripts/dev-shot.mjs http://127.0.0.1:4211/sift-sports-intelligence/ <outDir> <width> <height> <hash>...
// Routes outbound requests through the session proxy (HTTPS_PROXY) so the live sport publications load.
// Width <= 500 renders a touch phone. Saves JPEGs (full page) and prints console errors.
import { chromium } from '@playwright/test';
const [,, base, out, w, h, ...hashes] = process.argv;
const proxy = process.env.HTTPS_PROXY;
const browser = await chromium.launch({
  args: ['--ignore-certificate-errors', ...(proxy ? [`--proxy-server=${proxy}`, '--proxy-bypass-list=localhost;127.0.0.1'] : [])],
});
const phone = +w <= 500;
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, serviceWorkers: 'block', isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
for (const hsh of hashes) {
  await page.goto(`${base}#${hsh}`, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => console.log('goto', e.message));
  await page.waitForTimeout(2500);
  const name = `${hsh.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}_${w}.jpg`;
  await page.screenshot({ path: `${out}/${name}`, fullPage: true, type: 'jpeg', quality: 70 });
  console.log('shot', `${out}/${name}`);
}
console.log('console errors:', errors.slice(0, 15));
await browser.close();
