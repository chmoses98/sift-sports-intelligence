// SIFT 3.0 sport coverage (Workstream 4): the research each sport's own publication states for a game, on the Overview, offline.
//   NHL, NBA, MLB   REAL published event documents from the committed `props` fixture family (fixtures/real, captured 2026-10-28).
//   Soccer, tennis  the trimmed REAL publications in tests/fixtures (the committed real families hold their boards but no soccer or tennis event document),
//                   served over the real feeds for those two hosts only.
// Every number asserted here is a published one; the specs read what the documents say and prove what is labelled, kept apart and absent.
import AxeBuilder from '@axe-core/playwright';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { feedNow, freshQuotes, useRealFeeds as realFeeds } from './support/realFeeds';

const FAMILY = 'props' as const;
const CAPTURE = feedNow(FAMILY);
const FIX = join(process.cwd(), 'tests', 'fixtures');
const SPORT_BASE: Record<'soccer' | 'tennis', RegExp> = {
  soccer: /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/soccer-edge-finder\/data-archive\/app\/latest\/(.+)$/,
  tennis: /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/Tennis-Edge-Finder\/tennis-data\/tennis-edge-finder\/data\/app\/latest\/(.+)$/,
};

/** The real feeds for everything, then the trimmed real soccer/tennis publication over its own host (a later route wins). */
async function setup(page: Page, fixtures: ('soccer' | 'tennis')[] = [], clock: Date = CAPTURE) {
  await realFeeds(page, { family: FAMILY });
  await freshQuotes(page, { family: FAMILY });
  for (const sport of fixtures) {
    await page.route(SPORT_BASE[sport], async (route) => {
      const rel = SPORT_BASE[sport].exec(route.request().url())![1].split('?')[0];
      const file = join(FIX, sport, 'app', 'latest', rel);
      if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
      return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(file, 'utf-8'), headers: { 'access-control-allow-origin': '*' } });
    });
  }
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.clock.setFixedTime(clock);
}

async function open(page: Page, path: string) {
  await page.goto(`./#${path}`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  const missing = page.getByText('This game is not on the published slate');
  const ready = page.locator('.v3-gh').first();
  await Promise.race([ready.waitFor({ timeout: 30_000 }), missing.waitFor({ timeout: 30_000 })]).catch(() => {});
  expect(await missing.isVisible().catch(() => false), `${path} is on the published slate`).toBe(false);
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const BANNED = /\+EV|\block\b|guaranteed|best bet|can't lose|fair price/i;

async function clean(page: Page) {
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  expect(await page.locator('.v3-gd__body').innerText()).not.toMatch(BANNED);
}

test.describe('NHL: a real document (CGY at EDM, 2026-10-28) @v3', () => {
  const GAME = '/v3/game/nhl/evt_628774085d72d1192326';

  test('the simulation is the SIFT model lane in goals, labelled research with the settled record; the Market lane is separate', async ({ page }) => {
    await setup(page);
    await open(page, GAME);
    const model = page.getByTestId('sift-model');
    await expect(model).toBeVisible();
    await expect(model).toContainText('Research simulation, not an approved projection');
    await expect(model).toContainText('nhl-sim-1.1');
    await expect(model).toContainText(/goals/);
    await expect(model).toContainText('2.8');
    await expect(model).toContainText('3.4');
    await expect(model).toContainText('60% to win');
    await expect(model).toContainText(/Brier score was 0\.236 against the market’s 0\.232/);
    await expect(model).toContainText(/published /);
    const market = page.getByTestId('market-lane');
    await expect(market).toBeVisible();
    await expect(market).not.toContainText('nhl-sim-1.1');
  });

  test('pace and scoring: the simulation and the season ranks, each labelled; the notes name the goalies with their source', async ({ page }) => {
    await setup(page);
    await open(page, GAME);
    const env = page.getByTestId('intel-environment');
    await expect(env).toContainText('averages 6.4 total goals');
    await expect(env).toContainText('Oilers 4.3 goals per game (1st of 32)');
    await expect(env).toContainText('Power play');
    await expect(env.locator('.mi-src--simulation').first()).toHaveText('Simulation');
    await expect(env.locator('.mi-src--season').first()).toHaveText('Season');
    const notes = page.getByTestId('intel-notes');
    await expect(notes).toContainText('EDM starter projected: Tristan Jarry');
    await expect(notes).toContainText('CGY starter projected: Devin Cooley');
    await expect(notes).toContainText('DailyFaceoff');
    await expect(notes).toContainText(/ESPN injury report, captured/);
    // one comparison row per season statistic
    const names = await page.getByTestId('intel-comparison').locator('tbody th').allInnerTexts();
    expect(new Set(names).size).toBe(names.length);
    await expect(page.getByTestId('intel-script')).toBeVisible();
  });

  test('no horizontal overflow, no axe violation, no betting language', async ({ page }) => {
    await setup(page);
    await open(page, GAME);
    await expect(page.getByTestId('intel-environment')).toBeVisible();
    await clean(page);
  });
});

test.describe('NBA: a real document (WAS at CLE, 2026-10-28) @v3', () => {
  const GAME = '/v3/game/nba/evt_218fc6544812b86338e7';

  test('the raw simulation carries the publication’s verdict that the market beat it, and the statistics say they run through last season', async ({ page }) => {
    await setup(page);
    await open(page, GAME);
    const model = page.getByTestId('sift-model');
    await expect(model).toContainText('nba-sim-0.1.0');
    await expect(model).toContainText(/lower log loss than the model.*8 of 8 families/);
    const env = page.getByTestId('intel-environment');
    await expect(env).toContainText('Simulated possessions per game');
    await expect(env).toContainText('Net rating');
    await expect(env).toContainText('These team statistics run through Jun 14 and do not include games played since.');
    await expect(page.getByTestId('intel-comparison')).toContainText('run through Jun 14');
    // an injury list the publication gives no team for is not pinned on a team
    await expect(page.getByTestId('intel-notes')).toHaveCount(0);
    await page.getByTestId('intel-gaps').locator('summary').click();
    await expect(page.getByTestId('intel-gaps')).toContainText(/without naming a team/);
    await clean(page);
  });
});

test.describe('MLB: a real slate document (MIL at TB, World Series game 5) @v3', () => {
  const GAME = '/v3/game/mlb/evt_4bca84d22c4244efc3a5';

  test('the slate projection is in runs with the publication’s confidence; starters and lineups are stated, with no invented ranks', async ({ page }) => {
    await setup(page);
    await open(page, GAME);
    const model = page.getByTestId('sift-model');
    await expect(model).toContainText('Slate research model, not an approved projection');
    await expect(model).toContainText('runs');
    await expect(model).toContainText('72% to win');
    await expect(model).toContainText(/confidence low/);
    await expect(page.getByTestId('intel-environment')).toContainText('park factor 97');
    const starters = page.getByTestId('intel-block-starters');
    await expect(starters).toContainText('Jacob Misiorowski');
    await expect(starters).toContainText(/has not been announced/);
    await expect(starters).toContainText(/Batting order not yet posted/);
    const cmp = page.getByTestId('intel-comparison');
    await expect(cmp).toContainText('published values');
    await expect(cmp.locator('tbody tr').first()).not.toContainText(/\d(st|nd|rd|th) of/);
    await clean(page);
  });

  test('a document the clock has left behind shows no baseball research as current', async ({ page }) => {
    await setup(page, [], new Date(CAPTURE.getTime() + 6 * 86_400_000));
    await page.goto(`./#${GAME}`);
    await expect(page.locator('[data-v3-shell]')).toBeVisible();
    // the game itself has been played by then; the Overview is the pregame analysis or absent, never a current model view
    await expect(page.getByTestId('sift-model')).toHaveCount(0);
  });
});

test.describe('Soccer: the trimmed real publication (Arsenal v Leeds, 2026-10-10) @v3', () => {
  const GAME = '/v3/game/soccer/evt_0a69396895a311cb26b2';
  const NOW = new Date('2026-10-09T08:00:00Z');

  test('the model board has a draw and goals, the six scripts are ranked simulation shares, attack against defence is a model rating', async ({ page }) => {
    await setup(page, ['soccer'], NOW);
    await open(page, GAME);
    const model = page.getByTestId('sift-model');
    await expect(model).toContainText('Research model board, not an approved projection');
    await expect(model).toContainText('53% to win');
    await expect(page.getByTestId('model-draw')).toHaveText('Draw 26%');
    await expect(model).toContainText(/every soccer model family is research-only/);
    await expect(model).toContainText(/goals/);
    for (const role of ['expected', 'alternate', 'danger']) await expect(page.getByTestId(`intel-script-${role}`)).toBeVisible();
    await expect(page.getByTestId('intel-script-expected')).toContainText('Tight, low event');
    await expect(page.getByTestId('intel-script')).toContainText(/not calibrated probabilities/);
    const ratings = page.getByTestId('intel-block-ratings');
    await expect(ratings).toContainText('Attack 80th percentile, defence 98th');
    await expect(ratings).toContainText(/model ratings \(research\), not match statistics/);
    await expect(page.getByTestId('intel-block-context')).toContainText('Premier League, Matchday 6.');
    await expect(page.getByTestId('intel-environment')).toContainText('26 days since their last match');
    await clean(page);
  });

  test('the Kalshi match-result contracts are the win prices (home and away; the draw is not a side), each opening its contract', async ({ page }) => {
    await setup(page, ['soccer'], NOW);
    await open(page, GAME);
    const win = page.getByTestId('win-price');
    await expect(win).toBeVisible();
    await expect(win.locator('[data-tap=price]')).toHaveCount(2);
    for (const t of await win.locator('[data-tap=price]').all()) await expect(t).toHaveAttribute('data-dest', /sheet=contract/);
  });
});

test.describe('Tennis: the trimmed real publication (Mertens v Swiatek, WTA Beijing; and a doubles match) @v3', () => {
  const NOW = new Date('2026-10-08T08:00:00Z');
  const MATCH = '/v3/game/tennis/evt_581f889e1dfb4de11420';
  const DOUBLES = '/v3/game/tennis/evt_d09d8721f706b006741f';

  test('the model’s match-win probability is shown as research beside the market, with ratings, surface, sample and the references in their own block', async ({ page }) => {
    await setup(page, ['tennis'], NOW);
    await open(page, MATCH);
    const model = page.getByTestId('sift-model');
    await expect(model).toBeVisible();
    await expect(model).toContainText('Research match-win probability, not an approved projection');
    await expect(model).toContainText(/Kalshi mid out-scoring the model/);
    await expect(model).toContainText(/never as a pick/);
    await expect(model).toContainText(/26%|74%/);
    await expect(page.getByTestId('intel-comparison')).toContainText('Elo rating (overall)');
    await expect(page.getByTestId('intel-block-context')).toContainText(/^[\s\S]*Hard\./);
    await expect(page.getByTestId('intel-block-form')).toContainText(/thinner sample of 3,838/);
    // tennis publishes no scoring or pace simulation: that section is absent and says why
    await expect(page.getByTestId('intel-environment')).toHaveCount(0);
    await page.getByTestId('intel-gaps').locator('summary').click();
    await expect(page.getByTestId('intel-gaps')).toContainText('no scoring or pace simulation');
    await clean(page);
  });

  test('the sharp references sit in their own block, marked as market data, with the publication’s verdict on the model', async ({ page }) => {
    await setup(page, ['tennis'], NOW);
    await open(page, '/v3/game/tennis/evt_626bc16043b56b7b1921');
    const refs = page.getByTestId('intel-block-refs');
    await expect(refs).toBeVisible();
    await expect(refs).toContainText('market data, not SIFT’s');
    await expect(refs).toContainText(/De-vigged bovada, smarkets/);
    await expect(refs).toContainText(/lone outlier against the sharp references/);
    await expect(page.getByTestId('sift-model')).not.toContainText('De-vigged');
    await clean(page);
  });

  test('the match-winner contracts are the win price; doubles carry no model and say so in the publication’s words', async ({ page }) => {
    await setup(page, ['tennis'], NOW);
    await open(page, MATCH);
    await expect(page.getByTestId('win-price').locator('[data-tap=price]')).toHaveCount(2);
    await open(page, DOUBLES);
    await expect(page.getByTestId('sift-model')).toHaveCount(0);
    await expect(page.getByTestId('sift-model-absent')).toContainText(/No model probability is shown for doubles/);
  });
});
