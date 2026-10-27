// Semantic targets never steal each other's taps, on every v3 screen with dense rows (real published documents, fixed clock). The helper
// samples points inside each target's own box with elementFromPoint and fails when another semantic target answers there.
import { test, expect, type Page } from '@playwright/test';
import { stolenTaps } from './support/hitTargets';
import { feedNow, useRealFeeds } from './support/realFeeds';

test.setTimeout(120_000);
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.clock.setFixedTime(feedNow());
  await useRealFeeds(page);
});

const go = async (page: Page, path: string) => { await page.goto(`./#${path}`); await expect(page.locator('[data-v3-shell]')).toBeVisible(); await page.waitForTimeout(5000); };

async function sweep(page: Page, path: string) {
  await go(page, path);
  const found: string[] = [];
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < Math.min(h, 6000); y += 500) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(250);
    for (const s of await stolenTaps(page, '.v3-main')) found.push(`${s.target} @${s.at} -> ${s.stolenBy}`);
  }
  return [...new Set(found)];
}

const SCREENS: [string, string][] = [
  ['Home', '/v3'], ['Games', '/v3/games'], ['Following', '/v3/following'],
  ['Team overview', '/v3/team/nfl/DAL'], ['Team profile', '/v3/team/nfl/DAL?tab=profile'], ['Team form', '/v3/team/nfl/DAL?tab=form'],
  ['Team players', '/v3/team/nfl/DAL?tab=players'], ['Team schedule', '/v3/team/nfl/DAL?tab=schedule'],
  ['Stat ranking', '/v3/stat/nfl/adj_off_epa'],
  ['Game overview', '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3'], ['Game matchup', '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3?tab=matchup'], ['Game props', '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3?tab=props'],
];

for (const [w, h] of [[390, 844], [375, 667]] as const) {
  for (const [name, path] of SCREENS) {
    test(`${name} at ${w}x${h}: no target steals a neighbour's tap`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      expect(await sweep(page, path)).toEqual([]);
    });
  }
  test(`Player props tab at ${w}x${h}: no target steals a neighbour's tap`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await go(page, '/v3/props?v=1&view=list&sport=nfl');
    await page.waitForSelector('.pd-row a.pd-av');
    const dest = await page.locator('.pd-row a.pd-av').first().getAttribute('data-dest');
    expect(await sweep(page, `${dest!.replace(/\?.*/, '')}?tab=props`)).toEqual([]);
  });
}
