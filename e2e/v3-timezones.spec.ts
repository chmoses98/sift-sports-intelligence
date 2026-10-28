// Game times in the viewer's real local time zone. Each context pins a browser `timezoneId` and a fixed clock (the schedule is UTC; the
// sandbox is UTC; neither may stand in for the viewer). Real-document tests read the captured published slate on its captured instant
// (the committed `game` fixture family, fixtures/real; its clock pin); the sample-data tests need no network. Unit coverage of the module is tests/v3/time.test.ts.
//
// DAL at PHI starts 2026-10-27T00:15:00Z. In a UTC sandbox that reads "Tue 12:15 AM"; for a New York viewer it is Monday 8:15 PM, today.
import { test, expect, type Locator, type Page } from '@playwright/test';
import { feedNow, useRealFeeds as answerWithRealFeeds } from './support/realFeeds';

const FAMILY = 'game' as const; // the committed `game` fixture family (fixtures/real)

test.setTimeout(120_000);
test.describe.configure({ mode: 'parallel' });
const plain = (s: string | null) => (s ?? '').replace(/\s/g, ' ').trim();

// What the captured start 2026-10-27T00:15:00Z is for a viewer on the captured evening (fixed clock 2026-10-26T23:25:00Z).
const ZONES = [
  { zone: 'America/New_York', clock: '8:15 PM', word: 'Today', todayList: true },
  { zone: 'America/Chicago', clock: '7:15 PM', word: 'Today', todayList: true },
  { zone: 'America/Los_Angeles', clock: '5:15 PM', word: 'Today', todayList: true },
  { zone: 'Europe/London', clock: '12:15 AM', word: 'Tomorrow', todayList: false },
  { zone: 'Pacific/Auckland', clock: '1:15 PM', word: 'Today', todayList: true },
] as const;

async function boot(page: Page, o: { now?: Date; demo?: boolean } = {}) {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ onboarded: true })); } catch { /* */ } });
  await page.clock.setFixedTime(o.now ?? feedNow(FAMILY));
  if (!o.demo) await answerWithRealFeeds(page, { family: FAMILY });
}
const go = async (page: Page, path: string, ready: string) => {
  await page.goto(`./#${path}`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  await page.waitForSelector(ready, { timeout: 30_000 });
};
/**
 * Tap the card's body: the stretched link behind the card's other targets (team, lines, star, bell). Its centre can sit under the lines box on a narrow phone (an iPhone SE is
 * 375 wide), where a centre click would be received by that button, so tap a point the link itself receives.
 */
async function tapCardBody(card: Locator) {
  const hit = card.locator('.v3-gc__hit');
  await hit.scrollIntoViewIfNeeded();
  const at = await hit.evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (const fy of [0.5, 0.3, 0.7, 0.15, 0.85, 0.08, 0.92]) for (const fx of [0.5, 0.3, 0.7, 0.12, 0.88, 0.04, 0.96]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (document.elementFromPoint(x, y) === el) return { x: r.width * fx, y: r.height * fy };
    }
    return null;
  });
  expect(at, 'a point of the card body that its own link receives').not.toBeNull();
  await hit.click({ position: at! });
}
const dalCard = (page: Page) => page.locator('article.v3-gc', { has: page.locator('.v3-gc__hit') }).filter({ has: page.locator(`.v3-gc__hit[aria-label^="Dallas Cowboys at Philadelphia Eagles"]`) });

test.describe('the captured slate (real documents) in real viewer zones', () => {
  test('the captured instant is the one the cache describes', () => {
    expect(feedNow(FAMILY).toISOString()).toBe('2026-10-26T23:25:00.000Z');
  });

  for (const z of ZONES) {
    test.describe(z.zone, () => {
      test.use({ timezoneId: z.zone, locale: 'en-US' });

      test(`Games: DAL at PHI reads ${z.clock} and is ${z.todayList ? 'listed under Today' : 'not listed under Today'}`, async ({ page }) => {
        await boot(page);
        await go(page, '/v3/games?sport=nfl', '.v3-gclist .v3-gc');
        const here = dalCard(page);
        if (z.todayList) {
          await expect(here).toHaveCount(1);
          expect(plain(await here.locator('.v3-gc__time, .v3-gc__live').first().textContent())).toContain(z.clock);
          expect(plain(await here.locator('.v3-gc__hit').getAttribute('aria-label'))).toContain(`, ${z.clock}. Open game`);
        } else {
          await expect(here).toHaveCount(0); // it is tomorrow's game for this viewer
          // The date picker names the day the viewer is looking at, and the next day lists the game with its local clock time.
          await expect(page.getByRole('button', { name: /Choose a date\. Showing Today/ })).toBeVisible();
          await go(page, '/v3/games?sport=nfl&date=2026-10-27', '.v3-gclist .v3-gc');
          await expect(dalCard(page)).toHaveCount(1);
          expect(plain(await dalCard(page).locator('.v3-gc__time, .v3-gc__live').first().textContent())).toContain(z.clock);
        }
      });

      test(`Game Detail: DAL at PHI reads "${z.word} · ${z.clock}"`, async ({ page }) => {
        await boot(page);
        await go(page, `/v3/games?sport=nfl${z.todayList ? '' : '&date=2026-10-27'}`, '.v3-gclist .v3-gc');
        await tapCardBody(dalCard(page));
        await expect(page.locator('.v3-gh__when')).toContainText(z.clock, { timeout: 20_000 });
        expect(plain(await page.locator('.v3-gh__when').textContent())).toContain(`${z.word} · ${z.clock}`);
      });

      test(`Prop Discovery: DAL at PHI rows read ${z.word === 'Today' ? z.clock : `Tue ${z.clock}`}`, async ({ page }) => {
        await boot(page);
        await go(page, '/v3/props?v=1&view=list&sport=nfl', '.pd-row');
        const row = page.locator('.pd-row', { hasText: /DAL at PHI|PHI at DAL/ }).first();
        await expect(row).toBeVisible({ timeout: 30_000 });
        const want = z.word === 'Today' ? z.clock : `Tue ${z.clock}`; // tomorrow is named by its weekday in a row
        expect(plain(await row.textContent())).toMatch(new RegExp(`DAL at PHI · ${want.replace(/\s/g, '\\s')}`));
      });
    });
  }
});

// DAL at PHI is 2026-10-27T00:15:00Z: New York midnight is 04:00Z (EDT), Chicago midnight 05:00Z (CDT). Whether the game is on the viewer's "Today" list
// flips exactly at the viewer's own midnight, whatever the UTC date says.
const MIDNIGHT = [
  { zone: 'America/New_York', now: '2026-10-27T03:30:00Z', local: 'Mon 11:30 PM', onToday: true },
  { zone: 'America/New_York', now: '2026-10-27T04:30:00Z', local: 'Tue 12:30 AM', onToday: false },
  { zone: 'America/Chicago', now: '2026-10-27T04:30:00Z', local: 'Mon 11:30 PM', onToday: true },
  { zone: 'America/Chicago', now: '2026-10-27T05:30:00Z', local: 'Tue 12:30 AM', onToday: false },
] as const;
test.describe('local midnight is the day boundary (real documents)', () => {
  for (const m of MIDNIGHT) {
    test.describe(`${m.zone} at ${m.now}`, () => {
      test.use({ timezoneId: m.zone, locale: 'en-US' });
      test(`it is ${m.local} locally: the game is ${m.onToday ? 'still on Today' : 'on Yesterday, not Today'}`, async ({ page }) => {
        await boot(page, { now: new Date(m.now) });
        await go(page, '/v3/games?sport=nfl', '.v3-gclist .v3-gc, .v3-state:has-text("Nothing here")'); // after midnight there is no NFL game "today"
        expect(plain(await page.evaluate(() => new Date().toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }))).replace(',', '')).toBe(m.local);
        await expect(dalCard(page)).toHaveCount(m.onToday ? 1 : 0);
        if (!m.onToday) {
          await go(page, `/v3/games?sport=nfl&date=2026-10-26`, '.v3-gclist .v3-gc');
          await expect(dalCard(page)).toHaveCount(1);
          await expect(page.getByRole('button', { name: /Choose a date\. Showing Yesterday/ })).toBeVisible(); // the picker names the day it is showing
        }
      });
    });
  }
});

test.describe('sample data across the US daylight-saving change (2026-11-01, a 25-hour day)', () => {
  test.use({ timezoneId: 'America/New_York', locale: 'en-US' });
  test('sample kick-offs keep their wall-clock times on the long day, and the day list steps over it', async ({ page }) => {
    await boot(page, { now: new Date('2026-11-01T17:00:00Z'), demo: true }); // noon EST, after the clocks went back
    await go(page, '/v3/games?demo=1', '.v3-gclist .v3-gc');
    // The sample slate is built from local wall-clock times (BUF at NYJ 1:00 PM, ORE at WASH 7:00 PM), not from "midnight plus N hours".
    const times = (await page.locator('.v3-gc__time').allTextContents()).map(plain);
    expect(times).toContain('1:00 PM');
    expect(times).toContain('7:00 PM');
    await page.getByRole('button', { name: /Choose a date/ }).click();
    await expect(page.locator('.v3-days button').first()).toBeVisible();
    const days = (await page.locator('.v3-days button').allTextContents()).map(plain);
    expect(days).toContain('Today · Sun, Nov 1');
    expect(days).toContain('Mon, Nov 2');
    expect(days).toContain('Fri, Oct 30');
    expect(new Set(days).size).toBe(days.length);
  });
});

test.describe('sample data is bucketed by the viewer\'s own day in every zone', () => {
  for (const zone of ['America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Pacific/Auckland']) {
    test.describe(zone, () => {
      test.use({ timezoneId: zone, locale: 'en-US' });
      test(`${zone}: the sample slate is "Today" and the date button says so`, async ({ page }) => {
        await boot(page, { now: new Date('2026-10-27T03:30:00Z'), demo: true }); // a different calendar day in different zones
        await go(page, '/v3/games?demo=1', '.v3-gclist .v3-gc');
        await expect(page.getByRole('button', { name: /Choose a date\. Showing Today/ })).toBeVisible();
        expect((await page.locator('.v3-gc__time').allTextContents()).map(plain)).toContain('1:00 PM');
        // The picker's "Today" is the viewer's local date for that instant.
        const local = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date('2026-10-27T03:30:00Z'));
        await page.getByRole('button', { name: /Choose a date/ }).click();
        await expect(page.locator('.v3-days button').first()).toBeVisible();
        expect((await page.locator('.v3-days button').allTextContents()).map(plain)).toContain(`Today · ${local}`);
      });
    });
  }
});
