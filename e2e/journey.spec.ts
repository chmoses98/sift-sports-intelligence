// The V1 acceptance journey (HOME → NFL → GAME → TEAM → METRIC → FULL RANKING → HISTORICAL GAME →
// PLAYER → MARKET → TRAY → COPY FOR CHATGPT), on real NFL data. External hosts are blocked so the
// run is deterministic: Sift falls back to the bundled same-run NFL research snapshot, exactly as it
// does in production while NFL's live explorer is unpublished.
import { expect, test, type Page } from '@playwright/test';

async function shot(page: Page, name: string) {
  // Mobile is not a squeezed desktop: no screen may scroll sideways.
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw, `${name} overflows horizontally`).toBeLessThanOrEqual(cw);
  await page.screenshot({ path: `test-results/journey/${test.info().project.name}-${name}.png` });
}

test.beforeEach(async ({ context }) => {
  await context.route(/^https:\/\/raw\.githubusercontent\.com\//, (r) => r.abort());
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:4173' });
});

test('the full research journey ends in a real handicap packet on the clipboard', async ({ page, isMobile }) => {
  // 1. Open Sift
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'Sift' })).toBeVisible();
  await shot(page, '01-home');

  // 2. Open NFL
  await page.getByRole('link', { name: /Open the slate/ }).click();
  await expect(page.getByRole('heading', { name: /2026 REG Week 4/i })).toBeVisible();
  await expect(page.getByText('RESEARCH SNAPSHOT')).toBeVisible();
  await shot(page, '02-slate');

  // 3. Open an upcoming game
  await page.getByRole('link', { name: /New England Patriots at Buffalo Bills/ }).click();
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

  // 11. Go elsewhere; the tray survives navigation and a reload
  await page.goto('./#/nfl');
  await page.reload();
  const trayCount = isMobile ? page.locator('.bottombar__n') : page.locator('.traybtn__n');
  await expect(trayCount).toHaveText('1');

  // 12. Open the tray
  await (isMobile ? page.locator('.bottombar button') : page.locator('.traybtn')).click();
  const drawer = page.getByRole('complementary', { name: 'Research tray' });
  await expect(drawer.locator('.tray__item')).toHaveCount(1);
  await shot(page, '12-tray');

  // 13. Build the handicap packet
  await drawer.getByRole('link', { name: /Build NFL handicap packet/ }).click();
  const copy = page.getByRole('button', { name: 'COPY FOR CHATGPT' });
  await expect(copy).toBeVisible({ timeout: 60_000 });
  await shot(page, '13-packet');

  // 14. Copy it for ChatGPT
  await copy.click();
  await expect(page.getByRole('button', { name: /Copied [\d,]+ characters/ })).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());

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
});

test('deep links survive a refresh on the Pages base path', async ({ page }) => {
  await page.goto('./#/nfl/team/prt_38f80e30c7c786aaf5b4?tab=schedule');
  await expect(page.getByRole('heading', { name: /Baltimore Ravens/i, level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.locator('.tabs').getByRole('tab', { name: 'Schedule' })).toHaveAttribute('aria-selected', 'true');
});

test('search answers entity + intent queries', async ({ page }) => {
  await page.goto('./#/search?q=Baltimore%20pass%20defense');
  await expect(page.locator('.sres--intent').first()).toContainText('Baltimore Ravens');
  await expect(page.locator('.sres--intent').first()).toContainText(/of 32/);
  await page.goto('./#/search?q=Josh%20Allen%20passing%20yards');
  await expect(page.locator('.sres--market').first()).toContainText('passing yards');
});
