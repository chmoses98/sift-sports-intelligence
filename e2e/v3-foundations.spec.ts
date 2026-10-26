// SIFT 3.0 Foundations: the history and scroll contract on the real screens (sample data, no network). Back restores the exact state of
// the entry it returns to; an in-place change (window, tab, filter) never moves the page and never adds a history entry; a sheet is one
// history entry that Back closes; links inside a sheet leave no ghost entry.
import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort()); });

const go = async (page: Page, path: string) => { await page.goto(`./#${path}`); await expect(page.locator('[data-v3-shell]')).toBeVisible(); await page.waitForTimeout(300); };
const y = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
const scrollTo = async (page: Page, to: number) => { await page.evaluate((t) => window.scrollTo(0, t), to); await page.waitForTimeout(200); };
const hash = (page: Page) => page.evaluate(() => location.hash);
const histLen = (page: Page) => page.evaluate(() => history.length);

test.describe('SIFT 3.0 foundations @v3', () => {
  test('Back restores the scroll position of the list the viewer left', async ({ page }) => {
    await go(page, '/v3/games?demo=1');
    await expect(page.locator('.v3-gc').first()).toBeVisible();
    await scrollTo(page, 420);
    const before = await y(page);
    expect(before).toBeGreaterThan(300);
    // A card that is on screen at this offset (Playwright would otherwise scroll the first card into view before clicking).
    await page.evaluate(() => { const a = [...document.querySelectorAll<HTMLAnchorElement>('.v3-gc a[href*="/v3/game/"]')].find((x) => { const r = x.getBoundingClientRect(); return r.top > 120 && r.bottom < innerHeight - 90; }); a?.click(); });
    await expect(page).toHaveURL(/#\/v3\/game\//);
    await expect.poll(() => y(page)).toBeLessThan(40);
    await page.goBack();
    await expect(page).toHaveURL(/#\/v3\/games/);
    await expect.poll(() => y(page)).toBeGreaterThan(before - 6);
    expect(Math.abs((await y(page)) - before)).toBeLessThanOrEqual(6);
  });

  test('changing the window in place keeps the page where it is and adds no history entry', async ({ page }) => {
    await go(page, '/v3/player/nba/sample-guard?demo=1');
    await expect(page.locator('.v3-win').first()).toBeVisible();
    await scrollTo(page, 180);
    const before = await y(page);
    const len = await histLen(page);
    await page.locator('.v3-win', { hasText: 'L5' }).click();
    await expect(page).toHaveURL(/win=L5/);
    expect(Math.abs((await y(page)) - before)).toBeLessThanOrEqual(4);
    expect(await histLen(page)).toBe(len);
  });

  test('a sheet is one history entry: Back closes it and the screen is exactly as it was', async ({ page }) => {
    await go(page, '/v3/player/nba/sample-guard?demo=1');
    await page.locator('.v3-win', { hasText: 'L5' }).click();
    const url = await hash(page);
    await scrollTo(page, 120);
    const before = await y(page);
    await page.getByRole('button', { name: /Research filters/ }).click();
    await expect(page.getByRole('dialog', { name: 'Research filters' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await hash(page)).toBe(url);
    expect(Math.abs((await y(page)) - before)).toBeLessThanOrEqual(4);
  });

  test('closing a sheet with its X leaves no extra entry behind', async ({ page }) => {
    await go(page, '/v3/explore?demo=1');
    await go(page, '/v3/player/nba/sample-guard?demo=1');
    const len = await histLen(page);
    await page.getByRole('button', { name: /Research filters/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).last().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/#\/v3\/explore/);
    expect(len).toBeGreaterThan(0);
  });

  test('applying filters from a sheet lands on the screen underneath and Back leaves the screen', async ({ page }) => {
    await go(page, '/v3/explore?demo=1');
    await page.evaluate(() => { location.hash = '#/v3/player/nba/sample-guard?demo=1'; });
    await expect(page.locator('.v3-win').first()).toBeVisible();
    await page.getByRole('button', { name: /Research filters/ }).click();
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/site=home/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/#\/v3\/explore/);
  });

  test('the shell parameters never become part of a saved or scrolled address', async ({ page }) => {
    await go(page, '/v3/player/nba/sample-guard?demo=1');
    await page.locator('.v3-win', { hasText: 'L20' }).click();
    await page.getByRole('button', { name: 'Save this research' }).click();
    await go(page, '/v3/following?demo=1');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sift3.saved') ?? '[]'));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ v: 2, kind: 'player', sport: 'nba' });
    expect(saved[0].route).toMatch(/^\/v3\/player\/nba\/sample-guard\?v=1&/);
    expect(saved[0].route).not.toMatch(/sheet=|demo=/);
  });
});
