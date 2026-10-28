// Saved research never keeps a frozen price: a saved card carries the address and the research setup, never a price, and reopening it reads
// the CURRENT qualifying quote from the live store through the quote gate (a price that is not current is withheld as "—"). Real documents:
// the Player group reads the `player` fixture family and the Props group the `game` family (its list has priced rows) (fixtures/real; never merged).
// The live-quote feed is the only thing changed between saving and reopening (every ask +3 cents, a TEST TRANSFORMATION): if anything had
// been frozen at save time, the reopened screen would show the old number.
import { test, expect, type Page } from '@playwright/test';
import { feedNow, freshQuotes, readFeedCache, useRealFeeds as serveRealFeeds } from './support/realFeeds';
import { PAGE_NOW, CAPTURED_AT, usePlayerFeeds } from './support/playerFeeds';

test.setTimeout(150_000);
test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

const FEED = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/sift-sports-intelligence\/live-quotes\/games\/[^/]+\.json/;
const PRICE_IN_STORAGE = /¢|\bask\b|\bodds\b|\bbid\b|implied/i;

/** Every ask in the live-quote feed moved by `bump` cents and stamped `at` (re-registered routes win). */
async function movableFeed(page: Page, family: 'player' | 'game', at: () => string, bump: () => number) {
  await page.route(FEED, async (route) => {
    const body = await readFeedCache(family, route.request().url());
    if (!body) return route.fallback();
    const doc = JSON.parse(body.toString('utf8')) as { generated_at?: string; markets: Record<string, unknown>[] };
    doc.generated_at = at();
    doc.markets = doc.markets.map((m) => {
      const ask = Number(m.yes_ask_dollars);
      return { ...m, observed_at: at(), ...(Number.isFinite(ask) && ask > 0 && ask < 0.95 ? { yes_ask_dollars: (ask + bump() / 100).toFixed(4) } : {}) };
    });
    return route.fulfill({ status: 200, body: JSON.stringify(doc), headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
  });
}
const savedJson = (page: Page) => page.evaluate(() => localStorage.getItem('sift3.saved') ?? '[]');
const hold = (page: Page) => page.waitForTimeout(600);
/** The Over price once it has stopped changing: the card can show one document's ask first and the live-quote document's a moment later, and "the price on screen" is the later one. */
async function settledOverPrice(page: Page): Promise<number> {
  const read = async () => Number(/Over (\d+)¢/.exec(await page.locator('.v3p-dl__r .p').first().innerText())?.[1]);
  let last = await read();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(700);
    const now = await read();
    if (now === last && Number.isFinite(now)) return now;
    last = now;
  }
  throw new Error(`the Over price never settled (last read ${last})`);
}
/** The reference player's Over price, once the live-quote document has answered (it can arrive after the chart is drawn); false only when it never carries one. */
const hasOverPrice = (page: Page) => expect(page.locator('.v3p-dl__r .p').first()).toHaveText(/Over \d+¢/, { timeout: 20_000 }).then(() => true, () => false);

test.describe('saved Player research reopens with the current quote @v3', () => {
  const LAMB = '/v3/player/nfl/prt_4c661ae8b854ff5f66dd';
  let bump = 0;
  test.beforeEach(async ({ page }) => {
    bump = 0;
    await usePlayerFeeds(page); // pins the clock at PAGE_NOW and stamps the captured documents
    await movableFeed(page, 'player', () => CAPTURED_AT, () => bump);
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
    await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true })); } catch { /* ignore */ } });
  });

  test('the saved record and its card carry no price; reopening shows the NEW ask from the store, not the one on screen when it was saved', async ({ page }) => {
    await page.goto(`./#${LAMB}?win=L5`);
    await expect(page.locator('.v3p-hb').first()).toBeVisible({ timeout: 40_000 });
    test.skip(!(await hasOverPrice(page)), 'the reference player has no current price in this cache');
    const before = await settledOverPrice(page);
    await page.getByRole('button', { name: 'Save this research' }).first().click();
    const raw = await savedJson(page);
    expect(JSON.parse(raw)).toHaveLength(1);
    expect(raw).not.toMatch(PRICE_IN_STORAGE);
    // the saved card on Following shows the setup and no price
    await page.goto('./#/v3/following');
    const card = page.locator('.v3-hit--saved').first();
    await expect(card).toBeVisible();
    expect(await card.innerText()).not.toMatch(PRICE_IN_STORAGE);
    // the market moved by +3 cents while it was saved
    bump = 3;
    await page.reload();
    await page.locator('.v3-hit--saved .v3-hit__l').first().click();
    await expect(page.locator('.v3p-dl__r .p').first()).toHaveText(new RegExp(`Over ${before + 3}¢`), { timeout: 40_000 });
    await expect(page.locator('.v3p-dl__r .p').first()).not.toHaveText(new RegExp(`Over ${before}¢`));
  });

  test('reopened when no current quote can be had, the price is withheld ("—"), never the saved or an old one', async ({ page }) => {
    await page.goto(`./#${LAMB}?win=L5`);
    await expect(page.locator('.v3p-hb').first()).toBeVisible({ timeout: 40_000 });
    test.skip(!(await hasOverPrice(page)), 'the reference player has no current price in this cache');
    await page.getByRole('button', { name: 'Save this research' }).first().click();
    // three hours later: every observation in the documents is older than the gate allows
    await page.clock.setFixedTime(PAGE_NOW + 3 * 3600_000);
    await page.goto('./#/v3/following');
    await page.reload();
    await page.locator('.v3-hit--saved .v3-hit__l').first().click();
    await expect(page.locator('.v3p-hb').first()).toBeVisible({ timeout: 40_000 });
    await hold(page);
    await expect(page.locator('.v3p-dl__r .p').first()).toHaveText(/Over —/);
    expect(await page.locator('[data-v3-shell]').innerText()).not.toMatch(/Over \d+¢/);
  });
});

test.describe('saved Prop Discovery views reopen with current quotes @v3', () => {
  let bump = 0;
  test.beforeEach(async ({ page }) => {
    bump = 0;
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
    await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true })); } catch { /* ignore */ } });
    await page.clock.setFixedTime(feedNow('game'));
    await serveRealFeeds(page, { family: 'game' });
    await freshQuotes(page, { family: 'game' });
    await movableFeed(page, 'game', () => feedNow('game').toISOString(), () => bump);
  });
  const ready = (page: Page) => page.waitForSelector('.pd-card, .pd-row, .pd-empty', { timeout: 90_000 });
  const firstPrice = (page: Page) => page.locator('.pd-row .pd-pp, .pd-row [data-tap="price"]').first();

  test('a saved list view stores the address only; reopened, its prices are read from the store now (+3 cents shows), and an old quote prints "—"', async ({ page }) => {
    await page.goto('./#/v3/props?view=list');
    await ready(page);
    test.skip((await page.locator('.pd-row').count()) === 0, 'no props in this cache');
    await page.waitForTimeout(800);
    const priced = page.locator('.pd-row', { has: page.locator('text=/\\d+¢/') }).first();
    test.skip((await priced.count()) === 0, 'no current price on a listed prop in this cache');
    const id = await priced.getAttribute('data-prop');
    const text0 = await priced.innerText();
    const before = Number(/(\d+)¢/.exec(text0)![1]);
    await page.getByRole('button', { name: 'Save this view' }).click();
    const raw = await savedJson(page);
    expect(raw).not.toMatch(PRICE_IN_STORAGE);
    expect(JSON.parse(raw)[0].route).toMatch(/^\/v3\/props/);
    bump = 3;
    await page.goto('./#/v3/following');
    await page.reload();
    await page.locator('.v3-hit--saved .v3-hit__l').first().click();
    await ready(page);
    await page.waitForTimeout(800);
    const again = page.locator(`.pd-row[data-prop="${id}"]`);
    await expect(again.first()).toContainText(new RegExp(`${before + 3}¢`), { timeout: 20_000 });
    // an old quote: the same saved view, observations older than the gate allows, prints dashes and no cents
    await page.clock.setFixedTime(feedNow('game').getTime() + 600_000); // ten minutes on: the games are still ahead, every observation is older than any list limit
    await page.reload();
    await ready(page);
    await page.waitForTimeout(800);
    expect(await page.locator('.pd-row').count()).toBeGreaterThan(0);
    expect(await page.locator('.pd-row').first().innerText()).not.toMatch(/\d+¢/);
    void firstPrice;
  });
});
