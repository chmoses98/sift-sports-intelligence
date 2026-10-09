// Tennis on Sift against a trimmed, real Tennis-Edge-Finder publication (tests/fixtures/tennis). An individual sport:
// tournaments and tours to filter, matches as two players, the model's chance beside the sharp references with the
// honest reason it stays research, doubles with no model, player pages, and a market page named by its players.
import type { Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, noHorizontalOverflow, test } from './fixtures';

const FIXTURE = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'tests', 'fixtures', 'tennis', 'app', 'latest');
const RAW = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/Tennis-Edge-Finder\/tennis-data\/tennis-edge-finder\/data\/app\/latest\/(.+)$/;
const NOW = new Date('2026-10-09T06:00:00Z');
const KHA_FER = 'evt_626bc16043b56b7b1921';
const DOUBLES = 'evt_d09d8721f706b006741f';
const KHACHANOV = 'prt_dc998b2d3279e7cce73b';
const BANNED = /\block\b|best bet|guaranteed|\bproven\b|\bprofitable\b/i;

async function serve(page: Page) {
  await page.context().unroute(RAW);
  await page.context().route(RAW, async (route) => {
    const rel = RAW.exec(route.request().url())![1].split('?')[0];
    const file = join(FIXTURE, rel);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(file, 'utf-8'), headers: { 'access-control-allow-origin': '*' } });
  });
}

test.beforeEach(async ({ page, market }) => {
  await page.clock.setFixedTime(NOW);
  market.observedAt = NOW.toISOString();
  await serve(page);
});

test('the Tennis tab opens a real home: tours, tournaments, matches as two players, honest status @smoke', async ({ page }) => {
  await page.goto('./#/tennis');
  await expect(page.getByRole('heading', { name: 'Tennis', level: 1 })).toBeVisible();
  await expect(page.getByText('no evidence of edge', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /ATP Shanghai/ })).toBeVisible();
  await expect(page.getByText('Karen Khachanov').first()).toBeVisible();
  await expect(page.getByText('Iga Swiatek').first()).toBeVisible();
  await page.getByRole('button', { name: 'WTA', exact: true }).click();
  await expect(page.getByText('Iga Swiatek').first()).toBeVisible();
  // The slate now holds WTA matches only (the candidates rail is slate-wide by design).
  await expect(page.locator('section[aria-labelledby="tn-slate-h"]').getByText('Karen Khachanov')).toHaveCount(0);
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/undefined|NaN|KXATP|KXWTA/);
  expect(text).not.toMatch(BANNED);
  await noHorizontalOverflow(page, 'tennis home');
});

test('a match page: the model read with triangulation and why it is not a bet, serve and return, every market, the player page @smoke', async ({ page }) => {
  await page.goto(`./#/tennis/game/${KHA_FER}`);
  await expect(page.getByRole('heading', { name: /Karen Khachanov wins 59% of the time in the model/ })).toBeVisible();
  await expect(page.getByText(/Model is the lone outlier/)).toBeVisible();
  await expect(page.getByText(/Why this is not a bet/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Serve, return and rating' })).toBeVisible();
  await expect(page.getByText('Match winner', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Arthur Fery to win the match' })).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/undefined|NaN|KXATP/);
  expect(text).not.toMatch(BANNED);
  await noHorizontalOverflow(page, 'tennis match');
  await page.getByRole('link', { name: 'Karen Khachanov' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/tennis/player/${KHACHANOV}`));
  await expect(page.getByRole('heading', { name: 'Karen Khachanov', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'By surface' })).toBeVisible();
  await noHorizontalOverflow(page, 'tennis player');
});

test('doubles carry no model and the match says so', async ({ page }) => {
  await page.goto(`./#/tennis/game/${DOUBLES}`);
  await expect(page.getByRole('heading', { name: 'No model probability for doubles.' })).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/undefined|NaN/);
});
