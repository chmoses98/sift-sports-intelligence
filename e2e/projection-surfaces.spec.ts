// One projection per stat, on every surface of the classic interface (the SIFT 2.0 surfaces are in e2e-default/): for a promoted stat
// (NFL receptions) the selected projection's expected value, prediction range, drawn distribution and probability of the over all come
// from one published distribution, the established simulation's 6.3 never appears beside it, a self-contradicting or unpublished
// distribution is not drawn or not shown, and no page carries development vocabulary.
import type { Page } from '@playwright/test';
import { expect, noHorizontalOverflow, NOW, test } from './fixtures';
import { BANNED, CORS, doc, DIST, GAME, LEGACY_MEAN, OLAVE, OLAVE_PROP, PROJ, SELECTED_MEAN } from './projectionDoc';

const EXPLORER = `./#/nfl/props?game=${GAME}&prop=${encodeURIComponent(OLAVE_PROP)}`;
const pct = (p: number) => `${Math.round(p * 100)}%`;

async function openExplorer(page: Page) {
  await page.clock.install({ time: NOW });
  await page.goto(EXPLORER);
  await expect(page.locator('#pexa-t')).toContainText('Chris Olave');
}
const legend = (page: Page, label: string) => page.locator('.fr-legend > div', { has: page.getByText(label, { exact: true }) }).first();

test('the Explorer draws the published distribution and reads value, range and probability from it @journey', async ({ page, context }) => {
  await context.route(PROJ, (r) => r.fulfill({ json: doc(), headers: CORS }));
  await openExplorer(page);
  const tile = page.locator('.fr-tile', { has: page.getByText('Projected receptions', { exact: true }) });
  await expect(tile).toContainText(SELECTED_MEAN);
  await expect(legend(page, 'Expected value')).toContainText(SELECTED_MEAN);
  await expect(legend(page, 'Median')).toContainText('7');
  await expect(legend(page, 'Middle 50%')).toContainText('4–10');
  await expect(legend(page, 'Prediction range (80%)')).toContainText('3–13');
  await expect(legend(page, '90% range')).toContainText('2–14');
  // the drawing is of the seven published quantiles, and the probability of the over is the published line probability at the main line
  await expect(page.locator('.frd__cap')).toContainText('7 published quantiles (5th · 10th · 25th · 50th · 75th · 90th · 95th)');
  await expect(page.locator('.frd--none')).toHaveCount(0);
  const line = Number((await legend(page, 'Market line').locator('dd').innerText()).trim());
  const k = Math.ceil(line);                                                    // "7+" is the over of 6.5
  await expect(legend(page, 'Probability of over')).toContainText(pct(DIST.thresholds[String(k)]));
  // one engine: no number, label or comparison from the established simulation
  const card = page.locator('.pexa').first();
  await expect(card.getByText(LEGACY_MEAN, { exact: true })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(BANNED);
  await noHorizontalOverflow(page, 'explorer with a published distribution');
  await page.screenshot({ path: 'test-results/projection-distribution.png', fullPage: false });
});

test('no published quantiles: the prediction range stays, nothing is drawn, nothing is reconstructed @journey', async ({ page, context }) => {
  await context.route(PROJ, (r) => r.fulfill({ json: doc({ quantiles: undefined }), headers: CORS }));
  await openExplorer(page);
  await expect(page.locator('.frd--none')).toContainText('No published distribution');
  await expect(legend(page, 'Prediction range (80%)')).toContainText('3–13');
  await expect(page.locator('.fr-legend', { hasText: 'Middle 50%' })).toHaveCount(0);   // no quartiles are invented from p10 / p90
  await expect(page.locator('.fr-tile', { has: page.getByText('Projected receptions', { exact: true }) })).toContainText(SELECTED_MEAN);
});

test('a distribution that contradicts its own probabilities or median withholds the projection @journey', async ({ page, context }) => {
  await context.route(PROJ, (r) => r.fulfill({ json: doc({ quantiles: { ...DIST.quantiles, p50: 9 } }), headers: CORS }));
  await openExplorer(page);
  await expect(page.getByTestId('projection-note').first()).toContainText('Projection withheld');
  await expect(page.locator('.frd')).toHaveCount(0);
  await expect(page.locator('.pexa').first().getByText(SELECTED_MEAN, { exact: true })).toHaveCount(0);
  await expect(page.locator('.pexa').first().getByText(LEGACY_MEAN, { exact: true })).toHaveCount(0);
});

test('a malformed or stale document shows no number from either engine @journey', async ({ page, context }) => {
  await context.route(PROJ, (r) => r.fulfill({ body: '{"schema": "sift.projections.v1", "players": [NaN]', headers: { ...CORS, 'content-type': 'application/json' } }));
  await openExplorer(page);
  await expect(page.getByTestId('projection-note').first()).toContainText('feed is unavailable');
  await expect(page.locator('.pexa').first().getByText(LEGACY_MEAN, { exact: true })).toHaveCount(0);
  const old = new Date(NOW.getTime() - 400 * 3600_000).toISOString();
  await context.unroute(PROJ);
  await context.route(PROJ, (r) => r.fulfill({ json: doc({ data_asof_utc: old }), headers: CORS }));
  await page.reload();
  // stale inputs: the selected projection is not shown; the approved established fallback (one number, labelled) may stand in if it passes its own checks
  await expect(page.getByTestId('projection-note').first()).toContainText(/Projection withheld|Established projection/);
  await expect(page.locator('.pexa').first().getByText(SELECTED_MEAN, { exact: true })).toHaveCount(0);
  await expect(page.locator('.frd__cap')).not.toContainText('7 published quantiles');
});

// ------------------------------------------------------------------------------- the other surfaces (classic interface)
const SURFACES: [string, string, string?][] = [
  ['Home', './#/'],
  ['Games', './#/games'],
  ['Game Command Center', `./#/nfl/game/${GAME}`],
  ['Research Lab', './#/explore?sport=nfl'],
  ['Prop hub', './#/props'],
];
for (const state of ['promoted', 'withheld', 'unavailable'] as const) {
  for (const [name, url] of SURFACES) {
    test(`${name}: no development vocabulary and no second projection (${state} feed) @journey`, async ({ page, context }) => {
      if (state !== 'unavailable') await context.route(PROJ, (r) => r.fulfill({ json: doc({}, { gate: state === 'withheld' ? 'BLOCK' : 'PASS' }), headers: CORS }));
      await page.clock.install({ time: NOW });
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).not.toContainText(BANNED);
    });
  }
}

for (const state of ['promoted', 'withheld'] as const) {
  test(`Player page: one projection for Olave's receptions, or a reason (${state}) @journey`, async ({ page, context }) => {
    await context.route(PROJ, (r) => r.fulfill({ json: doc({}, { gate: state === 'withheld' ? 'BLOCK' : 'PASS' }), headers: CORS }));
    await page.clock.install({ time: NOW });
    await page.goto(`./#/nfl/player/${OLAVE}`);
    await expect(page.locator('.fr-plprops')).toBeVisible();
    const table = page.locator('.fr-plprops');
    const row = table.locator('tr', { has: page.getByText('Receptions', { exact: true }) });
    if (state === 'promoted') await expect(row).toContainText(SELECTED_MEAN);
    else await expect(row).toContainText('withheld');
    await expect(row).not.toContainText(LEGACY_MEAN);
    await page.locator('.pthis [role=tab]', { hasText: 'Receptions' }).click();
    if (state === 'promoted') {
      await expect(page.locator('.pthis__nums')).toContainText(SELECTED_MEAN);
      await expect(page.locator('.pthis .frd__cap')).toContainText('7 published quantiles');
    } else await expect(page.getByTestId('player-projection-withheld')).toBeVisible();
    await expect(page.locator('.pthis')).not.toContainText(LEGACY_MEAN);
    await expect(page.locator('body')).not.toContainText(BANNED);
    await noHorizontalOverflow(page, `player page (${state})`);
  });
}

test('Market page: a promoted stat shows the projection’s probability of the line and no second model price @journey', async ({ page, context }) => {
  await context.route(PROJ, (r) => r.fulfill({ json: doc(), headers: CORS }));
  await page.clock.install({ time: NOW });
  await page.goto(`./#/nfl/market/mkt_kalshi_KXNFLREC-26OCT05ATLNO-NOCOLAVE12-7?event=${GAME}`);
  const px = page.locator('.px', { has: page.getByText('Projected probability of YES', { exact: true }) });
  await expect(px).toContainText(`${(DIST.thresholds['7'] * 100).toFixed(1)}¢`);
  await expect(page.getByText('Model fair P(YES)', { exact: true })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(BANNED);
  await expect(page.locator('body')).not.toContainText(LEGACY_MEAN);
});
