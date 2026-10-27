// Start times come from the league schedule (the explorer index), never from Kalshi event metadata. Real documents (the disk cache): the NHL
// board and explorer both list TOR at CGY at 2026-10-27T00:30Z (8:30 PM ET). TEST TRANSFORMATION (the real documents agree, so the disagreement is
// made): the board's copy of that game is re-stamped to 01:00Z (9:00 PM ET, the time Kalshi's event implies: docs/sift3/QUOTE_DELIVERY.md). The app
// must show the schedule's 8:30 PM everywhere once the schedule is read, and must never show 9:00 PM.
import { test, expect, type Page } from '@playwright/test';
import { feedNow, freshQuotes, readFeedCache, useRealFeeds } from './support/realFeeds';

test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

const TOR_CGY = 'evt_9dcedbe131e7ff4c72d6';
const GAME = `/v3/game/nhl/${TOR_CGY}`;

async function setup(page: Page, o: { shiftBoard: boolean }) {
  await useRealFeeds(page);
  await freshQuotes(page);
  if (o.shiftBoard) {
    // every board document that lists the game gets the 01:00Z copy of it; nothing else changes
    await page.route(/^https:\/\/raw\.githubusercontent\.com\//, async (route) => {
      const body = readFeedCache(route.request().url());
      if (!body) return route.fallback();
      let doc: { items?: { event_id: string; start_time_utc: string }[] } | null = null;
      try { doc = JSON.parse(body.toString('utf8')); } catch { return route.fallback(); }
      const it = doc?.items?.find((x) => x.event_id === TOR_CGY);
      if (!doc || !Array.isArray(doc.items) || !it) return route.fallback();
      it.start_time_utc = '2026-10-27T01:00:00Z';
      return route.fulfill({ status: 200, body: JSON.stringify(doc), headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
    });
  }
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.clock.setFixedTime(new Date(Date.parse('2026-10-26T22:00:00Z')));
  void feedNow();
}
const go = async (page: Page, path: string) => { await page.goto(`./#${path}`); await expect(page.locator('[data-v3-shell]')).toBeVisible(); };

test.describe('start time authority @v3', () => {
  test('control: the real board and schedule agree, and the game card says 8:30 PM', async ({ page }) => {
    await setup(page, { shiftBoard: false });
    await go(page, '/v3/games?sport=nhl&state=today');
    const card = page.locator('.v3-gc', { hasText: 'Flames' });
    await expect(card.locator('.v3-gc__time')).toContainText('8:30', { timeout: 30_000 });
  });

  test('a board that says 9:00 PM (Kalshi-implied) is overruled by the league schedule: Games card and Game Detail say 8:30 PM, nowhere 9:00 PM', async ({ page }) => {
    await setup(page, { shiftBoard: true });
    await go(page, '/v3/games?sport=nhl&state=today');
    const card = page.locator('.v3-gc', { hasText: 'Flames' });
    await expect(card.locator('.v3-gc__time')).toContainText('8:30', { timeout: 30_000 });
    expect(await card.innerText()).not.toMatch(/9:00/);
    await go(page, GAME);
    await expect(page.locator('.v3-gh__when')).toContainText('8:30', { timeout: 30_000 });
    expect(await page.locator('[data-v3-shell]').innerText()).not.toMatch(/9:00\s?PM/);
  });
});
