// One projection per stat. For a stat whose approved engine is the Projection Foundation model (NFL receptions here) the
// Explorer, Home and the Game Command Center show ONE number — the selected model's — with its range, reliability,
// availability and update time; the previous model's number never appears beside it, a withheld projection shows a
// reason and no number from either engine, and a stat on the established model is unchanged. Contracts are served by the test.
import type { Page } from '@playwright/test';
import { expect, noHorizontalOverflow, NOW, test } from './fixtures';

const PROJ = /raw\.githubusercontent\.com\/chmoses98\/nfl-edge-finder\/projection-data\/projections\/nfl\/latest\.json/;
const SUMMARY = /raw\.githubusercontent\.com\/chmoses98\/nfl-edge-finder\/projection-data\/summary\/nfl\/latest\.json/;
const CORS = { 'access-control-allow-origin': '*' };

// A real receiver with a priced receptions line on the bundled ATL–NO game (the established simulation projects 6.3 for him).
const GAME = 'evt_639f74e87ff25310c542';
const OLAVE = 'prt_9b2e8d8fa10766e401a1|receptions';
const LEGACY_MEAN = '6.3';
const SELECTED_MEAN = '7.3';
const RUNGS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const EXPLORER = `./#/nfl/props?game=${GAME}&prop=${encodeURIComponent(OLAVE)}`;

const fresh = () => new Date(NOW.getTime() - 3 * 3600_000).toISOString();
const doc = (over: Record<string, unknown> = {}, gate: 'PASS' | 'BLOCK' = 'PASS') => ({
  schema: 'sift.projections.v1', sport: 'NFL', generated_utc: fresh(), data_asof_utc: fresh(),
  model: { id: 'pf-nfl', version: 'pf-1.2.1', authority: 'research_only' },
  families: { receptions: { readiness: 'READY', model: 'F', reason: 'test' }, passing_tds: { readiness: 'NEEDS IMPROVEMENT', model: 'D', reason: 'test' } },
  games: [],
  players: [{
    player_id: 'gsis-olave', name: 'Chris Olave', team: 'NO', opponent: 'ATL', game_id: GAME, family: 'receptions', mean: 7.3, median: 7, p10: 4, p90: 11,
    thresholds: Object.fromEntries(RUNGS.map((k, i) => [String(k), Math.max(0.02, +(0.97 - i * 0.09).toFixed(2))])),
    opportunity: { family: 'targets', mean: 9.4, p10: 6, p90: 13 }, opponent_adjustment: { factor: 1.03, sample_games: 5 }, adjustments: ['Role from last 8 games'],
    readiness: 'READY', gate: gate === 'PASS' ? { status: 'PASS', findings: [] } : { status: 'BLOCK', findings: [{ check: 'injury', severity: 'BLOCK', what: 'Player listed OUT', category: 'data_quality', action: '' }] },
    participation: { status: 'CONFIRMED_ACTIVE', certainty: 'CONFIRMED', source: 'nfl_roster_inactives', captured_utc: fresh(), reasons: [] },
    segments: { new_team_first4: false, tier: 'starter', backup: false, rookie: false }, role: 'shadow', data_asof_utc: fresh(), ...over,
  }],
});

async function open(page: Page, url = EXPLORER) {
  await page.clock.install({ time: NOW });
  await page.goto(url);
  await expect(page.locator('#pexa-t')).toContainText('Chris Olave');
}
const tile = (page: Page) => page.locator('.fr-tile', { has: page.getByText(/^Projected /) }).first();

test('a promoted stat shows exactly one projection, with reliability, availability and update time @journey', async ({ page, context }) => {
  await context.route(PROJ, (r) => r.fulfill({ json: doc(), headers: CORS }));
  await open(page);
  await expect(tile(page)).toContainText(SELECTED_MEAN);
  await expect(tile(page)).not.toContainText(LEGACY_MEAN);
  const note = page.getByTestId('projection-note').first();
  await expect(note).toContainText('High reliability');
  await expect(note).toContainText('Confirmed to play');
  await expect(note).toContainText(/Updated Oct/);
  await expect(note).toContainText('realistic range 4.0–11.0');
  const card = page.locator('.pexa').first();
  // the previous model's mean, its "simulation" caption and every comparison phrase are gone from the analysis
  await expect(card).not.toContainText(/shadow|independent|incumbent|production model|agrees|disagree/i);
  await expect(card.getByText(LEGACY_MEAN, { exact: true })).toHaveCount(0);
  await expect(page.getByText('Probability of over').first()).toBeVisible();
  await noHorizontalOverflow(page, 'explorer with the selected projection');
  await page.screenshot({ path: 'test-results/projection-explorer.png', fullPage: false });
});

test('a withheld projection shows its reason and no number from either engine @journey', async ({ page, context }) => {
  await context.route(PROJ, (r) => r.fulfill({ json: doc({}, 'BLOCK'), headers: CORS }));
  await open(page);
  const note = page.getByTestId('projection-note').first();
  await expect(note).toContainText('Projection withheld');
  await expect(note).toContainText('Player listed OUT');
  await expect(tile(page)).not.toContainText(SELECTED_MEAN);
  await expect(tile(page)).not.toContainText(LEGACY_MEAN);        // no silent fall back to the established simulation
  await expect(tile(page)).toContainText('withheld');
});

test('no published feed withholds a promoted stat instead of showing the old number @journey', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('projection-note').first()).toContainText('feed is unavailable');
  await expect(tile(page)).not.toContainText(LEGACY_MEAN);
});

test('a stat on the established model is unchanged by the feed @journey', async ({ page, context }) => {
  await context.route(PROJ, (r) => r.fulfill({ json: doc(), headers: CORS }));
  await page.clock.install({ time: NOW });
  await page.goto('./#/nfl/props?game=' + GAME);
  await expect(page.locator('.pexa').first()).toBeVisible();
  // passing TDs stays on the established model: no projection note, the publication's own caption
  const sel = `./#/nfl/props?game=${GAME}&prop=${encodeURIComponent('prt_387ffd71206b0fc20b48|passing_tds')}`;
  await page.goto(sel);
  await expect(page.locator('#pexa-t')).toContainText('Passing TDs');
  await expect(page.getByTestId('projection-note')).toHaveCount(0);
  await expect(tile(page)).toContainText('expected value');
});

test('Home and the Explorer agree on the selected number for the same player and stat @journey', async ({ page, context }) => {
  await context.route(PROJ, (r) => r.fulfill({ json: doc(), headers: CORS }));
  await open(page);
  const explorer = (await tile(page).locator('dd.fx-num').first().innerText()).trim();
  expect(explorer).toBe(SELECTED_MEAN);
  await page.goto('./#/');
  const picks = page.locator('.htp-pick, .htp-row').filter({ hasText: 'Chris Olave' });
  if (await picks.count()) {
    for (const pick of await picks.all()) {
      const proj = pick.locator('.htp-num--proj b');
      if (await proj.count()) await expect(proj).toContainText(SELECTED_MEAN);
      await expect(pick).not.toContainText(LEGACY_MEAN);
      await expect(pick).not.toContainText(/shadow|independent/i);
    }
  }
  await noHorizontalOverflow(page, 'home with the selected projection');
});

test('the Game Command Center shows one projected score for CFB-style team families only where the engine is promoted @journey', async ({ page, context }) => {
  // NFL team points stay on the established model, so a published NFL team_points family adds nothing to the page
  await page.clock.install({ time: NOW });
  await page.goto(`./#/nfl/game/${GAME}`);
  await expect(page).toHaveTitle(/ @ /);
  const title = await page.title();
  const m = title.match(/\b([A-Z]{2,3}) (?:@|at|vs\.?) ([A-Z]{2,3})\b/);
  test.skip(!m, `cannot read teams from title: ${title}`);
  const [away, home] = [m![1], m![2]];
  await context.route(PROJ, (r) => r.fulfill({ headers: CORS, json: {
    ...doc(), families: { team_points: { readiness: 'READY', model: 'F', reason: '' } },
    games: [{ game_id: 'x', start_utc: null, home, away, teams: [{ team: away, family: 'team_points', mean: 20.4, p10: 11, p90: 30 }, { team: home, family: 'team_points', mean: 24.1, p10: 14, p90: 34 }] }],
    players: [] } }));
  await page.reload();
  await expect(page).toHaveTitle(/ @ /);
  await expect(page.getByTestId('team-projections')).toHaveCount(0);
  await noHorizontalOverflow(page, 'game page without a second team projection');
});

test('the Research Lab shows accuracy for the stats live in SIFT and says what is unchanged @journey', async ({ page, context }) => {
  await context.route(SUMMARY, (r) => r.fulfill({ headers: CORS, json: {
    schema: 'sift.projection_foundation.sport_summary.v1', sport: 'NFL', splits: { holdout: '2024–2025 seasons' },
    families: [
      { family: 'receptions', readiness: 'READY', readiness_reason: 'beats baselines', best_model: 'F', holdout: { n_obs: 6160, mae: 1.55, cover_80: 0.81 } },
      { family: 'passing_tds', readiness: 'NEEDS IMPROVEMENT', readiness_reason: 'worse than the incumbent', best_model: 'D', holdout: { n_obs: 1050, mae: 0.93, cover_80: 0.79 } },
    ] } }));
  await page.clock.install({ time: NOW });
  await page.goto('./#/explore?sport=nfl');
  const card = page.getByTestId('projection-scorecard');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('pfs-live-in-sift')).toContainText('Receptions');
  await expect(page.getByTestId('pfs-live-in-sift')).toContainText('1.55');
  await expect(page.getByTestId('pfs-not-changed')).toContainText('Passing tds — Current projection kept');
  await expect(card).not.toContainText(/shadow|incumbent|production model|challenger|versus/i);
  await expect(page.getByTestId('pfs-live-empty').first()).toBeVisible();   // no settled live games yet, and it says so
  await noHorizontalOverflow(page, 'research lab with the accuracy card');
  await page.screenshot({ path: 'test-results/projection-research-lab.png', fullPage: false });
});
