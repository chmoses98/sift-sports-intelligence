// Soccer on Sift against a trimmed, real soccer-edge-finder publication (tests/fixtures/soccer), served in place of
// raw.githubusercontent.com. The sport tab opens a real home (competitions, fixtures, candidates), the match page
// leads with the strongest research expression and its counter-case or an honest PASS, markets open, and nothing
// scrolls sideways or invents a number.
import type { Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, noHorizontalOverflow, test } from './fixtures';

const FIXTURE = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'tests', 'fixtures', 'soccer', 'app', 'latest');
const RAW = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/soccer-edge-finder\/data-archive\/app\/latest\/(.+)$/;
const NOW = new Date('2026-10-09T08:00:00Z');
const ARS_LEE = 'evt_0a69396895a311cb26b2';
const SAN_FLA = 'evt_588a4c8417a2e976344d';
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

test('the Soccer tab opens a real home: competitions, fixtures, research candidates, honest status @smoke', async ({ page }) => {
  await page.goto('./#/soccer');
  await expect(page.getByRole('heading', { name: 'Soccer', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /Premier League/ })).toBeVisible();
  await expect(page.locator('.skrow')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Opportunities' })).toBeVisible();
  await expect(page.getByText('Arsenal').first()).toBeVisible();
  // Filtering to one competition keeps only its fixtures.
  await page.getByRole('button', { name: /Liga MX/ }).click();
  await expect(page.locator('#sc-slate-h')).toHaveText(/Liga MX/);
  await expect(page.getByText('Puebla').first()).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/undefined|NaN|KXEPL|KXLIGA/);
  expect(text).not.toMatch(BANNED);
  expect(text).toMatch(/research only/i);
  await noHorizontalOverflow(page, 'soccer home');
});

test('a match page: the strongest research expression with price, break-even and counter-case, then scripts, matchup and markets @smoke', async ({ page }) => {
  await page.goto(`./#/soccer/game/${ARS_LEE}`);
  await expect(page.getByRole('heading', { name: /NO on “Arsenal to win”/ })).toBeVisible();
  await expect(page.getByText(/What beats it:/)).toBeVisible();
  await expect(page.getByText('Break-even', { exact: true }).first()).toBeVisible();
  for (const h of ['The research read', 'How the match could play', 'Matchup', 'Every research expression', 'Markets', 'Context']) {
    await expect(page.getByRole('heading', { name: h, exact: true })).toBeVisible();
  }
  await expect(page.getByText('Tight, low event').first()).toBeVisible();
  // Every market reads in soccer language with a price; a contract link opens its market page.
  await expect(page.getByText('Match result (1X2)', { exact: false }).first()).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/undefined|NaN|KXEPL/);
  expect(text).not.toMatch(BANNED);
  await noHorizontalOverflow(page, 'soccer match');
  await page.getByRole('link', { name: 'Draw', exact: true }).first().click();
  await expect(page).toHaveURL(/\/soccer\/market\/mkt_kalshi_KXEPLGAME-26OCT10ARSLEE-TIE\?event=/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Result: draw|Draw/);
});

test('a fixture the engine did not run says PASS, without inventing a thesis or a price', async ({ page }) => {
  await page.goto(`./#/soccer/game/${SAN_FLA}`);
  await expect(page.getByRole('heading', { name: 'No script-engine read for this fixture.' })).toBeVisible();
  await expect(page.getByText('fixture not on the model board', { exact: false })).toBeVisible();
  await expect(page.getByText('No Kalshi contract is published for this game yet.')).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/undefined|NaN/);
  expect(text).not.toMatch(/bet up to|break-even/i);
});

test('the global home features the soccer research candidates with their price, break-even and limit @smoke', async ({ page }) => {
  // Inside the publication's validity window for these recommendations (they expire at 06:24Z).
  await page.clock.setFixedTime(new Date('2026-10-09T06:10:00Z'));
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'Today on Sift' })).toBeVisible();
  await page.getByRole('button', { name: 'This week' }).click();
  const card = page.locator('.opp--research_candidate').first();
  await expect(card).toBeVisible();
  await expect(card).toContainText(/Research candidate/);
  await expect(card).toContainText(/Break-even/);
  await expect(card).toContainText(/Bet up to/);
  await expect(card).toContainText(/What beats it:/);
  await card.getByRole('button', { name: /Evidence/ }).click();
  await expect(card.getByText(/posterior draws/)).toBeVisible();
  // Every other sport is honest about being unreadable in this offline run; nothing is invented for it.
  await expect(page.locator('.opp--pass').first()).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/undefined|NaN|KXEPL|KXLIGA/);
  expect(text).not.toMatch(BANNED);
  await noHorizontalOverflow(page, 'home');
  // The game list carries the fixture with its candidate count and opens it.
  await page.getByRole('link', { name: /Arsenal v Leeds United, Soccer/ }).click();
  await expect(page.getByRole('heading', { name: 'The research read' })).toBeVisible();
});
