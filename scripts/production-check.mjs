// Post-deploy production check: the LIVE site on GitHub Pages, in real Chromium and WebKit, against the
// live quote feed — no fixtures, no mocks. Proves the market clock works where the owner uses it.
// Read-only. Run by .github/workflows/production-check.yml after every deploy (and on demand).
import { chromium, webkit } from '@playwright/test';

const BASE = process.env.SIFT_URL ?? 'https://chmoses98.github.io/sift-sports-intelligence/';
const failures = [];
const check = (ok, msg) => (ok ? console.log(`  ok   ${msg}`) : (failures.push(msg), console.log(`  FAIL ${msg}`)));
const RELAY = (process.env.SIFT_QUOTE_RELAY_URL ?? '').trim().replace(/\/+$/, '');
const ORIGIN = new URL(BASE).origin;
const EXPECT_RELAY = process.env.SIFT_EXPECT_RELAY === '1';

/** A Status diagnostics cell; a row this build does not have reads as such (and fails its check). */
async function diagCell(page, k) {
  const cell = page.locator(`td[data-diag="${k}"]`);
  return (await cell.count()) ? ((await cell.textContent()) ?? '').trim() : `(no "${k}" row)`;
}

// Fallback proof, on the live site: force the relay to answer Kalshi's 429 in this browser only, and
// prove the feed answers (FEED, honest freshness, packet still builds, the 429 named with its status,
// no crash). Then let the relay through again and prove LIVE returns. Production itself is untouched.
async function fallbackProof(browser, device, name, gameUrl) {
  console.log(`  -- fallback proof (relay forced to HTTP 429 in this browser)`);
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|access control checks|net::ERR/.test(m.text()) && errs.push(m.text()));
  const feed = [];
  page.on('response', (r) => r.url().includes('/live-quotes/') && feed.push(r.status()));
  const forced = [];
  const block = (route) => {
    forced.push(route.request().url());
    return route.fulfill({
      status: 429,
      headers: { 'access-control-allow-origin': ORIGIN, 'access-control-expose-headers': 'X-Sift-Observed-At, Retry-After', 'retry-after': '7', 'content-type': 'application/json' },
      body: '{"error":{"code":"too_many_requests","message":"too many requests (forced by the production check)"}}',
    });
  };
  const diag = (k) => diagCell(page, k);
  try {
    await page.route(`${RELAY}/**`, block);
    await page.goto(gameUrl);
    await page.getByRole('heading', { name: 'How they match up' }).waitFor({ timeout: 60_000 });
    await page.waitForFunction(() => document.querySelector('[data-live-mode]')?.getAttribute('data-live-mode') === 'FEED', null, { timeout: 90_000 }).catch(() => {});
    const chip = page.locator('.mh__chips .qchip');
    const state = await chip.getAttribute('data-quote-state');
    console.log(`  forced 429s: ${forced.length} | feed requests: ${feed.length} | prices chip: ${await chip.getAttribute('data-quote-source')} ${state} "${(await chip.textContent())?.trim()}"`);
    check(forced.length > 0, 'fallback: the relay was asked first and answered 429');
    check((await page.locator('[data-live-mode]').getAttribute('data-live-mode')) === 'FEED', 'fallback: mode becomes FEED');
    check(feed.some((s) => s === 200 || s === 304), `fallback: the GitHub quote feed answered (${feed.length} requests)`);
    check((await chip.getAttribute('data-quote-source')) === 'live' && /\d/.test((await chip.textContent()) ?? ''), 'fallback: prices stay visible, from the feed');
    check(['FRESH', 'AGING'].includes(state ?? ''), `fallback: freshness is the feed's real age (got ${state})`);
    await page.goto(BASE + '#/status');
    await page.getByRole('heading', { name: 'Live market quotes' }).waitFor({ timeout: 60_000 });
    const reason = await diag('Fallback reason');
    console.log(`  status: answered by ${await diag('Answered by')} | mode ${await diag('Mode')} | fallback reason: ${reason}`);
    check((await diag('Answered by')) === 'quote-feed', 'fallback: Status says the quote feed answered');
    check(/kalshi-relay HTTP 429/.test(reason), `fallback: the relay error is shown with its status code (${reason})`);
    const ev = gameUrl.split('/game/')[1]?.split('?')[0];
    await page.goto(`${BASE}#/packet?sport=nfl&scope=GAME&event=${ev}`);
    await page.getByRole('button', { name: 'COPY FOR CHATGPT' }).waitFor({ timeout: 120_000 });
    const verdict = await page.getByRole('region', { name: 'Market refresh preflight' }).getAttribute('data-preflight');
    check(verdict === 'PASS' || verdict === 'PARTIAL', `fallback: the packet preflight still completes (got ${verdict})`);
    check(errs.length === 0, `fallback: no page/console errors, no crash (${errs.slice(0, 3).join(' | ')})`);
    await page.screenshot({ path: `production-${name}-fallback.png` });

    // Restore: the relay answers again and LIVE returns on the next refresh.
    await page.unroute(`${RELAY}/**`, block);
    await page.goto(gameUrl);
    await page.waitForFunction(() => document.querySelector('[data-live-mode]')?.getAttribute('data-live-mode') === 'LIVE', null, { timeout: 120_000 }).catch(() => {});
    check((await page.locator('[data-live-mode]').getAttribute('data-live-mode')) === 'LIVE', 'restored: mode returns to LIVE when the relay answers');
    await page.goto(BASE + '#/status');
    await page.getByRole('heading', { name: 'Live market quotes' }).waitFor({ timeout: 60_000 });
    console.log(`  restored: answered by ${await diag('Answered by')} | mode ${await diag('Mode')} | fallback reason: ${await diag('Fallback reason')}`);
    check((await diag('Answered by')) === 'kalshi-relay' && (await diag('Fallback reason')) === '—', 'restored: the relay answers and no fallback is reported');
  } catch (e) {
    check(false, `${name} fallback proof: ${String(e).split('\n')[0]}`);
    await page.screenshot({ path: `production-${name}-fallback-failure.png` }).catch(() => {});
  } finally {
    await ctx.close();
  }
}

// The relay as the browser sees it: Sift's Pages origin, a CORS preflight, then the real GET.
// Logged on every run so a relay failure always says why (the app's fallback hides it from the UI).
if (RELAY) {
  console.log(`relay ${RELAY} (origin ${ORIGIN})`);
  const q = `${RELAY}/markets?series_ticker=KXNFLGAME&status=open&limit=2`;
  for (const [what, init] of [['OPTIONS', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET' } }], ['GET', { headers: { Origin: ORIGIN } }]]) {
    try {
      const r = await fetch(q, { ...init, signal: AbortSignal.timeout(20_000) });
      const body = what === 'GET' ? (await r.text()).replace(/\s+/g, ' ').slice(0, 300) : '';
      console.log(`  ${what} ${r.status} acao=${r.headers.get('access-control-allow-origin')} observed=${r.headers.get('x-sift-observed-at')} ${body}`);
    } catch (e) {
      console.log(`  ${what} failed: ${String(e.cause ?? e)}`);
    }
  }
}

for (const [name, type, device] of [['chromium-phone', chromium, { viewport: { width: 390, height: 844 } }], ['webkit-iphone', webkit, { viewport: { width: 393, height: 659 }, isMobile: true, hasTouch: true }]]) {
  console.log(`\n${name}`);
  const browser = await type.launch();
  const page = await (await browser.newContext(device)).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|access control checks|net::ERR/.test(m.text()) && errs.push(m.text()));
  const feed = [];
  page.on('response', (r) => r.url().includes('/live-quotes/') && feed.push(r.status()));
  const relay = [];
  if (RELAY) {
    page.on('response', (r) => r.url().startsWith(RELAY) && relay.push(`${r.request().method()} ${r.status()}`));
    page.on('requestfailed', (r) => r.url().startsWith(RELAY) && relay.push(`${r.method()} failed: ${r.failure()?.errorText}`));
  }
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
    if (!EXPECT_RELAY) check(feed.some((s) => s === 200 || s === 304), `live-quote feed answered (${feed.length} requests)`);
    const mode = await page.locator('[data-live-mode]').getAttribute('data-live-mode');
    console.log(`  live mode: ${mode}`);
    check(['FEED', 'LIVE'].includes(mode ?? ''), `source banner shows live quotes running (got ${mode})`);
    // Which provider chain production runs, and which provider actually answered (Status diagnostics).
    // With the relay configured (repo variable SIFT_QUOTE_RELAY_URL -> SIFT_EXPECT_RELAY=1) the chain must be
    // relay first, GitHub quote feed as fallback, and the relay must be the one answering.
    const gameUrl = page.url();
    await page.goto(BASE + '#/status');
    await page.getByRole('heading', { name: 'Live market quotes' }).waitFor({ timeout: 60_000 });
    const diag = (k) => diagCell(page, k);
    const provider = await diag('Provider');
    const answered = await diag('Answered by');
    const diagMode = await diag('Mode');
    console.log(`  provider chain: ${provider}\n  answered by: ${answered} | mode: ${diagMode}`);
    if (RELAY) console.log(`  relay requests from the page: ${relay.length} [${[...new Set(relay)].slice(0, 6).join('; ')}]`);
    if (EXPECT_RELAY) {
      const fallback = await diag('Fallback reason');
      console.log(`  fallback reason: ${fallback} | feed requests: ${feed.length}`);
      check(/^Kalshi public market data via relay \(.+\), then Sift quote feed/.test(provider), 'relay is the primary provider, GitHub quote feed the fallback');
      check(provider.includes(`(${new URL(RELAY).host})`), `the configured relay host is the one Sift calls (${new URL(RELAY).host})`);
      check(answered === 'kalshi-relay', `live quotes answered by kalshi-relay (got ${answered})`);
      check(diagMode === 'LIVE', `market clock mode LIVE (got ${diagMode})`);
      check(state === 'FRESH', `current game prices are FRESH (got ${state})`);
      check(relay.length > 0 && relay.every((r) => r === 'GET 200'), `every relay request on the main path answered 200 (${relay.length}: ${[...new Set(relay)].join('; ')})`);
      check(feed.length === 0 && fallback === '—', `no fallback to the quote feed on the main path (${feed.length} feed requests; fallback reason ${fallback})`);
    }
    await page.goto(gameUrl);
    const ev = page.url().split('/game/')[1]?.split('?')[0];
    await page.goto(`${BASE}#/packet?sport=nfl&scope=GAME&event=${ev}`);
    await page.getByRole('button', { name: 'COPY FOR CHATGPT' }).waitFor({ timeout: 120_000 });
    const pf = page.getByRole('region', { name: 'Market refresh preflight' });
    const verdict = await pf.getAttribute('data-preflight');
    console.log(`  preflight: ${verdict} | ${(await pf.textContent())?.replace(/\s+/g, ' ').slice(0, 220)}`);
    if (EXPECT_RELAY) check(verdict === 'PASS', `packet preflight PASS through the relay (got ${verdict})`);
    else check(verdict === 'PASS' || verdict === 'PARTIAL', `packet preflight refreshed the game's markets (got ${verdict})`);
    await page.screenshot({ path: `production-${name}-packet.png` });
    check(errs.length === 0, `no page/console errors (${errs.slice(0, 3).join(' | ')})`);
    if (RELAY) await fallbackProof(browser, device, name, gameUrl);
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
