// CBB acceptance: the sport opens as a real Sift sport on its own publication (served from the synthetic
// fixtures in e2e/data/cbb, built by the CBB repo's production publisher). The journey runs on every
// project, including the WebKit iPhone: home → slate → game → projected score → roster → matchup →
// team → metric → national ranking → model comparison → provenance. Then the honesty checks: the
// preseason state, a post-tip record never shown, UNSCORABLE visible, no invented markets.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CBB_NOW, expect, noHorizontalOverflow, test } from './fixtures';

interface Ev { event_id: string; home_participant: string; extensions: { cbb: { cbb_game_id: string } } }
const events = (variant: string): Ev[] =>
  JSON.parse(readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), 'data', 'cbb', variant, 'app', 'latest', 'events.json'), 'utf-8')).items;
const byGid = (variant: string, gid: string) => events(variant).find((e) => e.extensions.cbb.cbb_game_id === gid)!;

const DUKE_KU = byGid('season', 'G900000005');
const ROME_FINAL = byGid('season', 'G900000011');
const SWAPPED = byGid('season', 'G900000012');

test.describe('CBB in season', () => {
  test.beforeEach(async ({ page }) => page.clock.install({ time: CBB_NOW.season }));

  test('CBB home → slate → game → team → metric → ranking @journey', async ({ page }) => {
    await page.goto('./#/cbb');
    await expect(page.getByRole('heading', { name: 'CBB', level: 1 })).toBeVisible();
    await expect(page.getByText('Prospective evaluation in progress')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Model status' })).toBeVisible();
    await expect(page.getByText('SYNTHETIC TEST FIXTURE', { exact: false }).first()).toBeVisible();
    await noHorizontalOverflow(page, 'cbb home');

    await page.getByRole('link', { name: /Full slate/ }).click();
    await expect(page.getByRole('heading', { name: 'Slate', level: 1 })).toBeVisible();
    await noHorizontalOverflow(page, 'cbb slate');
    await page.getByRole('link', { name: /Duke at Kansas/ }).click();

    // projected score: the incumbent, archived before tip, with model uncertainty (never a guarantee)
    await expect(page.getByRole('heading', { name: 'Projected score' })).toBeVisible();
    await expect(page.getByText('Incumbent', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Model uncertainty/)).toBeVisible();
    await expect(page.getByText(/not guaranteed ranges/)).toBeVisible();
    // roster: the P-ROSTER-1 pregame state archived with the projection, in plain language
    await expect(page.getByText(/P-ROSTER-1 · prospective roster overlay/i)).toBeVisible();
    await expect(page.getByText('Input substitution active').first()).toBeVisible();
    await expect(page.getByText(/not a confirmed starting lineup/).first()).toBeVisible();
    // model comparison: every archived row, incumbent first, nothing ranked "better"
    const rows = page.locator('.cmc__row');
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toContainText('pure-0.2.0');
    await expect(rows.last()).toContainText('pure-0.5.0+roster');
    await expect(page.getByText(/best bet|lock|guaranteed win/i)).toHaveCount(0);
    // markets: nothing invented
    await expect(page.getByText(/Market research is not published for CBB yet/)).toBeVisible();
    await noHorizontalOverflow(page, 'cbb game');

    // provenance behind a disclosure
    await page.locator('#cg-prov summary').click();
    await expect(page.getByText('Pre-tip basis').first()).toBeVisible();

    // matchup → metric → full D-I ranking
    await page.locator('#cg-matchup a.cmu__v').first().click();
    await expect(page.getByText('League median')).toBeVisible();
    await noHorizontalOverflow(page, 'cbb metric');
    await page.getByRole('link', { name: /Full CBB ranking/ }).click();
    await expect(page.getByText('Competition ranking', { exact: false })).toBeVisible();
    await noHorizontalOverflow(page, 'cbb ranking');

    // team page from the game hero
    await page.goto(`./#/cbb/game/${DUKE_KU.event_id}`);
    await page.locator('.cbbh__team').last().click();
    await expect(page.getByRole('heading', { name: 'Kansas Jayhawks', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Opponent-adjusted ratings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Roster', exact: true })).toBeVisible();
    await noHorizontalOverflow(page, 'cbb team');
  });

  test('a post-tip record is never the projection; UNSCORABLE stays visible @smoke', async ({ page }) => {
    await page.goto(`./#/cbb/game/${ROME_FINAL.event_id}`);
    await expect(page.getByText('Prospective evidence · valid').first()).toBeVisible();
    await expect(page.locator('.cproj__grid').first()).toContainText(/Villanova by 0\.\d/); // the +25 post-tip record is excluded
    await expect(page.getByText(/made at or after tip are excluded/)).toBeVisible();
    await page.goto(`./#/cbb/game/${SWAPPED.event_id}`);
    await expect(page.getByText('Unscorable').first()).toBeVisible();
    await expect(page.getByText(/different matchup than the current schedule/)).toBeVisible();
  });

  test('deep links survive a reload @smoke', async ({ page }) => {
    await page.goto(`./#/cbb/team/${DUKE_KU.home_participant}`);
    await expect(page.getByRole('heading', { name: 'Kansas Jayhawks', level: 1 })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Kansas Jayhawks', level: 1 })).toBeVisible();
  });

  test('CBB is in the sports navigation and on the global home', async ({ page, isMobile }) => {
    await page.goto('./#/sports');
    await expect(page.locator('.sportcard2', { hasText: "NCAA Division I Men's Basketball" })).toBeVisible();
    await page.goto('./#/');
    await expect(page.locator('.cbbmod')).toContainText('College basketball');
    if (!isMobile) await expect(page.locator('.snav').getByRole('link', { name: 'CBB' })).toBeVisible();
  });

  test('the CBB game packet carries the projection rows and the frozen protocol', async ({ page }) => {
    await page.goto(`./#/packet?sport=cbb&scope=GAME&event=${DUKE_KU.event_id}`);
    await expect(page.getByRole('button', { name: 'COPY FOR CHATGPT' })).toBeVisible({ timeout: 60_000 });
    const body = await page.locator('main').innerText();
    expect(body).toMatch(/Incumbent pure-0\.2\.0 projection/);
    expect(body).toMatch(/P-ROSTER-1 roster overlay/);
    expect(body).toMatch(/Prospective evaluation: game-1 N = /);
    expect(body).toMatch(/Adjusted offensive efficiency \[LATEST_PREGAME\]/);
  });
});

test.describe('CBB preseason', () => {
  test.use({ cbbVariant: 'preseason' });
  test.beforeEach(async ({ page }) => page.clock.install({ time: CBB_NOW.preseason }));

  test('games are on the slate with projection pending; N = 0; nothing invented @smoke', async ({ page }) => {
    await page.goto('./#/cbb');
    await expect(page.getByText('Preseason: the prospective experiment is armed')).toBeVisible();
    await expect(page.getByText(/N = 0/).first()).toBeVisible();
    await expect(page.getByText(/No conclusion yet/)).toBeVisible();
    await expect(page.getByText('Projection pending').first()).toBeVisible();
    await expect(page.locator('.cgame__score')).toHaveCount(0);
    await noHorizontalOverflow(page, 'cbb preseason home');
    const g = byGid('preseason', 'G900000005');
    await page.goto(`./#/cbb/game/${g.event_id}`);
    await expect(page.getByText(/game has not entered the prospective capture window/).first()).toBeVisible();
    await expect(page.getByText(/Current roster truth/)).toBeVisible();
    await expect(page.locator('.cmc__row')).toHaveCount(0);
    await noHorizontalOverflow(page, 'cbb preseason game');
  });
});
