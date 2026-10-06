// CFB through the CFB Script Engine: the same SIFT game page, driven by a market-blind football read.
// The CFB publication is served from tests/fixtures/cfb (a trimmed, real cfb-edge-finder export) in place
// of raw.githubusercontent.com, so the run is deterministic and offline.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, noHorizontalOverflow, NOW, test } from './fixtures';

const FIXTURE = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'tests', 'fixtures', 'cfb', 'app', 'latest');
const CFB_RAW = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/cfb-edge-finder\/main\/app\/latest\/(.+)$/;

/** Georgia at Alabama, 2026-10-10: HIGH data confidence, a shootout primary and a grind danger. */
export const UGA_ALA = 'evt_93e12676ae9337017c63';
/** LSU at Kentucky: an away-control primary with secondary and danger scripts. */
export const LSU_UK = 'evt_8c3166866b2bfa530c17';
/** Albany vs Stony Brook: the engine could not match the game; markets only. */
export const ALBY_STON = 'evt_776097ba6eef448fb340';

async function serveCfb(page: Page) {
  await page.context().route(CFB_RAW, async (route) => {
    const rel = CFB_RAW.exec(route.request().url())![1].split('?')[0];
    const file = join(FIXTURE, rel);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(file, 'utf-8'), headers: { 'access-control-allow-origin': '*' } });
  });
}

async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.skel')).toHaveCount(0);
  await page.mouse.move(0, 0);
}

test.beforeEach(async ({ page, market }) => {
  await page.clock.setFixedTime(NOW);
  market.observedAt = NOW.toISOString();
  await serveCfb(page);
});

test('the CFB game page leads with the football read, then scripts, then the bets that survive them @smoke', async ({ page }) => {
  await page.goto(`./#/cfb/game/${UGA_ALA}`);
  await expect(page.getByRole('heading', { name: 'SIFT Read' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Likely Game Scripts' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bets That Survive Multiple Scripts' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Matchup Edges' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Data Confidence' })).toBeVisible();
  await expect(page.locator('.eng-scard')).toHaveCount(2);
  await expect(page.locator('.eng-scard').first()).toContainText('Primary');
  await expect(page.locator('.eng-scard').last()).toContainText('Danger');
  // No likelihoods, no price verdicts.
  const text = (await page.locator('.ov--engine').innerText()).toLowerCase();
  expect(text).not.toContain('+ev');
  expect(text).not.toMatch(/\d+% likely/);
  expect(text).not.toContain('fair value');
});

test('why this bet opens the scripts, conditions, evidence and price behind a row @journey', async ({ page }) => {
  await page.goto(`./#/cfb/game/${UGA_ALA}`);
  const toggle = page.getByRole('button', { name: /why this bet/i }).first();
  await toggle.click();
  const why = page.getByRole('region', { name: /^Why / }).first();
  await expect(why).toBeVisible();
  await expect(why).toContainText('Required football conditions');
  await expect(why).toContainText('Pays when');
  await expect(why).toContainText(/Primary/);
});

test('the script tab shows the causal chain with the findings that justify each step @journey', async ({ page }) => {
  await page.goto(`./#/cfb/game/${LSU_UK}?tab=script`);
  const steps = page.locator('.chain > li');
  await expect(steps.first()).toBeVisible();
  expect(await steps.count()).toBeGreaterThanOrEqual(3);
  await page.locator('.chain .fchip > summary').first().click();
  await expect(page.locator('.chain .fchip[open]').first()).toContainText(/opponent-adjusted|out-rates|owns/i);
  await expect(page.getByRole('heading', { name: 'Markets this script settles' })).toBeVisible();
});

test('the matchup tab publishes every metric with raw, adjusted and rank @journey', async ({ page }) => {
  await page.goto(`./#/cfb/game/${UGA_ALA}?tab=matchup`);
  await expect(page.getByRole('heading', { name: 'Matchup findings' })).toBeVisible();
  await expect(page.locator('.mettab').first()).toBeVisible();
  await expect(page.locator('.mettab__sub').first()).toContainText(/adj|raw/);
});

test('a game the engine could not read says so and keeps the markets @smoke', async ({ page }) => {
  await page.goto(`./#/cfb/game/${ALBY_STON}`);
  await expect(page.getByText('No script engine read for this game')).toBeVisible();
});

for (const [name, url] of [
  ['cfb-game', `./#/cfb/game/${UGA_ALA}`],
  ['cfb-game-script', `./#/cfb/game/${LSU_UK}?tab=script`],
  ['cfb-game-matchup', `./#/cfb/game/${UGA_ALA}?tab=matchup`],
] as const) {
  test(`${name} has no horizontal overflow and no serious a11y violations @smoke`, async ({ page }) => {
    await page.goto(url);
    await page.locator('.game--engine').waitFor();
    await ready(page);
    await noHorizontalOverflow(page, name);
    const res = await new AxeBuilder({ page }).include('.game--engine').analyze();
    const bad = res.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test(`${name} @visual`, async ({ page, isMobile }) => {
    await page.goto(url);
    await page.locator('.game--engine').waitFor();
    await ready(page);
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: !isMobile });
  });
}
