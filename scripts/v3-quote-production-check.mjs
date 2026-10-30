// SIFT 3.0 (opt-in #/v3) on the deployed app: can it consume the current quotes, show market prices, and open a priced contract, with no page errors,
// at desktop and iPhone size. Read-only. A game with no tradable market must say so ("—"), never print a price (the tradable rule is the app's).
//
//   node scripts/v3-quote-production-check.mjs      (SIFT_URL overrides the Pages address)
import { chromium, webkit, devices } from '@playwright/test';

const BASE = (process.env.SIFT_URL ?? 'https://chmoses98.github.io/sift-sports-intelligence/').replace(/\/?$/, '/');
let failed = 0;
const ok = (c, m) => {
  console.log(`${c ? 'PASS' : 'FAIL'} ${m}`);
  if (!c) failed++;
  return c;
};
const runs = [
  ['chromium desktop 1280x800', chromium, { viewport: { width: 1280, height: 800 } }],
  ['webkit iPhone 14', webkit, devices['iPhone 14']],
];
for (const [label, engine, ctxOpts] of runs) {
  const browser = await engine.launch();
  try {
    const page = await (await browser.newContext(ctxOpts)).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    await page.goto(`${BASE}#/v3/games`);
    await page.waitForSelector('[data-v3-shell]', { timeout: 60_000 });
    await page.waitForTimeout(6000);
    const links = await page.$$eval('a[href*="/v3/game/"]', (a) => [...new Set(a.map((x) => x.getAttribute('href')))]);
    ok(links.length > 0, `${label}: Games lists ${links.length} games`);
    // the first game whose win-price block is present and tradable; report how many were looked at
    let priced = null;
    for (const href of links.filter((h) => /\/v3\/game\/(nfl|nhl|mlb)\//.test(h)).slice(0, 8)) {
      await page.goto(`${BASE}${href}`);
      await page.waitForSelector('[data-testid="win-price"]', { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const text = (await page.getByTestId('win-price').innerText().catch(() => '')) || '';
      if (/\d+¢/.test(text)) {
        priced = { href, text: text.replace(/\s+/g, ' ').slice(0, 80) };
        break;
      }
    }
    if (!priced) {
      ok(false, `${label}: none of the first games shows a win price (every one says "—" or has no block); check the quote feed and the tradable rule`);
    } else {
      ok(true, `${label}: ${priced.href} shows prices: "${priced.text}"`);
      const tap = page.getByTestId('win-price').locator('.mx-win__t').first();
      await tap.click();
      const sheet = page.getByLabel('Contract ticker');
      ok(await sheet.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false), `${label}: tapping a price opens the exact-contract sheet`);
      const body = await page.locator('body').innerText();
      ok(/KX[A-Z0-9-]+/.test(body) && !/NaN|undefined|Infinity/.test(body), `${label}: the contract sheet names its ticker and prints no NaN/undefined`);
    }
    ok(errors.length === 0, `${label}: no page errors${errors.length ? ` (${errors[0]})` : ''}`);
  } catch (e) {
    ok(false, `${label}: ${String(e).split('\n')[0]}`);
  } finally {
    await browser.close();
  }
}
console.log(failed ? `\nSIFT 3.0 quote check FAILED (${failed})` : '\nSIFT 3.0 quote check passed');
process.exit(failed ? 1 : 0);
