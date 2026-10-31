// SIFT 3.0 as the default interface of the release build: the root and classic addresses open SIFT 3.0, a refresh keeps them there, the Home Screen launch
// address (`#/`, the manifest's start_url) opens Home, and SIFT 2.0 stays reachable on purpose. Fixtures and the fixed clock are the shared acceptance ones.
import { test, expect, NOW, NEBUF } from '../e2e/fixtures';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ onboarded: true })); } catch { /* storage blocked */ } });
  await page.clock.install({ time: NOW });
});

const ABORTED_FETCH = /\/sift-sports-intelligence\/\S+ due to access control checks/;

test('the root address (the Home Screen launch address) opens SIFT 3.0 Home with the games feed', async ({ page, errors }) => {
  errors.allow(ABORTED_FETCH);
  await page.goto('#/');
  await expect(page).toHaveURL(/#\/v3$/);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Props' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Following' })).toBeVisible();
  await expect(nav.getByRole('link')).toHaveCount(3);
  await page.waitForLoadState('networkidle');
  await page.reload();
  await expect(page).toHaveURL(/#\/v3$/);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
});

const MAPPED: [string, RegExp][] = [
  ['#/games', /#\/v3$/],
  ['#/props', /#\/v3\/props$/],
  ['#/explore', /#\/v3\/search$/],
  [`#/nfl/game/${NEBUF}`, new RegExp(`#/v3/game/nfl/${NEBUF}$`)],
  ['#/mlb', /#\/v3\?sport=mlb$/],
  ['#/status', /#\/v3$/],
];
for (const [from, to] of MAPPED) {
  test(`classic address ${from.replace(NEBUF, '<event>')} opens SIFT 3.0`, async ({ page, errors }) => {
    errors.allow(ABORTED_FETCH);
    await page.goto(from);
    await expect(page).toHaveURL(to);
    await expect(page.locator('[data-v3-shell]')).toBeVisible();
  });
}

test('SIFT 2.0 is a deliberate choice: ?ui=sift2 opens it and remembers it; Settings offers the way back and ?ui=default restores SIFT 3.0', async ({ page, errors }) => {
  errors.allow(ABORTED_FETCH);
  await page.goto('#/?ui=sift2');
  await expect(page).toHaveURL(/#\/design\/sift2\/home$/);
  await page.goto('#/games');
  await expect(page).toHaveURL(/#\/design\/sift2\/games$/);
  await page.goto('#/?ui=default');
  await expect(page).toHaveURL(/#\/v3$/);
  await page.goto('#/v3/settings');
  await expect(page.getByRole('link', { name: 'Open SIFT 2.0' })).toBeVisible();
  await expect(page.getByTestId('build-id')).toContainText('Build');
});
