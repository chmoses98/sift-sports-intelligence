// node docs/sift3/redesign/render-palette.mjs -> out/pal/{p1,g1}-{A,B}.png : the same screen in the two colour treatments
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
const here = dirname(fileURLToPath(import.meta.url)); mkdirSync(join(here, 'out', 'pal'), { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
for (const s of ['p1', 'g1']) for (const t of ['A', 'B']) {
  await page.goto(pathToFileURL(join(here, 'index.html')).href + `?s=${s}&t=${t}`);
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(250);
  await page.locator('#phone').screenshot({ path: join(here, 'out', 'pal', `${s}-${t}.png`) });
  console.log('ok', s, t);
}
await b.close();
