// Post-deploy production check: the LIVE site on GitHub Pages, in real Chromium and WebKit, against the
// live quote feed — no fixtures, no mocks. Proves the market clock works where the owner uses it.
// Read-only. Run by .github/workflows/production-check.yml after every deploy (and on demand).
import { chromium, webkit } from '@playwright/test';

const BASE = process.env.SIFT_URL ?? 'https://chmoses98.github.io/sift-sports-intelligence/';
const failures = [];
const check = (ok, msg) => (ok ? console.log(`  ok   ${msg}`) : (failures.push(msg), console.log(`  FAIL ${msg}`)));

for (const [name, type, device] of [['chromium-phone', chromium, { viewport: { width: 390, height: 844 } }], ['webkit-iphone', webkit, { viewport: { width: 393, height: 659 }, isMobile: true, hasTouch: true }]]) {
  console.log(`\n${name}`);
  const browser = await type.launch();
  const page = await (await browser.newContext(device)).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|access control checks|net::ERR/.test(m.text()) && errs.push(m.text()));
  const feed = [];
  page.on('response', (r) => r.url().includes('/live-quotes/') && feed.push(r.status()));
  try {
    await page.goto(BASE + '#/');
    await page.getByRole('heading', { name: 'Sift' }).waitFor({ timeout: 60_000 });
    check(true, 'home renders');
    // Find an upcoming game from the board and open its moneyline market.
    await page.goto(BASE + '#/nfl');
    await page.locator('.gcard__link').first().waitFor({ timeout: 60_000 });
    await page.locator('.gcard__link').first().click();
    await page.getByRole('heading', { name: 'How they match up' }).waitFor({ timeout: 60_000 });
    // Wait for the game scope's own refresh (inventory + tickers), not just the slate's first quotes.
    await page.waitForFunction(() => document.querySelector('.mh__chips .qchip')?.getAttribute('data-quote-source') === 'live', null, { timeout: 90_000 }).catch(() => {});
    const gameChip = page.locator('.mh__chips .qchip');
    const src = await gameChip.getAttribute('data-quote-source');
    const state = await gameChip.getAttribute('data-quote-state');
    console.log(`  game prices chip: source=${src} state=${state} "${(await gameChip.textContent())?.trim()}"`);
    check(src === 'live', 'every game price comes from the live market clock');
    check(['FRESH', 'AGING'].includes(state ?? ''), `game quotes are FRESH or AGING (got ${state})`);
    check(feed.some((s) => s === 200 || s === 304), `live-quote feed answered (${feed.length} requests)`);
    const mode = await page.locator('[data-live-mode]').getAttribute('data-live-mode');
    console.log(`  live mode: ${mode}`);
    check(['FEED', 'LIVE'].includes(mode ?? ''), `source banner shows live quotes running (got ${mode})`);
    // Which provider chain production runs, and which provider actually answered (Status diagnostics).
    // With the relay configured (repo variable SIFT_QUOTE_RELAY_URL -> SIFT_EXPECT_RELAY=1) the chain must be
    // relay first, GitHub quote feed as fallback, and the relay must be the one answering.
    const gameUrl = page.url();
    await page.goto(BASE + '#/status');
    await page.getByRole('heading', { name: 'Live market quotes' }).waitFor({ timeout: 60_000 });
    const diag = async (k) => ((await page.locator(`td[data-diag="${k}"]`).textContent()) ?? '').trim();
    const provider = await diag('Provider');
    const answered = await diag('Answered by');
    const diagMode = await diag('Mode');
    console.log(`  provider chain: ${provider}\n  answered by: ${answered} | mode: ${diagMode}`);
    if (process.env.SIFT_EXPECT_RELAY === '1') {
      check(/^Kalshi public market data via relay \(.+\), then Sift quote feed/.test(provider), 'relay is the primary provider, GitHub quote feed the fallback');
      check(answered === 'kalshi-relay', `live quotes answered by kalshi-relay (got ${answered})`);
      check(diagMode === 'LIVE', `market clock mode LIVE (got ${diagMode})`);
    }
    await page.goto(gameUrl);
    const ev = page.url().split('/game/')[1]?.split('?')[0];
    await page.goto(`${BASE}#/packet?sport=nfl&scope=GAME&event=${ev}`);
    await page.getByRole('button', { name: 'COPY FOR CHATGPT' }).waitFor({ timeout: 120_000 });
    const pf = page.getByRole('region', { name: 'Market refresh preflight' });
    const verdict = await pf.getAttribute('data-preflight');
    console.log(`  preflight: ${verdict} | ${(await pf.textContent())?.replace(/\s+/g, ' ').slice(0, 220)}`);
    check(verdict === 'PASS' || verdict === 'PARTIAL', `packet preflight refreshed the game's markets (got ${verdict})`);
    await page.screenshot({ path: `production-${name}-packet.png` });
    check(errs.length === 0, `no page/console errors (${errs.slice(0, 3).join(' | ')})`);
  } catch (e) {
    check(false, `${name}: ${String(e).split('\n')[0]}`);
    await page.screenshot({ path: `production-${name}-failure.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}
if (failures.length) {
  console.error(`\nPRODUCTION CHECK FAILED:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nproduction check OK');
