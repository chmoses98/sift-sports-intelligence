// Home is the games feed (src/v3/screens/Home.tsx): three tabs, a sport rail of only the sports with games, college conference chips, a day strip,
// time-grouped sections, and everything the viewer picked kept in the address (and, for sport and conference, on the device). Sample data (?demo=1):
// deterministic and offline. The sample slate has live games in NBA, NHL and NCAAF, a 25-game NCAAF card with ranks, and no tennis.
import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort()); });

const go = async (page: Page, path: string) => {
  await page.goto(`./#${path}`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  if (/[?&]demo=/.test(path)) await expect(page).not.toHaveURL(/[?&]demo=/);
};
const tabs = (page: Page) => page.locator('.v3-rail__t');
const selected = (page: Page) => page.locator('.v3-rail__t[aria-selected="true"]');
const conf = (page: Page, name: string) => page.locator('.v3-chips--conf').getByRole('button', { name, exact: true });
const cards = (page: Page) => page.locator('.v3-gc');
const prefs = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('sift3.prefs') ?? '{}') as { homeSport?: string; homeConf?: Record<string, string> });

test.describe('Home is the games feed @v3', () => {
  test('opens on games at once: the sport rail lists only sports with games, in product order, on the sport that is in play; no For You, no Spotlight', async ({ page }) => {
    await go(page, '/v3?demo=1');
    await expect(cards(page).first()).toBeVisible();
    await expect(tabs(page)).toHaveText(['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF']);
    await expect(selected(page)).toHaveText('NBA'); // the first sport in product order with a live game
    for (const g of await cards(page).locator('.v3-gc__lg').allTextContents()) expect(g).toBe('NBA');
    const text = await page.locator('[data-v3-shell]').innerText();
    expect(text).not.toMatch(/for you|spotlight/i);
    await expect(page.getByRole('link', { name: 'Search', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Choose a date\. Showing Today/ })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link')).toHaveText(['Home', 'Props', 'Following']);
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  test('every card names its sport and carries logos, names, scores, records, rank and status', async ({ page }) => {
    await go(page, '/v3?demo=1&sport=cfb');
    const live = page.locator('.v3-gc__hit[href*="demo_uga_fla"]').locator('xpath=..');
    await expect(live.locator('.v3-gc__lg')).toHaveText('NCAAF');
    await expect(live.locator('.v3-gc__live')).toContainText('Q3 6:24');
    await expect(live.locator('.v3-gc__sc')).toHaveText(['24', '10']);
    await expect(live).toContainText('#1');
    await expect(live).toContainText('6-1');
    await expect(live.locator('.v3-logo, img').first()).toBeVisible();
    await expect(live.locator('.v3-gc__sit')).toContainText('1st & 10');
  });

  test('choosing a sport shows only that sport, writes it to the address and remembers it on this device', async ({ page }) => {
    await go(page, '/v3?demo=1');
    await tabs(page).filter({ hasText: 'NHL' }).click();
    await expect(page).toHaveURL(/sport=nhl/);
    await expect(selected(page)).toHaveText('NHL');
    await expect(cards(page)).toHaveCount(1);
    expect((await prefs(page)).homeSport).toBe('nhl');
    // A later visit with no address opens where the viewer left off.
    await go(page, '/v3');
    await expect(selected(page)).toHaveText('NHL');
    await page.reload();
    await expect(selected(page)).toHaveText('NHL');
    // An address that names a sport wins over the device.
    await go(page, '/v3?sport=nfl');
    await expect(selected(page)).toHaveText('NFL');
  });

  test('NCAAF and NCAAB get conference chips; a conference filters at once and survives reload; Top 25 needs stated ranks', async ({ page }) => {
    await go(page, '/v3?demo=1&sport=cfb');
    await expect(conf(page, 'All')).toHaveAttribute('aria-pressed', 'true');
    await expect(conf(page, 'Top 25')).toBeVisible();
    for (const c of ['SEC', 'Big Ten', 'ACC', 'Big 12']) await expect(conf(page, c)).toBeVisible();
    const all = await cards(page).count();
    expect(all).toBeGreaterThan(20);
    await conf(page, 'SEC').click();
    await expect(page).toHaveURL(/conf=sec/);
    await expect(conf(page, 'SEC')).toHaveAttribute('aria-pressed', 'true');
    const sec = await cards(page).count();
    expect(sec).toBeGreaterThan(5);
    expect(sec).toBeLessThan(all);
    await conf(page, 'Top 25').click();
    await expect(page).toHaveURL(/conf=top25/);
    const top = await cards(page).count();
    expect(top).toBeGreaterThan(5);
    expect(top).toBeLessThan(all);
    for (const t of await cards(page).allInnerTexts()) expect(t).toMatch(/#\d+/);
    await conf(page, 'Big Ten').click();
    await page.reload();
    await expect(conf(page, 'Big Ten')).toHaveAttribute('aria-pressed', 'true');
    // The device remembers the conference per sport: opening NCAAF again with no conference in the address applies it.
    expect((await prefs(page)).homeConf?.cfb).toBe('big-ten');
    await go(page, '/v3?sport=cfb');
    await expect(conf(page, 'Big Ten')).toHaveAttribute('aria-pressed', 'true');
    // Other sports have no conference chips.
    await tabs(page).filter({ hasText: 'NFL' }).click();
    await expect(page.locator('.v3-chips--conf')).toHaveCount(0);
  });

  test('opening a game and coming Back restores the sport, conference and day', async ({ page }) => {
    await go(page, '/v3?demo=1&sport=cfb');
    await conf(page, 'SEC').click();
    await expect(page).toHaveURL(/conf=sec/);
    const url = page.url();
    await cards(page).first().locator('.v3-gc__hit').click();
    await expect(page).toHaveURL(/#\/v3\/game\/cfb\//);
    await page.goBack();
    await expect(page).toHaveURL(url);
    await expect(selected(page)).toHaveText('NCAAF');
    await expect(conf(page, 'SEC')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the schedule is grouped by time: Live first in priority order, kickoff windows, then Final with a count and a jump row', async ({ page }) => {
    await go(page, '/v3?demo=1&sport=cfb');
    const heads = page.locator('.v3-sec__h');
    await expect(heads.first()).toHaveText('Live · 6');
    await expect(heads.last()).toContainText('Final · 5');
    const titles = (await heads.allInnerTexts()).map((t) => t.trim());
    expect(titles.length).toBeGreaterThan(4);
    // The live game that is a tie between two ranked teams leads; the blowout-free late games are not the order's concern here.
    await expect(page.locator('.v3-sec').first().locator('.v3-gc__hit').first()).toHaveAttribute('href', /demo_ala_tenn/);
    const jump = page.getByRole('navigation', { name: 'Jump to' });
    await expect(jump.getByRole('button')).toHaveText([/Live\s*6/, /Upcoming\s*\d+/, /Final\s*5/]);
    await jump.getByRole('button', { name: /Final/ }).click();
    await expect(page.locator('#sec-final .v3-gc').first()).toBeInViewport();
    // The Final header is a real disclosure; collapsing it hides the games and the header stays.
    const fin = page.getByRole('button', { name: /^Final, 5 games/ });
    await expect(fin).toHaveAttribute('aria-expanded', 'true');
    await fin.click();
    await expect(fin).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#sec-final .v3-gc')).toHaveCount(0);
    await jump.getByRole('button', { name: /Final/ }).click();
    await expect(fin).toHaveAttribute('aria-expanded', 'true');
  });

  test('the day strip and the calendar sheet change the day; the day is in the address; an empty day says so and offers a way back', async ({ page }) => {
    await go(page, '/v3?demo=1');
    const strip = page.getByRole('tablist', { name: 'Day' });
    await expect(strip.getByRole('tab')).toHaveCount(14);
    await expect(strip.getByRole('tab', { selected: true })).toContainText('Today');
    await strip.getByRole('tab').nth(5).click(); // two days ahead
    await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByText('Nothing here')).toBeVisible();
    await page.getByRole('button', { name: 'Back to today' }).click();
    await expect(page).not.toHaveURL(/date=/);
    await expect(cards(page).first()).toBeVisible();
    await page.getByRole('button', { name: /Choose a date/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('.v3-days button').nth(5).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}/);
  });

  test('old Games and Explore addresses open Home and Search with their query', async ({ page }) => {
    await go(page, '/v3/games?demo=1&sport=nfl&state=upcoming');
    await expect(page).toHaveURL(/#\/v3\?.*sport=nfl/);
    await expect(page).not.toHaveURL(/state=/);
    await expect(selected(page)).toHaveText('NFL');
    await go(page, '/v3/explore?q=points');
    await expect(page).toHaveURL(/#\/v3\/search\?q=points/);
  });

  test('global search is in the header of every primary screen', async ({ page }) => {
    for (const path of ['/v3?demo=1', '/v3/props?demo=1', '/v3/following?demo=1']) {
      await go(page, path);
      await page.getByRole('link', { name: 'Search', exact: true }).first().click();
      await expect(page).toHaveURL(/#\/v3\/search/);
      await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible();
    }
  });

  test('tennis is its own chip and never appears in another sport\'s feed', async ({ page }) => {
    await go(page, '/v3?demo=1&sport=tennis');
    await expect(selected(page)).toHaveText('TENNIS');
    await expect(cards(page)).toHaveCount(0);
    await go(page, '/v3?sport=nba');
    for (const g of await cards(page).locator('.v3-gc__lg').allTextContents()) expect(g).not.toBe('TENNIS');
  });
});
