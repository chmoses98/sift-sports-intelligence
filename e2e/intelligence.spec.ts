// Projection-intelligence integration: the no-validated-opportunities state, the per-stat reliability line, and the safe
// failure of a missing/invalid contract. The contract is served by the test (the network is otherwise blocked).
import { expect, noHorizontalOverflow, NOW, test } from './fixtures';

const URL = /raw\.githubusercontent\.com\/chmoses98\/nfl-edge-finder\/market-data\/data\/intelligence\/nfl\/latest\.json/;
const STATS = ['receptions', 'receiving_yards', 'rushing_yards', 'carries', 'passing_yards', 'attempts', 'completions', 'passing_tds', 'interceptions', 'touchdowns'];
const contract = (validated: string[]) => ({
  schema: 'sift.disagreement_status.v1', authority: 'RESEARCH_ONLY', generated_at: '2026-10-04T12:00:00Z',
  message: 'No validated opportunities. Projection gaps against the market are research context only: in out-of-sample tests so far, trading the gap has not paid at the executable price after fees.',
  sample_accounting: { independent_player_stat_games: 4012 },
  projection_accuracy: { by_stat: Object.fromEntries(STATS.map((s) => [s, { brier_model_minus_market: 0.03, brier_se: 0.004, mean_outcome_minus_model_prob: 0.12, independent_units: 700 }])) },
  betting_signals: { validated_segments: validated, model_error_segments: [], status_counts: { UNRESOLVED: 30 } },
});

test('Top props says there are no validated opportunities when the contract lists none @journey', async ({ page, context }) => {
  await context.route(URL, (r) => r.fulfill({ json: contract([]), headers: { 'access-control-allow-origin': '*' } }));
  await page.clock.install({ time: NOW });
  await page.goto('./#/props');
  const note = page.getByTestId('validation-state').first();
  await expect(note).toContainText('No validated opportunities');
  await expect(note).not.toContainText(/^Validated/);
  await noHorizontalOverflow(page, 'props hub with the no-validated state');
  await page.screenshot({ path: 'test-results/intelligence-props-no-validated.png', fullPage: false });
});

test('a missing contract fails safe to the same no-validated state, never to validated @journey', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/props');
  await expect(page.getByTestId('validation-state').first()).toContainText('No validated opportunities');
  await expect(page.getByTestId('projection-reliability')).toHaveCount(0);
});

test('an invalid contract (wrong authority) is ignored safely @journey', async ({ page, context }) => {
  await context.route(URL, (r) => r.fulfill({ json: { ...contract(['receptions|all']), authority: 'ACTIONABLE' }, headers: { 'access-control-allow-origin': '*' } }));
  await page.clock.install({ time: NOW });
  await page.goto('./#/props');
  await expect(page.getByTestId('validation-state').first()).toContainText('No validated opportunities');
});

test('only an engine-listed validated segment produces the validated statement @journey', async ({ page, context }) => {
  await context.route(URL, (r) => r.fulfill({ json: contract(['receptions|model_below_market']), headers: { 'access-control-allow-origin': '*' } }));
  await page.clock.install({ time: NOW });
  await page.goto('./#/props');
  await expect(page.getByTestId('validation-state').first()).toContainText('1 segment(s) passed out-of-sample tests');
  await expect(page.getByTestId('validation-state').first()).toContainText('Research authority only');
});

test('the Player Prop Explorer shows the stat\'s projection reliability @journey', async ({ page, context }) => {
  await context.route(URL, (r) => r.fulfill({ json: contract([]), headers: { 'access-control-allow-origin': '*' } }));
  await page.clock.install({ time: NOW });
  await page.goto('./#/props');
  await page.locator('.tprow').first().getByRole('link').first().click();
  const rel = page.getByTestId('projection-reliability');
  await expect(rel).toBeVisible();
  await expect(rel).toContainText(/market has been the more accurate/i);
  await noHorizontalOverflow(page, 'explorer with reliability');
  await page.screenshot({ path: 'test-results/intelligence-explorer-reliability.png', fullPage: false });
});

test('Home shows the same no-validated state, compactly @journey', async ({ page, context }) => {
  await context.route(URL, (r) => r.fulfill({ json: contract([]), headers: { 'access-control-allow-origin': '*' } }));
  await page.clock.install({ time: NOW });
  await page.goto('./');
  await expect(page.locator('.htp').getByTestId('validation-state')).toContainText('No validated opportunities');
});
