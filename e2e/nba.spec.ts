// NBA on Sift against a trimmed, real nba-edge-finder publication (tests/fixtures/nba). The sport tab opens a real
// home (slate, honest model status with the publication's own study), the game page leads with a PASS and shows the
// matchup, injuries, rosters and every market as prices only, and the team page opens.
import type { Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, noHorizontalOverflow, test } from './fixtures';

const FIXTURE = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'tests', 'fixtures', 'nba', 'app', 'latest');
const RAW = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/nba-edge-finder\/data-archive\/app\/latest\/(.+)$/;
const NOW = new Date('2026-10-09T08:00:00Z');
const DAL_HOU = 'evt_0787342e3e624193d62e';
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

test('the NBA tab opens a real home: the slate with both clubs and the honest research PASS @smoke', async ({ page }) => {
  await page.goto('./#/nba');
  await expect(page.getByRole('heading', { name: 'NBA', level: 1 })).toBeVisible();
  await expect(page.getByText('market beats model 8/8 families')).toBeVisible();
  await expect(page.locator('.skrow')).toHaveCount(2);
  await expect(page.getByText('Dallas Mavericks').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /No NBA market clears the bar/ })).toBeVisible();
  // Team identity never depends on an image: the tricode or the club name is always text on the row.
  await expect(page.locator('.skrow').first()).toContainText(/Bucks|Thunder|MIL|OKC/);
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/undefined|NaN|KXNBA/);
  expect(text).not.toMatch(BANNED);
  await noHorizontalOverflow(page, 'nba home');
});

test('a game page: PASS first, then matchup ranks, injuries, rosters and every market as prices only; the team page opens @smoke', async ({ page }) => {
  await page.goto(`./#/nba/game/${DAL_HOU}`);
  await expect(page.getByRole('heading', { name: /No defensible opportunity/ })).toBeVisible();
  for (const h of ['Matchup', 'Injury report', 'Markets', 'Model against the market']) await expect(page.getByRole('heading', { name: h, exact: true })).toBeVisible();
  await expect(page.getByText(/rank of 30/).first()).toBeVisible();
  await expect(page.getByText(/The model prices none of these/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dallas Mavericks −10.5' })).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/undefined|NaN|KXNBA/);
  expect(text).not.toMatch(BANNED);
  expect(text).not.toMatch(/bet up to/i);
  await noHorizontalOverflow(page, 'nba game');
  await page.getByRole('link', { name: 'Dallas Mavericks' }).first().click();
  await expect(page).toHaveURL(/\/nba\/team\//);
  await expect(page.getByRole('heading', { name: /Dallas Mavericks/, level: 1 })).toBeVisible();
  await noHorizontalOverflow(page, 'nba team');
});
