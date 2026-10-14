// Intelligence-to-market chain (owner priority: MATCHUP → SCHEME → PLAYER → GAME SCRIPT → MARKET). Selecting an NFL
// matchup mismatch in the Terminal shows the chain card: the lead player, the scripts that support or cut against the
// reading, the priced contracts with the opportunity layer's call (or "not a candidate"), the strongest counterargument
// and how many scripts it survives. With the close game split (sim-script-1.1.0) the margin fit is re-read over five scripts.
import { expect, NEBUF, noHorizontalOverflow, NOW, test } from './fixtures';

const BUF = { 'win1-6': { share_of_rows: 0.2259, pass_rate_mean: 0.5871, pass_att_mean: 32.4, rush_att_mean: 29.6, plays_mean: 64.4 }, tie: { share_of_rows: 0.0024 }, 'lose1-6': { share_of_rows: 0.1358, pass_rate_mean: 0.6281, pass_att_mean: 34.4, rush_att_mean: 27.0, plays_mean: 64.2 } };
const NE = { 'win1-6': { share_of_rows: 0.1358, pass_rate_mean: 0.6012, pass_att_mean: 31.2, rush_att_mean: 28.4, plays_mean: 62.8 }, tie: { share_of_rows: 0.0024 }, 'lose1-6': { share_of_rows: 0.2259, pass_rate_mean: 0.6355, pass_att_mean: 32.6, rush_att_mean: 26.9, plays_mean: 62.5 } };
const RUN = `mm:${NEBUF}:run:BUF`;

test.beforeEach(async ({ page }) => page.clock.install({ time: NOW }));

test('a matchup mismatch is followed to its player, scripts and priced markets, never to an invented bet @journey', async ({ page }) => {
  await page.goto(`./#/intelligence?d=${encodeURIComponent(RUN)}`);
  const card = page.locator('#tm-ch');
  await expect(card.getByRole('heading', { name: 'From matchup to market' })).toBeVisible();
  const chain = card.getByRole('list', { name: 'Matchup to market chain' });
  await expect(chain.getByRole('link', { name: 'James Cook III', exact: true })).toBeVisible();
  await expect(chain.locator('.ich__sn', { hasText: 'Bills Win Big' })).toBeVisible();
  await expect(chain.getByText(/Survives 2 of 4 scripts/).first()).toBeVisible();
  // No NFL candidate exists: the price is never called a bet.
  await expect(chain.getByText('Not a candidate').first()).toBeVisible();
  await expect(chain.getByText(/research-only model price .* not a bet call/).first()).toBeVisible();
  await expect(chain.locator('.dword--back')).toHaveCount(0);
  await expect(chain.getByRole('heading', { name: 'Strongest counterargument' })).toBeVisible();
  await expect(page.locator('#tm-ev')).toContainText('None of the 2 linked contracts is a publication candidate');
  await noHorizontalOverflow(page, 'terminal chain');
});

test('with the close game split, the chain reads five scripts and the tie share @journey', async ({ page }) => {
  await page.context().route(new RegExp(`/data/nfl/app/latest/explorer/events/${NEBUF}\\.json`), async (route) => {
    const resp = await route.fetch();
    const doc = await resp.json();
    doc.extensions.game_script_inputs.team_volume.BUF.by_close_result = BUF;
    doc.extensions.game_script_inputs.team_volume.NE.by_close_result = NE;
    doc.extensions.game_script_inputs.calibration_gates = { version: 'calibration-gates-1.0.0', close_win_split: { status: 'SHOW', displayable: true } };
    await route.fulfill({ response: resp, json: doc });
  });
  await page.goto(`./#/intelligence?d=${encodeURIComponent(RUN)}`);
  const chain = page.locator('#tm-ch').getByRole('list', { name: 'Matchup to market chain' });
  await expect(chain.locator('.ich__sn', { hasText: 'Patriots Win a Close One' })).toBeVisible();
  await expect(chain.getByText(/ties after overtime 0\.2%/)).toBeVisible();
  await expect(chain.getByText(/Survives 3 of 5 scripts/).first()).toBeVisible();
});
