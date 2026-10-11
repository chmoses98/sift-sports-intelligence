// usage: node shot.mjs <baseUrl> <outDir> <w> <h> <hash>...
import { chromium } from '@playwright/test';
const [,, base, out, w, h, ...hashes] = process.argv;
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1,[::1]' } : undefined;
const browser = await chromium.launch({ args: ['--ignore-certificate-errors', ...(proxy ? ['--proxy-server=' + proxy.server, '--proxy-bypass-list=localhost;127.0.0.1'] : [])] });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
for (const hsh of hashes) {
  await page.goto(base + '#' + hsh, { waitUntil: 'networkidle', timeout: 60000 }).catch(e => console.log('goto', e.message));
  await page.waitForTimeout(2500);
  const name = (hsh.replace(/[^a-z0-9]+/gi, '_') || 'home') + `_${w}.png`;
  await page.screenshot({ path: `${out}/${name}`, fullPage: true });
  console.log('shot', name);
}
console.log('console errors:', errors.slice(0, 10));
await browser.close();
