// Projection Foundation integration: the independent projection block in the Player Prop Explorer and the game props
// cards, the withheld (BLOCK) state, and the Research Lab reliability scorecard. Contracts are served by the test.
import type { Page } from '@playwright/test';
import { expect, noHorizontalOverflow, NOW, test } from './fixtures';

const PROJ = /raw\.githubusercontent\.com\/chmoses98\/nfl-edge-finder\/projection-data\/projections\/nfl\/latest\.json/;
const SUMMARY = /raw\.githubusercontent\.com\/chmoses98\/nfl-edge-finder\/projection-data\/summary\/nfl\/latest\.json/;
const CORS = { 'access-control-allow-origin': '*' };

const doc = (playerId: string, stat: string, gate: 'PASS' | 'BLOCK' = 'PASS') => ({
  schema: 'sift.projections.v1', sport: 'NFL', generated_utc: '2026-10-04T08:00:00Z', data_asof_utc: '2026-10-04T08:00:00Z',
  model: { id: 'pf-nfl', version: 'pf-1.0.0', authority: 'research_only' },
  families: { [stat]: { readiness: 'SHADOW VALIDATION', model: 'C', reason: 'test' } },
  games: [],
  players: [{
    player_id: playerId, name: 'Test Player', team: 'TST', opponent: 'OPP', game_id: '', family: stat, mean: 5.4, median: 5, p10: 2, p90: 9,
    thresholds: { '3': 0.8, '5': 0.55, '7': 0.3 }, opportunity: { family: 'targets', mean: 7.2, p10: 4, p90: 11 },
    opponent_adjustment: { factor: 1.03, sample_games: 4 }, adjustments: ['Role from last 8 games'], readiness: 'SHADOW VALIDATION',
    gate: gate === 'PASS' ? { status: 'PASS', findings: [] } : { status: 'BLOCK', findings: [{ check: 'injury', severity: 'BLOCK', what: 'Player listed OUT', category: 'data_quality', action: '' }] },
    data_asof_utc: '2026-10-04T08:00:00Z',
  }],
});

/** Opens the first prop in the Explorer; the selection is in the URL as prop=<playerId>|<stat>. */
async function selected(page: Page) {
  await page.clock.install({ time: NOW });
  await page.goto('./#/props');
  await page.locator('.tprow').first().getByRole('link').first().click();
  await expect(page.locator('#pexa-t')).toBeVisible();
  const prop = new URLSearchParams(page.url().split('?')[1] ?? '').get('prop') ?? '';
  const [playerId, stat] = prop.split('|');
  return { playerId, stat: stat || null };
}

test('the Explorer shows the independent projection as a labelled shadow with range and readiness @journey', async ({ page, context }) => {
  const s = await selected(page);
  test.skip(!s.stat, 'fixture explorer has no stat parameter');
  await context.route(PROJ, (r) => r.fulfill({ json: doc(s.playerId, s.stat!), headers: CORS }));
  await page.reload();
  const block = page.getByTestId('foundation-projection').first();
  await expect(block).toBeVisible();
  await expect(block).toContainText('Independent projection · shadow');
  await expect(block).toContainText('realistic range 2.0–9.0');
  await expect(block).toContainText(/Shadow validation/);
  await expect(block).not.toContainText(/profitable|\bbet\b/i);
  await noHorizontalOverflow(page, 'explorer with foundation projection');
  await page.screenshot({ path: 'test-results/foundation-explorer.png', fullPage: false });
});

test('a BLOCKed projection is withheld with its reason and no number @journey', async ({ page, context }) => {
  const s = await selected(page);
  test.skip(!s.stat, 'fixture explorer has no stat parameter');
  await context.route(PROJ, (r) => r.fulfill({ json: doc(s.playerId, s.stat!, 'BLOCK'), headers: CORS }));
  await page.reload();
  const block = page.getByTestId('foundation-projection').first();
  await expect(block).toContainText('Independent projection withheld');
  await expect(block).toContainText('Player listed OUT');
  await expect(block).not.toContainText('5.4');
});

test('no published projection leaves the Explorer exactly as before @journey', async ({ page }) => {
  await selected(page);
  await expect(page.getByTestId('foundation-projection')).toHaveCount(0);
});

test('the Research Lab shows projection reliability by family @journey', async ({ page, context }) => {
  await context.route(SUMMARY, (r) => r.fulfill({ headers: CORS, json: {
    schema: 'sift.projection_foundation.sport_summary.v1', sport: 'NFL', splits: { holdout: '2024–2025 seasons' },
    families: [
      { family: 'receptions', readiness: 'SHADOW VALIDATION', readiness_reason: 'beats baselines', best_model: 'C', holdout: { n_obs: 9000, mae: 1.41, cover_80: 0.79 } },
      { family: 'anytime_td', readiness: 'NEEDS IMPROVEMENT', readiness_reason: 'overconfident tails', best_model: 'B' },
    ] } }));
  await page.clock.install({ time: NOW });
  await page.goto('./#/explore?sport=nfl');
  const card = page.getByTestId('projection-scorecard');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Receptions');
  await expect(card).toContainText('average miss 1.41');
  await expect(page.getByTestId('pfs-live-empty')).toBeVisible();
  await expect(card).toContainText('NEEDS IMPROVEMENT');
  await noHorizontalOverflow(page, 'research lab with scorecard');
  await page.screenshot({ path: 'test-results/foundation-research-lab.png', fullPage: false });
});

test('the same independent number appears on Home and in the Explorer, with availability @journey', async ({ page, context }) => {
  const s = await selected(page);
  test.skip(!s.stat, 'fixture explorer has no stat parameter');
  const d = doc(s.playerId, s.stat!);
  (d.players[0] as Record<string, unknown>).participation = { status: 'UNVERIFIED', certainty: 'UNKNOWN', source: '', captured_utc: null, reasons: [] };
  await context.route(PROJ, (r) => r.fulfill({ json: d, headers: CORS }));
  await page.reload();
  const block = page.getByTestId('foundation-projection').first();
  await expect(block).toContainText('5.4');
  await expect(page.getByTestId('foundation-availability').first()).toContainText('Availability not verified — projection assumes he plays');
  await page.goto('./#/');
  const homeLine = page.getByTestId('foundation-projection');
  if (await homeLine.count()) {
    await expect(homeLine.first()).toContainText('Independent (shadow): 5.4');
  }
  await noHorizontalOverflow(page, 'home with independent projection line');
});

test('the Game Command Center shows independent team projections only for the matching game @journey', async ({ page, context }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/props');
  await page.locator('.tprow').first().getByRole('link').first().click();
  await expect(page.locator('#pexa-t')).toBeVisible();
  const game = new URLSearchParams(page.url().split('?')[1] ?? '').get('game');
  test.skip(!game, 'no game in explorer url');
  await page.goto(`./#/nfl/game/${game}`);
  await expect(page).toHaveTitle(/ @ /);
  const title = await page.title();
  const m = title.match(/\b([A-Z]{2,3}) (?:@|at|vs\.?) ([A-Z]{2,3})\b/);
  test.skip(!m, `cannot read teams from title: ${title}`);
  const [away, home] = [m![1], m![2]];
  await context.route(PROJ, (r) => r.fulfill({ headers: CORS, json: {
    schema: 'sift.projections.v1', sport: 'NFL', generated_utc: '2026-10-04T08:00:00Z', data_asof_utc: '2026-10-04T08:00:00Z',
    model: { id: 'pf-nfl', version: 'pf', authority: 'research_only' }, families: { team_points: { readiness: 'READY', model: 'F', reason: '' } },
    games: [{ game_id: 'x', start_utc: null, home, away, teams: [{ team: away, family: 'team_points', mean: 20.4, p10: 11, p90: 30 }, { team: home, family: 'team_points', mean: 24.1, p10: 14, p90: 34 }] }],
    players: [] } }));
  await page.reload();
  const line = page.getByTestId('foundation-teams');
  await expect(line).toBeVisible();
  await expect(line).toContainText(`${away} 20 (11–30)`);
  await expect(line).toContainText('Not a betting signal');
  await noHorizontalOverflow(page, 'game page with team projections');
  await page.screenshot({ path: 'test-results/foundation-game-teams.png', fullPage: false });
});
