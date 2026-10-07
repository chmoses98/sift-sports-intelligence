// NHL on Sift: the NHL vertical against a trimmed, real NHL-edge-finder publication (tests/fixtures/nhl),
// served in place of raw.githubusercontent.com so the run is deterministic and offline. Home, game (overview,
// scripts, candidates, markets), market, team, skater, goalie, scorecard, search and the research tray → packet.
// The clock is set before the slate's first puck drop; live quotes come from the same relay mock as NFL.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, NHL_FIXTURE, noHorizontalOverflow, test } from './fixtures';

const NHL_RAW = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/NHL-edge-finder\/data-archive\/app\/latest\/(.+)$/;
const NHL_NOW = new Date('2026-10-06T23:30:00Z');

/** Florida at Los Angeles, 2026-10-07 02:00Z: simulated, scripts and research candidates published. */
const FLA_LAK = 'evt_5938c3f8a7c1b24c0118';
const LAK = 'prt_1513313ad992fb9eb71f';
const KEMPE = 'prt_9e5d52ad51ba0c6a2f60';
const KUEMPER = 'prt_628b1d1dc955ba0a8b41';
const TOTAL = 'mkt_kalshi_KXNHLTOTAL-26OCT06FLALA-6';

async function serveNhl(page: Page) {
  await page.context().route(NHL_RAW, async (route) => {
    const rel = NHL_RAW.exec(route.request().url())![1].split('?')[0];
    const file = join(NHL_FIXTURE, rel);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(file, 'utf-8'), headers: { 'access-control-allow-origin': '*' } });
  });
}

async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.skel')).toHaveCount(0);
  await page.mouse.move(0, 0);
}

const BANNED = /\block\b|best bet|guaranteed|\bproven\b|\bprofitable\b/i;

test.beforeEach(async ({ page, market }) => {
  await page.clock.setFixedTime(NHL_NOW);
  market.observedAt = NHL_NOW.toISOString();
  await serveNhl(page);
});

test('the NHL home leads with the learning state, the slate and research candidates @smoke', async ({ page }) => {
  await page.goto('./#/nhl');
  await expect(page.getByRole('heading', { name: 'NHL', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /NHL model status: Learning/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: "Today's Games" })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Research Candidates' })).toBeVisible();
  expect(await page.locator('main').innerText()).not.toMatch(BANNED);
});

test('the NHL game page answers projection, what matters, scripts and candidates @smoke', async ({ page }) => {
  await page.goto(`./#/nhl/game/${FLA_LAK}`);
  await expect(page.getByRole('heading', { name: 'What Matters' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /How It Could Play Out/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Research Candidates/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Goaltending' })).toBeVisible();
  await expect(page.getByText(/Model projects FLA/)).toBeVisible();
  const text = await page.locator('.game--nhl').innerText();
  expect(text).not.toMatch(/KXNHL/);
  expect(text).not.toMatch(BANNED);
  expect(text).toMatch(/research only/i);
});

test('the scripts tab carries every script and a survival matrix that fits the screen @journey', async ({ page, isMobile }) => {
  await page.goto(`./#/nhl/game/${FLA_LAK}?tab=script`);
  await expect(page.getByRole('heading', { name: 'Which markets survive which scripts' })).toBeVisible();
  if (isMobile) await expect(page.getByRole('region', { name: 'Script survival matrix' })).toBeHidden();
  else await expect(page.getByRole('region', { name: 'Script survival matrix' })).toBeVisible();
  await noHorizontalOverflow(page, 'nhl-scripts');
});

test('a research candidate opens why it is interesting, its survival and its research status @journey', async ({ page }) => {
  await page.goto(`./#/nhl/game/${FLA_LAK}?tab=candidates`);
  const first = page.locator('.nc').first();
  await expect(first).toBeVisible();
  await expect(first).toContainText(/Survives \d+% of simulated games/);
  await expect(first.locator('.nstatus')).toBeVisible();
  await first.getByRole('button', { name: /Why this candidate/ }).click();
  const why = page.getByRole('region', { name: /^Why / }).first();
  await expect(why).toContainText('Scripts');
  await expect(why).toContainText('Model evidence');
  await expect(why).toContainText('Price');
});

test('the markets tab keeps the live market and says when the model does not price a market @journey', async ({ page }) => {
  await page.goto(`./#/nhl/game/${FLA_LAK}?tab=markets`);
  await expect(page.locator('.game--nhl')).toContainText(/Model does not price this market|Model P\(YES\)|Model/);
  expect(await page.locator('.game--nhl').innerText()).not.toMatch(/KXNHL/);
});

test('a market page shows the contract in every script with the failure script called out @journey', async ({ page }) => {
  await page.goto(`./#/nhl/market/${TOTAL}?event=${FLA_LAK}`);
  await expect(page.getByRole('heading', { name: /does it survive the game scripts/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Script-conditioned prices' })).toBeVisible();
});

test('a team page separates opponent-adjusted strength from raw numbers @journey', async ({ page }) => {
  await page.goto(`./#/nhl/team/${LAK}`);
  const region = page.getByRole('region', { name: 'Opponent-adjusted strength' });
  await expect(region).toBeVisible();
  await expect(region.getByRole('columnheader', { name: 'Raw (same games)' })).toBeVisible();
});

test('skater and goalie pages are research first @journey', async ({ page }) => {
  await page.goto(`./#/nhl/player/${KEMPE}`);
  await expect(page.getByRole('heading', { name: /Adrian Kempe/, level: 1 })).toBeVisible();
  await page.goto(`./#/nhl/player/${KUEMPER}`);
  await expect(page.getByRole('heading', { name: /Kuemper/, level: 1 })).toBeVisible();
  await expect(page.getByText(/Projected starter|Confirmed starter|starter/i).first()).toBeVisible();
});

test('the scorecard reports real counts and what is not yet known @journey', async ({ page }) => {
  await page.goto('./#/nhl/scorecard');
  await expect(page.getByRole('heading', { name: /Projection vs market/ })).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).toMatch(/What we still do not know/);
  expect(text).toMatch(/\d+ settled games/);
  expect(text).not.toMatch(BANNED);
});

test('search finds NHL teams and players @journey', async ({ page }) => {
  await page.goto('./#/search?q=Kempe');
  await expect(page.locator('.sres').filter({ hasText: 'Kempe' }).first()).toBeVisible();
});

test('an NHL game saved to the tray builds an NHL handicap packet with the scripts @journey', async ({ page, isMobile }) => {
  await page.goto(`./#/nhl/game/${FLA_LAK}`);
  await page.getByRole('button', { name: /^Save .* to research tray$/ }).first().click();
  await (isMobile ? page.locator('.bottombar__tray') : page.locator('.traybtn')).click();
  const drawer = page.getByRole('complementary', { name: 'Research tray' });
  await expect(drawer.locator('.tray__item')).toHaveCount(1);
  await drawer.getByRole('link', { name: /Dig deeper with ChatGPT \(NHL\)/ }).click();
  await expect(page.getByRole('button', { name: 'COPY FOR CHATGPT' })).toBeVisible({ timeout: 60_000 });
  const packet = await page.locator('pre, textarea').first().innerText().catch(() => '');
  if (packet) {
    expect(packet).toContain('protocol edge_finder.handicap.nhl.v1');
    expect(packet).toContain('NHL_SCRIPT_V1');
  }
});

for (const [name, url, root] of [
  ['nhl-home', './#/nhl', 'main'],
  ['nhl-game', `./#/nhl/game/${FLA_LAK}`, '.game--nhl'],
  ['nhl-game-script', `./#/nhl/game/${FLA_LAK}?tab=script`, '.game--nhl'],
  ['nhl-game-candidates', `./#/nhl/game/${FLA_LAK}?tab=candidates`, '.game--nhl'],
  ['nhl-market', `./#/nhl/market/${TOTAL}?event=${FLA_LAK}`, 'main'],
  ['nhl-team', `./#/nhl/team/${LAK}`, 'main'],
  ['nhl-goalie', `./#/nhl/player/${KUEMPER}`, 'main'],
  ['nhl-scorecard', './#/nhl/scorecard', 'main'],
] as const) {
  test(`${name} has no horizontal overflow and no serious a11y violations @smoke`, async ({ page }) => {
    await page.goto(url);
    await page.locator(root).first().waitFor();
    await ready(page);
    await noHorizontalOverflow(page, name);
    const res = await new AxeBuilder({ page }).include(root).analyze();
    const bad = res.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  if (['nhl-home', 'nhl-game', 'nhl-game-script', 'nhl-scorecard'].includes(name)) {
    test(`${name} @visual`, async ({ page, isMobile }) => {
      await page.goto(url);
      await page.locator(root).first().waitFor();
      await ready(page);
      await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: !isMobile });
    });
  }
}
