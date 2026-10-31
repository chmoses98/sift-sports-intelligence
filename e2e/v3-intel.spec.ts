// SIFT 3.0 Matchup Intelligence on Game Detail (Release 2) against REAL published NFL documents (the committed `game` fixture family in fixtures/real,
// offline). DAL at PHI, week 7 (2026-10-26) is the reference game. At phone size the real research is on the Overview itself: the SIFT model
// projection kept apart from the Market, the top three advantages as sentences with rank bars, the offense/defense comparison, player matchups,
// injury notes, scoring environment and game scripts, each with its source. The Matchup tab's default is readable sentences; the detailed chart is
// one tap away. Nothing here is stubbed except where a test removes a document on purpose to prove the honest absent state.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { feedDocument, feedNow, freshQuotes, useRealFeeds } from './support/realFeeds';

const GAME = '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3';
const EVENT_DOC = 'https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest/explorer/events/evt_cd335cc6d5f5b8d8f7b3.json';
const FAMILY = 'game' as const;
const CAPTURE = feedNow(FAMILY);

test.beforeEach(async ({ page }) => {
  await useRealFeeds(page, { family: FAMILY });
  await freshQuotes(page, { family: FAMILY });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.clock.setFixedTime(CAPTURE);
});

async function open(page: Page, query = '') {
  await page.goto(`./#${GAME}${query}`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  const missing = page.getByText('This game is not on the published slate');
  const ready = page.locator('.v3-gh').first();
  await Promise.race([ready.waitFor({ timeout: 30_000 }), missing.waitFor({ timeout: 30_000 })]).catch(() => {});
  test.skip(await missing.isVisible().catch(() => false), 'the reference game is no longer on the published slate');
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const top = async (page: Page, testid: string) => (await page.getByTestId(testid).first().boundingBox())!.y + (await page.evaluate(() => window.scrollY));

test.describe('Overview carries the real NFL research @v3', () => {
  test('the SIFT model projection is labelled with model, version and as-of, and the Market is a separate lane', async ({ page }) => {
    await open(page);
    const model = page.getByTestId('sift-model');
    await expect(model).toBeVisible();
    await expect(model).toContainText('SIFT model');
    await expect(model).toContainText('Research simulation, not an approved projection');
    await expect(model).toContainText('shadow-0.4.0');
    await expect(model).toContainText(/inputs cut off/);
    await expect(model).toContainText('24.6');
    await expect(model).toContainText('19.7');
    await expect(model).toContainText('67%');
    await expect(model).toContainText(/redundant to the closing market/);
    const market = page.getByTestId('market-lane');
    await expect(market).toBeVisible();
    await expect(market).toContainText('Market');
    await expect(market).not.toContainText('shadow-0.4.0');
    // the market lane's prices are the app's quote-gated Kalshi asks and open the contract sheet
    const px = market.locator('[data-tap=price]').first();
    if (await px.count()) { await expect(px).toHaveText(/\d+¢/); await expect(px).toHaveAttribute('data-dest', /sheet=contract/); }
  });

  test('top three advantages are plain-English sentences with ranks and rank bars, not EPA rails or bare numbers', async ({ page }) => {
    await open(page);
    const adv = page.getByTestId('intel-advantage');
    await expect(adv).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const a = adv.nth(i);
      await expect(a).toContainText(/^The \w+ have an? (modest|strong|major) [\w-]+ advantage\./);
      await expect(a).toContainText(/ranks \d+(st|nd|rd|th) of 28 in/);
      await expect(a).toContainText('What it implies.');
      await expect(a.locator('.mi-bar')).toHaveCount(2);
    }
    // the statistic's meaning and why it matters are one tap away and say what EPA is
    const first = adv.first();
    await first.locator('summary').click();
    await expect(first.locator('details')).toContainText(/What it measures/);
    await expect(first.locator('details')).toContainText(/Why it matters/);
    // no unexplained signed gap pill ("+63") on the default presentation
    await expect(page.locator('.mx-tilt')).toHaveCount(0);
    await expect(page.getByTestId('intel-advantages')).not.toContainText(/[+−]\d{2}\b/);
  });

  test('sections appear in the pregame order and before the market and props cards', async ({ page }) => {
    await open(page);
    for (const id of ['intel-projection', 'intel-advantages', 'intel-comparison', 'intel-mismatches', 'intel-notes', 'intel-environment', 'intel-script']) await expect(page.getByTestId(id)).toBeVisible();
    const ys = [];
    for (const id of ['intel-projection', 'intel-advantages', 'intel-comparison', 'intel-mismatches', 'intel-notes', 'intel-environment', 'intel-script', 'win-price']) ys.push(await top(page, id));
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  test('comparison table, player matchups, notes, environment and scripts show real published figures with their sources', async ({ page }) => {
    await open(page);
    const cmp = page.getByTestId('intel-comparison');
    await expect(cmp.locator('tbody tr')).toHaveCount(7);
    await expect(cmp.getByRole('row', { name: /Passing/ })).toContainText('7th');
    await expect(page.getByTestId('intel-mismatches')).toContainText(/meets the (DAL|PHI) (pass|run) defense: \d+(st|nd|rd|th) of 28/);
    const notes = page.getByTestId('intel-notes');
    await expect(notes).toContainText('Jalen Hurts');
    await expect(notes).toContainText(/ESPN injury report, captured/);
    await expect(page.getByTestId('intel-environment')).toContainText('45.6 total points');
    await expect(page.getByTestId('intel-environment')).toContainText(/Simulation/);
    for (const role of ['expected', 'alternate', 'danger']) {
      const c = page.getByTestId(`intel-script-${role}`);
      await expect(c).toBeVisible();
      await expect(c).toContainText(/% of simulated games/);
      await expect(c).toContainText('Evidence');
      await expect(c).toContainText('Counterargument');
    }
    await expect(page.getByTestId('intel-script')).toContainText(/not calibrated probabilities/);
  });

  test('no horizontal overflow and no axe violation on the Overview', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('intel-script')).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });

  test('every control inside the research is a real target of at least 44 points', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('intel-advantages')).toBeVisible();
    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('.mi-more summary, .mi-gaps summary, [data-testid^=intel-] a, [data-testid^=intel-] button, [data-testid=market-lane] a')) {
        const r = el.getBoundingClientRect();
        // a `.v3-tap` extends its hit area to 44 points with ::after; summaries are measured as laid out
        const tap = el.classList.contains('v3-tap');
        if (!tap && r.height < 43.5) out.push(`${el.className || el.tagName}: ${Math.round(r.height)}`);
      }
      return out;
    });
    expect(small).toEqual([]);
  });
});

test.describe('honest absent states @v3', () => {
  test('with no model view the projection card says why, shows no number, and the Market lane is untouched', async ({ page }) => {
    const body = await feedDocument(FAMILY, EVENT_DOC);
    test.skip(!body, 'the reference research document is not in the fixture family');
    const doc = JSON.parse(body!.toString('utf8'));
    delete doc.extensions.model_view;
    await page.route(EVENT_DOC, (r) => r.fulfill({ status: 200, body: JSON.stringify(doc), headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } }));
    await open(page);
    const none = page.getByTestId('sift-model-absent');
    await expect(none).toBeVisible();
    await expect(none).toContainText(/No projection shown/);
    await expect(none).toContainText(/no SIFT model view/i);
    await expect(page.getByTestId('sift-model')).toHaveCount(0);
    await expect(page.getByTestId('market-lane')).toBeVisible();
    // the research sections that do exist are untouched
    await expect(page.getByTestId('intel-advantages')).toBeVisible();
  });

  test('a section whose data is removed disappears and is listed under "Not published for this game"', async ({ page }) => {
    const body = await feedDocument(FAMILY, EVENT_DOC);
    test.skip(!body, 'the reference research document is not in the fixture family');
    const doc = JSON.parse(body!.toString('utf8'));
    doc.context.injuries = [];
    delete doc.extensions.game_script_inputs;
    await page.route(EVENT_DOC, (r) => r.fulfill({ status: 200, body: JSON.stringify(doc), headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } }));
    await open(page);
    await expect(page.getByTestId('intel-advantages')).toBeVisible();
    await expect(page.getByTestId('intel-notes')).toHaveCount(0);
    await expect(page.getByTestId('intel-script')).toHaveCount(0);
    const gaps = page.getByTestId('intel-gaps');
    await expect(gaps).toBeVisible();
    await gaps.locator('summary').click();
    await expect(gaps).toContainText(/no injuries or lineup changes/);
    await expect(gaps).toContainText(/states no game script/);
  });
});

test.describe('Matchup tab: readable by default, detailed chart one tap away @v3', () => {
  test('the default is sentences with side-by-side rank bars; the chart is behind a toggle that lives in the address', async ({ page }) => {
    await open(page, '?v=1&tab=matchup');
    const rows = page.getByTestId('readable-rows');
    await expect(rows).toBeVisible();
    await expect(page.getByTestId('tug-rows')).toHaveCount(0);
    await expect(rows.locator('.mi-row')).toHaveCount(7);
    await expect(rows.locator('.mi-row__h').first()).toContainText(/have an? (modest|strong|major) [\w-]+ advantage\.|is about even in/);
    await expect(rows.locator('.mi-bar').first()).toContainText(/of 28/);
    await expect(page.locator('.mx-tilt')).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const toggle = page.getByTestId('chart-toggle');
    await expect(toggle).toHaveText('Show the detailed chart');
    await toggle.click();
    await expect(page).toHaveURL(/chart=1/);
    await expect(page.getByTestId('tug-rows')).toBeVisible();
    // the chart's gap pills are explained where they appear
    await expect(page.getByText(/difference in league-percentile points/)).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.reload();
    await expect(page.getByTestId('tug-rows')).toBeVisible();
    await page.getByTestId('chart-toggle').click();
    await expect(page.getByTestId('readable-rows')).toBeVisible();
  });

  test('a unit opens from the readable list and Back returns to it', async ({ page }) => {
    await open(page, '?v=1&tab=matchup');
    const row = page.getByTestId('readable-rows').locator('.mi-row').first();
    await row.locator('.v3-navrow__main').click();
    await expect(page.getByTestId('unit-view')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('readable-rows')).toBeVisible();
  });

  test('axe-clean in both presentations', async ({ page }) => {
    await open(page, '?v=1&tab=matchup');
    await expect(page.getByTestId('readable-rows')).toBeVisible();
    const check = async () => {
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    };
    await check();
    await page.getByTestId('chart-toggle').click();
    await expect(page.getByTestId('tug-rows')).toBeVisible();
    await check();
  });
});

test.describe('after kickoff the research stays as "Pregame analysis" @v3', () => {
  test('a game that has started keeps the pregame research in an open section, without the Market lane', async ({ page }) => {
    await page.clock.setFixedTime(new Date(CAPTURE.getTime() + 3 * 3_600_000));
    await open(page);
    const after = page.getByTestId('pregame-analysis');
    await expect(after).toBeVisible();
    await expect(after).toContainText('Pregame analysis');
    await expect(after.getByTestId('sift-model')).toBeVisible();
    await expect(after.getByTestId('market-lane')).toHaveCount(0);
    await expect(after.getByTestId('intel-advantage').first()).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});
