// SIFT 3.0 Milestone 4: Team Research (TR1 to TR6) against REAL published documents (e2e/support/realFeeds.ts: a disk cache of the
// explorer and board documents; V3_REAL_FEEDS=live fills it through the proxy) plus a sample-data block. Every tap-matrix row the
// screen owns is exercised against the real components, Back restores the screen's exact state and scroll, nothing overflows at 390 and
// 375 px, and no freshness text exists.
import { test, expect, type Locator, type Page } from '@playwright/test';
import { useRealFeeds } from './support/realFeeds';
import { TAP_MATRIX } from '../tests/v3/tapmatrix';

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await useRealFeeds(page);
});

const go = async (page: Page, path: string) => {
  await page.goto(`./#${path}`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
};
const hash = (page: Page) => page.evaluate(() => location.hash);
const y = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
const histLen = (page: Page) => page.evaluate(() => history.length);
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
const center = (l: Locator) => l.evaluate((el) => el.scrollIntoView({ block: 'center' }));
/** Wait until the tab's real data is on screen. */
const ready = async (page: Page, sel: string) => expect(page.locator(sel).first()).toBeVisible({ timeout: 30_000 });

/** Tap `loc`, check where it went (data-dest and the address), then Back must restore the address and the scroll offset exactly. */
async function tapAndBack(page: Page, loc: Locator, kind: string, dest: RegExp) {
  await center(loc);
  await page.waitForTimeout(150);
  const before = await hash(page);
  const at = await y(page);
  const target = loc.first();
  expect(await target.getAttribute('data-tap')).toBe(kind);
  expect(await target.getAttribute('data-dest')).toMatch(dest);
  await target.click();
  // Prop Discovery is built in a later milestone: today `/v3/props` is picked up by the classic `/:slug/props` route and handed on to the
  // SIFT 2.0 workspace, so the address keeps its `/v3/props?...` tail behind that prefix. The destination address itself is the contract.
  const prefix = kind === 'props' ? '(?:/design/sift2)?' : '';
  await expect.poll(() => hash(page)).toMatch(new RegExp(`^#${prefix}${dest.source.replace(/^\^/, '')}`));
  await page.goBack();
  await expect.poll(() => hash(page)).toBe(before);
  await expect.poll(async () => Math.abs((await y(page)) - at), { timeout: 5_000 }).toBeLessThanOrEqual(8);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

const FRESH = /\bago\b|last known|\bstale\b|last updated|updated \d|as of \d|just now/i;
const MATRIX_OWNED = TAP_MATRIX.filter((r) => r.milestone === 4);

test.describe('Team Research (real documents) @v3', () => {
  test('the tap matrix rows this screen owns are the ones this spec covers', () => {
    expect(MATRIX_OWNED.map((r) => r.id)).toEqual([47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65]);
  });

  test('Overview (TR1): hero, record, next game from the schedule, identity, extremes, margin bars; every target goes where the contract says', async ({ page }) => {
    await go(page, '/v3/team/nfl/DAL');
    await ready(page, '.tm-idt .idr');
    await expect(page.locator('.tm-hero h1')).toContainText('Cowboys');
    await expect(page.locator('.tm-hero .tm-rec b')).toHaveText(/^\d+–\d+(–\d+)?$/);
    await expect(page.getByRole('tab')).toHaveText(['Overview', 'Profile', 'Form', 'Players', 'Schedule']);
    // the three-lane evidence UI is absent: team pages carry no SIFT model lane
    await expect(page.locator('.x-trio, .x-lane--sift')).toHaveCount(0);
    expect(await page.locator('.tm-gstrip').innerText()).toMatch(/\b(at|vs) [A-Z]{2,3} · /);
    // 47 next game → Game Detail
    await tapAndBack(page, page.locator('.tm-gstrip [data-tap="game"]'), 'game', /^\/v3\/game\/nfl\/evt_/);
    // 48 opponent logo → Team
    await tapAndBack(page, page.locator('.tm-gstrip [data-tap="team"]'), 'team', /^\/v3\/team\/nfl\/[A-Z]{2,3}$/);
    // 49 props today → Prop Discovery filtered to the team. The Prop Discovery screen is built in a later milestone: the address is built
    // with the route builder and carries the team; it is expected not to render its own screen yet.
    await tapAndBack(page, page.locator('.tm-prow[data-tap="props"]'), 'props', /^\/v3\/props\?.*team=DAL/);
    // 50 offense block, 51 defense rank, 52 strongest row → Stat Detail, ranking, this team selected
    await tapAndBack(page, page.locator('.tm-idt .idbig .o[data-tap="stat"]'), 'stat', /^\/v3\/stat\/nfl\/rnk_[0-9a-f]+\?.*sel=DAL/);
    await tapAndBack(page, page.locator('.tm-idt .rr .d[data-tap="stat"]').first(), 'stat', /^\/v3\/stat\/nfl\/rnk_[0-9a-f]+\?.*sel=DAL/);
    await tapAndBack(page, page.locator('.tm-exc .exr[data-tap="stat"]').first(), 'stat', /^\/v3\/stat\/nfl\/rnk_[0-9a-f]+\?.*sel=DAL/);
    // 53 margin bar → completed Game Detail, 54 logo under the bar → Team
    await tapAndBack(page, page.locator('.tm-lst .tm-mb__hit[data-tap="game"]').first(), 'game', /^\/v3\/game\/nfl\/evt_/);
    await tapAndBack(page, page.locator('.tm-lst .tm-mb__lg [data-tap="team"]').first(), 'team', /^\/v3\/team\/nfl\/[A-Z]{2,3}$/);
    expect(await page.locator('body').innerText()).not.toMatch(FRESH);
  });

  test('Adjusted / Raw switches the whole identity card in place (history replaced) and Back leaves the screen', async ({ page }) => {
    await go(page, '/v3/team/nfl/DAL');
    await ready(page, '.tm-idt .idr');
    const adjusted = await page.locator('.tm-idt .idr .lab').first().getAttribute('aria-label');
    expect(adjusted).toMatch(/Adjusted/);
    const len = await histLen(page);
    await page.getByRole('group', { name: 'Statistic basis' }).getByRole('button', { name: 'Raw' }).click();
    await expect(page).toHaveURL(/adj=0/);
    expect(await page.locator('.tm-idt .idr .lab').first().getAttribute('aria-label')).not.toMatch(/Adjusted/);
    expect(await histLen(page)).toBe(len);
    await expect(page.locator('.tm-idt .tm-note')).toContainText('what happened, not how good the team is');
  });

  test('Profile (TR2): rows by category with rank, each a target to Stat Detail; windows and Raw/Adjusted are state; Back restores them with scroll and the expanded list', async ({ page }) => {
    await go(page, '/v3/team/nfl/DAL?tab=profile&adj=0&win=L6&all=1');
    await ready(page, '.tm .prr');
    await expect(page.locator('.tm .kd.g')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Window' }).getByRole('button', { pressed: true })).toHaveText('Last 6');
    const rows = await page.locator('.tm .prr').count();
    expect(rows).toBeGreaterThan(8);
    const url = await hash(page);
    const row = page.locator('.tm .prr[data-tap="stat"]').nth(3);
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(150);
    const at2 = await y(page);
    const target = await row.getAttribute('data-dest');
    expect(target).toMatch(/^\/v3\/stat\/nfl\/rnk_[0-9a-f]+\?.*sel=DAL.*win=L6|^\/v3\/stat\/nfl\/rnk_[0-9a-f]+\?.*win=L6.*sel=DAL/);
    await row.click();
    await expect(page).toHaveURL(/#\/v3\/stat\/nfl\//);
    await page.goBack();
    await expect.poll(() => hash(page)).toBe(url);
    await expect.poll(async () => await page.locator('.tm .prr').count()).toBe(rows);
    await expect.poll(async () => Math.abs((await y(page)) - at2), { timeout: 5_000 }).toBeLessThanOrEqual(8);
    await expect(page.getByRole('group', { name: 'Statistic basis' }).getByRole('button', { pressed: true })).toHaveText('Raw');
    // switching the window and the basis replace history
    const len = await histLen(page);
    await page.getByRole('group', { name: 'Window' }).getByRole('button', { name: 'Last 34' }).click();
    await expect(page).toHaveURL(/win=L34/);
    await page.getByRole('group', { name: 'Statistic basis' }).getByRole('button', { name: 'Opponent-adjusted' }).click();
    await expect(page).toHaveURL(/adj=1|v=1(?!.*adj=0)/);
    expect(await histLen(page)).toBe(len);
    // adjusted statistics never appear in the raw list and vice versa
    const names = await page.locator('.tm .prr .pn b').allInnerTexts();
    expect(names.every((n) => /^Adjusted/.test(n))).toBe(true);
  });

  test('Profile row tap (55): Stat Detail for that statistic, ranking tab, this team selected', async ({ page }) => {
    await go(page, '/v3/team/nfl/DAL?tab=profile');
    await ready(page, '.tm .prr');
    await tapAndBack(page, page.locator('.tm .prr[data-tap="stat"]').first(), 'stat', /^\/v3\/stat\/nfl\/rnk_[0-9a-f]+\?.*sel=DAL/);
  });

  test('Form (TR3): margin bars, splits from game rows, the locked closing-lines rows; result rows open the game and the logo the team (56, 57)', async ({ page }) => {
    await go(page, '/v3/team/nfl/DAL?tab=form');
    await ready(page, '.tm .res');
    await expect(page.locator('.tm-frm')).toContainText('Last 12 games');
    await expect(page.locator('.tm-spl3')).toContainText('Splits · last 12');
    await expect(page.locator('.tm-lockc').first()).toContainText('Against the spread');
    await expect(page.locator('.tm-lockc').first()).toContainText('closing lines');
    await tapAndBack(page, page.locator('.tm .res > a[data-tap="game"]').first(), 'game', /^\/v3\/game\/nfl\/evt_/);
    await tapAndBack(page, page.locator('.tm .res [data-tap="team"]').first(), 'team', /^\/v3\/team\/nfl\/[A-Z]{2,3}$/);
  });

  test('Form results beyond the first six expand in place and the expansion is in the address and survives Back', async ({ page }) => {
    await go(page, '/v3/team/nhl/TOR?tab=form');
    await ready(page, '.tm .res');
    const six = await page.locator('.tm .res').count();
    expect(six).toBe(6);
    const len = await histLen(page);
    await page.getByRole('button', { name: /Show all \d+ results/ }).click();
    await expect(page).toHaveURL(/all=1/);
    expect(await histLen(page)).toBe(len);
    expect(await page.locator('.tm .res').count()).toBeGreaterThan(six);
    const url = await hash(page);
    const n = await page.locator('.tm .res').count();
    await tapAndBack(page, page.locator('.tm .res > a[data-tap="game"]').nth(8), 'game', /^\/v3\/game\/nhl\/evt_/);
    expect(await hash(page)).toBe(url);
    expect(await page.locator('.tm .res').count()).toBe(n);
  });

  test('Schedule (TR4): opponents with their adjusted offense and defense ranks; row to the game, logo to the team, pill to the opponent ranking (58, 59, 60)', async ({ page }) => {
    await go(page, '/v3/team/nfl/DAL?tab=schedule');
    await ready(page, '.tm .sch .op.o[data-tap="stat"]');
    await expect(page.locator('.tm-sum6')).toContainText('Next 6 opponents');
    await expect(page.locator('.tm-sum6')).toContainText('6 of 6 opponents ranked');
    expect(await page.locator('.tm .sch').count()).toBe(6);
    await tapAndBack(page, page.locator('.tm .sch > a[data-tap="game"]').first(), 'game', /^\/v3\/game\/nfl\/evt_/);
    await tapAndBack(page, page.locator('.tm .sch [data-tap="team"]').first(), 'team', /^\/v3\/team\/nfl\/[A-Z]{2,3}$/);
    // the pill opens the OPPONENT's ranking with the opponent highlighted and this team named as the other side
    const pill = page.locator('.tm .sch .op.o[data-tap="stat"]').first();
    expect(await pill.getAttribute('data-dest')).toMatch(/^\/v3\/stat\/nfl\/rnk_[0-9a-f]+\?.*sel=PHI/);
    expect(await pill.getAttribute('data-dest')).toMatch(/opp=DAL/);
    await tapAndBack(page, pill, 'stat', /^\/v3\/stat\/nfl\/rnk_[0-9a-f]+\?.*sel=PHI/);
  });

  test('Players (TR5): availability and skill players open Player Research; prop counts open Prop Discovery for the player (61, 62, 63); expanded rows are state', async ({ page }) => {
    await go(page, '/v3/team/nfl/DAL?tab=players');
    await ready(page, '.tm .plr');
    await expect(page.locator('.tm-avc')).toContainText('Availability');
    await expect(page.locator('.tm .olc')).toContainText('Offensive-line quality is not published');
    // An availability row opens Player Research when the publication has a player page for that name. Today none of Dallas's players
    // who are out has one (the explorer lists 13 skill players), so those rows are plain text rather than dead links.
    const linked = page.locator('.tm .avr [data-tap="player"]');
    if (await linked.count()) await tapAndBack(page, linked.first(), 'player', /^\/v3\/player\/nfl\/prt_/);
    else expect(await page.locator('.tm .avr').count()).toBeGreaterThan(0);
    await tapAndBack(page, page.locator('.tm .plr > a[data-tap="player"]').first(), 'player', /^\/v3\/player\/nfl\/prt_/);
    const pc = page.locator('.tm .plr .pcnt[data-tap="props"]');
    if (await pc.count()) await tapAndBack(page, pc.first(), 'props', /^\/v3\/props\?.*player=prt_/);
    await page.getByRole('button', { name: 'Why' }).click();
    await expect(page).toHaveURL(/exp=ol/);
    await expect(page.locator('.x-lock')).toContainText('no offensive-line metric');
    const url = await hash(page);
    await tapAndBack(page, page.locator('.tm .plr > a[data-tap="player"]').first(), 'player', /^\/v3\/player\/nfl\/prt_/);
    expect(await hash(page)).toBe(url);
    await expect(page.locator('.x-lock')).toBeVisible();
  });

  test('Hockey (TR6): record is W–L–OT, the tabs are Overview and Form only, goals-for opens the ranking (64, 65); gated tabs are honest', async ({ page }) => {
    await go(page, '/v3/team/nhl/TOR');
    await ready(page, '.tm-idt .idr');
    await expect(page.getByRole('tab')).toHaveText(['Overview', 'Form']);
    await expect(page.locator('.tm-hero .tm-rec b')).toHaveText(/^\d+–\d+–\d+$/);
    await expect(page.locator('.tm-idt')).toContainText('Scoring vs');
    await tapAndBack(page, page.locator('.tm-gstrip [data-tap="game"]'), 'game', /^\/v3\/game\/nhl\/evt_/);
    await tapAndBack(page, page.locator('.tm-idt .idbig .o[data-tap="stat"]'), 'stat', /^\/v3\/stat\/nhl\/rnk_[0-9a-f]+\?.*sel=TOR/);
    // the window is the switch; special teams are season-only and are not drawn for L10
    await page.getByRole('group', { name: 'Window' }).getByRole('button', { name: 'L10' }).click();
    await expect(page).toHaveURL(/win=L10/);
    await expect(page.locator('.tm-idt .idr')).toHaveCount(2);
    // a gated tab named by an address is a locked row with the reason, never a working tab
    await go(page, '/v3/team/nhl/TOR?tab=profile');
    await expect(page.locator('.x-lock')).toContainText('Not part of the first release');
    await expect(page.getByRole('tab', { selected: true })).toHaveCount(0);
    await go(page, '/v3/team/nhl/TOR?tab=form');
    await ready(page, '.tm .res');
    await expect(page.locator('.tm-spl3')).toContainText('One goal');
    await expect(page.locator('.tm-spl3')).toContainText('overtime');
  });

  test('MLB team pages are off, with the reason', async ({ page }) => {
    await go(page, '/v3/team/mlb/LAD');
    await expect(page.getByRole('note').filter({ hasText: 'not shown' })).toContainText('late August');
    await expect(page.getByRole('tab')).toHaveCount(0);
  });

  test('Saved research: the bookmark saves the route with tab, Raw/Adjusted and window, and reopening restores them', async ({ page }) => {
    await go(page, '/v3/team/nfl/DAL?tab=profile&adj=0&win=L34');
    await ready(page, '.tm .prr');
    await page.locator('.tm-bar--sticky').getByRole('button', { name: /^Save .* research$/ }).click();
    const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('sift3.saved') ?? '[]')[0]);
    expect(rec.kind).toBe('team');
    expect(rec.route).toMatch(/^\/v3\/team\/nfl\/DAL\?/);
    expect(rec.route).toMatch(/tab=profile/);
    expect(rec.route).toMatch(/adj=0/);
    expect(rec.route).toMatch(/win=L34/);
    expect(rec.chips).toEqual(['Profile', 'Raw', 'Last 34']);
    await go(page, '/v3/explore');
    await go(page, rec.route);
    await ready(page, '.tm .prr');
    await expect(page.getByRole('group', { name: 'Statistic basis' }).getByRole('button', { pressed: true })).toHaveText('Raw');
    await expect(page.getByRole('group', { name: 'Window' }).getByRole('button', { pressed: true })).toHaveText('Last 34');
    await expect(page.getByRole('tab', { selected: true })).toHaveText('Profile');
    await expect(page.locator('.tm-bar--sticky').getByRole('button', { name: /^Remove saved/ })).toBeVisible();
  });

  test('no horizontal overflow at 390 and 375 on every tab, and no freshness text', async ({ page }) => {
    for (const w of [390, 375]) {
      await page.setViewportSize({ width: w, height: 800 });
      for (const [path, sel] of [['/v3/team/nfl/DAL', '.tm-idt .idr'], ['/v3/team/nfl/DAL?tab=profile', '.tm .prr'], ['/v3/team/nfl/DAL?tab=form', '.tm .res'], ['/v3/team/nfl/DAL?tab=schedule', '.tm .sch .op.o[data-tap="stat"]'], ['/v3/team/nfl/DAL?tab=players', '.tm .plr'], ['/v3/team/nhl/TOR', '.tm-idt .idr']] as const) {
        await go(page, path);
        await ready(page, sel);
        await noOverflow(page);
        expect(await page.locator('body').innerText()).not.toMatch(FRESH);
      }
    }
  });
});

test.describe('Team Research: performance and missing-data states (real documents) @v3', () => {
  const profileUrls = (page: Page) => {
    const urls: string[] = [];
    page.on('request', (r) => { const u = r.url(); if (/\/explorer\/teams\/prt_[^/]+\.json/.test(u)) urls.push(u.replace(/\?.*$/, '')); });
    return urls;
  };

  test('one team profile on Overview; Schedule fetches only the shown opponents, never every team', async ({ page }) => {
    const urls = profileUrls(page);
    await go(page, '/v3/team/nfl/DAL');
    await ready(page, '.tm-idt .idr');
    expect(new Set(urls).size).toBe(1);
    await page.getByRole('tab', { name: 'Schedule' }).click();
    await ready(page, '.tm .sch .op.o[data-tap="stat"]');
    // DAL plus its next six games' distinct opponents (PHI appears twice), far fewer than the 28 teams
    const n = new Set(urls).size;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(7);
    // opponent columns show a skeleton-sized placeholder, not a layout jump: the row count is stable from the first paint
    expect(await page.locator('.tm .sch').count()).toBe(6);
  });

  test('the first viewport (hero, name, tabs) renders before the team profile arrives', async ({ page }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    await page.route(/\/explorer\/teams\/prt_[^/]+\.json/, async (route) => { await gate; await route.fallback(); });
    await go(page, '/v3/team/nfl/DAL');
    await expect(page.locator('.tm-hero h1')).toContainText('Cowboys');
    await expect(page.getByRole('tab')).toHaveCount(5);
    await expect(page.locator('.tm-idt .idr')).toHaveCount(0);
    const h = await page.locator('.tm-hero').boundingBox();
    release();
    await ready(page, '.tm-idt .idr');
    const h2 = await page.locator('.tm-hero').boundingBox();
    expect(Math.abs((h?.height ?? 0) - (h2?.height ?? 0))).toBeLessThanOrEqual(2);
  });

  test('no upcoming game: the next-game strip says so, props row stays a plain link, Schedule is a locked row', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2027-07-01T12:00:00Z'));
    await go(page, '/v3/team/nfl/DAL');
    await ready(page, '.tm-idt .idr');
    await expect(page.locator('.tm-gstrip')).toHaveCount(0);
    await expect(page.getByText('No upcoming game is on the published schedule.')).toBeVisible();
    await expect(page.locator('.tm-prow')).toContainText('DAL player props');
    await page.getByRole('tab', { name: 'Schedule' }).click();
    await expect(page.locator('.x-lock')).toContainText('No upcoming games');
    await noOverflow(page);
  });

  test('the team document cannot be read: an honest note, tabs stay, nothing invented', async ({ page }) => {
    await page.route(/\/explorer\/teams\/prt_[^/]+\.json/, (r) => r.fulfill({ status: 404, body: 'x', headers: { 'access-control-allow-origin': '*' } }));
    await go(page, '/v3/team/nfl/DAL');
    await expect(page.getByText('Team statistics are unavailable')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.tm-idt .idr')).toHaveCount(0);
    await expect(page.locator('.tm-hero .tm-rec b')).toHaveCount(0);
  });

  test('an unknown team code is "Team not found", not an empty page', async ({ page }) => {
    await go(page, '/v3/team/nfl/ZZZ');
    await expect(page.getByText('Team not found')).toBeVisible({ timeout: 20_000 });
  });

  test('statistics the publication does not carry are locked rows with the reason, never a working control', async ({ page }) => {
    await go(page, '/v3/team/nfl/DAL?tab=form');
    await ready(page, '.tm .res');
    const lock = page.locator('.tm-lockc');
    await expect(lock.first()).toContainText('closing lines');
    expect(await lock.count()).toBeGreaterThanOrEqual(2);
    for (const l of await lock.all()) expect(await l.locator('a, button').count()).toBe(0);
    await go(page, '/v3/team/nhl/TOR?tab=schedule');
    await expect(page.locator('.x-lock')).toContainText('Not part of the first release');
    await go(page, '/v3/team/nhl/TOR?tab=players');
    await expect(page.locator('.x-lock')).toBeVisible();
    await expect(page.getByRole('tab')).toHaveText(['Overview', 'Form']);
  });

  test('availability row to Player Research (61): in today\'s published packets no injured player is also a listed skill player, so the real document is edited in the test to name one', async ({ page }) => {
    // The explorer lists skill players for a few teams and none of them appears in that team's availability list (checked across the cached
    // packets), so row 61 cannot fire on an untouched real document. The test renames the first availability entry of the real DAL document
    // to a listed player; nothing else changes. Rows without a player page stay plain text (asserted in the Players test above).
    await page.route(/\/explorer\/teams\/prt_[^/]+\.json/, async (route) => {
      const res = await route.fetch();
      const doc = await res.json();
      if (doc.players?.length && doc.availability?.length) {
        const who = doc.players[0].display_name;
        doc.availability[0].detail = doc.availability[0].detail.replace(/^.+? \(/, `${who} (`);
        doc.availability[0].status = 'OUT';
      }
      await route.fulfill({ response: res, json: doc });
    });
    await go(page, '/v3/team/nfl/DAL?tab=players');
    await ready(page, '.tm .plr');
    const linked = page.locator('.tm .avr [data-tap="player"]');
    await expect(linked).toHaveCount(1);
    await tapAndBack(page, linked.first(), 'player', /^\/v3\/player\/nfl\/prt_/);
  });

  test('no price UI on the page: nothing but links reaches a price', async ({ page }) => {
    await go(page, '/v3/team/nfl/DAL');
    await ready(page, '.tm-idt .idr');
    await expect(page.locator('[data-tap="price"]')).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toMatch(/[0-9]¢|\$[0-9]/);
  });
});

test.describe('Team Research (sample data) @v3', () => {
  test('?demo=1 shows the same design on labelled sample data, and says so', async ({ page }) => {
    await go(page, '/v3/team/nfl/KC?demo=1');
    await expect(page.getByRole('note').filter({ hasText: 'Sample data' }).first()).toBeVisible();
    await ready(page, '.tm-idt .idr');
    await expect(page.locator('.tm-hero')).toContainText('sample data');
    await page.getByRole('tab', { name: 'Schedule' }).click();
    await ready(page, '.tm .sch');
    await page.getByRole('tab', { name: 'Form' }).click();
    await ready(page, '.tm .res');
    await expect(page).toHaveURL(/tab=form/);
    await noOverflow(page);
  });

  test('?demo=1 hockey: same gated tabs, W–L–OT record, labelled sample data', async ({ page }) => {
    await go(page, '/v3/team/nhl/TOR?demo=1');
    await ready(page, '.tm-idt .idr');
    await expect(page.getByRole('tab')).toHaveText(['Overview', 'Form']);
    await expect(page.locator('.tm-hero')).toContainText('sample data');
    await expect(page.locator('.tm-hero .tm-rec b')).toHaveText(/^\d+–\d+–\d+$/);
    await noOverflow(page);
  });
});
