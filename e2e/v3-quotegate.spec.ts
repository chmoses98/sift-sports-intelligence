// Milestone 8a: EVERY price goes through the one quote gate, and no freshness text exists anywhere. Real published documents (the disk cache)
// under a pinned browser clock. The cache describes one instant (feedNow()). A price is "fresh" when the live-quote feed's observation times are
// re-stamped to that instant (freshQuotes: a test transformation of timestamps only; every price is the published one) and "old" when the clock is
// moved past the gate's limit for its context (list: 90 s inside two hours of the start, 180 s beyond, 60 s live; exact contract: 30 s / 60 s).
// DAL at PHI (2026-10-27 00:15Z) is the reference game: 50 minutes after the cache's instant, so list limit 90 s and contract limit 30 s.
import { test, expect, type Locator, type Page } from '@playwright/test';
import { feedNow, freshQuotes, useRealFeeds as serveRealFeeds } from './support/realFeeds';

const GAME = '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3';
const GAMES_NFL = '/v3/games?sport=nfl&state=upcoming';
/** Every kind of freshness text the owner ruled out. */
const FRESH = /\bago\b|just now|last known|stale|\baging\b|\bfresh\b|last updated|updated \d|as of \d|published .* ago|\d+\s?(s|sec|min|mins|minutes|h|hr|hours) old\b|\b\d+m\b ago/i;

type Mode = 'fresh' | 'old';
/** `fresh`: observations at the cache instant, clock at the instant plus `plusS`. `old`: the real feed as captured, which is older than every limit. */
async function setup(page: Page, mode: Mode, plusS = 0) {
  await serveRealFeeds(page);
  if (mode === 'fresh') await freshQuotes(page);
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.clock.setFixedTime(new Date(feedNow().getTime() + plusS * 1000));
}
const go = async (page: Page, path: string) => { await page.goto(`./#${path}`); await expect(page.locator('[data-v3-shell]')).toBeVisible(); };
const bodyText = (page: Page) => page.locator('[data-v3-shell]').innerText();
const noFreshness = async (page: Page) => expect(await bodyText(page)).not.toMatch(FRESH);
const box = async (l: Locator) => { const b = await l.boundingBox(); expect(b).not.toBeNull(); return b!; };

const dalCard = (page: Page) => page.locator('.v3-gc', { hasText: 'Cowboys' }).first();
const dialogOf = (page: Page) => page.getByRole('dialog');
/** The unavailable state of the exact-contract sheet: the exact words, Retry, and none of the price-derived rows. */
async function expectUnavailable(page: Page) {
  const dlg = dialogOf(page);
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('[data-state="unavailable"]')).toContainText('Price unavailable right now');
  await expect(dlg.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(dlg.locator('[data-state="price"], [data-state="fee"]')).toHaveCount(0);
  const text = await dlg.innerText();
  expect(text).not.toMatch(/taker fee|break-even|\bask\b|\bbid\b|implied/i);
  expect(text).not.toMatch(FRESH);
}
async function expectPriced(page: Page) {
  const dlg = dialogOf(page);
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('[data-state="price"]')).toContainText(/\d+¢/);
  await expect(dlg.locator('[data-state="fee"]')).toContainText('Fee-aware break-even');
  await expect(dlg.locator('[data-state="unavailable"]')).toHaveCount(0);
  expect(await dlg.innerText()).not.toMatch(FRESH);
}

test.describe('Games: the lines box goes through the list gate @v3', () => {
  test('a current price is shown, tappable, and opens the shared exact-contract sheet with its fee rows', async ({ page }) => {
    await setup(page, 'fresh');
    await go(page, GAMES_NFL);
    const lines = dalCard(page).locator('.v3-lines');
    await expect(lines.locator('em').first()).toContainText(/\d+¢/);
    await expect(lines.locator('em').nth(1)).toContainText(/\d+¢/);
    await noFreshness(page);
    const url = page.url();
    await lines.click();
    await expect(page).toHaveURL(/sheet=contract&tk=KXNFL/);
    await expectPriced(page);
    await expect(dialogOf(page)).toContainText(/DAL at PHI/); // the subtitle names the game: the sheet knows the contract
    await page.keyboard.press('Escape');
    await expect(dialogOf(page)).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(page.url()).toBe(url);
  });

  test('a price older than its limit prints a dash in the same slot, stays tappable, and the sheet says "Price unavailable right now"', async ({ page }) => {
    await setup(page, 'old');
    await go(page, GAMES_NFL);
    const lines = dalCard(page).locator('.v3-lines');
    await expect(lines).toBeVisible();
    await expect(lines.locator('em').first()).toHaveText('—');
    await expect(lines.locator('em').nth(1)).toHaveText('—');
    await expect(lines).not.toContainText('¢');
    await noFreshness(page);
    await lines.click();
    await expect(page).toHaveURL(/sheet=contract&tk=KXNFL/);
    await expectUnavailable(page);
    await page.goBack();
    await expect(dialogOf(page)).toHaveCount(0);
  });

  test('the same observation is shown inside the list limit and withheld just past it, with no change to the box and the tap still opening the sheet', async ({ page }) => {
    await setup(page, 'fresh', 80); // 80 s old: inside 90 s (list), outside 30 s (exact contract)
    await go(page, GAMES_NFL);
    const lines = dalCard(page).locator('.v3-lines');
    await expect(lines.locator('em').first()).toContainText(/\d+¢/);
    const priced = await box(lines);
    const card = await box(dalCard(page));
    // the list shows the price at 80 s; the exact contract (30 s) does not
    await lines.click();
    await expectUnavailable(page);
    await page.goBack();
    await expect(dialogOf(page)).toHaveCount(0);
    await page.clock.setFixedTime(new Date(feedNow().getTime() + 100_000)); // 100 s old: outside the list limit
    await expect(lines.locator('em').first()).toHaveText('—', { timeout: 15_000 });
    await expect(lines.locator('em').nth(1)).toHaveText('—');
    const withheld = await box(lines);
    expect(Math.abs(withheld.width - priced.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(withheld.height - priced.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(withheld.x - priced.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(withheld.y - priced.y)).toBeLessThanOrEqual(1);
    expect(Math.abs((await box(dalCard(page))).height - card.height)).toBeLessThanOrEqual(1); // no layout shift
    await lines.click();
    await expectUnavailable(page);
  });

  test('sample data keeps its labelled prices (sample prices have no observation clock) and the sheet still opens', async ({ page }) => {
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
    await go(page, '/v3/games?demo=1');
    const lines = page.locator('.v3-gc .v3-lines').first();
    await expect(lines).toContainText(/\d+¢/);
    await noFreshness(page);
    await lines.click();
    await expect(dialogOf(page)).toContainText('SAMPLE-');
    await expect(dialogOf(page).locator('[data-state="fee"]')).toContainText('Fee-aware break-even');
    expect(await dialogOf(page).innerText()).not.toMatch(FRESH);
  });
});

test.describe('Home: no price, no freshness text, in either state @v3', () => {
  for (const mode of ['fresh', 'old'] as const) {
    test(`Home with ${mode} quotes carries no freshness text and the featured game has no stale price`, async ({ page }) => {
      await setup(page, mode);
      await go(page, '/v3');
      await expect(page.locator('.v3-feat, .v3-state').first()).toBeVisible();
      await page.waitForTimeout(1500);
      await noFreshness(page);
      await expect(page.locator('.v3-feat')).not.toContainText(/\d+¢/);
    });
  }
  test('Home on sample data prints no age on a story line', async ({ page }) => {
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
    await go(page, '/v3?demo=1');
    await expect(page.getByText("What's happening")).toBeVisible();
    await noFreshness(page);
  });
});

test.describe('Game Detail: win prices, market cards, props and the sheet @v3', () => {
  test('current prices are shown in the win price, the three market cards and the props list; each is a target for the one contract sheet', async ({ page }) => {
    await setup(page, 'fresh');
    await go(page, GAME);
    await expect(page.getByTestId('win-price').locator('.mx-win__t').first()).toContainText(/\d+¢/);
    const cards = page.locator('.v3-mcs .v3-mc');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText(/\d+¢/);
    await expect(cards.nth(1)).toContainText(/\d+¢/);
    await expect(cards.nth(2)).toContainText(/\d+¢.*\d+¢/s);
    await noFreshness(page);
    await expect(page.locator('.v3-mcs__src')).toContainText('Kalshi prediction-market prices.');
    await cards.nth(0).click(); // the Spread card: a ladder of rungs
    await expect(page).toHaveURL(/sheet=contract&tk=KXNFL/);
    await expectPriced(page);
    await expect(dialogOf(page).locator('.v3c-nb')).toContainText('Neighbouring rungs');
    await expect(dialogOf(page).locator('.v3c-nr').first()).toBeVisible();
    // the old Market detail is gone: no "Quote ... ago" row, no Fresh/Aging/Stale word, no "Venue" row
    expect(await dialogOf(page).innerText()).not.toMatch(/\bQuote\b|\bVenue\b|Not a current price/);
    await page.goBack();
    await expect(dialogOf(page)).toHaveCount(0);
    // a props row opens the same sheet
    await go(page, `${GAME}?tab=props`);
    const px = page.locator('.v3-prop__p').first();
    await expect(px).toContainText(/\d+¢/);
    await px.click();
    await expect(page).toHaveURL(/sheet=contract&tk=KXNFL/);
    await expectPriced(page);
    await expect(dialogOf(page).locator('.v3c-nb')).toContainText('over');
  });

  test('old prices: dashes in the same slots, still targets, the sheet says "Price unavailable right now", and the page carries no freshness word', async ({ page }) => {
    await setup(page, 'old');
    await go(page, GAME);
    const win = page.getByTestId('win-price').locator('.mx-win__t');
    await expect(win.first()).toContainText('—');
    await expect(win.first()).toHaveAttribute('data-tap', 'price');
    const cards = page.locator('.v3-mcs .v3-mc');
    await expect(cards).toHaveCount(3);
    for (const i of [0, 1, 2]) { await expect(cards.nth(i)).not.toContainText('¢'); await expect(cards.nth(i)).toContainText('—'); }
    await expect(page.locator('.v3-mcs__src')).not.toContainText(/ago|last|captured/i);
    await noFreshness(page);
    await cards.nth(1).click(); // Total
    await expectUnavailable(page);
    await page.goBack();
    await win.first().click();
    await expectUnavailable(page);
    await page.goBack();
    await go(page, `${GAME}?tab=props`);
    const px = page.locator('.v3-prop__p').first();
    await expect(px).toHaveText('—');
    await noFreshness(page);
    await px.click();
    await expectUnavailable(page);
  });

  test('a price that is current for the list but too old for the exact contract is shown in the list and withheld in the sheet', async ({ page }) => {
    await setup(page, 'fresh', 80);
    await go(page, GAME);
    const cards = page.locator('.v3-mcs .v3-mc');
    await expect(cards.nth(0)).toContainText(/\d+¢/);
    await cards.nth(0).click();
    await expectUnavailable(page);
    await dialogOf(page).getByRole('button', { name: 'Retry' }).click(); // asks again; the feed still answers an 80 s old observation: withheld, never an older price as current
    await expectUnavailable(page);
  });

  test('a deep link to an exact contract works on a game, and the live price is gated with the schedule start', async ({ page }) => {
    await setup(page, 'fresh');
    await go(page, `${GAME}?sheet=contract&tk=KXNFLGAME-26OCT26DALPHI-DAL`);
    await expectPriced(page);
    await expect(dialogOf(page)).toContainText('Dallas Cowboys to win');
  });
});
