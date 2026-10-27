// Saved research (milestone 7): the existing record, versioned and migrated, restores the exact state of every kind of screen, from
// a first-build record (no version) as well as a current one, and Back returns to the saved list as it was. Sample data (?demo=1), no network.
import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort()); });

const T0 = 1_700_000_000_000;
const seed = [
  // first-build records: no `v`, no kind, no chips
  { id: 'r1', title: 'Sample Guard · Assists', subtitle: 'L5 · Home · line 6.5', route: '/v3/player/nba/sample-guard?stat=ast&win=L5&site=home&line=6.5', savedAt: T0, snapshot: [{ label: 'Hit rate', value: '3/5', asOf: null }] },
  { id: 'r2', title: 'Points per game', subtitle: 'Rankings', route: '/v3/stat/nfl/sample-0?tab=rankings&team=DAL', savedAt: T0 - 1 },
  { id: 'r3', title: 'Georgia', subtitle: 'Overview', route: '/v3/game/cfb/demo_uga_fla?tab=main', savedAt: T0 - 2 },
  // a current record
  { v: 2, id: 'r4', kind: 'team', sport: 'cfb', title: 'Georgia Bulldogs', subtitle: 'Schedule', chips: ['Schedule'], route: '/v3/team/cfb/UGA?v=1&tab=schedule', sv: 1, savedAt: T0 - 3 },
];

async function open(page: Page) {
  await page.goto('./#/v3/following?demo=1');
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  await page.evaluate((s) => { localStorage.setItem('sift3.saved', JSON.stringify(s)); }, seed);
  await page.goto('./#/v3/explore?demo=1');
  await page.goto('./#/v3/following?demo=1');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Saved research' })).toBeVisible();
}

test.describe('Saved research @v3', () => {
  test('first-build and current records all appear, with their kind, and without any age or timestamp text', async ({ page }) => {
    await open(page);
    const list = page.getByRole('region', { name: 'Saved research' });
    await expect(list.locator('.v3-hit--saved')).toHaveCount(4);
    await expect(list.locator('.v3-kind').first()).toHaveText(/Player · NBA/);
    await expect(list.getByText('Saved values: Hit rate 3/5')).toBeVisible();
    await expect(list.locator('.v3-chipx')).toHaveText(['Schedule']);
    expect(await list.innerText()).not.toMatch(/\bago\b|stale|updated|last known/i);
  });

  test('a first-build player record reopens with its stat, window, filter and line; Back returns to the list', async ({ page }) => {
    await open(page);
    await page.getByRole('link', { name: /Reopen Sample Guard/ }).click();
    await expect(page).toHaveURL(/#\/v3\/player\/nba\/sample-guard\?v=\d+&.*stat=ast/);
    await expect(page).toHaveURL(/win=L5/);
    await expect(page).toHaveURL(/site=home/);
    await expect(page).toHaveURL(/line=6\.5/);
    await expect(page.getByRole('button', { name: 'AST', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.goBack();
    await expect(page).toHaveURL(/#\/v3\/following/);
    await expect(page.getByRole('region', { name: 'Saved research' })).toBeVisible();
  });

  test('a first-build statistic record opens in the current vocabulary with its team selected', async ({ page }) => {
    await open(page);
    await page.getByRole('link', { name: /Reopen Points per game/ }).click();
    await expect(page).toHaveURL(/#\/v3\/stat\/nfl\/sample-0\?v=1&.*sel=DAL/);
    await expect(page).not.toHaveURL(/team=|tab=rankings/);
    await page.goBack();
    await expect(page).toHaveURL(/#\/v3\/following/);
  });

  test('a first-build game record (tab=main) opens Overview, and a current team record opens its tab', async ({ page }) => {
    await open(page);
    await page.getByRole('link', { name: /Reopen Georgia:/ }).first().click();
    await expect(page).toHaveURL(/#\/v3\/game\/cfb\/demo_uga_fla/);
    await expect(page).not.toHaveURL(/tab=main/);
    await page.goBack();
    await page.getByRole('link', { name: /Reopen Georgia Bulldogs/ }).click();
    await expect(page).toHaveURL(/#\/v3\/team\/cfb\/UGA\?v=1&tab=schedule/);
    await page.goBack();
    await expect(page).toHaveURL(/#\/v3\/following/);
  });

  test('records the app cannot open are dropped, never shown as broken links', async ({ page }) => {
    await page.goto('./#/v3/following?demo=1');
    await page.evaluate(() => localStorage.setItem('sift3.saved', JSON.stringify([{ route: 'https://evil.example/v3/x', title: 'x' }, { title: 'no route' }, 7, null, { route: '/v3/team/cfb/UGA', title: 'Georgia', subtitle: '', savedAt: 1 }])));
    await page.reload();
    const items = page.getByRole('region', { name: 'Saved research' }).locator('.v3-hit--saved');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('Georgia');
  });
});
