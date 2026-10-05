// The V1 acceptance journey (HOME → NFL → GAME → TEAM → METRIC → FULL RANKING → HISTORICAL GAME →
// PLAYER → MARKET → TRAY → BUILD PACKET → COPY FOR CHATGPT), on real NFL data, in Chromium (phone,
// desktop) and WebKit (iPhone). External hosts are blocked so the run is deterministic: Sift falls
// back to the bundled same-run NFL research snapshot, exactly as it does in production while NFL's
// live explorer is unpublished; live quotes come from the fixture relay (e2e/fixtures.ts).
import type { BrowserContext, Page } from '@playwright/test';
import { expect, noHorizontalOverflow, test } from './fixtures';

async function shot(page: Page, name: string) {
  await noHorizontalOverflow(page, name);
  await page.screenshot({ path: `test-results/journey/${test.info().project.name}-${name}.png` });
}

/**
 * Chromium grants clipboard permissions to the test; WebKit has no such permission, so the copy is
 * captured from navigator.clipboard.writeText (the app's first choice) instead.
 */
async function clipboardFor(context: BrowserContext, browserName: string) {
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:4173' });
    return (page: Page) => page.evaluate(() => navigator.clipboard.readText());
  }
  await context.addInitScript(() => {
    const w = window as unknown as { __copied?: string };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void (w.__copied = t), readText: async () => w.__copied ?? '' } });
  });
  return (page: Page) => page.evaluate(() => (window as unknown as { __copied?: string }).__copied ?? '');
}

test('the full research journey ends in a real handicap packet on the clipboard @journey', async ({ page: first, context, isMobile, browserName }) => {
  let page = first;
  const readClipboard = await clipboardFor(context, browserName);
  // 1. Open Sift
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'Today on Sift' })).toBeVisible();
  await shot(page, '01-home');

  // 2. Open the NFL home (the sport's landing page; the full slate is one link away)
  await page.getByRole('link', { name: /NFL home/ }).click();
  await expect(page.getByRole('heading', { name: 'NFL', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Script Outlook' })).toBeVisible();
  await expect(page.getByText('RESEARCH SNAPSHOT')).toBeVisible();
  // The breadcrumb restarted at the sport.
  await expect(page.getByRole('navigation', { name: 'Research path' }).locator('li')).toHaveCount(1);
  await shot(page, '02-nfl-home');

  // 3. Open an upcoming game: the overview leads with the model read and the game scripts
  await page.getByRole('link', { name: /New England Patriots at Buffalo Bills/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Model Read' })).toBeVisible();
  await expect(page.locator('.scard')).toHaveCount(4);
  await page.getByRole('navigation', { name: 'Game sections' }).getByRole('link', { name: 'Matchup' }).click();
  await expect(page.getByRole('heading', { name: 'How they match up' })).toBeVisible();
  await expect(page.locator('.mb__cell')).toHaveCount(28);
  await shot(page, '03-game');

  // 4. Open one team's profile
  await page.locator('.mh__team--home .mh__name').click();
  await expect(page.getByRole('heading', { name: /Buffalo Bills/i, level: 1 })).toBeVisible();
  await shot(page, '04-team');

  // 5. Open a metric (from the team's metrics tab)
  await page.locator('.tabs').getByRole('tab', { name: 'Metrics' }).click();
  await page.locator('.mrow2__main', { hasText: 'Adjusted defensive EPA per dropback allowed' }).click();
  await expect(page.getByText('of 32')).toBeVisible();
  await expect(page.getByText('League median')).toBeVisible();
  await shot(page, '05-metric');

  // 6. That metric against the full NFL comparison universe
  await page.getByRole('link', { name: /Full NFL ranking/ }).click();
  await expect(page.locator('.rankbars__row')).toHaveCount(32);
  await expect(page.locator('.rankbars__row--focus')).toContainText(isMobile ? 'BUF' : 'Buffalo Bills');
  await shot(page, '06-ranking');

  // 7. A historical point from the team's trend → that game
  await page.goBack();
  await page.goBack();
  await page.locator('.tabs').getByRole('tab', { name: 'Results' }).click();
  const trend = page.locator('.trend').first();
  await expect(trend.locator('.trend__col')).toHaveCount(40);
  await trend.locator('.trend__hit').nth(5).click();
  await trend.getByRole('link', { name: /Open game/ }).click();
  await expect(page.getByText('Historical game')).toBeVisible();
  await expect(page.locator('.mh__score').first()).toHaveText(/\d+/);
  await shot(page, '07-historical');

  // 8. A player from that game's teams
  await page.locator('.chips .elink--player').filter({ hasText: 'Josh Allen' }).click();
  await expect(page.getByRole('heading', { name: 'Josh Allen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Markets vs projection' })).toBeVisible();
  await shot(page, '08-player');

  // 9. One of the player's markets (a rung of the passing-yards ladder)
  await page.locator('.ladder .trend__hit').first().click();
  await expect(page.getByText('YES pays $1 if')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Model evidence' })).toBeVisible();
  await shot(page, '09-market');

  // 10. Save it to the research tray
  await page.getByRole('button', { name: /^Save .* to research tray$/ }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'to the research tray' })).toBeVisible();

  // 11. Go elsewhere; the tray survives navigation and a fresh load of the app
  await page.goto('./#/nfl');
  if (browserName === 'webkit') {
    // Playwright's WebKit build on Linux crashes ("Page crashed") on page.reload() at this point of the
    // long journey only; isolated reloads after the same screens pass (e2e deep-link test, CI diagnostic
    // 2026-10-04). A fresh page in the same context proves the same thing: the tray persists across loads.
    const fresh = await context.newPage();
    await page.close();
    page = fresh;
    await page.goto('./#/nfl');
  } else {
    await page.reload();
  }
  const trayCount = isMobile ? page.locator('.bottombar__n') : page.locator('.traybtn__n');
  await expect(trayCount).toHaveText('1');

  // 12. Open the tray
  await (isMobile ? page.locator('.bottombar__tray') : page.locator('.traybtn')).click();
  const drawer = page.getByRole('complementary', { name: 'Research tray' });
  await expect(drawer.locator('.tray__item')).toHaveCount(1);
  await shot(page, '12-tray');

  // 13. Build the handicap packet
  await drawer.getByRole('link', { name: /Build NFL handicap packet/ }).click();
  const copy = page.getByRole('button', { name: 'COPY FOR CHATGPT' });
  await expect(copy).toBeVisible({ timeout: 60_000 });
  // The packet's markets were refreshed before it was built (preflight), and the user is told so.
  const preflight = page.getByRole('region', { name: 'Market refresh preflight' });
  await expect(preflight).toHaveAttribute('data-preflight', 'PASS');
  await expect(preflight).toContainText('Oldest relevant quote');
  // The copy button is never hidden behind the fixed bottom navigation.
  await copy.click({ trial: true, timeout: 5_000 }); // fails if a fixed bar / sheet would take the tap
  await shot(page, '13-packet');

  // 14. Copy it for ChatGPT
  await copy.click();
  await expect(page.getByRole('button', { name: /Copied [\d,]+ characters/ })).toBeVisible();
  const text = await readClipboard(page);

  // 15. The packet carries protocol, current evidence, markets, quality/freshness and the user's focus
  expect(text).toContain('EDGE FINDER HANDICAP PACKET pkt_');
  expect(text).toContain('protocol edge_finder.handicap.nfl.v1');
  expect(text).toContain('WARNING: Everything in this packet is EVIDENCE');
  expect(text).toContain('PROTOCOL PRINCIPLES:');
  expect(text).toContain('Projections, model prices and repository recommendations are EVIDENCE');
  expect(text).toMatch(/DATA QUALITY: markets (FRESH|AGING|STALE|UNKNOWN), model (FRESH|AGING|STALE|UNKNOWN)/);
  expect(text).toContain('USER FOCUS');
  expect(text).toMatch(/- MARKET YES iff Josh Allen passing_yards \(FULL\) >= /);
  expect(text).toContain('EVENTS:\n- NE @ BUF (evt_0cb333291f580a201a70)');
  expect(text).toContain('EVIDENCE:\n- TEAM New England Patriots');
  expect(text).toContain('- PLAYER Josh Allen (Buffalo Bills), QB');
  expect(text).toMatch(/MARKETS \(796, all in scope\)/);
  expect(text).toContain('MODEL EVIDENCE:');
  // Freshness was evaluated at build time on refreshed quotes: the tray market is FRESH and live.
  expect(text).toMatch(/DATA QUALITY: markets FRESH, model /);
  expect(text).toContain('kalshi live quotes (kalshi-relay');
});

test('deep links survive a refresh on the Pages base path @smoke', async ({ page }) => {
  await page.goto('./#/nfl/team/prt_38f80e30c7c786aaf5b4?tab=schedule');
  await expect(page.getByRole('heading', { name: /Baltimore Ravens/i, level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.locator('.tabs').getByRole('tab', { name: 'Schedule' })).toHaveAttribute('aria-selected', 'true');
});

test('search answers entity + intent queries @journey', async ({ page }) => {
  await page.goto('./#/search?q=Baltimore%20pass%20defense');
  await expect(page.locator('.sres--intent').first()).toContainText('Baltimore Ravens');
  await expect(page.locator('.sres--intent').first()).toContainText(/of 32/);
  await page.goto('./#/search?q=Josh%20Allen%20passing%20yards');
  await expect(page.locator('.sres--market').first()).toContainText('passing yards');
});
