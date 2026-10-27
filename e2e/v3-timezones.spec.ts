// Game times in the viewer's real local time zone. Each context pins a browser `timezoneId` and a fixed clock (the schedule is UTC; the
// sandbox is UTC; neither may stand in for the viewer). Real-document tests read the captured published slate on its captured instant
// (`.v3-feed-cache`, `captured_at.txt`); the sample-data tests need no network. Unit coverage of the module is tests/v3/time.test.ts.
//
// DAL at PHI starts 2026-10-27T00:15:00Z. In a UTC sandbox that reads "Tue 12:15 AM"; for a New York viewer it is Monday 8:15 PM, today.
import { test, expect, type Page } from '@playwright/test';
import { feedNow, useRealFeeds } from './support/realFeeds';

test.setTimeout(120_000);
test.describe.configure({ mode: 'parallel' });
const plain = (s: string | null) => (s ?? '').replace(/\s/g, ' ').trim();
const DAL_PHI_LABEL = /^Dallas Cowboys at Philadelphia Eagles/;

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
  await page.clock.setFixedTime(o.now ?? feedNow());
  if (!o.demo) await useRealFeeds(page);
}
const go = async (page: Page, path: string, ready: string) => {
  await page.goto(`./#${path}`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  await page.waitForSelector(ready, { timeout: 30_000 });
};
const dalCard = (page: Page) => page.locator('article.v3-gc', { has: page.locator('.v3-gc__hit') }).filter({ has: page.locator(`.v3-gc__hit[aria-label^="Dallas Cowboys at Philadelphia Eagles"]`) });

test.describe('the captured slate (real documents) in real viewer zones', () => {
  test('the captured instant is the one the cache describes', () => {
    expect(feedNow().toISOString()).toBe('2026-10-26T23:25:00.000Z');
  });

  for (const z of ZONES) {
    test.describe(z.zone, () => {
      test.use({ timezoneId: z.zone, locale: 'en-US' });

      test(`Games: DAL at PHI reads ${z.clock} and is ${z.todayList ? 'listed under Today' : 'not listed under Today'}`, async ({ page }) => {
        await boot(page);
        await go(page, '/v3/games', '.v3-gclist .v3-gc');
        const here = dalCard(page);
        if (z.todayList) {
          await expect(here).toHaveCount(1);
          expect(plain(await here.locator('.v3-gc__time, .v3-gc__live').first().textContent())).toContain(z.clock);
          expect(plain(await here.locator('.v3-gc__hit').getAttribute('aria-label'))).toContain(`, ${z.clock}. Open game`);
        } else {
          await expect(here).toHaveCount(0); // it is tomorrow's game for this viewer
          // The date picker names the day the viewer is looking at, and the next day lists the game with its local clock time.
          await expect(page.getByRole('button', { name: /Choose a date\. Showing Today/ })).toBeVisible();
          await go(page, '/v3/games?date=2026-10-27', '.v3-gclist .v3-gc');
          await expect(dalCard(page)).toHaveCount(1);
          expect(plain(await dalCard(page).locator('.v3-gc__time, .v3-gc__live').first().textContent())).toContain(z.clock);
        }
      });

      test(`Game Detail: DAL at PHI reads "${z.word} · ${z.clock}"`, async ({ page }) => {
        await boot(page);
        await go(page, '/v3/games', '.v3-gclist .v3-gc');
        await go(page, `/v3/games${z.todayList ? '' : '?date=2026-10-27'}`, '.v3-gclist .v3-gc');
        await dalCard(page).locator('.v3-gc__hit').click();
        await expect(page.locator('.v3-gh__when')).toContainText(z.clock, { timeout: 20_000 });
        expect(plain(await page.locator('.v3-gh__when').textContent())).toContain(`${z.word} · ${z.clock}`);
      });

      test(`Prop Discovery: DAL at PHI rows read ${z.word === 'Today' ? z.clock : `Tomorrow ${z.clock}`}`, async ({ page }) => {
        await boot(page);
        await go(page, '/v3/props?v=1&view=list&sport=nfl', '.pd-row');
        const row = page.locator('.pd-row', { hasText: /DAL at PHI|PHI at DAL/ }).first();
        await expect(row).toBeVisible({ timeout: 30_000 });
        const want = z.word === 'Today' ? z.clock : `Tomorrow ${z.clock}`;
        expect(plain(await row.textContent())).toMatch(new RegExp(`DAL at PHI · ${want.replace(/\s/g, '\\s')}`));
      });
    });
  }
});

test.describe('local midnight is the day boundary (real documents)', () => {
  test.describe('New York', () => {
    test.use({ timezoneId: 'America/New_York', locale: 'en-US' });
    test('the game stays on Monday until New York midnight (04:00Z) and belongs to the day before after it', async ({ page }) => {
      await boot(page, { now: new Date('2026-10-27T03:30:00Z') }); // 11:30 PM Monday in New York; the UTC date is already Tuesday
      await go(page, '/v3/games', '.v3-gclist .v3-gc');
      await expect(dalCard(page)).toHaveCount(1);
      await expect(page.getByRole('button', { name: /Choose a date\. Showing Today/ })).toBeVisible();
      // After midnight the same slate has moved on: Tuesday is today, Monday's game is Yesterday.
      await page.clock.setFixedTime(new Date('2026-10-27T04:30:00Z'));
      await page.reload();
      await page.waitForSelector('.v3-gclist .v3-gc');
      await expect(dalCard(page)).toHaveCount(0);
      await go(page, '/v3/games?date=2026-10-26', '.v3-gclist .v3-gc');
      await expect(dalCard(page)).toHaveCount(1);
      expect(plain(await dalCard(page).locator('.v3-gc__hit').getAttribute('aria-label'))).toContain('8:15 PM'); // the clock time does not move
    });
  });
  test.describe('Chicago', () => {
    test.use({ timezoneId: 'America/Chicago', locale: 'en-US' });
    test('Chicago midnight is 05:00Z', async ({ page }) => {
      await boot(page, { now: new Date('2026-10-27T04:30:00Z') }); // 11:30 PM Monday in Chicago, 12:30 AM Tuesday in New York
      await go(page, '/v3/games', '.v3-gclist .v3-gc');
      await expect(dalCard(page)).toHaveCount(1); // still Monday in Chicago
      await page.clock.setFixedTime(new Date('2026-10-27T05:30:00Z'));
      await page.reload();
      await page.waitForSelector('.v3-gclist .v3-gc');
      await expect(dalCard(page)).toHaveCount(0); // Tuesday in Chicago
    });
  });
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
        expect((await page.locator('.v3-days button').allTextContents()).map(plain)).toContain(`Today · ${local}`);
      });
    });
  }
});
