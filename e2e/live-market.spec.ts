// Market gates (owner spec Y, "Market gates" 1-10) in a real browser on the production build: the
// fixture relay plays Kalshi, Playwright's clock plays time. No redeploy, no reload, no network.
import { expect, marketPrice, ML, ML_ID, NEBUF, NOW, setVisibility, test } from './fixtures';

const gameUrl = `./#/nfl/game/${NEBUF}`;
const marketUrl = `./#/nfl/market/${ML_ID}?event=${NEBUF}`;
const boardPrice = (page: import('@playwright/test').Page) => page.locator(`a.mrow[href*="${ML_ID}"] .mrow__p`);
const quoteChip = (page: import('@playwright/test').Page) => page.locator('.px', { hasText: 'YES bid / ask' }).locator('xpath=ancestor::section[1]').locator('.qchip').first();

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOW });
});

test('1-4: 46¢ becomes 51¢ without a redeploy; away and back never resurrects 46¢ @live', async ({ page, market }) => {
  market.set(ML, 0.46, 0.48);
  await page.goto(gameUrl);
  await expect(page.getByRole('heading', { name: 'How they match up' })).toBeVisible();
  // 1. the game shows the provider's 46¢ (the publication says 63¢)
  await expect(boardPrice(page)).toHaveText('46¢ / 48¢');
  await expect(page.locator('.mh__chips .qchip')).toHaveAttribute('data-quote-source', 'live');

  // 2-3. the provider moves to 51¢; the next game-cadence poll shows it — same page, same build
  market.set(ML, 0.51, 0.53);
  await page.clock.fastForward(46_000);
  await expect(boardPrice(page)).toHaveText('51¢ / 53¢');

  // 4. go to a team, spend minutes there, come back: the last known 51¢ is shown at once (never 46¢,
  //    never the publication's 63¢) even before the provider answers again...
  await page.locator('.mh__team--home .mh__name').click();
  await expect(page.getByRole('heading', { name: /Buffalo Bills/i, level: 1 })).toBeVisible();
  await page.clock.fastForward(4 * 60_000);
  market.fail = 'hang';
  market.set(ML, 0.53, 0.55);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'How they match up' })).toBeVisible();
  await expect(boardPrice(page)).toHaveText('51¢ / 53¢');
  // ...and the moved market (53¢) as soon as the provider answers.
  market.release();
  market.fail = null;
  await page.clock.fastForward(60_000);
  await expect(boardPrice(page)).toHaveText('53¢ / 55¢');
});

test('5: background -> foreground pauses polling and refreshes immediately on return', async ({ page, market }) => {
  await page.goto(marketUrl);
  await expect(page.getByText('YES pays $1 if')).toBeVisible();
  await expect.poll(() => market.tickerRequests().length).toBeGreaterThan(0);
  await setVisibility(page, 'hidden');
  const before = market.requests.length;
  await page.clock.fastForward(5 * 60_000);
  await page.clock.fastForward(5 * 60_000);
  expect(market.requests.length, 'no polling while the app is in the background').toBe(before);
  market.set(ML, 0.51, 0.53);
  await setVisibility(page, 'visible');
  await expect.poll(() => market.requests.length).toBeGreaterThan(before);
  await expect.poll(() => marketPrice(page)).toBe('51¢ / 53¢');
});

test('6-7: a provider outage keeps 51¢ with its real time; it ages to AGING then STALE @live', async ({ page, market }) => {
  market.set(ML, 0.51, 0.53);
  market.observedAt = NOW.toISOString();
  await page.goto(marketUrl);
  await expect.poll(() => marketPrice(page)).toBe('51¢ / 53¢');
  await expect(quoteChip(page)).toHaveAttribute('data-quote-state', 'OPEN:FRESH');
  market.fail = { status: 503 };
  await page.clock.fastForward(20 * 60_000);
  await page.clock.fastForward(15_000);
  await expect(quoteChip(page)).toHaveAttribute('data-quote-state', 'OPEN:AGING');
  await page.clock.fastForward(11 * 60_000);
  await page.clock.fastForward(15_000);
  await expect(quoteChip(page)).toHaveAttribute('data-quote-state', 'OPEN:STALE');
  expect(await marketPrice(page)).toBe('51¢ / 53¢'); // never blanked
  await expect(quoteChip(page)).toContainText(/STALE · 3\dm/);
  await expect(quoteChip(page)).toContainText('live'); // a real live observation, honestly old
  await expect(page.locator('[data-live-mode]')).toHaveAttribute('data-live-mode', /BACKOFF|LIVE/);
});

test('8: market status updates independently of the research publication', async ({ page, market }) => {
  await page.goto(marketUrl);
  await expect(page.getByRole('heading', { name: 'Model evidence' })).toBeVisible();
  await expect(quoteChip(page)).toHaveAttribute('data-quote-state', 'OPEN:FRESH');
  market.status.set(ML, 'inactive');
  await page.clock.fastForward(21_000);
  await expect(quoteChip(page)).toHaveAttribute('data-quote-state', 'SUSPENDED:FRESH');
  await expect(quoteChip(page)).toContainText('SUSPENDED · quote');
  await expect(page.locator('.ehead__meta .chip--status-suspended')).toHaveText('SUSPENDED');
  market.status.set(ML, 'closed');
  await page.clock.fastForward(21_000);
  await expect(quoteChip(page)).toContainText('CLOSED · final quote');
  // the research record is untouched: model evidence and history still come from the publication
  await expect(page.getByRole('heading', { name: 'Model evidence' })).toBeVisible();
  await expect(page.getByText('Model fair P(YES)')).toBeVisible();
});

test('9: the packet preflight uses the current quote, not the session memo @live', async ({ page, market }) => {
  market.set(ML, 0.46, 0.48);
  await page.goto(marketUrl);
  await expect.poll(() => marketPrice(page)).toBe('46¢ / 48¢');
  market.set(ML, 0.51, 0.53); // moves; no poll has run since
  await page.goto(`./#/packet?sport=nfl&scope=GAME&event=${NEBUF}`);
  await expect(page.getByRole('button', { name: 'COPY FOR CHATGPT' })).toBeVisible({ timeout: 60_000 });
  const pre = page.getByRole('region', { name: 'Market refresh preflight' });
  await expect(pre).toHaveAttribute('data-preflight', 'PASS');
  await expect(pre).toContainText('796 / 796 refreshed');
  await page.getByRole('button', { name: /Show all [\d,]+ lines/ }).click();
  const text = (await page.getByLabel('Packet text').textContent()) ?? '';
  expect(text).toMatch(/- KXNFLGAME-26OCT04NEBUF-BUF \[game_winner FULL\][^\n]*: 51\/53 /);
  expect(text).not.toMatch(/KXNFLGAME-26OCT04NEBUF-BUF \[game_winner FULL\][^\n]*: 46\/48 /);
  // live observation times are second-precision, like the publication's
  expect(text).toMatch(/prices were captured at 2026-10-04T15:00:\d\dZ, FRESH\)/);
  expect(text).toMatch(/DATA QUALITY: markets FRESH/);
});

test('10: shared, batched polling — no request storm from one screen', async ({ page, market }) => {
  await page.goto(gameUrl);
  await expect(page.getByRole('heading', { name: 'How they match up' })).toBeVisible();
  await expect.poll(() => market.requests.length).toBeGreaterThan(0);
  for (let i = 0; i < 4; i++) await page.clock.fastForward(45_000); // 3 minutes on the game
  await page.clock.fastForward(1_000);
  const tick = market.tickerRequests();
  const ev = market.eventRequests();
  // 796 tickers -> at most 8 batches of 100 per poll; the first poll is served by the inventory sweep.
  expect(Math.max(...tick.map((r) => r.tickers.length))).toBeLessThanOrEqual(100);
  const perTicker = new Map<string, number>();
  for (const r of tick) for (const t of r.tickers) perTicker.set(t, (perTicker.get(t) ?? 0) + 1);
  expect(Math.max(...perTicker.values()), 'a ticker requested more often than its cadence allows').toBeLessThanOrEqual(5);
  const perEvent = new Map<string, number>();
  for (const r of ev) perEvent.set(r.event!, (perEvent.get(r.event!) ?? 0) + 1);
  expect(Math.max(...perEvent.values()), 'inventory re-listed more often than every 3 minutes').toBeLessThanOrEqual(2);
  expect(tick.length).toBeLessThanOrEqual(40);
  const summary = `3 min on a 796-market game: ${tick.length} ticker batches, ${ev.length} event listings (${perEvent.size} events)`;
  test.info().annotations.push({ type: 'requests', description: summary });
  console.log(`[request budget] ${summary}`);

  // A market screen shows its ticker in two scopes (detail + ladder): one request, not two.
  market.requests = [];
  await page.goto(marketUrl);
  await expect(page.getByText('YES pays $1 if')).toBeVisible();
  await expect.poll(() => market.tickerRequests().length).toBeGreaterThan(0);
  await page.clock.fastForward(1_000);
  const first = market.tickerRequests().flatMap((r) => r.tickers).filter((t) => t === ML);
  expect(first.length).toBeLessThanOrEqual(1);
});

test('offline -> online: the quote stays with its real age, nothing refreshes offline, return refreshes', async ({ page, market, context }) => {
  market.set(ML, 0.51, 0.53);
  await page.goto(marketUrl);
  await expect.poll(() => marketPrice(page)).toBe('51¢ / 53¢');
  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toContainText('Market quotes are not refreshing');
  await expect(page.locator('[data-live-mode]')).toHaveAttribute('data-live-mode', 'OFFLINE');
  const before = market.requests.length;
  await page.clock.fastForward(2 * 60_000);
  expect(market.requests.length).toBe(before);
  expect(await marketPrice(page)).toBe('51¢ / 53¢');
  market.set(ML, 0.55, 0.57);
  await context.setOffline(false);
  await expect.poll(() => market.requests.length).toBeGreaterThan(before);
  await expect.poll(() => marketPrice(page)).toBe('55¢ / 57¢');
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toHaveCount(0);
});

test('inventory: a contract listed after the research run appears, without invented research', async ({ page, market }) => {
  market.extra.push({
    ticker: 'KXNFLSPREAD-26OCT04NEBUF-BUF9', event_ticker: 'KXNFLSPREAD-26OCT04NEBUF', status: 'active',
    title: 'Buffalo wins by over 9.5 points?', yes_sub_title: 'Buffalo by more than 9.5', yes_bid_dollars: '0.2100', yes_ask_dollars: '0.2300',
  });
  market.status.set('KXNFLSPREAD-26OCT04NEBUF-BUF10', 'closed');
  await page.goto(gameUrl);
  const later = page.locator('.newlisted');
  await expect(later).toContainText('Listed on Kalshi after this research run');
  await expect(later).toContainText('Buffalo wins by over 9.5 points?');
  await expect(later).toContainText('21¢ / 23¢');
  await expect(later).toContainText('not included in handicap packets');
  await expect(later.locator('a')).toHaveCount(0); // no research page is invented for it
  await page.getByRole('tab', { name: /Game lines/ }).click();
  await expect(page.locator('a[href*="KXNFLSPREAD-26OCT04NEBUF-BUF10"]')).toContainText('CLOSED');
});
