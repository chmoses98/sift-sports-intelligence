// SIFT 3.0 Prop Discovery (milestone 6), against REAL published documents (e2e/support/realFeeds.ts: the committed `props` fixture family, offline; V3_REAL_FEEDS=live refills a scratch cache).
// The quote feed's own observation times are re-stamped to "now" (freshQuotes: a test transformation, prices untouched) because the real
// feed is, by design, older than the display rule allows; the missing-price tests remove quotes instead. Nothing here names a player: rows
// are found by what they carry (a player page, an opponent chip), so the file keeps working when the slate changes.
//
// Tap-matrix rows owned (tests/v3/tapmatrix.ts, milestone 6): 1-7 PD home, 8-12 PD list, 13-17 PD list (expanded). Each is exercised
// below as `[row N]` and, after every tap, Back must restore the address, the scroll offset, the expanded row and close any sheet.
import { test, expect, type Locator, type Page } from '@playwright/test';
import { expectNoStolenTaps } from './support/hitTargets';
import { feedNow, freshQuotes, useRealFeeds } from './support/realFeeds';

test.setTimeout(120_000);
const FAMILY = 'props' as const;

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  // A first visit opens the Welcome sheet over Home after the slate loads (it would cover the tab bar); this test device has been welcomed.
  await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true })); } catch { /* storage may be blocked */ } });
  await page.clock.setFixedTime(feedNow(FAMILY));
  await useRealFeeds(page, { family: FAMILY });
  await freshQuotes(page, { family: FAMILY });
});

const go = async (page: Page, path: string) => {
  await page.goto(`./#${path}`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
};
const ready = (page: Page) => page.waitForSelector('.pd-card, .pd-row, .pd-empty', { timeout: 90_000 });
const open = async (page: Page, path: string) => { await go(page, path); await ready(page); await page.waitForTimeout(400); };
const y = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
const hash = (page: Page) => page.evaluate(() => location.hash);
const histLen = (page: Page) => page.evaluate(() => history.length);
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
/** Tap the open part of a row (below the price pill, clear of every link on it): the row's own button, as a thumb would. */
async function tapRow(row: Locator) {
  const hit = row.locator('.pd-row__hit');
  await center(row);
  const b = await hit.boundingBox();
  if (!b) throw new Error('row has no box');
  await hit.click({ position: { x: Math.max(8, b.width - 34), y: Math.max(8, b.height - 14) } });
}
function center(l: Locator) { return l.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' })); }

interface Snap { hash: string; y: number; open: string[]; sheet: boolean; q: string | null }
const snap = (page: Page): Promise<Snap> => page.evaluate(() => ({
  hash: location.hash, y: Math.round(window.scrollY),
  open: [...document.querySelectorAll('.pd-row.is-open')].map((e) => e.getAttribute('data-prop') ?? ''),
  sheet: !!document.querySelector('.v3-sheet'),
  q: (document.querySelector('.pd-search input') as HTMLInputElement | null)?.value ?? null,
}));

/** Tap a target, check where it goes, press Back, and check the screen is exactly as it was (address, scroll, expanded row, sheet closed). */
async function tapAndBack(page: Page, target: Locator, dest: RegExp, o: { sheet?: boolean } = {}) {
  await expect(target).toBeVisible();
  await center(target);
  await page.waitForTimeout(250);
  const before = await snap(page);
  const tap = await target.getAttribute('data-tap');
  const to = await target.getAttribute('data-dest');
  expect(tap, 'the target carries data-tap').toBeTruthy();
  expect(to, 'the target carries data-dest').toMatch(dest);
  await target.click();
  await expect.poll(() => hash(page)).toMatch(dest);
  if (o.sheet) await expect.poll(() => page.evaluate(() => location.search || location.hash)).toMatch(/sheet=contract&tk=/);
  await page.goBack();
  await expect.poll(() => hash(page)).toBe(before.hash);
  await expect.poll(async () => Math.abs((await y(page)) - before.y), { timeout: 8000 }).toBeLessThanOrEqual(6);
  const after = await snap(page);
  expect(after.open, 'the expanded row is kept').toEqual(before.open);
  expect(after.sheet, 'no sheet is left open').toBe(false);
  expect(after.q).toBe(before.q);
  return { tap, to };
}

const PLAYER = /\/v3\/player\/[a-z]+\/[^?]+/;
const GAME = /\/v3\/game\/[a-z]+\/[^?]+/;
const STAT = /\/v3\/stat\/[a-z]+\/[a-z_0-9]+\?.*sel=[A-Z]+/;
const CONTRACT = /sheet=contract&tk=KX[A-Z0-9-]+/;

/** A list address filtered to a sport that carries rows with a player page and an opponent chip. */
async function listWithResearchableRow(page: Page): Promise<{ path: string }> {
  for (const [sport, fam] of [['nfl', 'receptions'], ['nhl', 'points'], ['nfl', null], ['nhl', null]] as const) {
    const path = `/v3/props?v=1&view=list&sport=${sport}${fam ? `&fam=${fam}` : ''}`;
    await open(page, path);
    if (await page.locator('.pd-row:has(a.pd-av):has(a.pd-chip[data-tap="stat"])').count()) return { path };
  }
  throw new Error('no sport on today\'s slate carries a researchable prop');
}

test.describe('Prop Discovery on real published documents @v3', () => {
  test('the Explore tab is Prop Discovery; the older search still lives at /v3/explore', async ({ page }) => {
    await go(page, '/v3');
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Explore' }).click();
    await expect(page).toHaveURL(/#\/v3\/props/);
    await ready(page);
    await expect(page.getByRole('heading', { name: 'Props', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Explore' })).toHaveAttribute('aria-current', 'page');
    await go(page, '/v3/explore?q=lamb');
    await expect(page.locator('.v3-explore input[type="search"], .v3-explore input').first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Explore' })).toHaveAttribute('aria-current', 'page');
  });

  test('/v3/props stays in SIFT 3.0: never handed to the classic /:slug/props route (team filter from Team Research opens the list)', async ({ page }) => {
    await open(page, '/v3/props?v=1&team=DAL');
    expect(await hash(page)).toMatch(/^#\/v3\/props\?.*team=DAL/);
    await expect(page.locator('[data-v3-shell]')).toBeVisible();
    await expect(page.locator('.pd-listpage')).toBeVisible();
    await expect(page.locator('.pd-hs h1')).toHaveText('DAL props');
    for (const r of await page.locator('.pd-row').all()) await expect(r.locator('.pd-ps')).toBeAttached();
    // every row is the team's own (the player's team, not just the game)
    const wrong = await page.locator('.pd-row .pd-pn a[data-tap="game"]').evaluateAll((els) => els.filter((e) => !/DAL/.test(e.textContent ?? '')).length);
    expect(wrong).toBe(0);
  });

  test('addresses from Game Detail and Player Research filter the list (game=, player=): title, rows and Back', async ({ page }) => {
    await open(page, '/v3/props?v=1&view=list&sport=nfl');
    const dest = await page.locator('.pd-row .pd-pn a[data-tap="game"]').first().getAttribute('data-dest');
    const evt = dest!.split('/').pop()!.split('?')[0];
    const name = (await page.locator('.pd-row .pd-pn a[data-tap="player"], .pd-row .pd-pn b').first().innerText()).trim();
    await open(page, `/v3/props?v=1&game=${evt}`);
    await expect(page.locator('.pd-hs h1')).toHaveText(/ at .* props$/);
    const games = await page.locator('.pd-row .pd-pn a[data-tap="game"]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-dest')))]);
    expect(games).toHaveLength(1);
    expect(games[0]).toContain(evt);
    await open(page, `/v3/props?v=1&player=${encodeURIComponent(name)}`);
    await expect(page.locator('.pd-hs h1')).toHaveText(name);
    const names = await page.locator('.pd-row .pd-pn').evaluateAll((els) => [...new Set(els.map((e) => (e.firstElementChild as HTMLElement).innerText.trim()))]);
    expect(names).toEqual([name]);
  });

  for (const [w, h] of [[390, 844], [375, 667]] as const) {
    for (const fonts of ['measured', 'fallback'] as const) {
      test(`semantic targets never steal each other's taps in rows, cards and the peek (${w}x${h}, ${fonts} fonts)`, async ({ page }) => {
        if (fonts === 'fallback') await page.route(/\.(woff2?|ttf|otf)(\?.*)?$/, (r) => r.abort());
        await page.setViewportSize({ width: w, height: h });
        await open(page, '/v3/props');
        await expectNoStolenTaps(page, '.pd-card');
        await open(page, '/v3/props?v=1&view=list&sport=nfl');
        for (const y0 of [0, 500, 1300]) {
          await page.evaluate((y) => window.scrollTo(0, y), y0);
          await page.waitForTimeout(500);
          await expectNoStolenTaps(page, '.pd-row');
        }
        const row = page.locator('.pd-row:has(a.pd-av)').first();
        await center(row);
        await tapRow(row);
        await expect(page.locator('.pd-peek')).toBeVisible();
        await page.waitForTimeout(400);
        await expectNoStolenTaps(page, '.pd-row.is-open, .pd-peek');
        await open(page, '/v3/props?v=1&view=list&sport=nhl');
        await expectNoStolenTaps(page, '.pd-row');
      });
    }
  }

  test('PD1 home: real counts, shelves of prop cards, lanes in order, no overflow at 390 and 375, no freshness words', async ({ page }) => {
    await open(page, '/v3/props');
    await expect(page.locator('.pd-h__sub')).toContainText(/game.*props.*contracts/);
    await expect(page.locator('.pd-field')).toBeVisible();
    await expect(page.locator('.pd-rail a').first()).toContainText('All');
    expect(await page.locator('.pd-fams a').count()).toBeGreaterThan(2);
    expect(await page.locator('.pd-card').count()).toBeGreaterThan(0);
    // The three lanes, always Market, History, SIFT model, in that order.
    const order = await page.locator('.pd-card').first().locator('.pd-lanesL .t').allTextContents();
    expect(order.map((t) => t.trim())).toEqual(['Market', 'History', 'SIFT model']);
    // No freshness language of any kind.
    expect(await page.locator('body').innerText()).not.toMatch(/\b(ago|stale|last known|last updated|updated|freshness|min old|s old)\b/i);
    await noOverflow(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);
    await noOverflow(page);
  });

  test('PD1 taps [rows 1-7]: avatar, name, game, price, opponent chip, lanes, See all; Back restores the home each time', async ({ page }) => {
    await open(page, '/v3/props');
    const card = page.locator('.pd-card').filter({ has: page.locator('a.pd-av') }).filter({ has: page.locator('a.pd-chip[data-tap="stat"]') }).first();
    await expect(card).toBeVisible();
    // Scroll the home a little so Back has a real offset to restore.
    await page.evaluate(() => window.scrollTo(0, 140));
    await page.waitForTimeout(250);
    const r1 = await tapAndBack(page, card.locator('a.pd-av'), PLAYER);                                // row 1 avatar to player
    expect(r1.to).toMatch(/stat=[a-z_]+&line=\d/);                                                       // for that statistic and line
    await tapAndBack(page, card.locator('.pd-pn a[data-tap="player"]'), PLAYER);                         // row 2 name to player
    await tapAndBack(page, card.locator('.pd-pn a[data-tap="game"]'), GAME);                             // row 3 game text to game
    await tapAndBack(page, card.locator('a.pd-px[data-tap="price"]'), CONTRACT, { sheet: true });        // row 4 price to the contract sheet
    await tapAndBack(page, card.locator('a.pd-chip[data-tap="stat"]'), STAT);                            // row 5 opponent chip to stat
    // row 6: the lanes block opens the expanded prop in the list; Back returns to the home.
    const before = await snap(page);
    await center(card.locator('a.pd-lanesL'));
    const lanesAt = await y(page);
    await card.locator('a.pd-lanesL').click();
    await expect(page).toHaveURL(/#\/v3\/props\?.*view=list.*exp=/);
    await expect(page.locator('.pd-row.is-open').first()).toBeVisible();
    await expect(page.locator('.pd-peek')).toHaveCount(1);
    await expect(page.locator('.pd-list .pd-row').first()).toHaveClass(/is-open/);                      // listed first when arriving from a card
    await page.goBack();
    await expect.poll(() => hash(page)).toBe(before.hash);
    await expect.poll(async () => Math.abs((await y(page)) - lanesAt), { timeout: 8000 }).toBeLessThanOrEqual(6);
    // row 7: See all opens the list preset; Back returns to the home.
    const see = page.locator('a.pd-seeall').first();
    await tapAndBack(page, see, /\/v3\/props\?.*preset=(model|bottom3)/);
  });

  test('PD2 list: virtualised (few DOM rows), a deep scroll survives a tap on a game and Back, rows are windowed not paged', async ({ page }) => {
    await open(page, '/v3/props?v=1&view=list');
    const total = Number(await page.locator('.pd-list').getAttribute('aria-rowcount'));
    expect(total).toBeGreaterThan(30);
    expect(await page.locator('.pd-row').count()).toBeLessThan(40);
    const docH = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(docH).toBeGreaterThan(total * 90);                                                          // spacer: the page is as tall as every row
    await page.evaluate((h) => window.scrollTo(0, Math.round(h * 0.55)), docH);
    await page.waitForTimeout(500);
    expect(await page.locator('.pd-row').count()).toBeLessThan(40);
    const name = await page.locator('.pd-row').nth(6).getAttribute('data-prop');
    const row = page.locator(`.pd-row[data-prop="${name}"]`);
    await center(row);
    await page.waitForTimeout(400);
    const top0 = await row.evaluate((e) => Math.round(e.getBoundingClientRect().top));
    const y0 = await y(page);
    await row.locator('.pd-pn a[data-tap="game"]').click();                                               // [row 10] game text to game
    await expect.poll(() => hash(page)).toMatch(GAME);
    await page.goBack();
    await expect(page).toHaveURL(/view=list/);
    await expect.poll(async () => Math.abs((await y(page)) - y0), { timeout: 8000 }).toBeLessThanOrEqual(6);
    const same = page.locator(`.pd-row[data-prop="${name}"]`);
    await expect(same).toBeVisible();
    expect(Math.abs((await same.evaluate((e) => Math.round(e.getBoundingClientRect().top))) - top0)).toBeLessThanOrEqual(6);
    await noOverflow(page);
  });

  test('PD2 taps [rows 8-12]: avatar, name, game, price, opponent chip; Back restores filters, sort, scroll', async ({ page }) => {
    const { path } = await listWithResearchableRow(page);
    await open(page, `${path}&sort=price&range=20-80`);
    const row = page.locator('.pd-row:has(a.pd-av):has(a.pd-chip[data-tap="stat"])').first();
    await expect(row).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 260));
    await page.waitForTimeout(300);
    const url = await hash(page);
    await tapAndBack(page, row.locator('a.pd-av'), PLAYER);                                              // row 8
    await tapAndBack(page, row.locator('.pd-pn a[data-tap="player"]'), PLAYER);                          // row 9
    await tapAndBack(page, row.locator('.pd-pn a[data-tap="game"]'), GAME);                              // row 10
    await tapAndBack(page, row.locator('a.pd-px[data-tap="price"]'), CONTRACT, { sheet: true });         // row 11
    await tapAndBack(page, row.locator('a.pd-chip[data-tap="stat"]'), STAT);                             // row 12
    expect(await hash(page)).toBe(url);
    expect(url).toMatch(/sort=price/);
    expect(url).toMatch(/range=20-80/);
  });

  test('PD3 expanded prop [rows 13-17]: Research, Contract, opponent unit, market lane, history lane; Back keeps the row expanded at the same place', async ({ page }) => {
    const { path } = await listWithResearchableRow(page);
    const row = page.locator('.pd-row:has(a.pd-av):has(a.pd-chip[data-tap="stat"])').first();
    await center(row);
    await tapRow(row);
    await expect(page.locator('.pd-peek')).toBeVisible();
    await expect(page).toHaveURL(/exp=/);
    const peek = page.locator('.pd-peek');
    // Three lanes, always in this order.
    const lanes = (await peek.locator('.pd-trio .t').allTextContents()).map((t) => t.trim());
    expect(lanes).toEqual(['Market', 'History', 'SIFT model']);
    await tapAndBack(page, peek.locator('.pd-acts a.pd-abtn--pri[data-tap="player"]'), PLAYER);          // row 13 Research
    await tapAndBack(page, peek.locator('.pd-acts a[data-tap="price"]'), CONTRACT, { sheet: true });     // row 14 Contract
    await tapAndBack(page, peek.locator('a.pd-umu[data-tap="stat"]'), STAT);                             // row 15 opponent unit
    await tapAndBack(page, peek.locator('.pd-trio a[data-tap="price"]'), CONTRACT, { sheet: true });     // row 16 market lane
    await tapAndBack(page, peek.locator('.pd-trio a[data-tap="player"]'), PLAYER);                       // row 17 history lane
    expect(path).toBeTruthy();
  });

  test('PD3: a rung chip changes the line in place (address replaced, no history entry, same row stays open)', async ({ page }) => {
    await listWithResearchableRow(page);
    const row = page.locator('.pd-row:has(a.pd-av)').first();
    await center(row);
    await tapRow(row);
    const peek = page.locator('.pd-peek');
    await expect(peek).toBeVisible();
    const chips = peek.locator('.pd-rs');
    const n = await chips.count();
    test.skip(n < 2, 'this prop lists a single rung');
    const len = await histLen(page);
    const y0 = await y(page);
    const second = peek.locator('.pd-rs[aria-pressed="false"]').first();                                    // a rung other than the featured one
    const label = (await second.locator('b').innerText()).trim();
    await second.click();
    await expect(peek.locator('.pd-rs', { hasText: label })).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/exp=[^&]+(@|%40)\d+/);
    await expect(row.locator('.pd-ps b')).toHaveText(label);                                          // the row's own line changed too
    expect(await histLen(page)).toBe(len);
    expect(Math.abs((await y(page)) - y0)).toBeLessThanOrEqual(8);
    // The line travels with Research: Player Research for that statistic and THAT line.
    const link = await peek.locator('.pd-acts a[data-tap="player"]').getAttribute('data-dest');
    expect(link).toMatch(/line=\d+(\.5)?/);
  });

  test('search keeps its own text, mirrors it into the address by replacing it, and never adds a history entry per keystroke', async ({ page }) => {
    await open(page, '/v3/props?v=1&view=list');
    const len = await histLen(page);
    const box = page.getByRole('searchbox', { name: 'Search player, stat or team' });
    await box.click();
    await box.pressSequentially('rece', { delay: 60 });
    await expect(page).toHaveURL(/q=rece/);
    expect(await histLen(page)).toBe(len);
    const count = await page.locator('.pd-hs__cnt').innerText();
    await box.fill('');
    await expect(page).not.toHaveURL(/q=/);
    expect(await histLen(page)).toBe(len);
    await box.fill('zzzzqq');
    await expect(page.getByText('No props match')).toBeVisible();
    expect(count).toBeTruthy();
  });

  test('PD4 filters sheet: live count, locked facets name their reason, apply lands in the address, Back leaves the list', async ({ page }) => {
    await open(page, '/v3/props?v=1&view=list');
    await page.getByRole('button', { name: /Open sort and filters/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Sort and filter' });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.pd-fs__live b')).toContainText(/\d+ props match/);
    const locked = sheet.locator('.pd-locked');
    await expect(locked).toContainText('Needs more data');
    await expect(locked).toContainText('no prop price history');
    await expect(locked).toContainText('Teammate out');
    await expect(locked).toContainText('Position-level defense');
    // Locked facets are notes, never controls.
    expect(await locked.getByRole('button').count()).toBe(0);
    await sheet.getByRole('button', { name: 'Price', exact: true }).click();
    const show = sheet.getByRole('button', { name: /^Show \d+ props$/ });
    await show.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/sort=price/);
    await expect(page.getByRole('button', { name: /Sort: Price/ })).toBeVisible();
    await page.goBack();                                                                                // Back leaves the list (the in-place change added nothing)
    await expect(page).not.toHaveURL(/view=list/);
  });

  test('PD4: opening the sheet then Back closes it and leaves the list exactly as it was', async ({ page }) => {
    await open(page, '/v3/props?v=1&view=list&sort=price');
    await page.evaluate(() => window.scrollTo(0, 60));
    const sortBtn = page.getByRole('button', { name: /Open sort and filters/ });
    await sortBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const before = await snap(page);
    await sortBtn.click();
    await expect(page.getByRole('dialog', { name: 'Sort and filter' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const after = await snap(page);
    expect(after.hash).toBe(before.hash);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(6);
  });

  test('History sort and filter load logs only on request: no log is fetched for a plain list or its expanded row beyond the rows on screen', async ({ page }) => {
    const logs: string[] = [];
    page.on('request', (r) => { if (/\/data\/nfl\/history\/players\/|explorer\/players\/prt_/.test(r.url())) logs.push(r.url()); });
    await open(page, '/v3/props?v=1&view=list&sport=nfl');
    await page.waitForTimeout(1500);
    const onScreen = logs.length;
    expect(onScreen).toBeLessThanOrEqual(14);                                                          // the windowed rows only
    const total = Number(await page.locator('.pd-list').getAttribute('aria-rowcount'));
    expect(total).toBeGreaterThan(onScreen);
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.scrollTo(0, 2000));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    // A flick through the list fetched nothing new; History sort, when chosen, shows its cost before loading more.
    expect(logs.length).toBeLessThanOrEqual(onScreen + 4);
  });

  test('compare: tick mode, 2 to 3 rows, tray, compare screen with Research and Contract under each column, Back restores the selection', async ({ page }) => {
    await open(page, '/v3/props?v=1&view=list');
    await page.getByRole('button', { name: /^Compare/ }).click();
    await expect(page).toHaveURL(/cmpm=1/);
    const rows = page.locator('.pd-row');
    await tapRow(rows.nth(0));
    await expect(page.locator('.pd-tray')).toBeVisible();
    await expect(page.locator('.pd-tray .pd-abtn')).toHaveText(/Clear/);                               // one row: Compare is not offered yet
    await tapRow(rows.nth(1));
    await expect(page.locator('.pd-tray')).toContainText('2 selected');
    await tapRow(rows.nth(2));
    await expect(page.locator('.pd-tray')).toContainText('3 selected');
    await tapRow(rows.nth(3));
    await expect(page.getByText('Compare up to three props')).toBeVisible();
    await expect(page.locator('.pd-tray')).toContainText('3 selected');
    const len = await histLen(page);
    const listHash = await hash(page);
    expect(listHash.match(/cmp=/g)?.length).toBe(1);
    await page.locator('.pd-tray a.pd-abtn--pri').click();
    await expect(page).toHaveURL(/view=compare/);
    await expect(page.locator('.pd-compare')).toBeVisible();
    expect(await page.locator('.pd-crow--hd .pd-cell').count()).toBe(3);
    const labels = (await page.locator('.pd-crow .pd-cap').allTextContents()).map((t) => t.replace(/last 10/, '').trim());
    expect(labels.slice(0, 7)).toEqual(['', 'Market', 'History', 'SIFT model', 'Opponent', 'Status', '']);
    // Contract (always) and Research (where he has a page) sit under every column; no column is ranked.
    expect(await page.locator('.pd-crow--acts .pd-cell').count()).toBe(3);
    for (let i = 0; i < 3; i++) await expect(page.locator('.pd-crow--acts .pd-cell').nth(i).locator('a[data-tap="price"]')).toBeVisible();
    await noOverflow(page);
    expect(await page.locator('.pd-compare').innerText()).not.toMatch(/\b(best|winner|edge|value)\b/i);
    // A column's contract button opens the sheet, Back closes it.
    await tapAndBack(page, page.locator('.pd-crow--acts .pd-cell').first().locator('a[data-tap="price"]'), CONTRACT, { sheet: true });
    await page.goBack();                                                                                // compare to list (the compare view was an in-address view: one entry)
    await expect.poll(() => hash(page)).toBe(listHash);
    await expect(page.locator('.pd-tray')).toContainText('3 selected');
    await expect(page.locator('.pd-row .pd-tick.is-on').first()).toBeAttached();
    expect(await histLen(page)).toBeGreaterThanOrEqual(len);
  });

  test('prices: a withheld price is "—" in the list and the peek, never a number, and the tap still opens the contract', async ({ page }) => {
    await freshQuotes(page, { family: FAMILY, omit: () => true });                                                         // every quote answered without the contract
    await open(page, '/v3/props?v=1&view=list&sport=nfl');
    const px = page.locator('.pd-row a.pd-px');
    expect(await px.count()).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(6, await px.count()); i++) {
      await expect(px.nth(i)).toHaveClass(/is-none/);
      await expect(px.nth(i).locator('b')).toHaveText('—');
      await expect(px.nth(i)).toHaveAttribute('data-tap', 'price');
    }
    const lane = (await page.locator('.pd-row').first().locator('.pd-ln3 .pd-m').innerText()).trim();
    expect(lane).toMatch(/—$/);
    await tapRow(page.locator('.pd-row').first());
    const peek = page.locator('.pd-peek');
    await expect(peek.locator('.pd-trio .n.pd-m')).toHaveText('—');
    await expect(peek.locator('.pd-acts a[data-tap="price"]')).toHaveText('Contract');                // no price on the button
    for (const t of await peek.locator('.pd-rs small').allTextContents()) expect(t).toBe('—');
    expect(await page.locator('body').innerText()).not.toMatch(/\b(ago|stale|last known|last updated|updated)\b/i);
  });

  test('PD6 exact contract: Over price, implied pre-fee, taker fee and break-even; neighbouring rungs switch in place; Research and Back to list', async ({ page }) => {
    const { path } = await listWithResearchableRow(page);
    const row = page.locator('.pd-row:has(a.pd-av):has(a.pd-chip[data-tap="stat"])').first();
    await center(row);
    const rowBefore = await snap(page);
    await row.locator('a.pd-px').click();
    const sheet = page.getByRole('dialog', { name: 'Exact contract' });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('[data-state="price"]')).toContainText('Ask');
    await expect(sheet.locator('[data-state="price"]')).toContainText('pre-fee');
    await expect(sheet.locator('[data-state="fee"]')).toContainText('Taker fee at');
    await expect(sheet.locator('[data-state="fee"]')).toContainText('Fee-aware break-even');
    await expect(sheet.locator('code')).toContainText(/^KX/);
    await expect(sheet.locator('.v3c-head')).toContainText(/ at .* · Kalshi YES/);
    expect(await sheet.innerText()).not.toMatch(/\b(ago|stale|last known|last updated|updated|fresh)\b/i);
    expect(await sheet.innerText()).not.toMatch(/\b(edge|value bet)\b/i);
    // Neighbouring rungs: tapping one swaps the contract in place (no new history entry).
    const nb = sheet.locator('.v3c-nr');
    if (await nb.count() > 1) {
      const len = await histLen(page);
      const tk0 = await sheet.locator('code').innerText();
      await nb.filter({ hasNot: page.locator('[aria-pressed="true"]') }).first().click();
      await expect.poll(async () => (await sheet.locator('code').innerText()) !== tk0).toBe(true);
      expect(await histLen(page)).toBe(len);
    }
    // Back to list closes the sheet and leaves the list as it was.
    await sheet.getByRole('link', { name: 'Back to list' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await hash(page)).not.toMatch(/sheet=/);
    expect(path).toBeTruthy();
    expect((await snap(page)).hash.replace(/&?tk=[^&]*/, '')).toContain('view=list');
    expect(rowBefore.hash).toContain('view=list');
    // Research from the sheet: the destination, then Back lands on the list with every sheet closed.
    await center(row);
    await row.locator('a.pd-px').click();
    await expect(sheet).toBeVisible();
    await sheet.getByRole('link', { name: /^Research / }).click();
    await expect.poll(() => hash(page)).toMatch(PLAYER);
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.pd-row').first()).toBeVisible();
  });

  test('PD6 missing price: "Price unavailable right now" with Retry, fee and break-even hidden; Retry recovers when a quote exists', async ({ page }) => {
    let withhold = true;
    await freshQuotes(page, { family: FAMILY, fail: () => withhold });
    await listWithResearchableRow(page);
    const row = page.locator('.pd-row:has(a.pd-av)').first();
    await center(row);
    await expect(row.locator('a.pd-px')).toHaveClass(/is-none/);
    await row.locator('a.pd-px').click();
    const sheet = page.getByRole('dialog', { name: 'Exact contract' });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('[data-state="unavailable"]')).toContainText('Price unavailable right now');
    await expect(sheet.getByRole('button', { name: 'Retry' })).toBeVisible();
    const txt = await sheet.innerText();
    expect(txt).not.toMatch(/Taker fee|break-even|Implied|\d+¢/);
    await expect(sheet.locator('[data-state="fee"]')).toHaveCount(0);
    expect(txt).not.toMatch(/\b(ago|stale|last known|last updated|updated)\b/i);
    withhold = false;
    await sheet.getByRole('button', { name: 'Retry' }).click();
    await expect(sheet.locator('[data-state="price"]')).toBeVisible({ timeout: 20_000 });
    await expect(sheet.locator('[data-state="fee"]')).toContainText('Fee-aware break-even');
  });

  test('PD6 deep link: a shared contract address opens the sheet over the list with the contract resolved', async ({ page }) => {
    await listWithResearchableRow(page);
    const dest = await page.locator('.pd-row a.pd-px').first().getAttribute('data-dest');
    expect(dest).toMatch(CONTRACT);
    await go(page, dest!);
    const sheet = page.getByRole('dialog', { name: 'Exact contract' });
    await expect(sheet).toBeVisible({ timeout: 60_000 });
    await expect(sheet.locator('.v3c-head b')).toContainText(/: \d+\+ /);
    await page.goBack().catch(() => undefined);
  });

  test('missing data is honest: History "—" where no game log exists, SIFT model "—" with its reason, no matchup chip where no ranking', async ({ page }) => {
    await open(page, '/v3/props?v=1&view=list&sport=mlb');
    test.skip((await page.locator('.pd-row').count()) === 0, 'no MLB props on this slate');
    const row = page.locator('.pd-row').first();
    await expect(row.locator('.pd-chip.is-none')).toHaveText('no matchup rows');
    await center(row);
    await tapRow(row);
    const peek = page.locator('.pd-peek');
    await expect(peek.locator('.pd-whyno').first()).toContainText('No game log is published');
    await expect(peek.locator('.pd-trio .n.pd-hc')).toHaveText('—');
    // MLB shows prices only: no history lane value, no player page link.
    await expect(peek.locator('.pd-acts a[data-tap="player"]')).toHaveCount(0);
  });

  test('SIFT model lane: a number only where the approval ledger and the published projection allow it; otherwise "—" with the reason; never beside an "edge"', async ({ page }) => {
    await open(page, '/v3/props?v=1&view=list&sport=nhl');
    test.skip((await page.locator('.pd-row').count()) === 0, 'no NHL props on this slate');
    const row = page.locator('.pd-row').first();
    await expect(row.locator('.pd-ln3 .pd-z')).toContainText('—');                                       // hockey has no approved model publication
    await center(row);
    await tapRow(row);
    await expect(page.locator('.pd-peek .pd-trio .n.pd-z')).toHaveText('—');
    await expect(page.locator('.pd-peek')).toContainText('not approved');
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/\b(edge|value bet|mispric|underpriced|overpriced)\b/i);
  });

  test('saving a prop saves Player Research for that statistic and line; saving a list view saves the list address', async ({ page }) => {
    const { path } = await listWithResearchableRow(page);
    await page.evaluate(() => localStorage.removeItem('sift3.saved'));
    const row = page.locator('.pd-row:has(a.pd-av)').first();
    await center(row);
    await tapRow(row);
    const peek = page.locator('.pd-peek');
    await peek.getByRole('button', { name: /to saved research$/ }).click();
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sift3.saved') ?? '[]'));
    expect(saved).toHaveLength(1);
    expect(saved[0].route).toMatch(/^\/v3\/player\/[a-z]+\/[^?]+\?v=\d+&.*stat=[a-z_]+&.*line=\d/);
    expect(saved[0].route).not.toMatch(/sheet=|demo=|exp=/);
    await page.getByRole('button', { name: 'Save this view' }).click();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sift3.saved') ?? '[]'));
    expect(saved).toHaveLength(2);
    const view = saved.find((s: { route: string }) => s.route.startsWith('/v3/props'));
    expect(view.route).toContain('view=list');
    expect(view.route).toContain(path.split('?')[1].split('&').find((p) => p.startsWith('sport=')) ?? 'sport=');
    // Opening the saved view restores that state exactly.
    await open(page, view.route);
    await expect(page.getByRole('button', { name: 'Remove this view from saved research' })).toBeVisible();
  });

  test('Back from Player, Game and Stat restores filters, sort, search, selections, the expanded row and scroll (one combined state)', async ({ page }) => {
    const { path } = await listWithResearchableRow(page);
    await open(page, `${path}&sort=price&q=a`);
    await page.evaluate(() => window.scrollTo(0, 420));
    await page.waitForTimeout(300);
    const id = await page.locator('.pd-row:has(a.pd-av):has(a.pd-chip[data-tap="stat"])').first().getAttribute('data-prop');
    const row = page.locator(`.pd-row[data-prop="${id}"]`);                                             // by identity: in tick mode the avatar is not a link
    await center(row);
    await page.getByRole('button', { name: /^Compare/ }).click();                                       // compare mode on: a tap ticks the row
    await expect(page).toHaveURL(/cmpm=1/);
    await tapRow(row);
    await expect(page).toHaveURL(/cmp=/);
    await page.getByRole('button', { name: /^Compare/ }).click();                                       // leave compare mode, keep the selection
    await expect(page).not.toHaveURL(/cmpm=1/);
    await tapRow(row);                                                          // expand
    await expect(page.locator('.pd-peek')).toBeVisible();
    const peek = page.locator('.pd-peek');
    for (const [loc, dest] of [[peek.locator('.pd-acts a.pd-abtn--pri'), PLAYER], [row.locator('.pd-pn a[data-tap="game"]'), GAME], [peek.locator('a.pd-umu'), STAT]] as const) {
      const before = await snap(page);
      await tapAndBack(page, loc, dest);
      const after = await snap(page);
      expect(after.hash).toBe(before.hash);
      expect(after.hash).toMatch(/sort=price/);
      expect(after.hash).toMatch(/cmp=/);
      expect(after.hash).toMatch(/exp=/);
      expect(after.q).toBe('a');
    }
  });

  test('layout: the opponent chip beside or under the line is decided from measured text, and nothing overflows its row at 390 or 375', async ({ page }) => {
    for (const [w, h] of [[390, 844], [375, 667]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await open(page, '/v3/props?v=1&view=list&sport=nfl');
      const bad = await page.evaluate(() => {
        const out: string[] = [];
        for (const r of document.querySelectorAll<HTMLElement>('.pd-row')) {
          const ps = r.querySelector<HTMLElement>('.pd-ps'), lanes = r.querySelector<HTMLElement>('.pd-ln3');
          if (!ps || !lanes) continue;
          const wrapped = r.classList.contains('is-wrap');
          const kids = [...ps.children] as HTMLElement[];
          const sameLine = kids.length === 2 && Math.abs(kids[0].getBoundingClientRect().top - kids[1].getBoundingClientRect().top) < 6;
          if (!wrapped && !sameLine) out.push(`${r.dataset.prop}: predicted one line, painted two`);
          if (wrapped && sameLine) out.push(`${r.dataset.prop}: predicted two lines, painted one`);
          if (!wrapped && ps.scrollWidth > ps.clientWidth + 1) out.push(`${r.dataset.prop}: clipped`);
          const rb = r.getBoundingClientRect(), lb = lanes.getBoundingClientRect();
          if (lb.bottom > rb.bottom + 1) out.push(`${r.dataset.prop}: lane line leaves the row`);
        }
        return out;
      });
      expect(bad, `${w}px`).toEqual([]);
      await noOverflow(page);
    }
  });
});
