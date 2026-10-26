// Player Research (locked designs P1 to P4) against REAL published documents: the cached (or, with V3_REAL_FEEDS=live, freshly curled) feeds of
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

export { PAGE_NOW };
