// SIFT 3.0: the CFB Script Engine game experience as one phone journey, over REAL published documents (fixtures/real, the `props` family: 114 real CFB research documents
// and their Kalshi contract lists, offline). Home -> a CFB game -> Game Script -> a scenario -> its priced expression -> the exact contract sheet -> Back, each step landing
// where it started. The clock is pinned one minute after the contract list's capture, so the quote gate (the app's own) shows the published prices; nothing is stubbed.
//   NIU at UNLV (2026-10-31): two scripts (Primary, Secondary), a calibrated control claim with its historical record, team totals the descriptive ranges relate to.
import { test, expect, type Page } from '@playwright/test';
import { feedDocument, useRealFeeds as serveRealFeeds } from './support/realFeeds';

const FAMILY = 'props' as const;
const RAW = 'https://raw.githubusercontent.com/chmoses98/cfb-edge-finder/main/app/latest/';
const NIU_UNLV = 'evt_217f91e8eb4a20fabb27';

interface Mkt { kalshi_ticker: string; captured_at: string }
const detail = async (id: string) => (JSON.parse((await feedDocument(FAMILY, `${RAW}event_detail/${id}.json`))!.toString()) as { markets: Mkt[] }).markets;

async function setup(page: Page, id: string) {
  await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ onboarded: true })); } catch { /* private mode */ } });
  await serveRealFeeds(page, { family: FAMILY });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.clock.setFixedTime(new Date(Date.parse((await detail(id))[0].captured_at) + 60_000));
}
const noSideways = async (page: Page) => {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, `the page is ${sw}px wide in a ${iw}px window`).toBeLessThanOrEqual(iw);
};

test.describe('CFB Script Engine journey @v3', () => {
  test('Home, a CFB game, Game Script, a scenario, its priced expression, the exact contract sheet, and Back at every step', async ({ page }) => {
    test.setTimeout(150_000);
    await setup(page, NIU_UNLV);
    // Home: the CFB game is on the slate; tapping it opens the game (the Overview leads with the primary script)
    await page.goto('./#/v3');
    await expect(page.locator('[data-v3-shell]')).toBeVisible();
    await page.getByRole('tab', { name: /NCAAF/ }).click();
    // the slate's day strip: the game is on Saturday the 31st
    await page.getByRole('button', { name: /Sat.*31|31.*Sat/ }).or(page.getByText('Sat', { exact: true })).first().click();
    // open slate games in turn until one carries Script Engine research (a Game Script tab); most of this day's CFB games do
    const cards = page.locator('a.v3-gc__hit');
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    let opened = false;
    for (let i = 0; i < 6 && !opened; i++) {
      await cards.nth(i).click({ position: { x: 24, y: 8 } });
      await expect(page).toHaveURL(/\/v3\/game\/cfb\//);
      opened = await page.getByRole('tab', { name: 'Game Script' }).waitFor({ state: 'visible', timeout: 12_000 }).then(() => true).catch(() => false);
      if (!opened) await page.goBack();
    }
    expect(opened, 'a CFB game on the slate carries a Game Script tab').toBe(true);
    const hero = page.getByTestId('cfb-read');
    await expect(hero).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('cfb-hero-script')).toContainText('Primary');

    // the hero says how the engine ranks the script, with no invented probability, and gives the best expression's price
    await expect(page.getByTestId('cfb-hero-script')).toContainText(/Ranked 1 of \d+ by matchup evidence/);
    await expect(page.getByTestId('cfb-hero-script')).toContainText(/publishes no probability/);
    // when the V2 control claim has a historical record it is a count of past games with its caveat, never a percentage
    if (await page.getByTestId('cfb-hero-history').count()) {
      await expect(page.getByTestId('cfb-hero-history')).toContainText(/Past games with the same claim: .* won \d+ of \d+/);
      await expect(page.getByTestId('cfb-hero-history')).toContainText('not this game’s chance');
    }
    await expect(page.getByTestId('cfb-hero-expr').locator('a.cs-px')).toHaveText(/(YES|NO)\s*\d+¢/);
    await noSideways(page);

    // a scenario tile opens the Game Script tab on that scenario (the address remembers it)
    const tiles = page.getByTestId('cfb-script');
    expect(await tiles.count()).toBeGreaterThanOrEqual(1);
    await tiles.last().click();
    await expect(page.getByRole('tab', { selected: true })).toHaveText('Game Script');
    const detailEl = page.getByTestId('cfb-script-detail');
    await expect(detailEl).toBeVisible();
    const id = (await detailEl.getAttribute('data-script'))!;
    await expect(page).toHaveURL(new RegExp(`sc=${id}`));
    await expect(page.getByRole('group', { name: 'Scenario' }).getByRole('button').last()).toHaveAttribute('aria-pressed', 'true');

    // why it happens, what breaks it, the numbers behind it
    await expect(detailEl).toContainText('Why it happens');
    await expect(detailEl).toContainText('What breaks it');
    await expect(detailEl.getByTestId('cfb-likelihood')).toContainText(/Ranked \d+ of \d+/);
    await expect(detailEl.locator('.cs-basis').first()).toHaveText(/adjusted|raw/i);

    // each priced expression carries the supporting matchup statistic; scoring lines are research only
    const markets = page.getByTestId('cfb-scenario-markets');
    await expect(markets.getByTestId('cfb-backed')).toContainText(/offense .* against .* defense/);
    await expect(markets.getByTestId('cfb-script-market').first().locator('.cs-ex__top a.cs-px')).toHaveText(/(YES|NO)\s*\d+¢/);
    await expect(markets).toContainText('Scoring: research only');

    // a price opens the exact contract sheet on that ticker; Back closes it and the scenario is exactly as it was
    const row = markets.getByTestId('cfb-script-market').first();
    const tk = (await row.getAttribute('data-ticker'))!;
    const before = page.url();
    await row.locator('.cs-ex__top a.cs-px').click();
    await expect(page).toHaveURL(new RegExp(`sheet=contract&tk=${tk}`));
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText(tk);
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(page.url()).toBe(before);
    await expect(page.getByTestId('cfb-script-detail')).toHaveAttribute('data-script', id);
    await noSideways(page);

    // Back from the game returns Home
    // (tab and scenario changes replace the history entry, so one Back leaves the game)
    await page.goBack();
    await expect(page).not.toHaveURL(/\/game\//);
    await expect(page.locator('a.v3-gc__hit').first()).toBeVisible();
  });

  test('the Overview lists Kalshi totals, team totals and the half market as research links, each opening its exact contract', async ({ page }) => {
    await setup(page, NIU_UNLV);
    await page.goto(`./#/v3/game/cfb/${NIU_UNLV}`);
    const sec = page.getByTestId('cfb-markets');
    await expect(sec).toBeVisible({ timeout: 30_000 });
    await expect(sec).toContainText('Research only');
    await expect(sec.getByTestId('cfb-market-group').first()).toContainText(/Game total|team total|First-half/);
    const tap = sec.locator('a.cs-px').first();
    const tk = new URL((await tap.getAttribute('data-dest'))!, 'http://x').searchParams.get('tk')!;
    await tap.click();
    await expect(page).toHaveURL(new RegExp(`sheet=contract&tk=${tk}`));
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('a price the quote gate withholds says why, on the row, in the gate\'s words', async ({ page }) => {
    await serveRealFeeds(page, { family: FAMILY });
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
    // six hours after the capture: every quote is too old for a pregame list
    await page.clock.setFixedTime(new Date(Date.parse((await detail(NIU_UNLV))[0].captured_at) + 6 * 3600_000));
    await page.goto(`./#/v3/game/cfb/${NIU_UNLV}`);
    const expr = page.getByTestId('cfb-hero-expr');
    await expect(expr).toBeVisible({ timeout: 30_000 });
    await expect(expr.locator('a.cs-px')).toHaveText(/(YES|NO)\s*—/);
    await expect(expr.getByTestId('cfb-price-why-full')).toContainText(/Price .* old/);
    await expect(page.getByTestId('cfb-survivor').first().getByTestId('cfb-price-why')).toContainText(/old/);
  });
});
