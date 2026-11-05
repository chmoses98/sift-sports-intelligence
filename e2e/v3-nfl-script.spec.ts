// SIFT 3.0: the NFL Game Script tab as a phone journey, over REAL published documents (fixtures/real, the `game` family, offline): DAL at PHI, week 7 (2026-10-26).
// Overview row -> Game Script -> pick a script (the address remembers it) -> how it plays -> a surviving bet's Kalshi price (the app's own quote gate, on the family's pinned
// clock) -> the exact contract sheet -> Back. A game whose research carries no simulation keeps the published thesis; nothing is invented.
import { test, expect, type Page } from '@playwright/test';
import { feedDocument, feedNow, freshQuotes, useRealFeeds as serveRealFeeds } from './support/realFeeds';

const GAME = '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3';
const EVENT_DOC = 'https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest/explorer/events/evt_cd335cc6d5f5b8d8f7b3.json';
const FAMILY = 'game' as const;

async function setup(page: Page) {
  await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ onboarded: true })); } catch { /* private mode */ } });
  await serveRealFeeds(page, { family: FAMILY });
  await freshQuotes(page, { family: FAMILY });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.clock.setFixedTime(feedNow(FAMILY));
}
async function open(page: Page, query = '') {
  await page.goto(`./#${GAME}${query}`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  const missing = page.getByText('This game is not on the published slate');
  await Promise.race([page.locator('.v3-gh').first().waitFor({ timeout: 30_000 }), missing.waitFor({ timeout: 30_000 })]).catch(() => {});
  test.skip(await missing.isVisible().catch(() => false), 'the reference game is no longer on the published slate');
}
const noSideways = async (page: Page) => {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, `the page is ${sw}px wide in a ${iw}px window`).toBeLessThanOrEqual(iw);
};

test.describe('NFL Game Script @v3', () => {
  test('Overview row, the script cards, a picked script in the address, how it plays, a gated price, the contract sheet, and Back', async ({ page }) => {
    test.setTimeout(120_000);
    await setup(page);
    await open(page);

    // the Overview carries the most likely script and its simulation share as one compact row; a tap opens the tab on it
    const row = page.getByTestId('nfl-script-row');
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(/\d+%\s*of simulated games/);
    const topName = (await row.locator('b').textContent())!;
    await row.click();
    await expect(page.getByRole('tab', { selected: true })).toHaveText('Game Script');
    const detail = page.getByTestId('nfl-script-detail');
    await expect(detail).toBeVisible();
    await expect(detail.locator('h2')).toHaveText(topName);
    const topId = (await detail.getAttribute('data-script'))!;
    await expect(page).toHaveURL(new RegExp(`sc=${topId}`));

    // four or five script cards: name, share bar, the margin line; the most likely one is badged and selected
    const cards = page.getByTestId('nfl-script-picker').getByRole('button');
    expect(await cards.count()).toBeGreaterThanOrEqual(4);
    expect(await cards.count()).toBeLessThanOrEqual(5);
    await expect(cards.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(cards.first()).toContainText('Most likely');
    await expect(page.getByTestId('nfl-script-tab')).toContainText(/not odds and not calibrated probabilities/);
    await noSideways(page);

    // pick another script: the address, the card and the detail follow
    await cards.nth(1).click();
    const id2 = (await cards.nth(1).getAttribute('data-script'))!;
    await expect(page).toHaveURL(new RegExp(`sc=${id2}`));
    await expect(detail).toHaveAttribute('data-script', id2);
    await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');

    // how it plays: one tap down, a volume table against all simulated games and the pass/run lean
    const how = page.getByTestId('nfl-script-how');
    await expect(page.getByTestId('nfl-script-volume')).toBeHidden();
    await how.locator('summary').click();
    await expect(page.getByTestId('nfl-script-volume')).toBeVisible();
    await expect(page.getByTestId('nfl-script-volume')).toContainText(/Pass attempts[\s\S]*Rush attempts/);
    await expect(how).toContainText(/pass (more|less|about the same)/);

    // bets that survive multiple scripts: Kalshi asks through the app's quote gate, each a tap on the exact contract
    const surv = page.getByTestId('nfl-survivors');
    await surv.scrollIntoViewIfNeeded();
    const first = surv.getByTestId('nfl-survivor').first();
    await expect(first).toBeVisible();
    await expect(first).toContainText(/Survives \d of \d scripts/);
    await expect(first.locator('a.cs-px')).toHaveText(/YES\s*\d+¢/);
    await expect(page.getByTestId('nfl-ways')).toContainText('Ways to bet');
    await expect(page.getByTestId('nfl-players')).toContainText(/Team (pass|rush) att/);
    await expect(page.getByTestId('nfl-margin-map')).toBeVisible();
    await noSideways(page);

    const tk = (await first.getAttribute('data-ticker'))!;
    const before = page.url();
    await first.locator('a.cs-px').click();
    await expect(page).toHaveURL(new RegExp(`sheet=contract&tk=${tk}`));
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText(tk);
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(page.url()).toBe(before);
    await expect(detail).toHaveAttribute('data-script', id2);
  });

  test('a shared link remembers the script, and an unknown one falls back to the most likely', async ({ page }) => {
    await setup(page);
    await open(page, '?tab=script&sc=dog');
    await expect(page.getByTestId('nfl-script-detail')).toHaveAttribute('data-script', 'dog', { timeout: 30_000 });
    await expect(page.getByTestId('nfl-script-picker').locator('[data-script=dog]')).toHaveAttribute('aria-pressed', 'true');
    await page.goto(`./#${GAME}?tab=script&sc=not-a-script`);
    await expect(page.getByTestId('nfl-script-picker').getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
  });

  test('a game whose research carries no simulation keeps the published thesis, with no invented script', async ({ page }) => {
    await setup(page);
    const body = JSON.parse((await feedDocument(FAMILY, EVENT_DOC))!.toString());
    delete body.extensions.game_script_inputs;
    await page.route(EVENT_DOC, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) }));
    await open(page, '?tab=script');
    await expect(page.getByRole('region', { name: 'Game script' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('nfl-script-tab')).toHaveCount(0);
    await expect(page.getByTestId('nfl-script-picker')).toHaveCount(0);
    await page.getByRole('tab', { name: /Overview/ }).click();
    await expect(page.getByTestId('nfl-script-row')).toHaveCount(0);
  });
});
