// Football decision surfaces: the NFL props board (families, team filter, one card per player and stat that opens
// into price after fees, the shadow model next to the market, risks and the ladder), the Sift verdict strip at the
// top of a game, and the CFB script → market cards (what pays, what it loses in, the other rungs). Offline and
// deterministic on the bundled NFL snapshot and the CFB fixture.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, NEBUF, noHorizontalOverflow, NOW, test } from './fixtures';

// The CFB publication and its research-signals contract, served from tests/fixtures/cfb (as e2e/cfb.spec.ts does).
const CFB_FIXTURE = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'tests', 'fixtures', 'cfb', 'app', 'latest');
const CFB_RAW = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/cfb-edge-finder\/main\/app\/latest\/(.+)$/;
const CFB_SIGNALS = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/cfb-edge-finder\/research-signals\/signals\/cfb_research_signals\.json(\?.*)?$/;
const CFB_NOW = new Date('2026-10-08T12:00:00Z');
async function serveCfb(page: Page) {
  await page.context().route(CFB_SIGNALS, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(join(CFB_FIXTURE, '..', '..', 'signals', 'cfb_research_signals.json'), 'utf-8'), headers: { 'access-control-allow-origin': '*' } }));
  await page.context().route(CFB_RAW, async (route) => {
    const file = join(CFB_FIXTURE, CFB_RAW.exec(route.request().url())![1].split('?')[0]);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(file, 'utf-8'), headers: { 'access-control-allow-origin': '*' } });
  });
}

const ATLNO = 'evt_639f74e87ff25310c542';
/** LSU at Kentucky: an away-control primary with secondary and danger scripts (e2e/cfb.spec.ts). */
const LSU_UK = 'evt_8c3166866b2bfa530c17';

test.beforeEach(async ({ page }) => page.clock.setFixedTime(NOW));

test('the NFL props board groups every prop by family and opens a card into price, model, risk and the ladder @journey', async ({ page }) => {
  await page.goto(`./#/nfl/game/${ATLNO}?tab=props`);
  const board = page.getByTestId('props-board');
  await expect(board.getByRole('heading', { name: 'Player props', level: 2 })).toBeVisible();
  const families = board.getByRole('group', { name: 'Prop family' });
  for (const f of ['Passing', 'Rushing', 'Receiving', 'Touchdowns']) await expect(families.getByRole('button', { name: new RegExp(`^${f}`) })).toBeVisible();
  await expect(board.locator('.pb__card').first()).toBeVisible();
  // The confidence line is the publication's own scorecard, never an edge.
  await expect(board.getByText(/Research only/).first()).toBeVisible();
  expect(await board.textContent()).not.toMatch(/bet up to|best bet|lock/i);

  // Rushing only, Falcons only: Bijan Robinson's rushing yards with projection, line and both asks.
  await families.getByRole('button', { name: /^Rushing/ }).click();
  await board.getByRole('group', { name: 'Team' }).getByRole('button', { name: /ATL/ }).click();
  await expect(page).toHaveURL(/family=rushing/);
  const bijan = board.locator('.pb__card').filter({ hasText: 'Bijan Robinson' }).filter({ hasText: 'Rushing yards' });
  await expect(bijan).toBeVisible();
  await expect(bijan.locator('.pb__read')).toContainText(/Sim (above|below|on) the line/);
  await expect(bijan.locator('.pb__nums').getByText('89.5', { exact: true })).toBeVisible();
  await expect(bijan.locator('.pb__nums')).toContainText(/\d+¢ \/ \d+¢/);
  for (const card of await board.locator('.pb__card').all()) await expect(card.locator('.pcard__s')).toContainText(/ATL/);

  // One tap down: price after fee with break-evens, the shadow model with its own support word, the other lines.
  await bijan.getByText('Evidence, price, risk and the other lines').click();
  await expect(bijan.getByText(/break-even \d+%/).first()).toBeVisible();
  await expect(bijan.getByText('Shadow model P(over)')).toBeVisible();
  await expect(bijan.getByText(/projectable not yet validated|not priced/).first()).toBeVisible();
  await expect(bijan.getByRole('heading', { name: 'The other lines' })).toBeVisible();
  expect(await bijan.locator('.pb__ladder tbody tr').count()).toBeGreaterThan(3);
  await expect(bijan.getByText(/No bet-up-to is shown/)).toBeVisible();
  await noHorizontalOverflow(page, 'nfl props board');
  const axe = await new AxeBuilder({ page }).include('[data-testid="props-board"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations).toEqual([]);
});

test('touchdown props read on expected touchdowns and the priced-lines switch widens the board @journey', async ({ page }) => {
  await page.goto(`./#/nfl/game/${NEBUF}?tab=props&family=touchdowns`);
  const board = page.getByTestId('props-board');
  const card = board.locator('.pb__card').first();
  await expect(card).toBeVisible();
  await expect(card.getByText('Expected TDs', { exact: true })).toBeVisible();
  await expect(card.locator('.pb__nums')).toContainText(/Anytime|\d\+/);
  const priced = await board.locator('.pb__card').count();
  await board.getByLabel('Priced lines only').uncheck();
  expect(await board.locator('.pb__card').count()).toBeGreaterThanOrEqual(priced);
});

test('an NFL game opens with the Sift verdict: no published opportunity, said plainly @smoke', async ({ page }) => {
  await page.goto(`./#/nfl/game/${NEBUF}`);
  const v = page.getByTestId('game-opportunities');
  await expect(v).toBeVisible();
  await expect(v.getByRole('heading', { name: 'Sift verdict' })).toBeVisible();
  await expect(v.getByText('No published opportunity on this game.')).toBeVisible();
  await expect(v.getByRole('link', { name: 'NFL opportunities' })).toHaveAttribute('href', '#/nfl');
  // The verdict sits above What Matters, not below it.
  const [vy, my] = await Promise.all([v.boundingBox(), page.getByRole('heading', { name: 'What Matters' }).boundingBox()]);
  expect(vy!.y).toBeLessThan(my!.y);
});

test('CFB script cards say what a contract pays, what it loses in, its price after fee and the other rungs @journey', async ({ page, market }) => {
  await page.clock.setFixedTime(CFB_NOW);
  market.observedAt = CFB_NOW.toISOString();
  await serveCfb(page);
  await page.goto(`./#/cfb/game/${LSU_UK}?tab=script`);
  await expect(page.getByRole('heading', { name: 'Markets this script settles' })).toBeVisible();
  const cards = page.getByTestId('script-market');
  expect(await cards.count()).toBeGreaterThan(0);
  const first = cards.first();
  await expect(first.locator('.smc__fit')).toContainText(/Pays across this script|Pays in \d+% of its range/);
  await expect(first.locator('.smc__line').filter({ hasText: 'Pays when' }).first()).toBeVisible();
  await expect(first.locator('.smc__nums')).toContainText(/supported in \d of \d scripts/);
  await expect(first.locator('.smc__nums')).toContainText('Break-even');
  // Switching to the danger script changes the supported contracts and names what loses.
  const titles = await cards.locator('.smc__t').allTextContents();
  await page.locator('.eng-scard').filter({ hasText: 'Danger' }).first().click();
  await expect(page.getByTestId('script-market').first()).toBeVisible();
  const after = await page.getByTestId('script-market').locator('.smc__t').allTextContents();
  expect(after).not.toEqual(titles);
  await expect(page.getByText(/Loses in|No script the engine built contradicts/).first()).toBeVisible();
  // Counts stay counts: no card turns script survival into a percentage of winning.
  for (const t of await page.getByTestId('script-market').locator('.smc__nums').allTextContents()) expect(t).not.toMatch(/\d+% (chance|to win|probability)/i);
  await noHorizontalOverflow(page, 'cfb script markets');
});
