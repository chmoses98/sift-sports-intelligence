// Start times come from the league schedule (the explorer index), never from Kalshi event metadata. Real documents (the committed `props` fixture family, fixtures/real):
// the game below is the soonest game, inside 48 hours of the family's clock, whose board row and league schedule list the same start (chosen from the
// family's own documents, so the spec follows a refreshed capture). TEST TRANSFORMATION (the real documents agree, so the disagreement is made): the board's
// copy of that game is re-stamped 30 minutes later (what a Kalshi-implied time looks like next to the schedule: docs/sift3/QUOTE_DELIVERY.md). The app
// must show the schedule's time everywhere once the schedule is read, and must never show the shifted one.
import { test, expect, type Page } from '@playwright/test';
import { feedNow, freshQuotes, readFeedCache, useRealFeeds as serveRealFeeds } from './support/realFeeds';
import { fixtureGames, nickname, scheduleStartMs, within, type FxGame } from './support/propsFixture';

const FAMILY = 'props' as const;
test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

const et = (ms: number, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...o }).format(new Date(ms));
/** "8:30" for 8:30 PM Eastern. */
const clock12 = (ms: number) => et(ms, { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?[AP]M$/, '');
const dayKey = (ms: number) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`; };

/** The soonest game inside 48 hours whose schedule start equals its board start. */
async function agreeingGame(): Promise<FxGame> {
  for (const g of within(await fixtureGames(FAMILY), FAMILY, '48h')) if ((await scheduleStartMs(FAMILY, g)) === g.startMs) return g;
  throw new Error('no game inside 48 hours of the props family\'s clock has the same start on its board and in its league schedule');
}

async function setup(page: Page, g: FxGame, o: { shiftBoard: boolean }) {
  await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ onboarded: true })); } catch { /* ignore */ } }); // Home is the landing screen: the first-run welcome sheet would cover it
  await serveRealFeeds(page, { family: FAMILY });
  await freshQuotes(page, { family: FAMILY });
  if (o.shiftBoard) {
    // every board document that lists the game gets the later copy of it; nothing else changes
    const shifted = new Date(g.startMs + 30 * 60_000).toISOString().replace('.000Z', 'Z');
    await page.route(/^https:\/\/raw\.githubusercontent\.com\//, async (route) => {
      const body = await readFeedCache(FAMILY, route.request().url());
      if (!body) return route.fallback();
      let doc: { items?: { event_id: string; start_time_utc: string }[] } | null;
      try { doc = JSON.parse(body.toString('utf8')); } catch { return route.fallback(); }
      const it = doc?.items?.find((x) => x.event_id === g.eventId);
      if (!doc || !Array.isArray(doc.items) || !it) return route.fallback();
      it.start_time_utc = shifted;
      return route.fulfill({ status: 200, body: JSON.stringify(doc), headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
    });
  }
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.clock.setFixedTime(feedNow(FAMILY));
}
const go = async (page: Page, path: string) => { await page.goto(`./#${path}`); await expect(page.locator('[data-v3-shell]')).toBeVisible(); };
const gamesPath = (g: FxGame) => `/v3?sport=${g.slug}&date=${dayKey(g.startMs)}`;

test.describe('start time authority @v3', () => {
  test('control: the real board and schedule agree, and the game card says the scheduled time', async ({ page }) => {
    const g = await agreeingGame();
    await setup(page, g, { shiftBoard: false });
    await go(page, gamesPath(g));
    const card = page.locator('.v3-gc', { hasText: nickname(g.home) }).first();
    await expect(card.locator('.v3-gc__time')).toContainText(clock12(g.startMs), { timeout: 30_000 });
  });

  test('a board that says 30 minutes later (Kalshi-implied) is overruled by the league schedule: the Home card and Game Detail say the scheduled time, the shifted one nowhere', async ({ page }) => {
    const g = await agreeingGame();
    const sched = clock12(g.startMs);
    const later = clock12(g.startMs + 30 * 60_000);
    expect(later, 'the shifted time is a different time').not.toBe(sched);
    const shifted = new RegExp(`${later}\\s?[AP]M`);
    await setup(page, g, { shiftBoard: true });
    await go(page, gamesPath(g));
    const card = page.locator('.v3-gc', { hasText: nickname(g.home) }).first();
    await expect(card.locator('.v3-gc__time')).toContainText(sched, { timeout: 30_000 });
    expect(await card.innerText()).not.toMatch(shifted);
    await go(page, `/v3/game/${g.slug}/${g.eventId}`);
    await expect(page.locator('.v3-gh__when')).toContainText(sched, { timeout: 30_000 });
    expect(await page.locator('[data-v3-shell]').innerText()).not.toMatch(shifted);
  });
});
