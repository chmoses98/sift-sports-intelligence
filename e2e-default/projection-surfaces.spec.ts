// One projection per stat on the SIFT 2.0 surfaces (the release interface): Home, Games, Game Command Center with its Player Snapshot,
// the Player Prop Explorer, the Research Lab, and the Player and Market pages the Explorer links to. For a promoted stat (NFL
// receptions) the selected projection's value, range, drawn distribution and probability of the over agree; the established
// simulation's number never appears beside it; a withheld, unpublished or contradictory distribution says so and shows no number;
// and no page carries development vocabulary. (The classic-interface twin is e2e/projection-surfaces.spec.ts.)
import type { Page } from '@playwright/test';
import { expect, NOW, test } from '../e2e/fixtures';
import { artifact, BANNED, DISTS, doc, DIST, embedded, GAME, LEGACY_MEAN, OLAVE, OLAVE_PROP, PROJ, SELECTED_MEAN, serve } from '../e2e/projectionDoc';

const ABORTED_FETCH = /\/sift-sports-intelligence\/\S+ due to access control checks/;
test.beforeEach(async ({ page, errors }) => { errors.allow(ABORTED_FETCH); await page.clock.install({ time: NOW }); });

const ROOT = '#/design/sift2';
const pct = (p: number) => `${Math.round(p * 100)}%`;
const legend = (page: Page, label: string) => page.locator('.fr-legend > div', { has: page.getByText(label, { exact: true }) }).first();
const noHorizontalOverflow = async (page: Page, what: string) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, `${what}: horizontal overflow`).toBeLessThanOrEqual(1);
};

test('Player Prop Explorer: the published distribution is drawn and value, range and probability come from it', async ({ page, context }) => {
  await serve(context);
  await page.goto(`${ROOT}/nfl/props?game=${GAME}&prop=${encodeURIComponent(OLAVE_PROP)}`);
  await expect(page.locator('#pexa-t')).toContainText('Chris Olave');
  await expect(page.locator('.fr-tile', { has: page.getByText('Projected receptions', { exact: true }) })).toContainText(SELECTED_MEAN);
  await expect(legend(page, 'Expected value')).toContainText(SELECTED_MEAN);
  await expect(legend(page, 'Prediction range (80%)')).toContainText('3–13');
  await expect(legend(page, 'Middle 50%')).toContainText('4–10');
  await expect(page.locator('.frd__cap')).toContainText('7 published quantiles');
  const line = Number((await legend(page, 'Market line').locator('dd').innerText()).trim());
  await expect(legend(page, 'Probability of over')).toContainText(pct(DIST.thresholds[String(Math.ceil(line))]));
  await expect(page.locator('.pexa').first().getByText(LEGACY_MEAN, { exact: true })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(BANNED);
  await noHorizontalOverflow(page, 'explorer');
  await page.screenshot({ path: 'test-results/sift2-projection-distribution.png' });
});

test('Player Prop Explorer: no artifact draws nothing; a self-contradicting one is dropped; an embedded one withholds the projection', async ({ page, context }) => {
  await serve(context, { artifact: null });
  await page.goto(`${ROOT}/nfl/props?game=${GAME}&prop=${encodeURIComponent(OLAVE_PROP)}`);
  await expect(page.locator('.frd--none')).toContainText('No published distribution');
  await expect(legend(page, 'Prediction range (80%)')).toContainText('3–13');
  await context.unroute(PROJ);
  const feed = doc();
  await serve(context, { feed, artifact: artifact(feed, { survival: { ...DIST.thresholds, '9': 0.9 } }) });
  await page.reload();
  await expect(page.locator('.frd--none')).toContainText('No published distribution');
  await expect(page.locator('.fr-tile', { has: page.getByText('Projected receptions', { exact: true }) })).toContainText(SELECTED_MEAN);
  await context.unroute(PROJ);
  await context.unroute(DISTS);
  await serve(context, { feed: embedded({ thresholds: { ...DIST.thresholds, '9': 0.9 } }), artifact: null });
  await page.reload();
  await expect(page.getByTestId('projection-note').first()).toContainText('Projection withheld');
  await expect(page.locator('.frd')).toHaveCount(0);
  await expect(page.locator('.pexa').first().getByText(SELECTED_MEAN, { exact: true })).toHaveCount(0);
  await expect(page.locator('.pexa').first().getByText(LEGACY_MEAN, { exact: true })).toHaveCount(0);
});

const SURFACES: [string, string][] = [
  ['Home', `${ROOT}/home`],
  ['Games', `${ROOT}/games`],
  ['Game Command Center', `${ROOT}/nfl/game/${GAME}`],
  ['Player Prop Explorer (all sports)', `${ROOT}/props`],
  ['Research Lab', `${ROOT}/lab?sport=nfl`],
];
for (const state of ['promoted', 'withheld', 'unavailable'] as const) {
  for (const [name, url] of SURFACES) {
    test(`${name}: no development vocabulary and no second projection (${state} feed)`, async ({ page, context }) => {
      if (state !== 'unavailable') await serve(context, { feed: doc({}, { gate: state === 'withheld' ? 'BLOCK' : 'PASS' }) });
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).not.toContainText(BANNED);
      await noHorizontalOverflow(page, `${name} (${state})`);
    });
  }
}

test('Game Command Center: the Player Snapshot shows one projection for Olave, with its reliability, and no second value', async ({ page, context }) => {
  await serve(context);
  await page.goto(`${ROOT}/nfl/game/${GAME}`);
  await expect(page.locator('.sift2-command')).toBeVisible();
  const snap = page.locator('.s2-player-explorer');
  await expect(snap).toBeVisible();
  await snap.getByRole('searchbox').fill('Olave');
  const olave = snap.locator('.s2-player', { hasText: 'Chris Olave' });
  await expect(olave).toBeVisible();
  await expect(olave).not.toContainText(LEGACY_MEAN);
  await expect(snap).not.toContainText(BANNED);
});

for (const state of ['promoted', 'withheld'] as const) {
  test(`Player page (from the Explorer): one projection for Olave's receptions, or a reason (${state})`, async ({ page, context }) => {
    await serve(context, { feed: doc({}, { gate: state === 'withheld' ? 'BLOCK' : 'PASS' }) });
    await page.goto(`${ROOT}/nfl/player/${OLAVE}`);
    const row = page.locator('.fr-plprops tr', { has: page.getByText('Receptions', { exact: true }) });
    await expect(row).toBeVisible();
    if (state === 'promoted') await expect(row).toContainText(SELECTED_MEAN);
    else await expect(row).toContainText('withheld');
    await expect(row).not.toContainText(LEGACY_MEAN);
    await expect(page.locator('body')).not.toContainText(BANNED);
    await noHorizontalOverflow(page, `player page (${state})`);
  });
}

test('Market page (from the Explorer): the projection’s probability of the line, no second model price', async ({ page, context }) => {
  await serve(context);
  await page.goto(`${ROOT}/nfl/market/mkt_kalshi_KXNFLREC-26OCT05ATLNO-NOCOLAVE12-7?event=${GAME}`);
  const px = page.locator('.px', { has: page.getByText('Projected probability of YES', { exact: true }) });
  await expect(px).toContainText(`${(DIST.thresholds['7'] * 100).toFixed(1)}¢`);
  await expect(page.getByText('Model fair P(YES)', { exact: true })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(BANNED);
});
