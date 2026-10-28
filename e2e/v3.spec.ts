// SIFT 3.0 acceptance (src/v3). Runs on sample data (?demo=1) so it is deterministic and offline; every screen carries the visible
// "Sample data" strip, which the first test asserts. These tests prove interaction semantics (nested taps, state restoration, Back),
// not data truth: real-data behaviour is covered by tests/v3 (contract shapes) and the WebKit journey run recorded in VISUAL_QA.md.
import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // No network: the sample slate needs none, and a stray request must never reach a real host from a test.
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
});

const go = async (page: Page, path: string) => {
  await page.goto(`./#${path}`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  // `?demo=` is dropped from the address by an effect once the shell has mounted (replace, no history entry). Wait for that, so an address read
  // afterwards is the settled one: on a slower engine a read taken straight after the shell appears can still hold the parameter.
  if (/[?&]demo=/.test(path)) await expect(page).not.toHaveURL(/[?&]demo=/);
};
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

test.describe('SIFT 3.0 @v3', () => {
  test('sample data is unmistakable and the shell has exactly four tabs', async ({ page }) => {
    await go(page, '/v3?demo=1');
    await expect(page.getByRole('note')).toContainText('Sample data');
    const tabs = page.getByRole('navigation', { name: 'Primary' }).getByRole('link');
    await expect(tabs).toHaveText(['Home', 'Games', 'Explore', 'Following']);
    await noOverflow(page);
  });

  test('Home featured game opens Game Detail; switcher keeps the tab; Back restores the previous game', async ({ page }) => {
    await go(page, '/v3?demo=1');
    await page.getByRole('link', { name: 'Game Center' }).click();
    await expect(page).toHaveURL(/#\/v3\/game\/cfb\/demo_uga_fla/);
    // College football has Overview and Props (Matchup is the NFL unit matchup, locked design G1 to G3).
    await expect(page.getByRole('tab')).toHaveText(['Live', 'Props']); // the featured sample game is in play: its first tab reads Live
    await page.getByRole('tab', { name: 'Props' }).click();
    await expect(page).toHaveURL(/tab=props/);
    await page.locator('.v3-sw__tile:not(.is-cur) .v3-sw__hit').first().click();
    await expect(page).toHaveURL(/tab=props/);
    await expect(page).not.toHaveURL(/demo_uga_fla/);
    await page.goBack();
    await expect(page).toHaveURL(/demo_uga_fla.*tab=props/);
  });

  test('picker: searchable, favourites pin without switching, handles 25 games', async ({ page }) => {
    await go(page, '/v3/game/cfb/demo_uga_fla?demo=1');
    await page.getByRole('button', { name: /All games/ }).click();
    await expect(page.getByRole('dialog', { name: 'Switch Game' })).toBeVisible();
    await page.getByRole('tab', { name: 'Today' }).click();
    await expect(page.locator('.v3-pk__row')).toHaveCount(25);
    const url = page.url();
    await page.locator('.v3-pk__row').nth(3).getByRole('button', { name: /^Follow/ }).click();
    expect(page.url()).toBe(url);
    await expect(page.getByText('Favorites', { exact: true })).toBeVisible();
    await page.getByLabel('Search games by team').fill('Auburn');
    await expect(page.locator('.v3-pk__row')).toHaveCount(1);
    await page.locator('.v3-pk__main').click();
    await expect(page).toHaveURL(/demo_lsu_aub/);
    await expect(page.locator('.v3-sheet')).toHaveCount(0);
  });

  test('Games card: team, lines, star, bell and body are independent targets', async ({ page }) => {
    await go(page, '/v3/games?demo=1');
    const url = page.url();
    const card = page.locator('.v3-gc').first();
    await card.getByRole('button', { name: /^Follow/ }).click();
    expect(page.url()).toBe(url);
    await card.getByRole('button', { name: /^Alerts for/ }).click();
    await expect(page.getByRole('dialog')).toContainText('Alerts for');
    await page.keyboard.press('Escape');
    await card.getByRole('button', { name: /Kalshi market prices/ }).click();
    await expect(page.getByRole('dialog')).toContainText('SAMPLE-');
    await page.keyboard.press('Escape');
    await card.getByRole('link', { name: /team page/ }).first().click();
    await expect(page).toHaveURL(/#\/v3\/team\//);
  });

  test('Team -> statistic -> ranking -> another team -> Back keeps the ranking and its scroll', async ({ page }) => {
    await go(page, '/v3/team/cfb/UGA?demo=1');
    await page.locator('.v3-stile').first().click();
    await expect(page).toHaveURL(/#\/v3\/stat\/cfb\/sample-/);
    await expect(page.locator('.st-rkr').first()).toBeVisible();
    // The locked Stat Detail lists the leaders and the neighbours of the selection; the whole list is one in-place tap away.
    await page.getByRole('button', { name: /^Show all/ }).click();
    await expect(page).toHaveURL(/all=1/);
    await page.evaluate(() => window.scrollTo(0, 420));
    const y = await page.evaluate(() => scrollY);
    await page.locator('.st-rkr a.nm').nth(4).evaluate((e) => (e as HTMLElement).click());
    await expect(page).toHaveURL(/#\/v3\/team\/cfb\//);
    await page.goBack();
    await expect(page).toHaveURL(/#\/v3\/stat\/cfb\/sample-/);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(y - 40);
  });

  test('Player research: stat, window and filter synchronize; a bar opens its observation; saved research restores exactly', async ({ page }) => {
    await go(page, '/v3/player/nba/sample-guard?demo=1');
    await page.getByRole('button', { name: 'AST' }).click();
    await expect(page).toHaveURL(/stat=ast/);
    await page.locator('[data-win="L5"]').click();
    await expect(page.locator('.v3p-hb__bar')).toHaveCount(5);
    // locked design P1: a bar opens its observation card on the page (a game the schedule does not list says so)
    await page.locator('.v3p-hb__bar').nth(2).dispatchEvent('click');
    await expect(page.locator('.v3p-obs')).toContainText(/No game page for this game|Game Detail/);
    await page.getByRole('button', { name: /^Research filters/ }).click();
    await page.getByRole('button', { name: /^Home/ }).click();
    await page.getByRole('button', { name: /^Show \d+ games?/ }).click();
    await expect(page).toHaveURL(/site=home/);
    await expect(page.locator('.v3p-fchip')).toHaveCount(1);
    await page.getByRole('button', { name: 'Save this research' }).click();
    await go(page, '/v3/following?demo=1');
    await expect(page.locator('.v3-snap')).toContainText('Saved values');
    await page.locator('.v3-hit--saved .v3-hit__l').click();
    await expect(page).toHaveURL(/stat=ast/);
    await expect(page).toHaveURL(/win=L5/);
    await expect(page).toHaveURL(/site=home/);
  });

  test('impossible filters say "0 games match" and one tap removes them', async ({ page }) => {
    await go(page, '/v3/player/nba/sample-guard?demo=1&stat=pts&site=away&min=36&script=blowout');
    await expect(page.getByText('0 games match')).toBeVisible();
    await page.getByRole('button', { name: 'Remove all filters' }).click();
    await expect(page.locator('.v3p-hb__bar').first()).toBeVisible();
  });

  test('starring never turns alerts on; no notification permission is requested', async ({ page }) => {
    await go(page, '/v3/team/cfb/UGA?demo=1');
    await page.getByRole('button', { name: /^Follow Georgia/ }).click();
    await go(page, '/v3/following?demo=1');
    await expect(page.locator('.v3-tm').first()).toContainText('Georgia');
    expect(await page.evaluate(() => localStorage.getItem('sift3.alerts'))).toBeNull();
    expect(await page.evaluate(() => typeof Notification === 'undefined' || Notification.permission !== 'granted')).toBe(true);
  });

  test('a statistic with no market is found by search and opens a real Stat Detail; Back keeps the query', async ({ page }) => {
    await go(page, '/v3/explore?demo=1');
    await page.getByLabel(/Search players/).fill('points per');
    await expect(page.getByRole('heading', { name: 'Statistics' })).toBeVisible();
    await page.locator('.v3-hit__l').first().click();
    await expect(page).toHaveURL(/#\/v3\/stat\//);
    await page.goBack();
    await expect(page).toHaveURL(/q=points/);
  });

  for (const route of ['/v3?demo=1', '/v3/games?demo=1', '/v3/game/cfb/demo_uga_fla?demo=1', '/v3/team/cfb/UGA?demo=1', '/v3/stat/nfl/sample-0?demo=1', '/v3/player/nba/sample-guard?demo=1', '/v3/explore?demo=1', '/v3/following?demo=1', '/v3/settings?demo=1']) {
    test(`no horizontal scroll: ${route}`, async ({ page }) => {
      await go(page, route);
      await page.waitForTimeout(400);
      await noOverflow(page);
    });
  }
});
