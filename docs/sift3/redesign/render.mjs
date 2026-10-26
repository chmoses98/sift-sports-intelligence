// node docs/sift3/redesign/render.mjs  -> out/<screen>.png (780x1688) and out/<screen>-annot.png
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const screens = ['p1', 'p2', 'p3', 'p4', 'g1', 'g2', 'g3', 'g1dal'].filter((s) => !only.length || only.includes(s));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
for (const s of screens) for (const annot of [false, true]) {
  await page.goto(pathToFileURL(join(here, 'index.html')).href + `?s=${s === 'g1dal' ? 'g1&dir=dal' : s}${annot ? '&annot=1' : ''}`);
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(250);
  await page.locator('#phone').screenshot({ path: join(here, 'out', `${s}${annot ? '-annot' : ''}.png`) });
  console.log('ok', s, annot ? 'annot' : '');
}
await b.close();
