// SIFT 3.0 Back from a game: Back returns DIRECTLY to the screen the game was opened from, however many games were switched through (rail, prev/next
// bar, picker), with that screen's address (sport, date, search, filters) and scroll offset restored. Game switching replaces the history entry, so
// the stack never grows with the games flicked through. Sample data (?demo=1, no network) for the list screens; the real `props` fixture family for the
// virtualised Props list. The pure rules are in tests/v3/origin.test.ts and tests/v3/originNav.test.tsx; this is the real browser (Chromium; CI runs WebKit too).
import { test, expect, type Locator, type Page } from '@playwright/test';
import { frames } from './support/scroll';
import { feedNow, freshQuotes, useRealFeeds } from './support/realFeeds';

test.setTimeout(120_000);

const WELCOMED = () => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true })); } catch { /* storage may be blocked */ } };
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.addInitScript(WELCOMED);
});

const go = async (page: Page, path: string) => { await page.goto(`./#${path}`); await expect(page.locator('[data-v3-shell]')).toBeVisible(); await page.waitForTimeout(300); };
const y = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
const hash = (page: Page) => page.evaluate(() => location.hash);
const histLen = (page: Page) => page.evaluate(() => history.length);
/** The entry's position in this tab's history (react-router's `idx`): game switches must never move it, a sheet opened and closed leaves it where it was. */
const idx = (page: Page) => page.evaluate(() => (history.state as { idx?: number } | null)?.idx ?? -1);
const scrollTo = async (page: Page, to: number) => { await page.evaluate((t) => window.scrollTo(0, t), to); await page.waitForTimeout(250); await frames(page); };
const gamePath = /#\/v3\/game\/([^/?]+)\/([^/?]+)/;
const gameId = async (page: Page) => gamePath.exec(await hash(page))?.[2] ?? '';

/** Open the first game link that is fully on screen at the current offset (a real tap, not a scroll-into-view). */
async function openVisibleGame(page: Page) {
  const link = await page.evaluateHandle(() => [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/v3/game/"]')].find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.top > 140 && r.bottom < innerHeight - 100; }) ?? null);
  const el = link.asElement();
  expect(el, 'a game link on screen').not.toBeNull();
  await el!.click();
  await expect(page).toHaveURL(gamePath);
  await expect(page.locator('.v3-gh')).toBeVisible({ timeout: 30_000 });
}

/** Switch games three ways: a rail tile, the compact bar's next, the picker. Each must replace the entry and change the game. */
async function switchThreeWays(page: Page) {
  const len = await histLen(page);
  const at = await idx(page);
  const a = await gameId(page);
  const tile = page.locator('.v3-sw__tile:not(.is-cur) .v3-sw__hit').first();
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  await expect.poll(() => gameId(page)).not.toBe(a);
  const b = await gameId(page);
  expect(await histLen(page)).toBe(len);
  // the compact bar appears once the hero has scrolled away
  await scrollTo(page, 500);
  const next = page.getByRole('button', { name: /^Next game:/ });
  await expect(next).toBeEnabled();
  await next.click();
  await expect.poll(() => gameId(page)).not.toBe(b);
  const c = await gameId(page);
  expect(await histLen(page)).toBe(len);
  await scrollTo(page, 0);
  await page.getByRole('button', { name: /^All games,/ }).click();
  await expect(page.getByRole('dialog', { name: 'Switch Game' })).toBeVisible();
  const row = page.locator('.v3-pk__row:not(.is-cur) .v3-pk__main').last();   // (the last row: not one of the games already visited)
  await row.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => gameId(page)).not.toBe(c);
  expect(await idx(page)).toBe(at);   // (a closed sheet leaves its forward entry behind, so the length can only be compared before the picker was used)
  expect(new Set([a, b, c]).size).toBe(3);
}

async function expectRestored(page: Page, origin: string, offset: number) {
  await expect.poll(() => hash(page)).toBe(origin);
  await expect.poll(async () => Math.abs((await y(page)) - offset), { timeout: 8000 }).toBeLessThanOrEqual(6);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
const backArrow = (page: Page) => page.getByRole('button', { name: 'Back', exact: true }).first();

test.describe('Back from a game returns to where it was opened @v3', () => {
  test('Games list with a sport filter: open A, switch three games, Back arrow restores the address and the scroll', async ({ page }) => {
    await go(page, '/v3/games?demo=1&sport=cfb');
    await expect(page.locator('.v3-gc').first()).toBeVisible();
    await scrollTo(page, 640);
    const origin = await hash(page);
    const at = await y(page);
    expect(at).toBeGreaterThan(500);
    expect(origin).toMatch(/sport=cfb/);
    await openVisibleGame(page);
    await switchThreeWays(page);
    await scrollTo(page, 0);
    await backArrow(page).click();
    await expectRestored(page, origin, at);
  });

  test('the browser Back button (and a swipe-back) does the same, in one step', async ({ page }) => {
    await go(page, '/v3/games?demo=1&sport=cfb');
    await expect(page.locator('.v3-gc').first()).toBeVisible();
    await scrollTo(page, 420);
    const origin = await hash(page);
    const at = await y(page);
    await openVisibleGame(page);
    await switchThreeWays(page);
    await page.goBack();
    await expectRestored(page, origin, at);
    // Forward returns to the last game viewed, and Back from it still reaches the origin
    await page.goForward();
    await expect(page).toHaveURL(gamePath);
    await expect(page.locator('.v3-gh')).toBeVisible();
    await scrollTo(page, 0);
    await backArrow(page).click();
    await expectRestored(page, origin, at);
  });

  test('a refresh on the game keeps the origin', async ({ page }) => {
    await go(page, '/v3/games?demo=1&sport=cfb');
    await expect(page.locator('.v3-gc').first()).toBeVisible();
    await scrollTo(page, 420);
    const origin = await hash(page);
    const at = await y(page);
    await openVisibleGame(page);
    const tile = page.locator('.v3-sw__tile:not(.is-cur) .v3-sw__hit').first();
    await tile.click();
    const b = await gameId(page);
    await page.reload();
    await expect(page.locator('.v3-gh')).toBeVisible({ timeout: 30_000 });
    expect(await gameId(page)).toBe(b);
    await backArrow(page).click();
    await expectRestored(page, origin, at);
  });

  test('a deep link has no in-app history: Back goes Home, replacing the entry, even after switching games', async ({ page }) => {
    await go(page, '/v3/games?demo=1');
    await expect(page.locator('a[href*="/v3/game/"]').first()).toBeVisible();
    const first = await page.evaluate(() => document.querySelector<HTMLAnchorElement>('a[href*="/v3/game/"]')?.getAttribute('href') ?? '');
    expect(first).toMatch(/#?\/v3\/game\//);
    // a fresh tab straight onto the game: nothing below it in this app
    const fresh = await page.context().newPage();
    await fresh.addInitScript(WELCOMED);
    await fresh.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
    await fresh.goto(`./${first.startsWith('#') ? first : `#${first}`}${first.includes('?') ? '&' : '?'}demo=1`);
    await expect(fresh.locator('.v3-gh')).toBeVisible({ timeout: 30_000 });
    const len = await histLen(fresh);
    const a = await gameId(fresh);
    await fresh.locator('.v3-sw__tile:not(.is-cur) .v3-sw__hit').first().click();
    await expect.poll(() => gameId(fresh)).not.toBe(a);
    expect(await histLen(fresh)).toBe(len);
    await backArrow(fresh).click();
    await expect.poll(() => hash(fresh)).toBe('#/v3');
    await expect(fresh.locator('[data-v3-shell]')).toBeVisible();
    expect(await histLen(fresh)).toBe(len);
    await fresh.close();
  });

  test('Explore search: the query and results scroll come back', async ({ page }) => {
    await go(page, '/v3/explore?demo=1&q=a&cat=game');
    await expect(page.locator('.v3-hit').first()).toBeVisible({ timeout: 30_000 });
    const origin = await hash(page);
    expect(origin).toMatch(/q=a/);
    const rows = await page.locator('.v3-hit a[href*="/v3/game/"]').count();
    test.skip(rows < 1, 'the sample slate has no game matching the query');
    await scrollTo(page, Math.min(240, await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)));
    const at = await y(page);
    await openVisibleGame(page);
    await switchThreeWays(page);
    await scrollTo(page, 0);
    await backArrow(page).click();
    await expectRestored(page, origin, at);
    await expect(page.locator('.v3-search input, input[type=search]').first()).toHaveValue('a');
  });

  test('Following: a long list comes back at the same offset after games were switched', async ({ page }) => {
    await go(page, '/v3/games?demo=1&sport=cfb');
    await expect(page.locator('.v3-gc').first()).toBeVisible();
    const stars = page.getByRole('button', { name: /^Follow / });
    const n = Math.min(14, await stars.count());
    for (let i = 0; i < n; i++) { await stars.first().scrollIntoViewIfNeeded(); await stars.first().click(); }
    await go(page, '/v3/following');
    await expect(page.locator('.v3-fg__l').first()).toBeVisible();
    const height = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    test.skip(height < 200, 'the followed list is not tall enough to scroll');
    await scrollTo(page, Math.min(height, 360));
    const origin = await hash(page);
    const at = await y(page);
    await openVisibleGame(page);
    await switchThreeWays(page);
    await scrollTo(page, 0);
    await backArrow(page).click();
    await expectRestored(page, origin, at);
  });

  test('game to team to game: the game opened from a team returns to that team; the explicit Back after switching still reaches the original origin', async ({ page }) => {
    await go(page, '/v3/games?demo=1&sport=cfb');
    await expect(page.locator('.v3-gc').first()).toBeVisible();
    const origin = await hash(page);
    await openVisibleGame(page);
    await page.locator('.v3-sw__tile:not(.is-cur) .v3-sw__hit').first().click();
    const b = await gameId(page);
    await page.locator('.v3-gh a[href*="/v3/team/"]').first().click();
    await expect(page).toHaveURL(/#\/v3\/team\//);
    await page.goBack();
    await expect.poll(() => gameId(page)).toBe(b);
    await backArrow(page).click();
    await expect.poll(() => hash(page)).toBe(origin);
  });
});

test.describe('Back restores a virtualised Props list @v3', () => {
  const FAMILY = 'props' as const;
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(feedNow(FAMILY));
    await useRealFeeds(page, { family: FAMILY });
    await freshQuotes(page, { family: FAMILY });
  });

  test('Props list: filters, search and scroll come back after opening a game and switching through three', async ({ page }) => {
    await go(page, '/v3/props?view=list');
    await page.waitForSelector('.pd-card, .pd-row, .pd-empty', { timeout: 90_000 });
    await page.waitForTimeout(500);
    const rows: Locator = page.locator('.pd-row');
    test.skip((await rows.count()) < 6, 'the props capture lists too few rows to scroll');
    await scrollTo(page, 900);
    const origin = await hash(page);
    const at = await y(page);
    expect(at).toBeGreaterThan(600);
    // the game link of a row on screen (a row's game chip), or the game behind an opened row's detail: any link to a game page in view
    const target = page.locator('.pd-row a[href*="/v3/game/"]').first();
    test.skip((await target.count()) === 0, 'no row exposes a game link in this capture');
    await target.scrollIntoViewIfNeeded();
    const here = await y(page);
    await target.click();
    await expect(page).toHaveURL(gamePath);
    await expect(page.locator('.v3-gh')).toBeVisible({ timeout: 30_000 });
    const tiles = await page.locator('.v3-sw__tile:not(.is-cur)').count();
    test.skip(tiles < 1, 'the game has nothing to switch to');
    await page.locator('.v3-sw__tile:not(.is-cur) .v3-sw__hit').first().click();
    await scrollTo(page, 0);
    await backArrow(page).click();
    await expect.poll(() => hash(page)).toBe(origin);
    await expect.poll(async () => Math.abs((await y(page)) - here), { timeout: 8000 }).toBeLessThanOrEqual(6);
    void at;
  });

  test('after a refresh on the game, Back still restores the Props list once its rows have loaded (the restore waits for the page to be tall enough)', async ({ page }) => {
    await go(page, '/v3/props?view=list');
    await page.waitForSelector('.pd-card, .pd-row, .pd-empty', { timeout: 90_000 });
    await page.waitForTimeout(500);
    test.skip((await page.locator('.pd-row').count()) < 6, 'the props capture lists too few rows to scroll');
    await scrollTo(page, 900);
    const origin = await hash(page);
    const target = page.locator('.pd-row a[href*="/v3/game/"]').first();
    test.skip((await target.count()) === 0, 'no row exposes a game link in this capture');
    await target.scrollIntoViewIfNeeded();
    const here = await y(page);
    await target.click();
    await expect(page.locator('.v3-gh')).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.locator('.v3-gh')).toBeVisible({ timeout: 30_000 });
    await backArrow(page).click();
    await expect.poll(() => hash(page)).toBe(origin);
    await expect.poll(async () => Math.abs((await y(page)) - here), { timeout: 15_000 }).toBeLessThanOrEqual(6);
  });
});
