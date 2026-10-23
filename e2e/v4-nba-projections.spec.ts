// SIFT v4 NBA after promotion: Props → NBA and Game → Players show SIFT's approved projection, one per player and stat, from the authority
// (not the raw Foundation rows as a "research preview"). A ruled-out player has no number, a stale feed has none and says why, and no screen
// presents projection accuracy as betting value. Real browsers over a synthetic NBA slate (e2e/slates.ts) and a feed shaped like the NBA
// publisher's output for the slate's second game, GSW @ MIL.
import type { BrowserContext, Page } from '@playwright/test';
import { expect, noHorizontalOverflow, NOW, test } from './fixtures';
import { installSlates, slateStart } from './slates';

test.use({ timezoneId: 'America/Chicago' });

const NBA_FEED = /raw\.githubusercontent\.com\/chmoses98\/nba-edge-finder\/projection-data\/projections\/nba\/latest\.json/;
const GAME_ID = 'espn:401900001';
const START = slateStart(NOW, 1, 3);                                   // the slate's second game: GSW @ MIL, about 3.5 h after NOW
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const FAMILIES = ['minutes', 'points', 'rebounds', 'assists', 'threes', 'pra', 'fga'];
const STATS: Record<string, [number, number, number]> = {      // mean, p10, p90
  minutes: [34, 28, 38], points: [27.4, 17, 38], rebounds: [5.2, 2, 9], assists: [6.1, 3, 10], threes: [3.9, 1, 7], pra: [38.7, 26, 51], fga: [19.6, 14, 26],
};
const part = (status: string, asOf: string) => ({ status, certainty: status.startsWith('CONFIRMED') ? 'CONFIRMED' : 'PROJECTED', source: 'nba_official_injury_report', captured_utc: asOf, reasons: [] });
function rows(playerId: string, name: string, team: string, opponent: string, status: string, asOf: string, families = FAMILIES) {
  return families.map((family) => {
    const [mean, p10, p90] = STATS[family];
    return {
      player_id: playerId, name, team, opponent, game_id: GAME_ID, family, mean, median: Math.round(mean), p10, p90,
      thresholds: { [String(Math.round(mean))]: 0.5 }, adjustments: [], readiness: 'READY', gate: { status: 'PASS', findings: [] },
      participation: part(status, asOf), segments: { new_team_first4: false, tier: 'starter', backup: false, rookie: false }, role: 'shadow', data_asof_utc: asOf,
    };
  });
}
const feed = (asOf: string) => ({
  schema: 'sift.projections.v1', sport: 'NBA', generated_utc: asOf, data_asof_utc: asOf,
  model: { id: 'pf-nba', version: 'pf-1.3.0', authority: 'research_only' },
  families: Object.fromEntries(FAMILIES.map((f) => [f, { readiness: 'READY', model: 'test', reason: 'test' }])),
  games: [{ game_id: GAME_ID, start_utc: START, away: 'GSW', home: 'MIL', teams: ['GSW', 'MIL'].map((team) => ({ team, family: 'team_points', mean: 112, p10: 100, p90: 124 })) }],
  players: [
    ...rows('espn:3975', 'Stephen Curry', 'GSW', 'MIL', 'LIKELY_ACTIVE', asOf),
    ...rows('espn:3032977', 'Giannis Antetokounmpo', 'MIL', 'GSW', 'CONFIRMED_ACTIVE', asOf, ['points', 'rebounds']),
    ...rows('espn:9999', 'Ruled Out Guard', 'GSW', 'MIL', 'CONFIRMED_OUT', asOf, ['points', 'assists']),
  ],
});
const CORS = { 'access-control-allow-origin': '*' };

/** Registered after installSlates: Playwright runs the latest-registered matching route first. */
async function serve(context: BrowserContext, body: unknown | null) {
  await context.route(NBA_FEED, (route) => body == null
    ? route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: '{"error":"not published"}' })
    : route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
}
const panel = (page: Page) => page.getByRole('region', { name: 'NBA player projections' });
const GAME_PATH = (page: Page) => page.getByRole('button', { name: /Golden State Warriors @ Milwaukee Bucks/ });
const VOCAB = /research preview|pending production approval|activation pending|profitab|guarantee|best bet|beat the market/i;

test.describe('v4 NBA projections, promoted', () => {
  test('Props → NBA: the approved SIFT projection, labelled for production, one per stat; the ruled-out player has none @smoke', async ({ page, context }) => {
    await installSlates(context, { NBA: 3 }, { now: NOW });
    await serve(context, feed(hoursAgo(3)));
    await page.clock.install({ time: NOW });
    await page.goto('#/v4/props?sport=nba');
    await expect(page.getByRole('group', { name: 'Sport' }).getByRole('button', { name: /NBA/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(GAME_PATH(page)).toBeVisible();
    const p = panel(page);
    await expect(p).toContainText('SIFT projection · approved for production');
    await expect(p).toContainText('Stephen Curry');
    await expect(p).toContainText('Giannis Antetokounmpo');
    await expect(p).not.toContainText('Ruled Out Guard');
    await expect(page.getByTestId('nba-withheld')).toContainText('2 stat forecasts withheld: 2 player ruled out.');
    await expect(page.getByTestId('nba-established-note')).toHaveCount(0);
    // Curry's card carries all seven stats, once each
    const curry = p.getByRole('listitem').filter({ hasText: 'Stephen Curry' });
    await curry.getByText('Stephen Curry').click();
    for (const label of ['PTS', 'REB', 'AST', '3PM', 'MIN', 'PRA', 'FGA']) await expect(curry.getByText(label, { exact: true }).last()).toBeVisible();
    await expect(curry.getByText('PTS', { exact: true })).toHaveCount(2);        // the headline and the stat row, never a second number for the stat
    await expect(curry.getByText('27.4', { exact: true })).toHaveCount(1);        // one headline number for the lead stat
    await expect(p).toContainText('27.4');
    await expect(p).toContainText('80% range 17–38');
    expect(await page.locator('body').innerText()).not.toMatch(VOCAB);
    await noHorizontalOverflow(page, 'v4 props nba');
  });

  test('Game → Players renders the same approved projection and the same withheld count @journey', async ({ page, context }) => {
    await installSlates(context, { NBA: 3 }, { now: NOW });
    await serve(context, feed(hoursAgo(3)));
    await page.clock.install({ time: NOW });
    await page.goto('#/v4/props?sport=nba');
    await GAME_PATH(page).click();
    await page.getByRole('link', { name: /Open/ }).first().click();
    await expect(page).toHaveURL(/#\/v4\/game\/nba\/.+tab=players/);
    const p = panel(page).first();
    await expect(p).toContainText('SIFT projection · approved for production');
    await expect(p).toContainText('Stephen Curry');
    await expect(p).not.toContainText('Ruled Out Guard');
    await expect(page.getByTestId('nba-withheld')).toContainText('2 stat forecasts withheld');
    expect(await page.locator('body').innerText()).not.toMatch(VOCAB);
    await noHorizontalOverflow(page, 'v4 game nba players');
  });

  test('a stale feed shows no projection and says why; no established projection is invented @journey', async ({ page, context }) => {
    await installSlates(context, { NBA: 3 }, { now: NOW });
    await serve(context, feed(hoursAgo(80)));                       // older than the 48 h limit
    await page.clock.install({ time: NOW });
    await page.goto('#/v4/props?sport=nba');
    await expect(GAME_PATH(page)).toBeVisible();
    const p = panel(page);
    await expect(p).toContainText('No usable NBA player projections');
    await expect(p).toContainText('inputs too old');
    await expect(p).not.toContainText('27.4');
    await expect(page.getByTestId('nba-established-note')).toHaveCount(0);
  });

  test('an unpublished feed shows no games with forecasts and no number @journey', async ({ page, context }) => {
    await installSlates(context, { NBA: 3 }, { now: NOW });
    await serve(context, null);
    await page.clock.install({ time: NOW });
    await page.goto('#/v4/props?sport=nba');
    await expect(page.getByText('No matched upcoming forecasts')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('27.4');
    await noHorizontalOverflow(page, 'v4 props nba unpublished');
  });
});
