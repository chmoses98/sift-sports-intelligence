// Non-tradable markets never show an actionable ask. Real published documents (the disk cache) under the cache's pinned clock, quotes made
// current by re-stamping observation times (freshQuotes: timestamps only). The real live-quote feed DOES carry non-tradable markets: DAL at PHI
// has `inactive` markets (DeVonta Smith receiving-yards ladder and first touchdown, published WITH a yes ask) and `determined` ones. Where a state
// has no real market (closed, settled with an ask) the test says so and CONTROLLED-MODIFIES one real market's feed `status`.
// What must hold on every surface: no ask, bid, implied price, fee or break-even; the list slot prints "—"; the exact-contract sheet says why
// ("Market closed" / "Market settled" / "Trading suspended"), offers no Retry, and the screen's research stays on the page.
import { test, expect, type Page } from '@playwright/test';
import { feedNow, freshQuotes, useRealFeeds as serveRealFeeds } from './support/realFeeds';

const GAME = '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3';
const FRESH = /\bago\b|just now|last known|stale|\baging\b|\bfresh\b|last updated|updated \d|as of \d|\d+\s?(s|sec|min|mins|minutes|h|hr|hours) old\b/i;
/** Real `inactive` markets in the captured DAL at PHI feed (they carry a yes ask in the published file). */
const REAL_INACTIVE = 'KXNFLRECYDS-26OCT26DALPHI-PHIDSMITH6-100';

async function setup(page: Page, status?: (t: string) => string | undefined) {
  await serveRealFeeds(page);
  await freshQuotes(page, { status });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.clock.setFixedTime(feedNow());
}
const go = async (page: Page, path: string) => { await page.goto(`./#${path}`); await expect(page.locator('[data-v3-shell]')).toBeVisible(); };
const dlg = (page: Page) => page.getByRole('dialog');

/** The non-actionable state of the exact-contract sheet: the headline, no Retry, none of the price-derived rows. */
async function expectNotTradable(page: Page, headline: string, status: string) {
  const d = dlg(page);
  await expect(d).toBeVisible();
  const box = d.locator('[data-state="not-tradable"]');
  await expect(box).toContainText(headline);
  await expect(box).toHaveAttribute('data-market-status', status);
  await expect(d.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await expect(d.locator('[data-state="price"], [data-state="fee"], [data-state="unavailable"]')).toHaveCount(0);
  const text = await d.innerText();
  expect(text).not.toMatch(/taker fee|break-even|\bask\b|\bbid\b|implied|Price unavailable/i);
  expect(text).not.toMatch(FRESH);
}

test.describe('the exact-contract sheet for a market that cannot be traded @v3', () => {
  test('REAL inactive market (published with an ask): "Trading suspended", no ask, fee, break-even or Retry', async ({ page }) => {
    await setup(page);
    await go(page, `${GAME}?sheet=contract&tk=${REAL_INACTIVE}`);
    await expectNotTradable(page, 'Trading suspended', 'suspended');
    await expect(dlg(page)).not.toContainText('¢');
  });

  for (const [word, headline, status] of [['closed', 'Market closed', 'closed'], ['determined', 'Market closed', 'closed'], ['settled', 'Market settled', 'settled'], ['finalized', 'Market settled', 'settled'], ['paused', 'Trading suspended', 'suspended']] as const) {
    test(`CONTROLLED MODIFICATION: a real open market whose feed status is "${word}" says "${headline}"`, async ({ page }) => {
      const tk = 'KXNFLGAME-26OCT26DALPHI-DAL';
      await setup(page, (t) => (t === tk ? word : undefined));
      await go(page, `${GAME}?sheet=contract&tk=${tk}`);
      await expectNotTradable(page, headline, status);
    });
  }

  test('the same market with an open status is priced (the control)', async ({ page }) => {
    await setup(page);
    await go(page, `${GAME}?sheet=contract&tk=KXNFLGAME-26OCT26DALPHI-DAL`);
    const d = dlg(page);
    await expect(d.locator('[data-state="price"]')).toContainText(/\d+¢/);
    await expect(d.locator('[data-state="fee"]')).toContainText('Fee-aware break-even');
    await expect(d.locator('[data-state="not-tradable"]')).toHaveCount(0);
  });
});

test.describe('Game Detail lists withhold a non-tradable market and keep the research @v3', () => {
  test('a props row whose market is closed prints "—" in the same slot, opens "Market closed", and its neighbours stay priced', async ({ page }) => {
    await setup(page);
    await go(page, `${GAME}?tab=props`);
    const px = page.locator('.v3-prop__p');
    await expect(px.first()).toContainText(/\d+¢/);
    const rowsBefore = await px.count();
    await px.first().click();
    await expect(page).toHaveURL(/sheet=contract&tk=(KXNFL[A-Z]+-[^&]+)/);
    const tk = /tk=([^&]+)/.exec(page.url())![1];
    await page.keyboard.press('Escape');
    await expect(dlg(page)).toHaveCount(0);
    await page.evaluate((h) => { location.hash = h; }, `${GAME}?tab=props`);
    await expect(page).not.toHaveURL(/sheet=contract/);
    // reload with that one market closed in the feed
    await setup(page, (t) => (t === decodeURIComponent(tk) ? 'closed' : undefined));
    await page.reload();
    await expect(page.locator('[data-v3-shell]')).toBeVisible();
    await expect(px.nth(1)).toContainText(/\d+¢/); // another row is still priced
    await expect(px.first()).toHaveText('—');
    expect(await px.count()).toBe(rowsBefore);
    await expect(px.first()).toHaveAttribute('aria-label', /no price available/);
    await px.first().click();
    await expectNotTradable(page, 'Market closed', 'closed');
    await expect(dlg(page).locator('.v3c-nb')).toContainText('over'); // the ladder stays; the closed rung prints a dash
    await expect(dlg(page).locator('.v3c-nr[aria-pressed="true"] .num')).toHaveText('—');
    await expect(dlg(page).locator('.v3c-nr:not([aria-pressed="true"]) .num').first()).toContainText(/\d+¢|—/);
  });

  test('a game whose every market is non-tradable prints no price anywhere on the Game Detail page', async ({ page }) => {
    await setup(page, () => 'determined');
    await go(page, GAME);
    await page.waitForTimeout(2500);
    expect(await page.locator('[data-v3-shell]').innerText()).not.toMatch(/\d+¢/);
    await expect(page.getByTestId('win-price').locator('.mx-win__t').first()).toContainText('—');
    await go(page, `${GAME}?tab=props`);
    await page.waitForTimeout(1500);
    const px = page.locator('.v3-prop__p');
    for (let i = 0; i < Math.min(await px.count(), 6); i++) await expect(px.nth(i)).toHaveText('—');
  });
});

test.describe('Games and Home never price a non-tradable game @v3', () => {
  test('Games: the lines box of a game whose markets are all closed carries no price', async ({ page }) => {
    await setup(page, () => 'closed');
    await go(page, '/v3/games?sport=nfl&state=upcoming');
    const card = page.locator('.v3-gc', { hasText: 'Cowboys' }).first();
    await expect(card).toBeVisible();
    await page.waitForTimeout(2500);
    await expect(card).not.toContainText('¢');
    expect(await page.locator('[data-v3-shell]').innerText()).not.toMatch(FRESH);
  });
});

// Run with V3_FEED_CACHE=<the props cache>: Prop Discovery's rows come from the props documents. Skips when the cache has no props.
test.describe('Prop Discovery withholds a non-tradable market and keeps the research @v3', () => {
  test.setTimeout(150_000);
  const ready = (page: Page) => page.waitForSelector('.pd-card, .pd-row, .pd-empty', { timeout: 90_000 });
  test('a row whose market is suspended prints "—" in its price pill, the sheet says "Trading suspended" with no Retry, and the research lanes stay', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true })); } catch { /* ignore */ } });
    await setup(page);
    await go(page, '/v3/props?view=list');
    await ready(page);
    await page.waitForTimeout(1200);
    const pill = page.locator('.pd-row .pd-px:not(.is-none)').first();
    test.skip((await pill.count()) === 0, 'no listed prop has a current price in this cache');
    const dest = (await pill.getAttribute('data-dest'))!;
    const tk = decodeURIComponent(/tk=([^&]+)/.exec(dest)![1]);
    const row = page.locator('.pd-row', { has: page.locator(`[data-dest*="${encodeURIComponent(tk)}"], [data-dest*="${tk}"]`) }).first();
    const lanesBefore = await row.locator('.pd-lanes, .pd-lane, .pd-pb').first().innerText();
    // the same page, one market's feed status now says it is suspended (a real feed word)
    await setup(page, (t) => (t === tk ? 'inactive' : undefined));
    await page.reload();
    await ready(page);
    await page.waitForTimeout(1200);
    const same = page.locator(`.pd-row .pd-px[data-dest*="${tk}"]`).first();
    await expect(same).toHaveText(/—/);
    await expect(same).toHaveAttribute('aria-label', /price unavailable right now/);
    expect(await same.innerText()).not.toMatch(/\d+¢/);
    // the research stays: the row still carries its name and statistic line
    expect((await page.locator(`.pd-row:has(.pd-px[data-dest*="${tk}"]) .pd-pb`).first().innerText()).length).toBeGreaterThan(10);
    void lanesBefore;
    await same.click();
    await expectNotTradable(page, 'Trading suspended', 'suspended');
  });
});
