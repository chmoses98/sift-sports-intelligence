// NBA and college basketball team pages against REAL published documents (the committed, trimmed fixtures under tests/v3/fixtures, each carries its
// provenance in `_fixture`), served in place of the two publications:
//   CBB  the 2026-27 explorer profile of Abilene Christian (a completed game, the rest of the schedule): the school logo, the record, the results and the
//        rest of the calendar must reach the Team screen (the results were dropped by a season label used as a date; the logo had no resolver).
//   NBA  the explorer's team profile is last season's (2025-26, through 14 June): the Team screen stays locked, says so, and shows only what is current
//        (the 2026-27 schedule and the player list), never last season's numbers as this season's.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const FIX = join(process.cwd(), 'tests', 'v3', 'fixtures');
const json = (rel: string) => JSON.parse(readFileSync(join(FIX, rel), 'utf8'));
const CORS = { 'access-control-allow-origin': '*', 'content-type': 'application/json', 'cache-control': 'no-store' };
const NOW = Date.parse('2026-11-05T15:00:00Z');

const acu = json('cbb/team-ACU.json');
const dan = json('nba/player-DAN.json');
const ACU_PID: string = acu.entity.participant_id;
/** A minimal explorer index in the publication's shape: the team list and the file table (how every profile is found), nothing invented about content. */
const explorerIndex = (sport: string, generated: string, teams: { display_name: string; participant_id: string; short_name: string }[]) => ({
  kind: 'explorer_index', schema_version: 'edge_finder.app.v1', sport, generated_at: generated, as_of: generated, metrics_path: 'explorer/metrics.json', search_index_path: 'explorer/search_index.json',
  files: Object.fromEntries(teams.map((t) => [`teams/${t.participant_id}.json`, { kind: 'entity_profile', entity_id: t.participant_id }])),
  teams: teams.map((t) => ({ ...t, path: `explorer/teams/${t.participant_id}.json` })), players_by_team: {}, events: [], windows: [], quality: { generated_at: generated, status: 'PARTIAL', limitations: [] },
});
const health = (sport: string) => ({ kind: 'health', schema_version: 'edge_finder.app.v1', sport, overall_status: 'OK', freshness_status: 'FRESH', components: {}, errors: [], generated_at: '2026-11-05T04:00:00Z' });

async function serve(page: Page, docs: Record<string, unknown>) {
  await page.clock.setFixedTime(NOW);
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.route(/^https:\/\/raw\.githubusercontent\.com\//, async (route) => {
    const url = route.request().url();
    const hit = Object.entries(docs).find(([k]) => url.includes(k));
    if (hit) await route.fulfill({ status: 200, body: route.request().method() === 'HEAD' ? '' : JSON.stringify(hit[1]), headers: CORS });
    else await route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
  });
}
const go = async (page: Page, path: string) => {
  await page.goto(`./#${path}`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
};
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

test.describe('CBB team page (real 2026-27 profile) @v3', () => {
  test.beforeEach(async ({ page }) => {
    const idx = explorerIndex('CBB', '2026-11-05T04:05:59Z', [{ display_name: acu.entity.display_name, participant_id: ACU_PID, short_name: 'ACU' }]);
    await serve(page, { 'cbb-edge-finder/app-data/app/latest/health.json': health('CBB'), 'cbb-edge-finder/app-data/app/latest/explorer/index.json': idx, [`explorer/teams/${ACU_PID}.json`]: acu });
  });

  test('shows the school’s committed logo, its completed result and the rest of its published schedule', async ({ page }) => {
    await go(page, '/v3/team/cbb/ACU');
    await expect(page.locator('.v3-th__id h1')).toContainText('Abilene Christian', { timeout: 25_000 });
    await expect(page.locator('.v3-th__id img.v3-logo')).toHaveAttribute('src', /teams\/cbb\/2000\.webp$/);
    await expect(page.locator('.v3-th__rec')).toHaveText('0 - 1');
    await page.getByRole('tab', { name: 'Schedule' }).click();
    await expect(page.locator('.v3-results .v3-res__b--L').first()).toBeVisible();
    const later = page.getByTestId('team-later');
    await expect(later.locator('li')).toHaveCount(27);
    await expect(later).toContainText('Lamar');
    await expect(page.getByText('The publication’s own schedule for 2026-27')).toBeVisible();
    await noOverflow(page);
  });
});

test.describe('NBA team page (explorer still on 2025-26) @v3', () => {
  test('stays locked with the reason, shows the player list, and prints no 2025-26 number as current', async ({ page }) => {
    const pid = 'prt_cb335b403343d076dc0e';
    const team = {
      kind: 'entity_profile', schema_version: 'edge_finder.app.v1', sport: 'NBA', league: 'NBA', entity_type: 'TEAM', season: '2025-26', generated_at: '2026-10-31T06:16:05Z',
      entity: { display_name: 'Atlanta Hawks', participant_id: pid, participant_type: 'TEAM', short_name: 'ATL', metadata: {}, source_ids: {} },
      quality: { ...acu.quality, data_as_of: '2026-06-14T00:30:00Z', generated_at: '2026-10-31T06:16:05Z' },
      metrics: [], rankings: [], series: [], opponents: [], extensions: {}, games: [], availability: [{ as_of: '2026-10-31T04:46:05Z', detail: 'Henri Veesaar (Knee)', event_id: null, source: 'espn_injuries', status: 'OUT' }],
      players: [{ display_name: dan.entity.display_name, participant_id: dan.entity.participant_id, path: `explorer/players/${dan.entity.participant_id}.json`, role: 'G' }],
    };
    const idx = explorerIndex('NBA', '2026-10-31T06:16:05Z', [{ display_name: 'Atlanta Hawks', participant_id: pid, short_name: 'ATL' }]);
    await serve(page, { 'nba-edge-finder/data-archive/app/latest/health.json': health('NBA'), 'nba-edge-finder/data-archive/app/latest/explorer/index.json': idx, [`explorer/teams/${pid}.json`]: team });
    await go(page, '/v3/team/nba/ATL');
    const lock = page.getByTestId('nba-lock');
    await expect(lock).toBeVisible({ timeout: 25_000 });
    await expect(lock).toContainText('2025-26, not 2026-27');
    await expect(page.getByTestId('blend-net')).toHaveCount(0);
    await expect(page.getByTestId('nba-asof')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Players' }).getByRole('link', { name: /Dyson Daniels/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Injury report' })).toContainText('Veesaar');
    await noOverflow(page);
  });
});
