// Owner item #14: the NFL one-score game split by winner. The bundled NE @ BUF publication predates sim-script-1.1.0,
// so the test attaches `by_close_result` with shares that satisfy the upstream identities (tests/closeSplit.test.ts):
// BUF by 1–6 = 0.2259, tie 0.0024, NE by 1–6 = 0.1358 (sum = within6 0.3641). Without it the pooled script stays.
import { expect, NEBUF, noHorizontalOverflow, NOW, test } from './fixtures';

const BUF = { 'win1-6': { share_of_rows: 0.2259, pass_rate_mean: 0.5871, pass_att_mean: 32.4, rush_att_mean: 29.6, plays_mean: 64.4 }, tie: { share_of_rows: 0.0024, n_rows: 48, note: 'too few rows' }, 'lose1-6': { share_of_rows: 0.1358, pass_rate_mean: 0.6281, pass_att_mean: 34.4, rush_att_mean: 27.0, plays_mean: 64.2 } };
const NE = { 'win1-6': { share_of_rows: 0.1358, pass_rate_mean: 0.6012, pass_att_mean: 31.2, rush_att_mean: 28.4, plays_mean: 62.8 }, tie: { share_of_rows: 0.0024, n_rows: 48, note: 'too few rows' }, 'lose1-6': { share_of_rows: 0.2259, pass_rate_mean: 0.6355, pass_att_mean: 32.6, rush_att_mean: 26.9, plays_mean: 62.5 } };

test.beforeEach(async ({ page }) => page.clock.install({ time: NOW }));

test('the one-score game is two winner-specific scripts with exact fits, and the tie share is stated @journey', async ({ page }) => {
  await page.context().route(new RegExp(`/data/nfl/app/latest/explorer/events/${NEBUF}\\.json`), async (route) => {
    const resp = await route.fetch();
    const doc = await resp.json();
    doc.extensions.game_script_inputs.team_volume.BUF.by_close_result = BUF;
    doc.extensions.game_script_inputs.team_volume.NE.by_close_result = NE;
    await route.fulfill({ response: resp, json: doc });
  });
  await page.goto(`./#/nfl/game/${NEBUF}?tab=script`);
  await expect(page.getByRole('heading', { name: 'Choose a script' })).toBeVisible();
  await expect(page.getByText('Bills Win a Close One').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('Patriots Win a Close One').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('Patriots Keep It Close')).toHaveCount(0);
  await expect(page.getByTestId('close-split-note')).toContainText('Ties after overtime: 0.2% of simulated games');
  // The BUF moneyline always wins in three of the five scripts (BUF 14+, 7–13 and 1–6).
  await expect(page.getByText(/Survives 3 of 5 scripts/).filter({ visible: true }).first()).toBeVisible();

  // Pick the underdog's close win: its ways to bet lead with the NE moneyline; the URL deep-links it.
  await page.getByRole('link', { name: /Patriots Win a Close One/ }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/script=dog-close/);
  await expect(page.getByRole('heading', { name: /Ways to bet Patriots Win a Close One/i })).toBeVisible();
  await expect(page.getByText('No spread wins in every one-score game')).toHaveCount(0);
  await noHorizontalOverflow(page, 'close-split script tab');
});

test('without the split the pooled one-score script is kept, never guessed @journey', async ({ page }) => {
  await page.goto(`./#/nfl/game/${NEBUF}?tab=script`);
  await expect(page.getByRole('heading', { name: 'Choose a script' })).toBeVisible();
  await expect(page.getByText('Patriots Keep It Close').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('Bills Win a Close One')).toHaveCount(0);
  await expect(page.getByTestId('close-split-note')).toHaveCount(0);
});
