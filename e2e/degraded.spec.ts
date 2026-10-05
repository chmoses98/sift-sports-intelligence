// Degraded states (owner spec S): every failure is explained, nothing crashes, nothing old is
// presented as current, nothing is invented.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, marketPrice, ML, ML_ID, NEBUF, NOW, test } from './fixtures';

const SNAP = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public', 'data', 'nfl', 'app', 'latest');
const detail = JSON.parse(readFileSync(join(SNAP, 'event_detail', `${NEBUF}.json`), 'utf-8')) as { markets: { kalshi_ticker: string; yes_bid: number; yes_ask: number; captured_at: string | null }[] };
const pub = detail.markets.find((m) => m.kalshi_ticker === ML)!;
const c = (v: number) => `${Math.round(v * 1000) / 10}¢`;
const PUBLISHED = `${c(pub.yes_bid)} / ${c(pub.yes_ask)}`;
const marketUrl = `./#/nfl/market/${ML_ID}?event=${NEBUF}`;
const packetUrl = `./#/packet?sport=nfl&scope=GAME&event=${NEBUF}`;
const chip = (page: import('@playwright/test').Page) => page.locator('.px', { hasText: 'YES bid / ask' }).locator('xpath=ancestor::section[1]').locator('.qchip').first();

async function packetText(page: import('@playwright/test').Page) {
  await expect(page.getByRole('button', { name: 'COPY FOR CHATGPT' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /Show all [\d,]+ lines/ }).click();
  return (await page.getByLabel('Packet text').textContent()) ?? '';
}

test.describe('with a fixed clock', () => {
  test.beforeEach(async ({ page }) => page.clock.install({ time: NOW }));

  test('live provider unavailable: publication quote, labelled published and STALE; packet says so', async ({ page, market }) => {
    market.fail = { status: 503 };
    await page.goto(marketUrl);
    await expect(page.getByText('YES pays $1 if')).toBeVisible();
    await expect.poll(() => market.requests.length).toBeGreaterThan(0);
    expect(await marketPrice(page)).toBe(PUBLISHED);
    await expect(chip(page)).toHaveAttribute('data-quote-source', 'publication');
    await expect(chip(page)).toHaveAttribute('data-quote-state', 'OPEN:STALE');
    await expect(chip(page)).toContainText('published');
    await expect(page.locator('[data-live-mode]')).toHaveAttribute('data-live-mode', 'BACKOFF');
    await page.goto(packetUrl);
    const text = await packetText(page);
    await expect(page.getByRole('region', { name: 'Market refresh preflight' })).toHaveAttribute('data-preflight', 'FAIL');
    expect(text).toMatch(/MISSING: .*live market refresh: 796 of 796 markets could not be refreshed/);
    expect(text).toMatch(/DATA QUALITY: markets STALE/);
  });

  test('the quote feed answers when the relay is down (fallback provider)', async ({ page, market }) => {
    market.fail = { status: 502 };
    await page.route('**/live-quotes/games/26OCT04NEBUF.json', (r) =>
      r.fulfill({
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify({
          schema: 'sift.live_quotes.v1', game_key: '26OCT04NEBUF', generated_at: '2026-10-04T14:56:00Z', source: 'test feed',
          tickers_checked: [ML], markets: [{ ticker: ML, event_ticker: 'KXNFLGAME-26OCT04NEBUF', status: 'active', yes_bid_dollars: '0.5800', yes_ask_dollars: '0.6000', observed_at: '2026-10-04T14:55:30Z' }],
        }),
      }),
    );
    await page.goto(marketUrl);
    await expect.poll(() => marketPrice(page)).toBe('58¢ / 60¢');
    await expect(chip(page)).toHaveAttribute('data-quote-source', 'live');
    await expect(chip(page)).toContainText('FRESH · 4m'); // its real age from the feed, not "now"
    await expect(page.locator('[data-live-mode]')).toHaveAttribute('data-live-mode', 'FEED');
  });

  test('relay rate-limited (Kalshi 429): the feed answers, Status names the 429, LIVE returns when the relay recovers', async ({ page, market }) => {
    market.fail = { status: 429, retryAfter: 7 };
    await page.route('**/live-quotes/games/26OCT04NEBUF.json', (r) =>
      r.fulfill({
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify({
          schema: 'sift.live_quotes.v1', game_key: '26OCT04NEBUF', generated_at: '2026-10-04T14:56:00Z', source: 'test feed',
          tickers_checked: [ML], markets: [{ ticker: ML, event_ticker: 'KXNFLGAME-26OCT04NEBUF', status: 'active', yes_bid_dollars: '0.5800', yes_ask_dollars: '0.6000', observed_at: '2026-10-04T14:55:30Z' }],
        }),
      }),
    );
    await page.goto(marketUrl);
    await expect.poll(() => marketPrice(page)).toBe('58¢ / 60¢');
    await expect(chip(page)).toContainText('FRESH · 4m'); // the feed's real age
    await expect(page.locator('[data-live-mode]')).toHaveAttribute('data-live-mode', 'FEED');
    await page.goto('./#/status');
    const diag = (k: string) => page.locator(`td[data-diag="${k}"]`);
    await expect(diag('Quotes answered by')).toHaveText('quote-feed');
    await expect(diag('Mode')).toHaveText('FEED');
    await expect(diag('Quote fallback reason')).toContainText('kalshi-relay HTTP 429');
    await expect(diag('Quote fallback reason')).toContainText('rate limited');

    market.fail = null;
    market.set(ML, 0.61);
    await page.goto(marketUrl);
    await page.clock.fastForward(21_000); // past the 20 s detail cadence: the next refresh asks the relay first again
    await expect.poll(() => marketPrice(page)).toBe('61¢ / 63¢');
    await expect(page.locator('[data-live-mode]')).toHaveAttribute('data-live-mode', 'LIVE');
    await page.goto('./#/status');
    await expect(diag('Quotes answered by')).toHaveText('kalshi-relay');
    await expect(diag('Mode')).toHaveText('LIVE');
    await expect(diag('Quote fallback reason')).toHaveText('—');
  });

  test('routing: inventory from the feed first, quotes from the relay first; Status shows each source', async ({ page, market }) => {
    const feedObserved = new Date(NOW.getTime() - 4 * 60_000).toISOString();
    const feedMarkets = detail.markets.filter((m) => m.kalshi_ticker).map((m) => ({
      ticker: m.kalshi_ticker, event_ticker: (m as { kalshi_event_ticker?: string }).kalshi_event_ticker ?? m.kalshi_ticker.split('-').slice(0, 2).join('-'),
      status: 'active', yes_bid_dollars: (m.yes_bid ?? 0.5).toFixed(4), yes_ask_dollars: (m.yes_ask ?? 0.52).toFixed(4), observed_at: feedObserved,
    }));
    // Only the feed lists this contract: if it appears, inventory came from the feed.
    feedMarkets.push({ ticker: 'KXNFLSPREAD-26OCT04NEBUF-BUF9', event_ticker: 'KXNFLSPREAD-26OCT04NEBUF', status: 'active', yes_bid_dollars: '0.2100', yes_ask_dollars: '0.2300', observed_at: feedObserved, title: 'Buffalo wins by over 9.5 points?', yes_sub_title: 'Buffalo by more than 9.5' } as (typeof feedMarkets)[number]);
    await page.route('**/live-quotes/games/26OCT04NEBUF.json', (r) =>
      r.fulfill({
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify({ schema: 'sift.live_quotes.v1', game_key: '26OCT04NEBUF', generated_at: feedObserved, source: 'test feed', tickers_checked: feedMarkets.map((m) => m.ticker), markets: feedMarkets }),
      }),
    );
    market.set(ML, 0.51);
    await page.goto(`./#/nfl/game/${NEBUF}`);
    await expect(page.locator('.newlisted')).toContainText('Buffalo wins by over 9.5 points?');
    await expect(page.locator('[data-live-mode]')).toHaveAttribute('data-live-mode', 'LIVE');
    await expect.poll(() => market.tickerRequests().length).toBeGreaterThan(0);
    expect(market.eventRequests(), 'the relay is never asked for the inventory sweep').toHaveLength(0);
    await page.goto(marketUrl);
    await expect.poll(() => marketPrice(page)).toBe('51¢ / 53¢'); // the relay's quote, not the feed's older one
    await page.goto('./#/status');
    const diag = (k: string) => page.locator(`td[data-diag="${k}"]`);
    await expect(diag('Quote provider')).toHaveText(/^Kalshi public market data via relay \(relay\.sift\.invalid\), then Sift quote feed/);
    await expect(diag('Inventory provider')).toHaveText(/^Sift quote feed .*, then Kalshi public market data via relay \(relay\.sift\.invalid\)/);
    await expect(diag('Quotes answered by')).toHaveText('kalshi-relay');
    await expect(diag('Inventory answered by')).toHaveText('quote-feed');
    await expect(diag('Quote fallback reason')).toHaveText('—');
    await expect(diag('Inventory fallback reason')).toHaveText('—');
    await expect(diag('Mode')).toHaveText('LIVE');
  });

  test('routing: feed unavailable, inventory falls back to the relay and Status names the feed failure', async ({ page, market }) => {
    await page.goto(`./#/nfl/game/${NEBUF}`);
    await expect(page.locator('[data-live-mode]')).toHaveAttribute('data-live-mode', 'LIVE');
    await expect.poll(() => market.eventRequests().length).toBeGreaterThan(0); // the blocked feed sent inventory to the relay
    await page.goto('./#/status');
    const diag = (k: string) => page.locator(`td[data-diag="${k}"]`);
    await expect(diag('Inventory answered by')).toHaveText('kalshi-relay');
    await expect(diag('Inventory fallback reason')).toContainText('quote-feed failed (network');
    await expect(diag('Quotes answered by')).toHaveText('kalshi-relay');
  });

  test('one quote missing: that market keeps the publication quote; the packet names it', async ({ page, market }) => {
    market.hidden.add(ML);
    await page.goto(marketUrl);
    await expect.poll(() => market.requests.length).toBeGreaterThan(0);
    expect(await marketPrice(page)).toBe(PUBLISHED);
    await expect(chip(page)).toHaveAttribute('data-quote-source', 'publication');
    await page.goto(packetUrl);
    const text = await packetText(page);
    const pre = page.getByRole('region', { name: 'Market refresh preflight' });
    await expect(pre).toContainText('Not listed now');
    expect(text).toMatch(/1 markets are not listed by the provider now/);
  });

  test('unknown timestamp: UNKNOWN, never fresh', async ({ page, market }) => {
    market.fail = { status: 503 }; // no live observation either
    await page.route(`**/data/nfl/app/latest/event_detail/${NEBUF}.json`, async (r) => {
      const doc = await (await r.fetch()).json();
      for (const m of doc.markets) if (m.kalshi_ticker === ML) m.captured_at = null;
      await r.fulfill({ json: doc });
    });
    await page.goto(marketUrl);
    await expect.poll(() => market.requests.length).toBeGreaterThan(0);
    await expect(chip(page)).toHaveAttribute('data-quote-state', 'OPEN:UNKNOWN');
  });

  test('partial refresh: PARTIAL preflight; refreshed and failed markets each keep honest times', async ({ page, market }) => {
    market.failTickers.add(ML);
    await page.goto(packetUrl);
    const text = await packetText(page);
    const pre = page.getByRole('region', { name: 'Market refresh preflight' });
    await expect(pre).toHaveAttribute('data-preflight', 'PARTIAL');
    await expect(pre).toContainText('some markets could not be refreshed');
    expect(text).toMatch(/live market refresh: \d+ of 796 markets could not be refreshed/);
    expect(text).toMatch(new RegExp(`- ${ML} \\[game_winner FULL\\][^\\n]*: ${Math.round(pub.yes_bid * 100)}/${Math.round(pub.yes_ask * 100)} [^\\n]*\\(${pub.captured_at}, STALE\\)`));
  });

  test('closed and suspended contracts are named in the packet, not silently priced', async ({ page, market }) => {
    market.status.set(ML, 'closed');
    market.status.set('KXNFLGAME-26OCT04NEBUF-NE', 'inactive');
    await page.goto(packetUrl);
    const text = await packetText(page);
    expect(text).toMatch(/markets not open on Kalshi at \S+Z: KXNFLGAME-26OCT04NEBUF-BUF CLOSED, KXNFLGAME-26OCT04NEBUF-NE SUSPENDED/);
  });
});

test('research source unavailable: an honest error, nothing invented', async ({ page, errors }) => {
  // Deliberate: the bundled snapshot index answers 404 for this test only.
  errors.allow(/Failed to load resource: the server responded with a status of 404/);
  await page.route('**/data/nfl/app/latest/explorer/index.json', (r) => r.fulfill({ status: 404, body: 'not found' }));
  await page.goto('./#/nfl');
  await expect(page.getByText('NFL research is unavailable right now')).toBeVisible();
  await expect(page.getByText('Nothing is shown in its place')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByText('is not explorable in Sift yet')).toHaveCount(0);
});

test('research unavailable on Home: the app stays up and says why (no error-boundary crash)', async ({ page, errors }) => {
  errors.allow(/Failed to load resource: the server responded with a status of 404/); // injected below
  await page.route('**/data/nfl/app/latest/explorer/index.json', (r) => r.fulfill({ status: 404, body: 'not found' }));
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'Sift' })).toBeVisible();
  await expect(page.getByText(/The NFL board could not be read/)).toBeVisible();
  await expect(page.getByText('Unexpected Application Error')).toHaveCount(0);
});

test('unsupported schema version: rejected with an explanation, never rendered', async ({ page }) => {
  await page.route('**/data/nfl/app/latest/board.json', async (r) => {
    const doc = await (await r.fetch()).json();
    await r.fulfill({ json: { ...doc, schema_version: 'edge_finder.app.v9' } });
  });
  await page.goto('./#/nfl');
  await expect(page.getByText('Could not load NFL board')).toBeVisible();
  await expect(page.getByText(/unsupported schema_version edge_finder\.app\.v9/)).toBeVisible();
});

test('live vs snapshot: the live root\'s newer run is announced while the snapshot serves research', async ({ page }) => {
  const health = JSON.parse(readFileSync(join(SNAP, 'health.json'), 'utf-8'));
  await page.route('https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest/health.json', (r) =>
    r.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { ...health, payload_run_id: 'run_live_newer' } }),
  );
  await page.route('https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest/explorer/index.json', (r) =>
    r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '404: Not Found' }),
  );
  await page.goto('./#/nfl');
  await expect(page.getByText('RESEARCH SNAPSHOT')).toBeVisible();
  await expect(page.getByText('Live has a newer run')).toBeVisible();
  await page.getByRole('button', { name: 'Source' }).click();
  await expect(page.getByText(/run_live_newer/)).toBeVisible();
});

test('offline with previously loaded research: it still renders; the banner is accurate', async ({ page, context }) => {
  await page.goto(`./#/nfl/game/${NEBUF}`);
  await expect(page.getByRole('heading', { name: 'How they match up' })).toBeVisible();
  await page.locator('.mh__team--home .mh__name').click();
  await expect(page.getByRole('heading', { name: /Buffalo Bills/i, level: 1 })).toBeVisible();
  await context.setOffline(true);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'How they match up' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();
  await expect(page.locator('.mh__chips .qchip')).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toHaveCount(0);
});

test('slow provider: the packet preflight gives up on time and the packet still builds', async ({ page, market }) => {
  market.fail = 'hang';
  const t0 = Date.now();
  await page.goto(packetUrl);
  await expect(page.getByRole('button', { name: 'COPY FOR CHATGPT' })).toBeVisible({ timeout: 30_000 });
  expect(Date.now() - t0).toBeLessThan(25_000);
  const pre = page.getByRole('region', { name: 'Market refresh preflight' });
  await expect(pre).toHaveAttribute('data-preflight', 'FAIL');
  await expect(pre).toContainText(/timed out|timeout/);
});
