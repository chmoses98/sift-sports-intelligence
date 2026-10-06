// Last Sift-side closure pass, on the real publication: new pregame research freezes at kickoff, the
// published model scorecard on the NFL home, plain-English metric definitions, and the cleaned-up Player page.
import type { Page } from '@playwright/test';
import { ALLEN, BUF, expect, ML_ID, NEBUF, noHorizontalOverflow, NOW, test } from './fixtures';

const FINAL_GAME = 'evt_0e858f7285b411adf630'; // a 2026 week-1 game, FINAL in this publication
const AFTER_KICKOFF = new Date('2026-10-04T17:30:00Z'); // NE @ BUF kicked off at 17:00Z
async function expectTray(page: Page, isMobile: boolean, n: number) {
  const badge = isMobile ? page.locator('.bottombar__n') : page.locator('.traybtn__n');
  if (isMobile && n === 0) await expect(badge).toHaveCount(0); // the phone badge hides at zero
  else await expect(badge).toHaveText(String(n));
}

// ---------------------------------------------------------------- post-kickoff freeze

test.describe('pregame research freezes at kickoff', () => {
  test('before kickoff a market can be saved; after kickoff it stays saved, shows as pregame and can be removed', async ({ page, isMobile }) => {
    await page.clock.install({ time: NOW });
    await page.goto(`./#/nfl/market/${ML_ID}?event=${NEBUF}`);
    const save = page.getByRole('button', { name: /^Save .* to research tray$/ }).first();
    await save.click();
    await expectTray(page, isMobile, 1);

    await page.clock.fastForward('02:40:00'); // past the 17:00Z kickoff; the control re-reads the clock
    const saved = page.getByRole('button', { name: /Remove .* \(saved before kickoff as pregame research\)/ }).first();
    await expect(saved).toBeVisible();
    await expect(saved).toHaveText(/Saved pregame/);
    await expectTray(page, isMobile, 1);
    await (isMobile ? page.locator('.bottombar__tray') : page.locator('.traybtn')).click();
    await expect(page.getByRole('complementary', { name: 'Research tray' }).getByText('Pregame · saved before kickoff')).toBeVisible();
    await page.keyboard.press('Escape');

    await saved.click();
    await expectTray(page, isMobile, 0);
    const frozen = page.getByRole('button', { name: /Pregame research frozen/ }).first();
    await expect(frozen).toHaveAttribute('aria-disabled', 'true');
    await frozen.click({ force: true }); // aria-disabled: a user can still tap it; nothing is saved
    await expectTray(page, isMobile, 0);
  });

  test('after kickoff the game hero offers no new save, and explains why on tap', async ({ page, isMobile }) => {
    await page.clock.install({ time: AFTER_KICKOFF });
    await page.goto(`./#/nfl/game/${NEBUF}`);
    await expect(page.getByText('Kicked off · pregame research frozen')).toBeVisible();
    const b = page.locator('.mh__actions').getByRole('button', { name: /Pregame research frozen/ });
    await expect(b).toHaveAttribute('aria-disabled', 'true');
    await expect(b).toHaveAccessibleDescription(/New pregame research can’t be saved after kickoff/);
    await b.click({ force: true }); // aria-disabled: tapping explains, never saves
    await expect(page.getByRole('status').filter({ hasText: 'items saved before kickoff stay in your tray' })).toBeVisible();
    await expectTray(page, isMobile, 0);
    // The Copy for ChatGPT packet path still works for the game.
    await expect(page.getByRole('link', { name: /Copy for ChatGPT/ })).toBeVisible();
  });

  test('a FINAL game rejects new pregame saves', async ({ page, isMobile }) => {
    await page.clock.install({ time: NOW });
    await page.goto(`./#/nfl/game/${FINAL_GAME}`);
    const b = page.locator('.mh__actions').getByRole('button', { name: /Pregame research frozen/ });
    await expect(b).toHaveAttribute('aria-disabled', 'true');
    await b.click({ force: true }); // aria-disabled: tapping explains, never saves
    await expectTray(page, isMobile, 0);
  });

  test('before kickoff the same hero control saves normally', async ({ page, isMobile }) => {
    await page.clock.install({ time: NOW });
    await page.goto(`./#/nfl/game/${NEBUF}`);
    await page.locator('.mh__actions').getByRole('button', { name: /^Save .* to research tray$/ }).click();
    await expectTray(page, isMobile, 1);
  });
});

// ---------------------------------------------------------------- model scorecard

test.describe('model scorecard', () => {
  test.beforeEach(async ({ page }) => page.clock.install({ time: NOW }));

  test('the NFL home shows the published scorecard plainly, and never fetches the wager ledger', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(r.url()));
    await page.goto('./#/nfl');
    const sc = page.getByRole('region', { name: 'Model Scorecard' });
    await expect(sc.getByText('Market currently stronger overall')).toBeVisible();
    await expect(sc.getByText('Brier score', { exact: true })).toBeVisible();
    await expect(sc.getByText('Log loss', { exact: true })).toBeVisible();
    await expect(sc.getByText('The model is not currently beating the market overall.', { exact: false })).toBeVisible();
    await sc.getByRole('button', { name: 'What is Brier score?' }).click();
    await expect(sc.getByRole('dialog', { name: 'What is Brier score?' })).toContainText('Lower is better.');
    await page.keyboard.press('Escape');
    await sc.getByRole('link', { name: /Full scorecard/ }).click();
    await expect(page.getByRole('heading', { name: 'Model Scorecard', level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: 'By market type' }).getByText('Player props')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Calibration' })).toContainText('Its probabilities run low');
    expect(requested.filter((u) => /performance\.json|wagers\.json/.test(u))).toEqual([]);
    await noHorizontalOverflow(page, 'scorecard');
    await expect(page.locator('body')).not.toContainText(/\b(lock|guaranteed|proven winner|profitable model)\b/i);
  });
});

// ---------------------------------------------------------------- definitions

test('metric pages lead with a plain-English definition; the registry text stays below', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto(`./#/nfl/metric/met_nfl.def_epa_play?team=${BUF}`);
  const plain = page.locator('.plain');
  await expect(plain).toContainText('In plain English');
  await expect(plain).toContainText('Expected points this defense allows per play. Lower is better.');
  await expect(page.getByText('Technical definition (metric registry)')).toBeVisible();
});

// ---------------------------------------------------------------- player page

test.describe('player page', () => {
  test.beforeEach(async ({ page }) => page.clock.install({ time: NOW }));

  test('the key market and projection numbers lead; provenance is demoted but reachable', async ({ page }) => {
    await page.goto(`./#/nfl/player/${ALLEN}`);
    await expect(page.getByRole('heading', { name: 'Market vs Projection' })).toBeVisible();
    for (const k of ['Model projection', 'Live market', 'Model − Market']) await expect(page.locator('.pvm').getByText(k, { exact: true })).toBeVisible();
    await expect(page.locator('.pvm').getByRole('link', { name: /Open market/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Projected Range' })).toBeVisible();
    for (const k of ['Low-end', 'Typical range', 'High-end', 'Model average', 'Market-implied']) await expect(page.locator('.prange').getByText(k, { exact: true })).toBeVisible();
    // No internal contract vocabulary on the primary path…
    const main = page.locator('.player > :not(.plquiet)');
    await expect(main.filter({ hasText: /Support state|RESEARCH_ONLY|coherent simulation/ })).toHaveCount(0);
    // …but the provenance is one tap away.
    await page.getByText('About this data: source, quality and support').click();
    await expect(page.locator('.pldet--about')).toContainText('support state');
    await expect(page.locator('.pldet--about')).toContainText('RESEARCH_ONLY');
  });

  test('QB receiving usage stays absent; relevant usage and role remain', async ({ page }) => {
    await page.goto(`./#/nfl/player/${ALLEN}`);
    const sec = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Usage & Role', exact: true }) }).first();
    await expect(sec.getByText('Carry share', { exact: true })).toBeVisible();
    await expect(sec.getByText('QB1')).toBeVisible();
    await expect(sec.getByText(/target share|reception|receiving/i)).toHaveCount(0);
  });

  test('the unavailable game log is honest and secondary, after the matchup', async ({ page }) => {
    await page.goto(`./#/nfl/player/${ALLEN}`);
    const quiet = page.getByRole('region', { name: 'History and availability' });
    await expect(quiet.getByText('Not published for 2026 yet.', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Game log', level: 2 })).toHaveCount(0);
    const order = await page.evaluate(() => {
      const mu = [...document.querySelectorAll('h2')].findIndex((h) => /^Matchup vs/.test(h.textContent ?? ''));
      const hi = [...document.querySelectorAll('h2')].findIndex((h) => /History & Availability/.test(h.textContent ?? ''));
      return { mu, hi };
    });
    expect(order.mu).toBeGreaterThan(-1);
    expect(order.hi).toBeGreaterThan(order.mu);
  });

  test('375 px: tabs, ladder, prices, range and matchup fit; info popovers open on tap', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`./#/nfl/player/${ALLEN}`);
    await expect(page.getByRole('heading', { name: 'Market vs Projection' })).toBeVisible();
    await noHorizontalOverflow(page, 'player-375');
    await page.getByRole('tab', { name: /Rushing yards/ }).click();
    await expect(page.getByRole('tab', { name: /Rushing yards/ })).toHaveAttribute('aria-selected', 'true');
    await noHorizontalOverflow(page, 'player-375-rushing');
    for (const sel of ['.pvm', '.ladder', '.prange', '.plmu']) {
      const box = await page.locator(sel).first().boundingBox();
      expect(box, sel).not.toBeNull();
      expect(box!.x + box!.width, `${sel} fits`).toBeLessThanOrEqual(375);
    }
    const info = page.locator('.plmu').getByRole('button', { name: /^What is / }).first();
    await info.scrollIntoViewIfNeeded();
    await info.click();
    await expect(page.locator('.plmu').getByRole('dialog').first()).toContainText('Lower is better.');
  });
});
