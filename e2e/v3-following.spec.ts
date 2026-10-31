// Following (src/v3/screens/Following.tsx): every followed sport together, live first, player updates, upcoming by day, recent finals, then what is
// followed. Runs on the labelled sample slate (?demo=1) so it is deterministic and offline. The sport chips are a filter only and live in the address.
import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
});

type Seed = { teams?: string[]; players?: string[]; games?: string[] } | Record<string, unknown>;
async function open(page: Page, seed: Seed | null, path = '/v3/following') {
  await page.addInitScript((s) => { try { if (s) localStorage.setItem('sift3.follows', JSON.stringify(s)); } catch { /* */ } }, seed);
  await page.goto(`./#${path}${path.includes('?') ? '&' : '?'}demo=1`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]demo=/);
}
const liveCards = (page: Page) => page.getByRole('region', { name: 'Live now' }).locator('article.v3-gc');
const chip = (page: Page, name: string) => page.getByRole('group', { name: 'Filter by sport' }).getByRole('button', { name, exact: true });

test.describe('Following @v3', () => {
  test('nothing followed: a short start with popular teams and search, no sport chips', async ({ page }) => {
    await open(page, { teams: [], players: [], games: [] });
    const start = page.getByRole('region', { name: 'Start following' });
    await expect(start).toBeVisible();
    await expect(start.locator('.v3-tm')).not.toHaveCount(0);
    await expect(start.getByRole('link', { name: /Search teams, players and games/ })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Filter by sport' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Live now' })).toHaveCount(0);
    // following one from here fills the screen; no alert is turned on
    await start.locator('.v3-tm').first().getByRole('button', { name: /^Follow/ }).click();
    await expect(page.getByRole('region', { name: 'Start following' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Live now' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('sift3.alerts'))).toBeNull();
  });

  test('followed teams of several sports are read together; the sport chips only filter, and the filter lives in the address', async ({ page }) => {
    await open(page, { teams: ['cfb:UGA', 'nba:NYK', 'nhl:TBL'], players: [], games: [] });
    await expect(liveCards(page)).toHaveCount(3);
    await expect(page.getByRole('group', { name: 'Filter by sport' }).getByRole('button')).toHaveText(['All', 'NCAAF', 'NBA', 'NHL']);
    await expect(chip(page, 'All')).toHaveAttribute('aria-pressed', 'true');

    await chip(page, 'NBA').click();
    await expect(page).toHaveURL(/#\/v3\/following\?sport=nba/);
    await expect(liveCards(page)).toHaveCount(1);
    await expect(liveCards(page).first()).toContainText('NBA');
    // the follows are untouched by filtering
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sift3.follows') ?? '{}').teams)).toHaveLength(3);

    await page.reload();
    await expect(page).toHaveURL(/sport=nba/);
    await expect(chip(page, 'NBA')).toHaveAttribute('aria-pressed', 'true');
    await expect(liveCards(page)).toHaveCount(1);

    await chip(page, 'All').click();
    await expect(page).not.toHaveURL(/sport=/);
    await expect(liveCards(page)).toHaveCount(3);
  });

  test('a sport in the address that is not followed means all sports', async ({ page }) => {
    await open(page, { teams: ['cfb:UGA', 'nba:NYK'], players: [], games: [] }, '/v3/following?sport=mlb');
    await expect(liveCards(page)).toHaveCount(2);
    await expect(chip(page, 'All')).toHaveAttribute('aria-pressed', 'true');
  });

  test('one followed sport shows no filter at all', async ({ page }) => {
    await open(page, { teams: ['cfb:UGA'], players: [], games: [] });
    await expect(liveCards(page)).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Filter by sport' })).toHaveCount(0);
  });

  test('a followed player brings his team\'s live game, with recent games and no invented live stats', async ({ page }) => {
    await open(page, { teams: [], players: ['nba:sample-guard'], games: [] });
    await expect(liveCards(page)).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Live now' })).toContainText("Sample Guard's team");
    const card = page.getByRole('region', { name: 'Player updates' }).locator('.v3-fp').first();
    await expect(card).toContainText('Sample Guard');
    await expect(card.locator('.v3-fp__log tbody tr')).toHaveCount(4); // three recent games and the last-5 average
    await expect(card.locator('.v3-fp__log thead th')).toHaveText(['Game', 'PTS', 'AST', 'REB']);
    await expect(card).toContainText('Live player stats are not published');
    await expect(card.getByRole('group', { name: /lines for Sample Guard/ })).toContainText('Sample');
    // the line chip opens that statistic on the player's page
    await card.getByRole('link', { name: /Sample Guard Points line/ }).click();
    await expect(page).toHaveURL(/#\/v3\/player\/nba\/sample-guard\?.*stat=pts/);
  });

  test('upcoming is grouped by day and finals show the score', async ({ page }) => {
    await open(page, { teams: ['nfl:KC', 'cfb:OSU', 'nba:LAL'], players: [], games: [] });
    const up = page.getByRole('region', { name: 'Upcoming' });
    await expect(up.locator('.v3-fday h3').first()).toHaveText(/Today|Tomorrow/);
    await expect(up.locator('.v3-fg')).not.toHaveCount(0);
    const fin = page.getByRole('region', { name: 'Recent finals' });
    await expect(fin.locator('.v3-fg').first()).toContainText(/\d+\s*–\s*\w+\s*\d+|\w+\s*\d+\s*–\s*\w+\s*\d+/);
    await expect(fin.locator('.v3-fg').first()).toContainText('Final');
  });

  test('unfollow and alerts are separate controls in "What you follow"', async ({ page }) => {
    await open(page, { teams: ['cfb:UGA', 'nba:NYK'], players: [], games: [] });
    const mine = page.getByRole('region', { name: 'What you follow' });
    await expect(mine.locator('.v3-hit--team')).toHaveCount(2);
    await mine.locator('.v3-hit--team').first().getByRole('button', { name: /^Alerts for/ }).click();
    await page.getByRole('dialog').getByRole('switch', { name: 'Game start' }).check();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sift3.follows') ?? '{}').teams)).toHaveLength(2); // an alert is not a follow
    expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('sift3.alerts') ?? '{}')))).toHaveLength(1);
    await mine.locator('.v3-hit--team').first().getByRole('button', { name: /^Unfollow/ }).click();
    await expect(mine.locator('.v3-hit--team')).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Filter by sport' })).toHaveCount(0); // one sport left
  });

  test('follows saved by an older build (no players list) still open', async ({ page }) => {
    await open(page, { teams: ['cfb:UGA'], games: ['cfb:demo_uga_fla', 'cfb:demo_uga_fla', 5] });
    await expect(liveCards(page)).toHaveCount(1);
    const mine = page.getByRole('region', { name: 'What you follow' });
    await expect(mine.locator('.v3-fg')).toHaveCount(1); // the duplicate and the junk entry are gone
  });

  test('live cards keep their order when the page re-renders', async ({ page }) => {
    await open(page, { teams: ['cfb:UGA', 'cfb:LSU', 'nba:NYK', 'nhl:TBL'], players: [], games: [] });
    const order = () => liveCards(page).evaluateAll((els) => els.map((e) => e.querySelector('.v3-gc__hit')?.getAttribute('href')));
    await expect(liveCards(page)).toHaveCount(4);
    const before = await order();
    await page.getByRole('button', { name: 'NBA', exact: true }).click();
    await expect(liveCards(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(liveCards(page)).toHaveCount(4);
    expect(await order()).toEqual(before);
  });

  test('no horizontal scroll and every control is a 44 pt target on a phone', async ({ page }) => {
    await open(page, { teams: ['cfb:UGA', 'nba:NYK', 'nhl:TBL'], players: ['nba:sample-guard'], games: ['nfl:demo_kc_sf'] });
    await expect(liveCards(page).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    const small = await page.locator('.v3-following button.v3-iconbtn, .v3-following .v3-fp__chip, .v3-following .v3-fp__next').evaluateAll((els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && Math.max(r.height, parseFloat(getComputedStyle(e, '::after').height) || 0) < 43.5 && r.height < 43.5; }).length);
    expect(small).toBe(0);
  });
});
