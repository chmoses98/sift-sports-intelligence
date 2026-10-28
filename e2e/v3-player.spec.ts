// Player Research (locked designs P1 to P4) against REAL published documents: the committed `player` fixture family (fixtures/real, offline; with V3_REAL_FEEDS=live, freshly curled feeds) of
// the 2026-10-26 slate, CeeDee Lamb at PHI. Prices are the real quotes; the page clock is pinned a few seconds after their capture (see
// e2e/support/playerFeeds.ts), which is the only thing pinned. Each tap-matrix row owned by this milestone is exercised against the real
// components; each ends with Back and a check that the exact state returned.
import { test, expect, type Page } from '@playwright/test';
import { usePlayerFeeds, PAGE_NOW } from './support/playerFeeds';

const LAMB = '/v3/player/nfl/prt_4c661ae8b854ff5f66dd';
test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

test.beforeEach(async ({ page }) => {
  await usePlayerFeeds(page);
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
});

const go = async (page: Page, path: string) => {
  await page.goto(`./#${path}`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
};
const ready = async (page: Page, route = LAMB, on = '.v3p-hb') => { await go(page, route); await expect(page.locator(on).first()).toBeVisible({ timeout: 25_000 }); };
const hash = (page: Page) => page.evaluate(() => location.hash);
const y = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
const histLen = (page: Page) => page.evaluate(() => history.length);
const scrollTo = async (page: Page, to: number) => { await page.evaluate((t) => window.scrollTo(0, t), to); await page.waitForTimeout(250); };
/** What must come back after Back: the address (tab, stat, line, window, filters), the scroll offset, and the visible line and window. */
const snap = async (page: Page) => ({ hash: await hash(page), y: await y(page), win: await page.evaluate(() => document.querySelector('[data-win][aria-pressed="true"]')?.getAttribute('data-win') ?? null), sheet: await page.getByRole('dialog').count() });
const backTo = async (page: Page, before: Awaited<ReturnType<typeof snap>>) => {
  await page.goBack();
  await expect.poll(() => hash(page)).toBe(before.hash);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => Math.abs((await y(page)) - before.y)).toBeLessThanOrEqual(6);
  if (before.win) await expect(page.locator('[data-win][aria-pressed="true"]').first()).toHaveAttribute('data-win', before.win);
};
/** Freshness is never shown: no age, no "ago", no "last updated", no stale badge, anywhere on the screen. */
const noFreshnessText = async (page: Page) => {
  const text = await page.locator('[data-v3-shell]').innerText();
  expect(text).not.toMatch(/\bago\b|\bstale\b|last updated|last known|updated \d|\d+\s?(s|sec|min|mins|minutes|h|hr|hours)\s+old\b|as of \d/i);
};
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

test.describe('Player Research P1: overview on real documents @v3', () => {
  test('hero, game strip, five tabs, statistic pills, the decision card with its three lanes, windows and the chart', async ({ page }) => {
    await ready(page);
    await expect(page.locator('.v3p-hero h1')).toContainText('Lamb');
    await expect(page.locator('.v3p-hero')).toContainText('WR · DAL');
    await expect(page.locator('.v3p-strip-g')).toContainText(/at PHI/);
    await expect(page.getByRole('tab')).toHaveText([/^Overview/, /^Props\d+/, /^Matchup/, /^Trends/, /^Log/]);
    await expect(page.locator('.v3p-pill[data-stat="receptions"]')).toHaveAttribute('aria-pressed', 'true');
    // the decision card: line, the Over price, Market / History / SIFT model in that order
    await expect(page.locator('.v3p-dl__l .v')).toContainText(/\d+\.5/);
    await expect(page.locator('.v3p-dl__r .p')).toContainText(/Over \d+¢/);
    await expect(page.locator('.x-trio > *')).toHaveCount(3);
    await expect(page.locator('.x-trio > *').nth(0)).toContainText('Market');
    await expect(page.locator('.x-trio > *').nth(1)).toContainText('History');
    await expect(page.locator('.x-trio > *').nth(2)).toContainText('SIFT model');
    await expect(page.locator('.x-trio > *').nth(1)).toContainText(/\d+ of \d+ · observed/);
    // window chips with hit counts, the chart and the summary strip
    await expect(page.locator('[data-win]')).toHaveCount(5);
    await expect(page.locator('[data-win="L10"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.v3p-hb__bar')).toHaveCount(10);
    await expect(page.locator('.v3p-sum')).toContainText(/Hit rate/);
    await noFreshnessText(page);
    await noOverflow(page);
  });

  test('the chart is in the first viewport at 375x667 and at 390x844, with no horizontal overflow on any tab', async ({ page }) => {
    for (const [w, h] of [[375, 667], [390, 844]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await ready(page);
      const box = await page.locator('.v3p-hb').boundingBox();
      const nav = await page.locator('nav.v3-nav').boundingBox().catch(() => null);
      const barTop = nav ? nav.y : h - 72;
      expect(box!.y + box!.height).toBeLessThanOrEqual(barTop + 1);          // the whole chart, bars and labels, sits above the tab bar
      for (const tab of ['overview', 'props', 'matchup', 'trends', 'log']) { await go(page, `${LAMB}?tab=${tab}`); await page.waitForTimeout(600); await noOverflow(page); }
    }
  });

  test('in-place changes (statistic, window, bar) replace history; Back leaves the screen and the entry below keeps its own state', async ({ page }) => {
    await go(page, '/v3/explore');
    await go(page, `${LAMB}`);
    await expect(page.locator('.v3p-hb')).toBeVisible({ timeout: 25_000 });
    const len = await histLen(page);
    await page.locator('[data-win="L5"]').click();
    await expect(page).toHaveURL(/win=L5/);
    await page.locator('.v3p-pill[data-stat="targets"]').click();
    await expect(page).toHaveURL(/stat=targets/);
    await page.locator('.v3p-hb__bar').nth(1).dispatchEvent('click');
    await expect(page).toHaveURL(/obs=/);
    expect(await histLen(page)).toBe(len);
    await page.goBack();
    await expect(page).toHaveURL(/#\/v3\/explore/);
  });
});

test.describe('Player Research tap matrix (milestone 3) @v3', () => {
  test('row 18: hero logo to Team Research, and Back restores the exact state', async ({ page }) => {
    await ready(page, `${LAMB}?win=L5`);
    await scrollTo(page, 0);
    const before = await snap(page);
    const t = page.locator('.v3p-who__logo');
    await expect(t).toHaveAttribute('data-tap', 'team');
    await t.click();
    await expect(page).toHaveURL(/#\/v3\/team\/nfl\/DAL/);
    await page.waitForTimeout(500);
    await backTo(page, before);
    await expect(page.locator('.v3p-hb')).toBeVisible();
  });
  test('row 19: game strip left logo to Team Research (DAL)', async ({ page }) => {
    await ready(page);
    const before = await snap(page);
    const t = page.locator('.v3p-strip-g > a[data-tap="team"]').first();
    await expect(t).toHaveAttribute('data-dest', /\/v3\/team\/nfl\/DAL/);
    await t.click();
    await expect(page).toHaveURL(/#\/v3\/team\/nfl\/DAL/);
    await page.waitForTimeout(500);
    await backTo(page, before);
  });
  test('row 20: game strip text to Game Detail', async ({ page }) => {
    await ready(page);
    const before = await snap(page);
    const t = page.locator('.v3p-strip-g__c');
    await expect(t).toHaveAttribute('data-tap', 'game');
    await t.click();
    await expect(page).toHaveURL(/#\/v3\/game\/nfl\//);
    await page.waitForTimeout(500);
    await backTo(page, before);
  });
  test('row 21: game strip right logo to Team Research (PHI)', async ({ page }) => {
    await ready(page);
    const before = await snap(page);
    const t = page.locator('.v3p-strip-g > a[data-tap="team"]').last();
    await expect(t).toHaveAttribute('data-dest', /\/v3\/team\/nfl\/PHI/);
    await t.click();
    await expect(page).toHaveURL(/#\/v3\/team\/nfl\/PHI/);
    await page.waitForTimeout(500);
    await backTo(page, before);
  });
  test('row 22: the Over price opens the exact-contract sheet; Back closes it and the screen is as it was', async ({ page }) => {
    await ready(page);
    const before = await snap(page);
    const price = page.locator('.v3p-dl__r');
    await expect(price).toHaveAttribute('data-tap', 'price');
    await price.click();
    await expect(page).toHaveURL(/sheet=contract&tk=/);
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg.locator('[data-state="price"]')).toContainText(/Ask/);
    await expect(dlg.locator('[data-state="fee"]')).toContainText(/Fee-aware break-even/);
    await expect(dlg).toContainText('pre-fee');
    await noFreshnessText(page);
    await backTo(page, before);
  });
  test('row 23: the Market lane opens the same exact-contract sheet', async ({ page }) => {
    await ready(page);
    const before = await snap(page);
    const lane = page.locator('.v3p-lane[data-tap="price"]');
    await expect(lane).toContainText('Market');
    await lane.click();
    await expect(page).toHaveURL(/sheet=contract&tk=/);
    await expect(page.getByRole('dialog').locator('[data-state="price"]')).toBeVisible();
    await backTo(page, before);
  });
  test('row 24: a bar opens its observation, and the observation opens Game Detail for that completed game', async ({ page }) => {
    await ready(page, `${LAMB}?win=SEASON`);
    const bars = page.locator('.v3p-hb__bar');
    await bars.last().dispatchEvent('click');
    await expect(page).toHaveURL(/obs=/);
    const obs = page.locator('.v3p-obs');
    await expect(obs).toBeVisible();
    const link = obs.locator('a[data-tap="game"]');
    await expect(link).toBeVisible({ timeout: 15_000 });
    await link.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    const before = await snap(page);
    await link.click();
    await expect(page).toHaveURL(/#\/v3\/game\/nfl\//);
    await page.waitForTimeout(500);
    await backTo(page, before);
    await expect(page.locator('.v3p-obs')).toBeVisible();     // the selected game is still selected
  });
  test('row 25: the coming game’s bar opens Game Detail', async ({ page }) => {
    await ready(page);
    const before = await snap(page);
    const t = page.locator('.v3p-hb__tonight');
    await expect(t).toHaveAttribute('data-tap', 'game');
    await t.dispatchEvent('click');
    await expect(page).toHaveURL(/#\/v3\/game\/nfl\//);
    await page.waitForTimeout(500);
    await backTo(page, before);
  });
  test('row 26: a Matchup opponent strip opens Stat Detail for that statistic with PHI highlighted; Back returns to Matchup at its scroll', async ({ page }) => {
    await ready(page, `${LAMB}?tab=matchup`, '.v3p-sl');
    const row = page.locator('.v3p-sl[data-tap="stat"]').first();
    await expect(row).toBeVisible({ timeout: 25_000 });
    await expect(row).toHaveAttribute('data-dest', /\/v3\/stat\/nfl\/adj_def_/);
    await expect(row).toHaveAttribute('data-dest', /sel=PHI/);
    await scrollTo(page, 160);
    const before = await snap(page);
    await row.click();
    await expect(page).toHaveURL(/#\/v3\/stat\/nfl\/adj_def_/);
    await page.waitForTimeout(600);
    await backTo(page, before);
    await expect(page.getByRole('tab', { name: /Matchup/ })).toHaveAttribute('aria-selected', 'true');
  });
  test('row 27: a Props tab price opens the exact-contract sheet', async ({ page }) => {
    await ready(page, `${LAMB}?tab=props`, '.v3p-px');
    const px = page.locator('.v3p-px[data-tap="price"]').first();
    await expect(px).toBeVisible({ timeout: 25_000 });
    const before = await snap(page);
    await px.click();
    await expect(page).toHaveURL(/sheet=contract&tk=/);
    await expect(page.getByRole('dialog').locator('[data-state="price"]')).toBeVisible();
    await backTo(page, before);
  });
});

const DAVIS = '/v3/player/nba/prt_3b16b9a418e9e8e833f9';

/** A real touch drag (Chromium's touch events through CDP), as a finger on the line's label: the page must not scroll while it moves. */
async function touchDrag(page: Page, from: { x: number; y: number }, dy: number, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x, y: from.y + (dy * i) / steps }] });
  return { end: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) };
}

test.describe('Player Research P2: dragging the line @v3', () => {
  test('a touch drag moves the line between Kalshi rungs, shows the readout in place of the window chips, recolours the bars and never scrolls the page; release commits the line by replacing history', async ({ page }) => {
    await ready(page);
    await scrollTo(page, 90);
    const startY = await y(page);
    const len = await histLen(page);
    const lineBefore = await page.locator('.v3p-hb__grab').getAttribute('aria-valuenow');
    const hitBefore = await page.locator('.v3p-sum').innerText();
    const bb = (await page.locator('.v3p-hb__grab').boundingBox())!;
    const drag = await touchDrag(page, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }, 70);
    await expect(page.locator('.v3p-readout')).toBeVisible();
    await expect(page.locator('.v3p-wins')).toHaveCount(0);                      // the readout REPLACES the window chips while scrubbing
    await expect(page.locator('.v3p-readout')).toContainText(/Market/);
    await expect(page.locator('.v3p-readout')).toContainText(/History/);
    await expect(page.locator('.v3p-readout')).toContainText(/SIFT model/);
    expect(Math.abs((await y(page)) - startY)).toBeLessThanOrEqual(2);          // the page did not pan under the finger
    const lineNow = await page.locator('.v3p-hb__grab').getAttribute('aria-valuenow');
    expect(lineNow).not.toBe(lineBefore);
    expect(Number(lineNow) % 1).toBeCloseTo(0.5, 5);                              // a listed rung: half-point lines only
    await expect(page.locator('.v3p-sum')).not.toHaveText(hitBefore);            // every number updated with the line
    await drag.end();
    await expect(page.locator('.v3p-wins')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`line=${lineNow}`));
    expect(await histLen(page)).toBe(len);                                        // committing the line replaced history
    expect(Math.abs((await y(page)) - startY)).toBeLessThanOrEqual(2);
    // the committed line is a listed rung: the ladder marks it, and the decision card shows its contract price
    await expect(page.locator('.v3p-dl__l .v')).toContainText(String(lineNow));
    await expect(page.locator('.v3p-lr[aria-pressed="true"]')).toHaveCount(1);
  });

  test('the alt-line ladder lists every rung with its three lanes; a rung sets the line, and the sheet lists them all', async ({ page }) => {
    await ready(page);
    const rows = page.locator('.v3p-ladder .v3p-lr');
    expect(await rows.count()).toBeGreaterThan(2);
    await expect(rows.first()).toHaveAttribute('aria-label', /Market .*History .*SIFT model/);
    const target = rows.nth(1);
    const k = await target.getAttribute('data-rung');
    await target.click();
    await expect(page).toHaveURL(new RegExp(`line=${Number(k) - 0.5}`));
    await expect(page.locator('.v3p-lr[aria-pressed="true"]')).toHaveAttribute('data-rung', k!);
    // the decision card's chevron opens the sheet with every rung; choosing one lands on the screen and closes the sheet
    await page.getByRole('button', { name: 'Alt lines' }).first().click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    const all = await dlg.locator('.v3p-lr').count();
    expect(all).toBeGreaterThanOrEqual(await rows.count());
    await dlg.locator('.v3p-lr').first().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/line=/);
  });

  test('no rung is scored: the lanes are never subtracted into an edge or value', async ({ page }) => {
    await ready(page);
    const text = (await page.locator('[data-v3-shell]').innerText()).toLowerCase();
    expect(text).not.toMatch(/(?<!“)\bedge\b(?!”)|mispric|value bet|\bev\b|best bet|\+ev/);
  });
});

test.describe('Player Research P3: research filters @v3', () => {
  test('the sheet shows counts before applying; locked rows are notes, not controls; applying lands on the screen with removable chips; the sheet is closed after Back', async ({ page }) => {
    await ready(page);
    const len = await histLen(page);
    await page.getByRole('button', { name: /^Research filters/ }).click();
    const dlg = page.getByRole('dialog', { name: 'Research filters' });
    await expect(dlg).toBeVisible();
    expect(await histLen(page)).toBe(len + 1);                                     // a sheet is one history entry
    const live = dlg.locator('.v3p-live');
    await expect(live).toContainText(/games? match/);
    const before = await live.innerText();
    const away = dlg.getByRole('button', { name: /^Away/ });
    await expect(away).toContainText(/n \d+ · \d+\/\d+/);                           // sample size and hit count BEFORE applying
    await away.click();
    await expect(live).not.toHaveText(before);                                      // the live card follows the draft
    // locked rows: visible with the reason, never working controls
    for (const name of ['Teammate out', 'Weather', 'Pace', 'Favorite']) {
      await expect(dlg.getByRole('note', { name: new RegExp(`^${name}`) })).toBeVisible();
      await expect(dlg.getByRole('button', { name: new RegExp(`^${name}`) })).toHaveCount(0);
    }
    const hashBefore = await hash(page);
    await dlg.getByRole('note', { name: /^Teammate out/ }).click({ force: true });
    await dlg.getByRole('note', { name: /^Weather/ }).click({ force: true });
    expect(await hash(page)).toBe(hashBefore);                                      // nothing happened
    await dlg.getByRole('button', { name: /^Show \d+ games?/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/site=away/);
    await expect(page.locator('.v3p-fchip')).toHaveText(['Away']);
    await expect(page.locator('.v3p-pill--f b')).toHaveText('1');                   // count badge on the filter button
    // removing the chip clears the filter in place
    const len2 = await histLen(page);
    await page.getByRole('button', { name: 'Remove filter Away' }).click();
    await expect(page).not.toHaveURL(/site=/);
    expect(await histLen(page)).toBe(len2);
  });

  test('Back restores line, window and filters exactly, after a team page and after a sheet; scroll too; sheets closed', async ({ page }) => {
    await go(page, '/v3/explore');
    await ready(page, `${LAMB}?win=L5&site=away`);
    await page.locator('.v3p-lr').nth(1).click();
    await scrollTo(page, 120);
    const before = await snap(page);
    expect(before.hash).toMatch(/line=/);
    await page.getByRole('button', { name: /^Research filters/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.goBack();                                                            // Back closes the sheet and leaves the state alone
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await hash(page)).toBe(before.hash);
    await page.locator('.v3p-strip-g > a[data-tap="team"]').last().evaluate((a) => (a as HTMLElement).click());
    await expect(page).toHaveURL(/#\/v3\/team\/nfl\/PHI/);
    await page.waitForTimeout(500);
    await backTo(page, before);
    await expect(page.locator('.v3p-fchip')).toHaveText(['Away']);
    await expect(page.locator('[data-win="L5"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a filter that leaves no game says "0 games match" and one tap removes it', async ({ page }) => {
    await ready(page, `${LAMB}?win=L5&min=40`, '.v3p-fchip');
    await expect(page.getByText('0 games match')).toBeVisible();
    await page.getByRole('button', { name: 'Remove all filters' }).click();
    await expect(page.locator('.v3p-hb__bar').first()).toBeVisible();
  });
});

test.describe('Player Research: saved research @v3', () => {
  test('the hero bookmark saves the exact route with chips and a snapshot; opening it from Following restores the same line, window and filters every time', async ({ page }) => {
    await ready(page, `${LAMB}?win=L5&site=away`);
    await page.locator('.v3p-lr').nth(1).click();
    const want = await hash(page);
    const line = /line=([\d.]+)/.exec(want)![1];
    await page.getByRole('button', { name: 'Save this research' }).last().click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sift3.saved') ?? '[]'));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ kind: 'player', sport: 'nfl' });
    expect(saved[0].chips).toEqual(expect.arrayContaining(['L5', 'Away']));
    expect(saved[0].chips.some((c: string) => /^\d+\+$/.test(c))).toBe(true);
    expect(saved[0].snapshot.length).toBeGreaterThan(0);
    expect(saved[0].route).toContain(`line=${line}`);
    expect(saved[0].route).toMatch(/win=L5/);
    expect(saved[0].route).toMatch(/site=away/);
    expect(saved[0].route).not.toMatch(/sheet=|demo=/);
    for (let i = 0; i < 2; i++) {
      await go(page, '/v3/following');
      await page.locator('.v3-hit--saved .v3-hit__l').first().click();
      await expect(page.locator('.v3p-hb')).toBeVisible({ timeout: 25_000 });
      await expect(page).toHaveURL(new RegExp(`line=${line}`));
      await expect(page).toHaveURL(/win=L5/);
      await expect(page).toHaveURL(/site=away/);
      await expect(page.locator('.v3p-dl__l .v')).toContainText(line);
      await expect(page.locator('[data-win="L5"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.v3p-fchip')).toHaveText(['Away']);
      await expect(page.getByRole('button', { name: 'Remove saved research' }).first()).toBeVisible();   // it knows it is saved
    }
  });
});

test.describe('Player Research: tabs, Trends, Log and SIFT Replay @v3', () => {
  test('tabs change in place (history is not added), keep the statistic, and each has its content', async ({ page }) => {
    await ready(page);
    const len = await histLen(page);
    await page.getByRole('tab', { name: /^Trends/ }).click();
    await expect(page).toHaveURL(/tab=trends/);
    await expect(page.getByRole('region', { name: 'Windows' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Splits' })).toBeVisible();
    await page.getByRole('tab', { name: /^Log/ }).click();
    await expect(page).toHaveURL(/tab=log/);
    await expect(page.locator('.v3p-gl li').first()).toBeVisible();
    await page.getByRole('tab', { name: /^Props/ }).click();
    await expect(page.locator('.v3p-prow').first()).toBeVisible();
    await page.getByRole('tab', { name: /^Overview/ }).click();
    await expect(page.locator('.v3p-hb')).toBeVisible();
    expect(await histLen(page)).toBe(len);
    await noFreshnessText(page);
  });

  test('Trends: a window row shows that window on the chart; a split row applies that cut', async ({ page }) => {
    await ready(page, `${LAMB}?tab=trends`, '.v3p-tt__r');
    await page.locator('.v3p-tt__r[data-win="L5"]').click();
    await expect(page).not.toHaveURL(/tab=trends/);                                // back on Overview (the default tab is not written)
    await expect(page).toHaveURL(/win=L5/);
    await expect(page.locator('.v3p-hb')).toBeVisible();
    await go(page, `${LAMB}?tab=trends&win=ALL`);
    await expect(page.locator('.v3p-spr').first()).toBeVisible({ timeout: 25_000 });
    await page.locator('.v3p-spr[data-split="site:away"]').click();
    await expect(page).toHaveURL(/site=away/);
    await expect(page.locator('.v3p-hb')).toBeVisible();
  });

  test('Log: newest first, each row shows the statistic and whether it cleared the line, and opens Game Detail where the schedule lists the game', async ({ page }) => {
    await ready(page, `${LAMB}?tab=log&win=SEASON`, '.v3p-gl li');
    const first = page.locator('.v3p-gl li').first();
    await expect(first).toContainText(/Over|Under|Push/);
    const link = page.locator('.v3p-gl a[data-tap="game"]').first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    await link.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    const before = await snap(page);
    await link.click();
    await expect(page).toHaveURL(/#\/v3\/game\/nfl\//);
    await page.waitForTimeout(500);
    await backTo(page, before);
    // the opponent logo of a row is its own target (a team), not the row's
    await expect(page.locator('.v3p-gl a[data-tap="team"]').first()).toHaveAttribute('data-dest', /\/v3\/team\/nfl\//);
  });

  test('SIFT Replay: reachable from Trends, in the address, mode switch replaces history, honest "adjusted what-if not available", Back to Trends', async ({ page }) => {
    await ready(page, `${LAMB}?tab=trends`, '.v3p-replaylink');
    const len = await histLen(page);
    await page.locator('.v3p-replaylink').click();
    await expect(page).toHaveURL(/view=replay/);
    await expect(page.getByRole('region', { name: 'SIFT Replay' })).toBeVisible();
    await expect(page.getByText('Adjusted what-if: not available.')).toBeVisible();
    await page.getByRole('button', { name: 'Head-to-head' }).click();
    await expect(page).toHaveURL(/rmode=h2h/);
    await expect(page.getByRole('button', { name: 'Head-to-head' })).toHaveAttribute('aria-pressed', 'true');
    expect(await histLen(page)).toBe(len);
    await page.getByRole('button', { name: 'Back to Trends' }).click();
    await expect(page).not.toHaveURL(/view=replay/);
    await expect(page.getByRole('region', { name: 'Windows' })).toBeVisible();
  });

  test('old saved or shared routes keep working: tab=replay opens Replay (with its mode), tab=log opens Log, an unknown tab opens Overview', async ({ page }) => {
    await ready(page, `${LAMB}?tab=replay`, '[aria-label="SIFT Replay"]');
    await expect(page.getByRole('tab', { name: /^Trends/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Adjusted what-if: not available.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Similar games' })).toHaveAttribute('aria-pressed', 'true');
    await ready(page, `${LAMB}?v=1&tab=replay&win=H2H&stat=receptions`, '[aria-label="SIFT Replay"]');
    await expect(page.getByRole('button', { name: 'Head-to-head' })).toHaveAttribute('aria-pressed', 'true');
    await ready(page, `${LAMB}?tab=log`, '.v3p-gl li');
    await expect(page.getByRole('tab', { name: /^Log/ })).toHaveAttribute('aria-selected', 'true');
    await ready(page, `${LAMB}?v=1&tab=whatever`);
    await expect(page.getByRole('tab', { name: /^Overview/ })).toHaveAttribute('aria-selected', 'true');
    // a saved record of the old vocabulary is revived into the new one and opens
    await page.evaluate(() => localStorage.setItem('sift3.saved', JSON.stringify([{ id: 'rold', title: 'Lamb', subtitle: 'Replay', route: '/v3/player/nfl/prt_4c661ae8b854ff5f66dd?v=1&tab=replay&stat=receptions', savedAt: 1 }])));
    await page.reload();
    await go(page, '/v3/following');
    await page.locator('.v3-hit--saved .v3-hit__l').first().click();
    await expect(page.locator('[aria-label="SIFT Replay"]')).toBeVisible({ timeout: 25_000 });
  });
});

test.describe('Player Research: missing data and missing quotes @v3', () => {
  test('a withheld price shows "—" in lists and, in the exact-contract sheet, exactly "Price unavailable right now" with Retry, hiding fee and break-even', async ({ page }) => {
    // Three hours after the captured quotes: the display gate withholds every price (the documents are the same real ones).
    await page.clock.setFixedTime(PAGE_NOW + 3 * 3600_000);
    await ready(page);
    await expect(page.locator('.v3p-dl__r .p')).toHaveText(/Over —/);
    await expect(page.locator('.x-trio > *').nth(0)).toContainText('—');
    await page.getByRole('tab', { name: /^Props/ }).click();
    await expect(page.locator('.v3p-px b').first()).toHaveText('—');
    const before = await snap(page);
    await page.locator('.v3p-px').first().click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.locator('[data-state="unavailable"]')).toContainText('Price unavailable right now');
    await expect(dlg.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(dlg.locator('[data-state="fee"]')).toHaveCount(0);
    await expect(dlg.locator('[data-state="price"]')).toHaveCount(0);
    await expect(dlg).not.toContainText(/break-even|taker fee/i);
    await noFreshnessText(page);
    await backTo(page, before);
  });

  test('no markets at all: the player and the chart still work, the lane says there is no market, nothing is invented', async ({ page }) => {
    await page.route(/raw\.githubusercontent\.com\/.*\/event_detail\/.*\.json/, (r) => r.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } }));
    await ready(page);
    await expect(page.locator('.v3p-dl__r')).toContainText(/reference line · no market|Over —/);
    await expect(page.locator('.x-trio > *').nth(0)).toContainText('—');
    await expect(page.locator('.v3p-hb__bar').first()).toBeVisible();
  });

  test('no game log: an honest state, the Props tab still lists contracts, no chart is drawn', async ({ page }) => {
    await page.route(/\/data\/nfl\/history\/players\/.*\.json/, (r) => r.fulfill({ status: 404, body: 'not found' }));
    await go(page, LAMB);
    await expect(page.getByText('No game history to chart')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.v3p-hb')).toHaveCount(0);
    await go(page, `${LAMB}?tab=trends`);
    await expect(page.getByText('No game history')).toBeVisible();
  });

  test('basketball (published box logs): the chart works, the SIFT lane says why it is empty, Matchup says "No matchup rows"', async ({ page }) => {
    await ready(page, DAVIS);
    await expect(page.locator('.v3p-hero h1')).toContainText('Davis');
    await expect(page.locator('.x-trio > *').nth(2)).toContainText('—');
    await expect(page.locator('.x-trio > *').nth(2)).toContainText(/awaiting live inputs|not approved yet/);
    await go(page, `${DAVIS}?tab=matchup`);
    await expect(page.getByText('No matchup rows')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole('button', { name: /Teammate out/ })).toHaveCount(0);
  });

  test('a sport with no published player research says so and offers search', async ({ page }) => {
    await go(page, '/v3/player/tennis/prt_nobody');
    await expect(page.getByText(/not available|no player profiles/i).first()).toBeVisible({ timeout: 25_000 });
    await noOverflow(page);
  });
});

test.describe('Player Research: the SIFT model lane only where the approval ledger allows it @v3', () => {
  test('football receptions (PROMOTED in the ledger) shows the published P(7+); receiving yards (HELD) shows "—" with the ledger’s words; both say the same on Matchup', async ({ page }) => {
    await ready(page);
    const lane = page.locator('.v3p-lane[data-ledger]');
    await expect(lane).toHaveAttribute('data-ledger', 'NFL:receptions:PROMOTED:2026-10-18');
    await expect(lane).toHaveAttribute('data-lane', 'value');
    await expect(lane).toContainText(/\d+%/);
    await expect(page.locator('.v3p-decide .v3p-foot')).toContainText('approved model estimate');
    await page.locator('.v3p-pill[data-stat="receiving_yards"]').click();
    await expect(page.locator('.v3p-lane[data-ledger]')).toHaveAttribute('data-ledger', 'NFL:receiving_yards:HELD:2026-10-18');
    await expect(page.locator('.v3p-lane[data-ledger]')).toHaveAttribute('data-lane', 'withheld');
    await expect(page.locator('.v3p-lane[data-ledger]')).toContainText('not approved yet');
    await expect(page.locator('.v3p-decide .v3p-foot')).toContainText('no approved model estimate');
    // Matchup tells the same story: the label counts approved stages from the same ledger, and Rec yards is "not approved yet"
    await go(page, `${LAMB}?tab=matchup&stat=receptions`);
    await expect(page.locator('[data-ledger-chip]')).toContainText(/3 of 4 approved/, { timeout: 25_000 });
    await expect(page.locator('.v3p-cn[data-ledger="NFL:receiving_yards:HELD:2026-10-18"]')).toContainText('not approved yet');
    await expect(page.locator('.v3p-cn[data-ledger="NFL:receptions:PROMOTED:2026-10-18"]')).not.toContainText('not approved yet');
    await expect(page.locator('.v3p-chain')).not.toContainText('research-only');
  });
});
