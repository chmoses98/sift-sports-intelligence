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
