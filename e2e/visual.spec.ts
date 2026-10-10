// Visual regression (owner spec P) on the screens that matter, in Chromium phone + desktop and WebKit
// iPhone. Deterministic: bundled NFL snapshot, fixture quotes stamped at a fixed time, a fixed clock,
// animations off, fonts loaded. Baselines live in e2e/__screenshots__/<project>/ and are produced on CI's
// Linux runners (see docs/ARCHITECTURE.md -> Visual regression) so they match what CI renders.
import type { Page } from '@playwright/test';
import { ALLEN, BUF, expect, ML_ID, NEBUF, NOW, test } from './fixtures';

async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.skel')).toHaveCount(0);
  await expect(page.locator('.gcard__hook--load')).toHaveCount(0);
  // Popovers/toasts are transient; make sure none is open.
  await page.mouse.move(0, 0);
}

test.beforeEach(async ({ page, market }) => {
  await page.clock.setFixedTime(NOW);
  market.observedAt = NOW.toISOString();
});

const SCREENS: { name: string; url: string; wait: (p: Page) => Promise<unknown>; full?: boolean }[] = [
  { name: 'home', url: './#/', wait: (p) => p.getByRole('heading', { name: /^Today on SIFT$/ }).waitFor(), full: true },
  { name: 'games', url: './#/games?day=week', wait: (p) => p.locator('.stile').first().waitFor() },
  { name: 'terminal', url: './#/intelligence', wait: (p) => p.locator('.term__list .trow').first().waitFor() },
  { name: 'pulse', url: './#/intelligence/pulse', wait: (p) => p.locator('.pcard').first().waitFor() },
  { name: 'season', url: './#/nfl/season', wait: (p) => p.locator('.wcell').first().waitFor() },
  { name: 'props', url: './#/nfl/props', wait: (p) => p.locator('#pexa-t').waitFor(), full: true },
  { name: 'nfl-home', url: './#/nfl', wait: (p) => p.getByRole('heading', { name: 'How Each Game Could End' }).waitFor(), full: true },
  { name: 'slate', url: './#/nfl/slate', wait: (p) => p.getByRole('heading', { name: /2026 REG Week 4/i }).waitFor() },
  { name: 'game', url: `./#/nfl/game/${NEBUF}`, wait: (p) => p.getByRole('heading', { name: 'What Matters' }).waitFor(), full: true },
  { name: 'game-script', url: `./#/nfl/game/${NEBUF}?tab=script&script=fav`, wait: (p) => p.getByRole('heading', { name: 'Choose a script' }).waitFor(), full: true },
  { name: 'game-matchup', url: `./#/nfl/game/${NEBUF}?tab=matchup`, wait: (p) => p.getByRole('heading', { name: 'Unit by unit' }).waitFor() },
  { name: 'team', url: `./#/nfl/team/${BUF}`, wait: (p) => p.getByRole('heading', { name: /Buffalo Bills/i, level: 1 }).waitFor() },
  { name: 'metric', url: `./#/nfl/metric/met_nfl.adj_def_db_epa?team=${BUF}`, wait: (p) => p.getByText('League median').waitFor() },
  { name: 'player', url: `./#/nfl/player/${ALLEN}`, wait: (p) => p.getByRole('heading', { name: 'Market Context', exact: true }).waitFor() },
  { name: 'market', url: `./#/nfl/market/${ML_ID}?event=${NEBUF}`, wait: (p) => p.getByRole('heading', { name: 'Model evidence' }).waitFor(), full: true },
  { name: 'packet', url: `./#/packet?sport=nfl&scope=GAME&event=${NEBUF}`, wait: (p) => p.getByRole('button', { name: 'COPY FOR CHATGPT' }).waitFor({ timeout: 60_000 }) },
];

for (const s of SCREENS) {
  test(`${s.name} @visual`, async ({ page, isMobile }) => {
    await page.goto(s.url);
    await s.wait(page);
    await ready(page);
    // Full-page captures on phones would include the fixed bottom bar and the off-screen tray sheet
    // mid-page (a capture artifact), so phones are compared viewport by viewport.
    await expect(page).toHaveScreenshot(`${s.name}.png`, { fullPage: !!s.full && !isMobile });
  });
}

test('game markets board @visual', async ({ page }) => {
  await page.goto(`./#/nfl/game/${NEBUF}?tab=markets`);
  await page.getByRole('heading', { name: 'Markets', exact: true }).waitFor();
  const board = page.locator('#g-markets');
  await ready(page);
  // The board is what this check is about. Its section's quote-freshness line changes when the live quote
  // check lands (the publication's capture age, then "updated 0s ago"), at engine-dependent times, so
  // pin the board's tab bar just under the sticky game tabs, which cover that line.
  await expect(board.locator('.gquote')).toContainText(/updated/i);
  await expect(board.locator('.mboard__bar')).toBeVisible();
  await board.locator('.mboard__bar').evaluate((e) => {
    // Where the game tabs sit once stuck (their sticky offset + height), not where they are now.
    const t = document.querySelector<HTMLElement>('.gtabs');
    const tabs = t ? parseFloat(getComputedStyle(t).top) + t.offsetHeight : 0;
    window.scrollTo(0, Math.round(e.getBoundingClientRect().top + window.scrollY - tabs - 8));
  });
  // The freshness line itself is masked wherever the layout puts it: after the scroll it can sit under the
  // translucent top bar instead of the game tabs, and its live state ghosted through on WebKit.
  await expect(page).toHaveScreenshot('game-markets.png', { mask: [board.locator('.gquote')] });
});

test('league ranking @visual', async ({ page, isMobile }) => {
  await page.goto(`./#/nfl/metric/met_nfl.adj_def_db_epa?team=${BUF}`);
  await page.getByRole('link', { name: /Full NFL ranking/ }).click();
  await expect(page.locator('.rankbars__row')).toHaveCount(32);
  await ready(page);
  await expect(page).toHaveScreenshot('ranking.png', { fullPage: !isMobile });
});

test('my board @visual', async ({ page }) => {
  await page.goto(`./#/nfl/player/${ALLEN}`);
  await page.getByRole('heading', { name: 'Market Context', exact: true }).waitFor();
  await page.getByRole('button', { name: /^Save .* to My Board$/ }).first().click();
  await page.goto('./#/board');
  await expect(page.locator('.bentry')).toHaveCount(1);
  await ready(page);
  await expect(page).toHaveScreenshot('board.png');
});
