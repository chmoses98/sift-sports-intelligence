// SIFT 3.0 Foundations: the history and scroll contract on the real screens (sample data, no network). Back restores the exact state of
// the entry it returns to; an in-place change (window, tab, filter) never moves the page and never adds a history entry; a sheet is one
// history entry that Back closes; links inside a sheet leave no ghost entry.
import { test, expect, type Page } from '@playwright/test';
import { frames, offsetBeforeClick } from './support/scroll';

test.beforeEach(async ({ page }) => { await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort()); });

const go = async (page: Page, path: string) => { await page.goto(`./#${path}`); await expect(page.locator('[data-v3-shell]')).toBeVisible(); await page.waitForTimeout(300); };
const y = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
// The app remembers the offset from scroll events, which a browser dispatches with the next frame: let them run before anything leaves the page.
const scrollTo = async (page: Page, to: number) => { await page.evaluate((t) => window.scrollTo(0, t), to); await page.waitForTimeout(200); await frames(page); };
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
    await expect(page.locator('[data-win]').first()).toBeVisible();
    await scrollTo(page, 180);
    const before = await y(page);
    const len = await histLen(page);
    await page.locator('[data-win="L5"]').click();
    await expect(page).toHaveURL(/win=L5/);
    expect(Math.abs((await y(page)) - before)).toBeLessThanOrEqual(4);
    expect(await histLen(page)).toBe(len);
  });

  test('a sheet is one history entry: Back closes it and the screen is exactly as it was', async ({ page }) => {
    await go(page, '/v3/player/nba/sample-guard?demo=1');
    await page.locator('[data-win="L5"]').click();
    const url = await hash(page);
    await scrollTo(page, 120);
    const opener = page.getByRole('button', { name: /Research filters/ });
    const before = await offsetBeforeClick(page, opener);   // on a short phone the sticky bar covers the button at 120 and the click scrolls it clear first
    await opener.click();
    await expect(page.getByRole('dialog', { name: 'Research filters' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await hash(page)).toBe(url);
    expect(Math.abs((await y(page)) - before)).toBeLessThanOrEqual(4);
  });

  // The shell drops `?demo=` from the address in an effect after it mounts, and Stat Detail rewrites a first-build ranking id once its catalog has answered. Both are
  // `replace`s, which land on whichever entry is current when they run: one that runs after the viewer has moved on must not put the old screen's address on the new one.
  for (const gap of [0, 10, 30, 60]) {
    test(`an address rewritten after the fact never overwrites the entry the viewer has moved to (second navigation ${gap} ms later)`, async ({ page }) => {
      await go(page, '/v3/games?demo=1');
      await expect(page).not.toHaveURL(/demo=/);
      await page.evaluate((ms) => new Promise<void>((done) => {
        location.hash = '#/v3/explore?demo=1';
        setTimeout(() => { location.hash = '#/v3/following?demo=1'; done(); }, ms);
      }), gap);
      await expect(page).toHaveURL(/#\/v3\/following/);
      await page.waitForTimeout(600);
      expect(await hash(page)).toMatch(/^#\/v3\/following/);
    });
  }

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
    await expect(page.locator('[data-win]').first()).toBeVisible();
    await page.getByRole('button', { name: /Research filters/ }).click();
    await page.getByRole('button', { name: /^Home/ }).click();
    await page.getByRole('button', { name: /^Show \d+ games?/ }).click();   // locked design P3: the sheet's apply button
    await expect(page).toHaveURL(/site=home/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/#\/v3\/explore/);
  });

  test('the shell parameters never become part of a saved or scrolled address', async ({ page }) => {
    await go(page, '/v3/player/nba/sample-guard?demo=1');
    await page.locator('[data-win="ALL"]').click();
    await page.getByRole('button', { name: 'Save this research' }).click();
    await go(page, '/v3/following?demo=1');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sift3.saved') ?? '[]'));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ v: 2, kind: 'player', sport: 'nba' });
    expect(saved[0].route).toMatch(/^\/v3\/player\/nba\/sample-guard\?v=2&/);
    expect(saved[0].route).not.toMatch(/sheet=|demo=/);
  });
});
