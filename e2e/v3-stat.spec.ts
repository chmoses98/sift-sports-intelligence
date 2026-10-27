// SIFT 3.0 milestone 2: Stat Detail and League Rankings (SD1 to SD7) against the REAL components and REAL published documents
// (e2e/support/realFeeds.ts: a disk cache of the research feeds, filled with V3_REAL_FEEDS=live). Every tap-matrix row this screen owns
// is exercised and its destination checked (data-dest and URL); Back restores tab, window, selection, comparison, expansion and scroll.
import { test, expect, type Locator, type Page } from '@playwright/test';
import { useRealFeeds } from './support/realFeeds';
import { TAP_MATRIX } from '../tests/v3/tapmatrix';

const LAMB = 'prt_4c661ae8b854ff5f66dd', PICKENS = 'prt_74580802ab4833992610';
const ADJ = '/v3/stat/nfl/adj_off_epa';

let feeds: Awaited<ReturnType<typeof useRealFeeds>>;
test.beforeEach(async ({ page }) => {
  feeds = await useRealFeeds(page);
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
});

const go = async (page: Page, path: string) => { await page.goto(`./#${path}`); await expect(page.locator('[data-v3-shell]')).toBeVisible(); };
const hash = (page: Page) => page.evaluate(() => location.hash.replace(/^#/, ''));
const y = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
const scrollTo = async (page: Page, to: number) => { await page.evaluate((t) => window.scrollTo(0, t), to); await page.waitForTimeout(150); };
const params = async (page: Page) => new URLSearchParams((await hash(page)).split('?')[1] ?? '');
const ready = (page: Page) => expect(page.locator('.st-hd h1')).toBeVisible();

/**
 * Click a target, check where it went, press Back and check the screen is exactly as it was (address and scroll). A Locator is scrolled
 * into view FIRST so the offset recorded is the one the screen is left at (a click that scrolls the target in would otherwise move it).
 */
async function tapAndBack(page: Page, target: Locator | (() => Promise<void>), dest: RegExp, o: { position?: { x: number; y: number } } = {}) {
  if (typeof target !== 'function') { await target.scrollIntoViewIfNeeded(); await page.waitForTimeout(200); }
  const before = await hash(page), at = await y(page);
  if (typeof target === 'function') await target(); else await target.click(o);
  await expect.poll(() => hash(page)).toMatch(dest);
  await page.goBack();
  await expect.poll(() => hash(page)).toBe(before);
  await expect.poll(async () => Math.abs((await y(page)) - at)).toBeLessThanOrEqual(6);
  await ready(page);
}

test.describe('Stat Detail and League Rankings (milestone 2) @v3', () => {
  test('the tap-matrix rows this screen owns are all covered below', () => {
    const rows = TAP_MATRIX.filter((r) => r.milestone === 2).map((r) => r.id);
    expect(rows).toEqual([66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77]);
  });

  test('SD1: the ranking opens on the short-id address with the selection and the next opponent outlined', async ({ page }) => {
    await go(page, `${ADJ}?v=1&sel=DAL&opp=PHI`);
    await ready(page);
    await expect(page.locator('.st-hd h1')).toHaveText('Adjusted offensive EPA per play');
    await expect(page.locator('.st-hd small')).toContainText('28 teams');
    await expect(page.locator('.st-selc')).toContainText('5th');
    await expect(page.locator('.st-selc')).toContainText('of 28 teams');
    await expect(page.locator('.st-selc')).toContainText('+0.048');
    await expect(page.locator('.st-selc')).toContainText('23');
    await expect(page.locator('.st-rkr.is-sel')).toHaveCount(1);
    await expect(page.locator('.st-rkr.is-opp')).toHaveCount(1);
    await expect(page.locator('.st-rkr.is-opp')).toContainText('Eagles');
    await expect(page.locator('[data-dotplot] circle[data-role="sel"]')).toHaveCount(1);
    await expect(page.locator('[data-dotplot] circle[data-role="opp"]')).toHaveCount(1);
    // the universe is the publication's: 28, never 32
    await expect(page.locator('.v3-main')).not.toContainText('of 32');
  });

  test('the next opponent comes from the league schedule when the address names none', async ({ page }) => {
    await go(page, `${ADJ}?v=1&sel=DAL`);
    await ready(page);
    await expect(page.locator('.st-selc')).toBeVisible();
    // DAL has an upcoming game in the published schedule: its opponent is dashed, and no `opp` was written into the address
    await expect(page.locator('.st-rkr.is-opp')).toHaveCount(1);
    expect((await params(page)).get('opp')).toBeNull();
  });

  test('legacy ranking id and sample id keep working; a missing window falls back honestly', async ({ page }) => {
    await go(page, '/v3/stat/nfl/rnk_eaddf1bcf94f465dbf95?tab=rankings&team=DAL');
    await expect.poll(() => hash(page)).toBe('/v3/stat/nfl/off_epa_play?v=1&win=L6&sel=DAL');
    await ready(page);
    await expect(page.locator('.st-chip[aria-pressed="true"]')).toContainText('Last 6');
    // the rewrite replaced the entry: one Back leaves the screen
    const len = await page.evaluate(() => history.length);
    await page.goBack();
    expect(await page.evaluate(() => history.length)).toBe(len);
    await go(page, `${ADJ}?v=1&win=L6`);
    await ready(page);
    await expect(page.locator('.st-fell')).toContainText('No “Last 6” window is published');
    await go(page, '/v3/stat/nfl/sample-0?demo=1');
    await expect(page.locator('.st-sample')).toHaveText('Sample ranking');
    await expect(page.locator('.v3-demo')).toBeVisible();
  });

  test('a statistic that is not published says so instead of showing something else', async ({ page }) => {
    await go(page, '/v3/stat/nfl/not_a_statistic');
    await expect(page.getByText('Statistic not available').first()).toBeVisible();
  });

  test('66 to 68: team name, team logo and the selected card open Team Research; Back restores the state', async ({ page }) => {
    await go(page, `${ADJ}?v=1&sel=DAL&opp=PHI&all=1`);
    await ready(page);
    await scrollTo(page, 500);
    await tapAndBack(page, page.locator('.st-rkr a.nm').nth(2), /^\/v3\/team\/nfl\/[A-Z]+/);
    await tapAndBack(page, page.locator('.st-rkr a[aria-label$="logo, team page"]').first(), /^\/v3\/team\/nfl\/SF/);
    await scrollTo(page, 0);
    await tapAndBack(page, page.locator('.st-selc .v3-navrow__main'), /^\/v3\/team\/nfl\/DAL/);
    // every identity in the list carries its destination for the matrix
    const dests = await page.locator('.st-rkr a[data-tap="team"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-dest')));
    expect(dests.length).toBeGreaterThanOrEqual(56);
    expect(dests.every((d) => /^\/v3\/team\/nfl\/[A-Z]+$/.test(d ?? ''))).toBe(true);
  });

  test('tapping a bar, a value or a dot moves the highlight in place and adds no history', async ({ page }) => {
    await go(page, `${ADJ}?v=1&sel=DAL&opp=PHI`);
    await ready(page);
    const len = await page.evaluate(() => history.length);
    await page.getByRole('button', { name: /^Detroit Lions bar/ }).click();
    expect((await params(page)).get('sel')).toBe('DET');
    await expect(page.locator('.st-selc')).toContainText('2nd');
    await expect(page.locator('.st-rkr.is-sel')).toContainText('Lions');
    await page.getByRole('button', { name: /^San Francisco 49ers .*highlight/ }).first().click();
    expect((await params(page)).get('sel')).toBe('SF');
    // a dot in the plot selects its team too
    const dot = page.locator('[data-dotplot] circle[data-dot="DET"]');
    await dot.click({ force: true });
    expect((await params(page)).get('sel')).toBe('DET');
    expect(await page.evaluate(() => history.length)).toBe(len);
    await page.goBack();
    await expect(page).not.toHaveURL(/#\/v3\/stat\/nfl\/adj_off_epa/);
  });

  test('"Show all" expands in place, and Back from a team restores it with the scroll', async ({ page }) => {
    await go(page, `${ADJ}?v=1&sel=DAL&opp=PHI`);
    await ready(page);
    await page.getByRole('button', { name: /^Show all 28 teams/ }).click();
    await expect(page.locator('.st-rkr')).toHaveCount(28);
    expect((await params(page)).get('all')).toBe('1');
    await scrollTo(page, 700);
    await tapAndBack(page, page.locator('.st-rkr a.nm').nth(15), /^\/v3\/team\//);
    await expect(page.locator('.st-rkr')).toHaveCount(28);
    await page.getByRole('button', { name: /^Show fewer/ }).click();
    await expect(page.locator('.st-rkr')).toHaveCount(7);
  });

  test('69: the raw switch opens the counterpart statistic\'s own ranking, keeping the selection; Back returns', async ({ page }) => {
    await go(page, `${ADJ}?v=1&sel=DAL&opp=PHI`);
    await ready(page);
    const raw = page.locator('.st-segc a', { hasText: 'Raw' });
    await expect(raw).toHaveAttribute('data-dest', /\/v3\/stat\/nfl\/off_epa_play\?v=1&sel=DAL&opp=PHI/);
    await raw.click();
    await expect.poll(() => hash(page)).toMatch(/^\/v3\/stat\/nfl\/off_epa_play/);
    await expect(page.locator('.st-hd h1')).toHaveText('Offensive EPA per play');
    await expect(page.locator('.st-selc')).toContainText('6th');
    // a different statistic with its own windows: the raw one has three, the adjusted one has one
    await expect(page.locator('.st-chip')).toHaveCount(3);
    await page.goBack();
    expect(await hash(page)).toBe(`${ADJ}?v=1&sel=DAL&opp=PHI`);
    await expect(page.locator('.st-hd h1')).toHaveText('Adjusted offensive EPA per play');
  });

  test('SD3: side by side keeps raw and adjusted as two separate cards, each opening its own ranking', async ({ page }) => {
    await go(page, `${ADJ}?v=1&sel=DAL&opp=PHI`);
    await ready(page);
    await page.getByRole('button', { name: 'Side by side' }).click();
    expect((await params(page)).get('sbs')).toBe('1');
    await expect(page.locator('.st-rvc')).toHaveCount(2);
    await expect(page.locator('.st-rvc.raw')).toContainText('6th');
    await expect(page.locator('.st-rvc.raw')).toContainText('+0.086');
    await expect(page.locator('.st-rvc.adj')).toContainText('5th');
    await expect(page.locator('.st-rvc.adj')).toContainText('+0.048');
    await expect(page.locator('.st-wpath > a')).toHaveCount(3);
    await expect(page.locator('.st-hd small')).toHaveText('Raw and opponent-adjusted are separate statistics');
    await expect(page.locator('.v3-main')).toContainText('never subtracted into a “schedule effect”');
    const open = page.locator('.st-rvc.raw .st-opn');
    await expect(open).toHaveAttribute('data-dest', /\/v3\/stat\/nfl\/off_epa_play\?v=1&win=SEASON&sel=DAL&opp=PHI/);
    await page.getByRole('button', { name: 'Opponent-adjusted' }).click();
    expect((await params(page)).get('sbs')).toBeNull();
  });

  test('windows: the chips re-cut the ranking in place and the window is in the address', async ({ page }) => {
    await go(page, '/v3/stat/nfl/off_epa_play?v=1&sel=DAL');
    await ready(page);
    await expect(page.locator('.st-chip[aria-pressed="true"]')).toContainText('Season');
    await page.locator('.st-chip', { hasText: 'Last 34' }).click();
    expect((await params(page)).get('win')).toBe('L34');
    await expect(page.locator('.st-selc')).toContainText('11th');
    await expect(page.locator('.st-selc')).toContainText('+0.022');
  });

  test('SD2: Trend shows the selected team\'s series; a bar selects an observation in place', async ({ page }) => {
    await go(page, '/v3/stat/nfl/points_for?v=1&tab=trend&sel=DAL');
    await expect(page.locator('.st-obs svg [data-obs]')).toHaveCount(12);
    await expect(page.locator('.st-chip[aria-pressed="true"]')).toContainText('2025–26 · last 12');
    await expect(page.locator('.st-obc')).toContainText('Week 6 · at GB');
    await expect(page.locator('.st-obc')).toContainText('13–23');
    await expect(page.locator('.st-obc')).toContainText('23.5');
    await expect(page.locator('.st-seas')).toContainText('rank —');
    await expect(page.locator('.st-seas')).toContainText('9th of 32');
    await expect(page.locator('.st-seas')).toContainText('Home, 2026');
    const len = await page.evaluate(() => history.length);
    await page.locator('[data-obs="10"]').click();
    await expect.poll(async () => (await params(page)).get('obs')).not.toBeNull();
    await expect(page.locator('.st-obc')).not.toContainText('Week 6 · at GB');
    expect(await page.evaluate(() => history.length)).toBe(len);
    await page.locator('.st-chip', { hasText: '2025' }).last().click();
    expect((await params(page)).get('st')).toBe('2025');
    await expect(page.locator('.st-obs svg [data-obs]')).toHaveCount(17);
  });

  test('70 and 71: the observation card opens that completed game and that opponent; Back restores the selected bar', async ({ page }) => {
    await go(page, '/v3/stat/nfl/points_for?v=1&tab=trend&sel=DAL&obs=36');
    await expect(page.locator('.st-obc')).toBeVisible();
    const before = await hash(page);
    const gd = page.getByRole('link', { name: /^Game Detail/ });
    await expect(gd).toHaveAttribute('data-tap', 'game');
    await expect(gd).toHaveAttribute('data-dest', /^\/v3\/game\/nfl\/evt_/);
    await tapAndBack(page, gd, /^\/v3\/game\/nfl\/evt_/);
    expect(await hash(page)).toBe(before);
    await expect(page.locator('.st-obs [data-obs][aria-pressed="true"]')).toHaveCount(1);
    const opp = page.locator('.st-obc a[data-tap="team"]');
    await tapAndBack(page, opp, /^\/v3\/team\/nfl\/[A-Z]+/);
  });

  test('a statistic with no per-game series says so and shows the rank path across its windows', async ({ page }) => {
    await go(page, '/v3/stat/nfl/off_epa_play?v=1&tab=trend&sel=DAL');
    await expect(page.locator('.st-state').first()).toContainText('No game-by-game series');
    await expect(page.locator('.st-path')).toContainText('Last 34');
    await expect(page.locator('.st-path')).toContainText('11th');
  });

  test('missing data: an empty series and an unreadable series each say so, and the rank path or the single window is stated instead', async ({ page }) => {
    const seriesUrl = /explorer\/series\/ser_e9732c71f3e58a0a095c\.json/;
    // a series document with no observations (real document, points removed)
    await page.route(seriesUrl, async (route) => {
      const res = await route.fetch();
      const doc = await res.json();
      await route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify({ ...doc, points: [] }) });
    });
    await go(page, '/v3/stat/nfl/points_for?v=1&tab=trend&sel=DAL');
    await expect(page.locator('.st-state').first()).toContainText('No game-by-game series');
    await expect(page.locator('.st-obs')).toHaveCount(0);
    await expect(page.locator('.v3-main')).toContainText(/across windows|One window only/);
    await page.unroute(seriesUrl);
    // the document is not in the publication at all
    await page.route(seriesUrl, (route) => route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } }));
    await go(page, '/v3/stat/nfl/points_for?v=1&tab=trend&sel=DAL&obs=3');
    await expect(page.locator('.st-hd h1')).toBeVisible();
    await expect(page.locator('.st-obs')).toHaveCount(0);
    await expect(page.locator('.st-obc')).toHaveCount(0);
  });

  test('missing data: a ranking whose document is not published says so; a team outside the universe has no rank', async ({ page }) => {
    await page.route(/explorer\/rankings\/rnk_2d0e261738ef71649dc9\.json/, (route) => route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } }));
    await go(page, `${ADJ}?v=1&sel=DAL`);
    await expect(page.getByText('This ranking is not in the publication')).toBeVisible();
    await expect(page.locator('.st-rkr')).toHaveCount(0);
    await expect(page.locator('.st-selc')).toHaveCount(0);
  });

  test('missing data: a selected team that is not in the ranking\'s universe has no rank here and nothing is invented', async ({ page }) => {
    await go(page, `${ADJ}?v=1&sel=ZZZ`);
    await ready(page);
    await expect(page.locator('.st-standin')).toContainText('ZZZ is not in this ranking');
    await expect(page.locator('.st-selc')).toHaveCount(0);
  });

  test('missing data: a player the publication does not know says so, and the missing league rank is still the locked row', async ({ page }) => {
    await go(page, `${ADJ}?v=1&tab=compare&sel=DAL&opp=PHI&cmpm=players&a=prt_000000000000000000000&b=${PICKENS}`);
    await expect(page.getByText('Player not found')).toBeVisible();
    await expect(page.locator('.st-olc')).toContainText('League rank among players is not published');
    await expect(page.locator('.st-pbars')).toHaveCount(0);
  });

  test('Trend with no team selected asks for one in a sheet; the choice lands in the address', async ({ page }) => {
    await go(page, '/v3/stat/nfl/points_for?v=1&tab=trend');
    await page.getByRole('button', { name: 'Choose a team' }).click();
    await expect(page.getByRole('dialog', { name: 'Choose a team' })).toBeVisible();
    await page.getByRole('option', { name: /Dallas Cowboys/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await params(page)).get('sel')).toBe('DAL');
    await expect(page.locator('.st-obs svg [data-obs]')).toHaveCount(12);
  });

  test('SD4 and 72, 73: Compare teams lists the ranks the design shows; a row opens its ranking with both teams; a chip opens the team', async ({ page }) => {
    await go(page, `${ADJ}?v=1&tab=compare&sel=DAL&opp=PHI`);
    await expect(page.locator('.st-cr')).toHaveCount(8);
    const first = page.locator('.st-cr').first();
    await expect(first).toContainText('Overall');
    await expect(first.locator('.cnk')).toHaveText('524');
    await expect(page.locator('.st-cr .cnk').nth(4)).toHaveText('2812');
    await expect(page.locator('.st-v3-none')).toHaveCount(0);
    await expect(page.locator('.st-hd h1')).toHaveText('Compare teams');
    const main = page.locator('.st-cr').nth(1).locator('.v3-navrow__main');
    await expect(main).toHaveAttribute('data-dest', /\/v3\/stat\/nfl\/adj_off_db_epa\?v=1&win=ADJ_RIDGE&sel=DAL&opp=PHI/);
    await tapAndBack(page, main, /^\/v3\/stat\/nfl\/adj_off_db_epa/, { position: { x: 12, y: 8 } });
    const chip = page.locator('.st-wc a[data-tap="team"]').first();
    await tapAndBack(page, chip, /^\/v3\/team\/nfl\/DAL/);
    // the track's own logos are team targets too
    await expect(page.locator('.st-cr a[data-tap="team"]').first()).toHaveAttribute('data-dest', /\/v3\/team\/nfl\/(DAL|PHI)/);
  });

  test('Compare: a team is removed and another added through a sheet; the picks are in the address', async ({ page }) => {
    await go(page, `${ADJ}?v=1&tab=compare&sel=DAL&opp=PHI`);
    await expect(page.locator('.st-cr')).toHaveCount(8);
    await page.getByRole('button', { name: 'Remove PHI' }).click();
    expect((await params(page)).get('b')).toBe('-');
    await expect(page.getByText('Choose two teams')).toBeVisible();
    await page.getByRole('button', { name: /Add team/ }).click();
    await page.getByRole('option', { name: /Detroit Lions/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await params(page)).get('b')).toBe('DET');
    await expect(page.locator('.st-cr')).toHaveCount(8);
    await expect(page.locator('.st-cr').first().locator('.cnk')).toHaveText('52');
  });

  test('SD5 and 74: Compare players uses game-log values, shows the missing league rank as a locked row, and a player opens Player Research', async ({ page }) => {
    await go(page, `${ADJ}?v=1&tab=compare&sel=DAL&opp=PHI&cmpm=players&a=${LAMB}&b=${PICKENS}&cs=receptions&thr=5`);
    await expect(page.locator('.st-hd h1')).toHaveText('Compare players');
    await expect(page.locator('.st-pbars')).toHaveCount(2);
    await expect(page.locator('.st-sdcm')).toContainText('Median');
    await expect(page.locator('.st-sdcm')).toContainText('5+ games');
    await expect(page.locator('.st-olc')).toContainText('League rank among players is not published');
    await expect(page.locator('.st-olc')).not.toContainText(/percentile \d/);
    await page.getByRole('button', { name: /^Why/ }).click();
    expect((await params(page)).get('more')).toBe('1');
    await expect(page.locator('.st-why')).toContainText('Player-level league rankings');
    const lamb = page.locator('.st-pcc a[data-tap="player"]').first();
    await expect(lamb).toHaveAttribute('data-dest', new RegExp(`^/v3/player/nfl/${LAMB}`));
    await tapAndBack(page, lamb, new RegExp(`^/v3/player/nfl/${LAMB}`));
    await expect(page.locator('.st-why')).toBeVisible(); // the expanded note came back with the entry
    // the threshold moves in place
    await page.getByRole('button', { name: 'Raise the threshold' }).click();
    expect((await params(page)).get('thr')).toBe('6');
    await expect(page.locator('.st-sdcm')).toContainText('6+ games');
  });

  test('SD6 and 75, 76: About lists every published limit, expands in place, related rows open their ranking and chips open Team', async ({ page }) => {
    await go(page, `${ADJ}?v=1&tab=about&sel=DAL&opp=PHI`);
    await expect(page.locator('.st-hd h1')).toHaveText('Adjusted offensive EPA per play');
    await expect(page.locator('.st-li')).toHaveCount(3);
    await expect(page.locator('.st-lim')).toContainText('current snapshot only; no committed history');
    await expect(page.locator('.st-lim')).toContainText('All 3 limits in full, methodology and source');
    await expect(page.locator('.st-li .clamp').last()).toBeVisible();
    await page.locator('.st-lim .st-more').click();
    expect((await params(page)).get('more')).toBe('1');
    await expect(page.locator('.st-li .clamp')).toHaveCount(0);
    await expect(page.locator('.st-lim')).toContainText('Showing all 3 limits');
    await expect(page.locator('.st-abt')).toContainText('Methodology');
    // derived related statistics are labelled as derived, raw and adjusted typed apart
    await expect(page.locator('.v3-main')).toContainText('Related statistics are derived here from the registry’s category and names');
    await expect(page.locator('.st-rr2').filter({ hasText: 'Offensive EPA per play' })).toContainText('Raw version');
    const rel = page.locator('.st-relc .v3-navrow__main').first();
    await expect(rel).toHaveAttribute('data-dest', /^\/v3\/stat\/nfl\/[a-z_]+\?v=1&win=ADJ_RIDGE&sel=DAL&opp=PHI/);
    await tapAndBack(page, rel, /^\/v3\/stat\/nfl\//, { position: { x: 12, y: 8 } });
    await expect(page.locator('.st-lim')).toContainText('Showing all 3 limits'); // expansion restored
    const chip = page.locator('.st-rel2 a[data-tap="team"]');
    await expect(chip).toContainText('Team Research · Dallas Cowboys');
    await tapAndBack(page, chip, /^\/v3\/team\/nfl\/DAL/);
    await expect(page.locator('.st-rel2 a[data-tap="game"]')).toContainText('Game matchup · DAL at PHI');
  });

  test('SD7 and 77: hockey ranking in W-L-OT country: window chips, season over season, and the next opponent row opens the team', async ({ page }) => {
    await go(page, '/v3/stat/nhl/pp_pct?v=1&sel=TOR&opp=CGY');
    await ready(page);
    await expect(page.locator('.st-chip[aria-pressed="true"]')).toContainText('2026–27 · 9 to 13 g');
    await expect(page.locator('.st-chip', { hasText: '2025–26' })).toContainText('82 g');
    await expect(page.locator('.st-selc')).toContainText('30.2%');
    await expect(page.locator('.st-selc')).toContainText('of 32 teams');
    await expect(page.locator('.st-hst')).toContainText('15th');
    await expect(page.locator('.st-hst')).toContainText('21.3%');
    await expect(page.locator('.st-fam')).toHaveCount(0); // no raw counterpart is linked for hockey
    const opp = page.locator('.st-rkr.is-opp');
    await expect(opp).toContainText('Flames');
    await expect(opp).toContainText('4');
    await tapAndBack(page, opp.locator('a.nm'), /^\/v3\/team\/nhl\/CGY/);
    await page.locator('.st-chip', { hasText: '2025–26' }).click();
    expect((await params(page)).get('win')).toBe('2025-26');
    await expect(page.locator('.st-selc')).toContainText('15th');
  });

  test('hockey compare and trend use the sport\'s own statistics', async ({ page }) => {
    await go(page, '/v3/stat/nhl/pp_pct?v=1&tab=compare&sel=TOR&opp=CGY');
    await expect(page.locator('.st-grh').first()).toContainText('Scoring');
    await expect(page.locator('.st-grh').nth(1)).toContainText('Preventing');
    await expect(page.locator('.st-hd small')).toContainText('official and season statistics');
  });

  test('MLB team statistics are not offered as current', async ({ page }) => {
    await go(page, '/v3/stat/mlb/anything');
    await expect(page.locator('.x-lock')).toContainText('stopped in late August');
    await expect(page.locator('.st-rkr')).toHaveCount(0);
  });

  test('saved research: the bookmark saves the route with window, selection, tab and picks, and opening it restores the same state', async ({ page }) => {
    await go(page, `${ADJ}?v=1&tab=compare&sel=DAL&opp=PHI&cmpm=players&a=${LAMB}&b=${PICKENS}&cs=receptions&thr=5&more=1`);
    await expect(page.locator('.st-pbars')).toHaveCount(2);
    await page.getByRole('button', { name: 'Save this statistic' }).click();
    await expect(page.getByRole('button', { name: 'Remove saved statistic' })).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sift3.saved') ?? '[]') as { route: string; title: string }[]);
    expect(saved[0].route).toBe(`${ADJ}?v=1&tab=compare&win=ADJ_RIDGE&sel=DAL&opp=PHI&cmpm=players&a=${LAMB}&b=${PICKENS}&more=1&cs=receptions&thr=5`);
    await go(page, '/v3/explore');
    await go(page, saved[0].route);
    await expect(page.locator('.st-hd h1')).toHaveText('Compare players');
    await expect(page.locator('.st-olc')).toBeVisible();
    await expect(page.locator('.st-why')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove saved statistic' })).toBeVisible();
    await expect(page.locator('.st-chip[aria-pressed="true"]')).toContainText(/Receptions/);
  });

  test('performance: a ranking document is fetched only for the statistic opened, a series only for the selected team', async ({ page }) => {
    const seen: string[] = [];
    page.on('request', (r) => { if (/explorer\/(rankings|series)\//.test(r.url())) seen.push(r.url().replace(/^.*explorer\//, '')); });
    await go(page, `${ADJ}?v=1&sel=DAL`);
    await ready(page);
    await expect(page.locator('.st-selc')).toBeVisible();
    expect(seen.filter((u) => u.startsWith('rankings/'))).toEqual(['rankings/rnk_2d0e261738ef71649dc9.json']);
    expect(seen.filter((u) => u.startsWith('series/'))).toEqual([]);
    await page.locator('.x-tabs [role="tab"]', { hasText: 'Trend' }).click();
    await expect(page.locator('.st-obs, .st-state').first()).toBeVisible();
    expect(seen.filter((u) => u.startsWith('series/'))).toHaveLength(0); // adjusted EPA has no series: nothing is fetched for it
    await go(page, '/v3/stat/nfl/points_for?v=1&tab=trend&sel=DAL');
    await expect(page.locator('.st-obs svg')).toBeVisible();
    expect(seen.filter((u) => u.startsWith('series/'))).toEqual(['series/ser_e9732c71f3e58a0a095c.json']);
  });

  test('tabs are in place: tab, window and selection survive Back through a team', async ({ page }) => {
    await go(page, '/v3/stat/nfl/off_epa_play?v=1&sel=DAL&opp=PHI');
    await ready(page);
    await page.locator('.st-chip', { hasText: 'Last 6' }).click();
    await page.locator('.x-tabs [role="tab"]', { hasText: 'About' }).click();
    const url = await hash(page);
    expect(url).toContain('tab=about');
    expect(url).toContain('win=L6');
    await scrollTo(page, 200);
    await tapAndBack(page, page.locator('.st-rel2 a[data-tap="team"]'), /^\/v3\/team\/nfl\/DAL/);
    expect(await hash(page)).toBe(url);
  });

  for (const w of [390, 375]) {
    test(`no horizontal overflow and no freshness text at ${w}px on every tab`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      const routes = [
        `${ADJ}?v=1&sel=DAL&opp=PHI&all=1`, `${ADJ}?v=1&sbs=1&sel=DAL`, '/v3/stat/nfl/points_for?v=1&tab=trend&sel=DAL', `${ADJ}?v=1&tab=compare&sel=DAL&opp=PHI`,
        `${ADJ}?v=1&tab=compare&sel=DAL&opp=PHI&cmpm=players&a=${LAMB}&b=${PICKENS}`, `${ADJ}?v=1&tab=about&sel=DAL&opp=PHI&more=1`, '/v3/stat/nhl/pp_pct?v=1&sel=TOR&opp=CGY', '/v3/stat/nfl/sample-0?demo=1',
      ];
      for (const r of routes) {
        await go(page, r);
        await expect(page.locator('.st-hd h1')).toBeVisible();
        await page.waitForTimeout(1200);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over, r).toBeLessThanOrEqual(0);
        const text = await page.locator('.st').innerText();
        expect(text, r).not.toMatch(/\b(ago|last known|stale|updated \d|as of)\b/i);
        expect(text, r).not.toMatch(/\d+\s?(m|h|d) ago/);
      }
    });
  }

  test('every target on the screen carries its tap kind and destination', async ({ page }) => {
    await go(page, `${ADJ}?v=1&sel=DAL&opp=PHI`);
    await ready(page);
    const bad = await page.locator('.st a[href]').evaluateAll((els) => els.filter((e) => !e.getAttribute('data-tap') || !e.getAttribute('data-dest')).map((e) => e.outerHTML.slice(0, 120)));
    expect(bad).toEqual([]);
    expect(feeds.served.length).toBeGreaterThan(0);
  });
});
