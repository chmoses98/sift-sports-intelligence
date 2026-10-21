// The release build (SIFT 2.0 is the default interface) with v4 present: v4 stays opt-in, leaving it is a real exit, and the
// remembered SIFT 2.0 / classic choices are not disturbed. (The classic-build twin is in e2e/v4.spec.ts.)
import { expect, NOW, test } from '../e2e/fixtures';
import { installSlates } from '../e2e/slates';

const pref = (page: import('@playwright/test').Page) => page.evaluate(() => localStorage.getItem('sift.ui'));

test.beforeEach(async ({ page }) => {
  await installSlates(page.context(), { NBA: 3 }, { now: NOW });
  await page.clock.install({ time: NOW });
});

test('without a flag the root is SIFT 2.0 and v4 is not shown', async ({ page }) => {
  await page.goto('#/');
  await expect(page).toHaveURL(/#\/design\/sift2\/home/);
  await expect(page.locator('[data-v4-shell]')).toHaveCount(0);
  expect(await pref(page)).toBeNull();
});

test('?ui=v4 opens v4; Open in SIFT 2.0 exits cleanly, and the root answers with SIFT 2.0 again; #/v4 re-enters', async ({ page }) => {
  await page.goto('#/?ui=v4');
  await expect(page.locator('[data-v4-shell]')).toBeVisible();
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Signals' }).click();
  await page.getByRole('link', { name: /Open in SIFT 2.0/ }).click();
  await expect(page).toHaveURL(/#\/design\/sift2\/intelligence/);
  expect(await pref(page)).toBeNull();
  await page.goto('#/');
  await expect(page).toHaveURL(/#\/design\/sift2\/home/);
  await expect(page.locator('[data-v4-shell]')).toHaveCount(0);
  await page.goto('#/v4');
  await expect(page.locator('[data-v4-shell]')).toBeVisible();
});

test('a remembered classic choice survives a round trip through v4', async ({ page }) => {
  await page.goto('#/?ui=classic');
  await expect(page.locator('[data-v4-shell]')).toHaveCount(0);
  await page.goto('#/?ui=v4');
  await expect(page.locator('[data-v4-shell]')).toBeVisible();
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Board' }).click();
  await page.getByRole('link', { name: /Open in SIFT 2.0/ }).click();
  expect(await pref(page)).toBe('classic');
  await page.goto('#/');
  await expect(page).not.toHaveURL(/design\/sift2/);
  await expect(page.locator('[data-v4-shell]')).toHaveCount(0);
});
