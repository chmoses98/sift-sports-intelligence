// NHL on Sift: the NHL vertical against a trimmed, real NHL-edge-finder publication (tests/fixtures/nhl),
// served in place of raw.githubusercontent.com so the run is deterministic and offline. Home, game (overview,
// scripts, candidates, markets), market, team, skater, goalie, scorecard, search and the research tray → packet.
// The clock is set before the slate's first puck drop; live quotes come from the same relay mock as NFL.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, NHL_FIXTURE, noHorizontalOverflow, test } from './fixtures';

/** The real 2026-10-07 slate after puck drop: frozen pregame research, two finals with publisher reviews. */
const NHL_FINAL_FIXTURE = join(NHL_FIXTURE, '..', '..', '..', 'nhl-final', 'app', 'latest');

const NHL_RAW = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/NHL-edge-finder\/data-archive\/app\/latest\/(.+)$/;
const NHL_NOW = new Date('2026-10-06T23:30:00Z');
const COL_WPG = 'evt_ced0054a8fcfd15477e5';
const EDM_ANA = 'evt_e3797432fbc05a48f863';

/** Florida at Los Angeles, 2026-10-07 02:00Z: simulated, scripts and research candidates published. */
const FLA_LAK = 'evt_5938c3f8a7c1b24c0118';
/** Vegas at Seattle: Vegas's starter is projected, Seattle's probable (neither confirmed). */
const VGK_SEA = 'evt_4f20f09608cc97c362a7';
const LAK = 'prt_1513313ad992fb9eb71f';
const KEMPE = 'prt_9e5d52ad51ba0c6a2f60';
const KUEMPER = 'prt_628b1d1dc955ba0a8b41';
const TOTAL = 'mkt_kalshi_KXNHLTOTAL-26OCT06FLALA-6';

async function serveNhl(page: Page, dir = NHL_FIXTURE) {
  await page.context().unroute(NHL_RAW);
  await page.context().route(NHL_RAW, async (route) => {
    const rel = NHL_RAW.exec(route.request().url())![1].split('?')[0];
    const file = join(dir, rel);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(file, 'utf-8'), headers: { 'access-control-allow-origin': '*' } });
  });
}

async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.skel')).toHaveCount(0);
  await page.mouse.move(0, 0);
}

const BANNED = /\block\b|best bet|guaranteed|\bproven\b|\bprofitable\b/i;

test.beforeEach(async ({ page, market }) => {
  await page.clock.setFixedTime(NHL_NOW);
  market.observedAt = NHL_NOW.toISOString();
  await serveNhl(page);
});

test('the NHL home is a hockey dashboard: status, the slate with logos and goalies @smoke', async ({ page }) => {
  await page.goto('./#/nhl');
  await expect(page.getByRole('heading', { name: 'NHL', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /NHL model status: Learning/ }).first()).toBeVisible();
  const rows = page.locator('.nsl');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText(/most likely script/);
  await expect(page.getByRole('heading', { name: 'Research that survives the scripts' })).toBeVisible();
  // Every team logo on the slate is a real, loaded image.
  const logos = page.locator('.nsl img.teammark--logo');
  await expect(logos).toHaveCount(6);
  for (const ok of await logos.evaluateAll((els) => els.map((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0))) expect(ok).toBe(true);
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(BANNED);
  expect(text).not.toMatch(/undefined|NaN/);
});

test('the NHL game page tells the story of the game @smoke', async ({ page }) => {
  await page.goto(`./#/nhl/game/${FLA_LAK}`);
  const game = page.locator('.game--nhl');
  for (const h of ['How this game is most likely to play', 'Game scripts', 'Goalie matchup', 'Market fit', 'Special teams', 'Player research']) {
    await expect(game.getByRole('heading', { name: new RegExp(`^${h}`) }).first()).toBeVisible();
  }
  await expect(game.getByRole('img', { name: /Model win probability: FLA 44%, LAK 56%/ })).toBeVisible();
  await expect(game.getByRole('note', { name: 'Contradiction check' })).toBeVisible();
  await expect(game.locator('.gh__team img.teammark--logo')).toHaveCount(2);
  const text = await game.innerText();
  expect(text).not.toMatch(/KXNHL|undefined|NaN/);
  expect(text).not.toMatch(BANNED);
  expect(text).toMatch(/research only/i);
});

test('an unconfirmed goalie is obvious on the slate and the game page @journey', async ({ page }) => {
  await page.goto('./#/nhl');
  await expect(page.locator('.nsl').filter({ hasText: 'VGK' }).getByText('Goalie unconfirmed')).toBeVisible();
  await page.goto(`./#/nhl/game/${VGK_SEA}`);
  await expect(page.locator('.ngc--unconf').first()).toBeVisible();
  await expect(page.getByText(/Not confirmed\. The projection assumes this starter/).first()).toBeVisible();
});

test('direct links, refresh and back/forward keep the NHL route @journey', async ({ page }) => {
  await page.goto(`./#/nhl/game/${FLA_LAK}?tab=script`);
  await expect(page.getByRole('heading', { name: 'Which markets survive which scripts' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Which markets survive which scripts' })).toBeVisible();
  await page.getByRole('link', { name: 'Story' }).click();
  await expect(page.getByRole('heading', { name: 'How this game is most likely to play' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Which markets survive which scripts' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'How this game is most likely to play' })).toBeVisible();
  await page.goto('./#/nhl/slate');
  await expect(page.getByRole('heading', { name: 'NHL slate', level: 1 })).toBeVisible();
  await page.locator('.nsl__a').first().click();
  await expect(page).toHaveURL(/#\/nhl\/game\//);
});

test('NHL fits a tablet and a narrow Android phone without sideways scrolling @journey', async ({ page }) => {
  for (const size of [{ width: 820, height: 1180 }, { width: 360, height: 780 }]) {
    await page.setViewportSize(size);
    for (const url of ['./#/nhl', `./#/nhl/game/${FLA_LAK}`, `./#/nhl/game/${FLA_LAK}?tab=players`, `./#/nhl/game/${FLA_LAK}?tab=markets`]) {
      await page.goto(url);
      await ready(page);
      await noHorizontalOverflow(page, `${url} @ ${size.width}px`);
    }
  }
});

test('the scripts tab carries every script and a survival matrix that fits the screen @journey', async ({ page, isMobile }) => {
  await page.goto(`./#/nhl/game/${FLA_LAK}?tab=script`);
  await expect(page.getByRole('heading', { name: 'Which markets survive which scripts' })).toBeVisible();
  if (isMobile) await expect(page.getByRole('region', { name: 'Script survival matrix' })).toBeHidden();
  else await expect(page.getByRole('region', { name: 'Script survival matrix' })).toBeVisible();
  await noHorizontalOverflow(page, 'nhl-scripts');
});

test('market fit groups research by the scripts and flags contradictions @journey', async ({ page }) => {
  await page.goto(`./#/nhl/game/${FLA_LAK}?tab=markets`);
  const fit = page.locator('#n-fit');
  await expect(fit.getByRole('note', { name: 'Contradiction check' })).toBeVisible();
  await expect(fit.getByRole('heading', { name: /Survives multiple scripts/ })).toBeVisible();
  await expect(fit.locator('.nfr').first()).toContainText(/Fair \d+%/);
  // Goal scorers sit behind a high-variance disclosure, never in the featured groups.
  await expect(fit.locator('.nmf .nfr').filter({ hasText: /1\+ goals|to score/ })).toHaveCount(0);
  await fit.getByText(/High-variance research: goal scorers/).click();
  await expect(fit.locator('.nmf__hv .nfr').first()).toBeVisible();
});

test('the markets tab keeps the live market and says when the model does not price a market @journey', async ({ page }) => {
  await page.goto(`./#/nhl/game/${FLA_LAK}?tab=markets`);
  await expect(page.locator('.game--nhl')).toContainText(/Model does not price this market|Model P\(YES\)|Model/);
  expect(await page.locator('.game--nhl').innerText()).not.toMatch(/KXNHL/);
});

test('a market page shows the contract in every script with the failure script called out @journey', async ({ page }) => {
  await page.goto(`./#/nhl/market/${TOTAL}?event=${FLA_LAK}`);
  await expect(page.getByRole('heading', { name: /does it survive the game scripts/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Script-conditioned prices' })).toBeVisible();
});

test('a team page separates opponent-adjusted strength from raw numbers @journey', async ({ page }) => {
  await page.goto(`./#/nhl/team/${LAK}`);
  const region = page.getByRole('region', { name: 'Opponent-adjusted strength' });
  await expect(region).toBeVisible();
  await expect(region.getByRole('columnheader', { name: 'Raw (same games)' })).toBeVisible();
});

test('skater and goalie pages are research first @journey', async ({ page }) => {
  await page.goto(`./#/nhl/player/${KEMPE}`);
  await expect(page.getByRole('heading', { name: /Adrian Kempe/, level: 1 })).toBeVisible();
  await page.goto(`./#/nhl/player/${KUEMPER}`);
  await expect(page.getByRole('heading', { name: /Kuemper/, level: 1 })).toBeVisible();
  await expect(page.getByText(/Projected starter|Confirmed starter|starter/i).first()).toBeVisible();
});

test('the scorecard reports real counts and what is not yet known @journey', async ({ page }) => {
  await page.goto('./#/nhl/scorecard');
  await expect(page.getByRole('heading', { name: /Projection vs market/ })).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).toMatch(/What we still do not know/);
  expect(text).toMatch(/\d+ settled games/);
  expect(text).not.toMatch(BANNED);
});

test('search finds NHL teams and players @journey', async ({ page }) => {
  await page.goto('./#/search?q=Kempe');
  await expect(page.locator('.sres').filter({ hasText: 'Kempe' }).first()).toBeVisible();
});

test('an NHL game saved to the tray builds an NHL handicap packet with the scripts @journey', async ({ page, isMobile }) => {
  await page.goto(`./#/nhl/game/${FLA_LAK}`);
  await page.getByRole('button', { name: /^Save .* to research tray$/ }).first().click();
  await (isMobile ? page.locator('.bottombar__tray') : page.locator('.traybtn')).click();
  const drawer = page.getByRole('complementary', { name: 'Research tray' });
  await expect(drawer.locator('.tray__item')).toHaveCount(1);
  await drawer.getByRole('link', { name: /Dig deeper with ChatGPT \(NHL\)/ }).click();
  await expect(page.getByRole('button', { name: 'COPY FOR CHATGPT' })).toBeVisible({ timeout: 60_000 });
  const packet = await page.locator('pre, textarea').first().innerText().catch(() => '');
  if (packet) {
    expect(packet).toContain('protocol edge_finder.handicap.nhl.v1');
    expect(packet).toContain('NHL_SCRIPT_V1');
  }
});

for (const [name, url, wait] of [
  ['nhl-home', './#/nhl', '.nhx'],
  ['nhl-game', `./#/nhl/game/${FLA_LAK}`, '.game--nhl'],
  ['nhl-game-script', `./#/nhl/game/${FLA_LAK}?tab=script`, '.game--nhl'],
  ['nhl-game-markets', `./#/nhl/game/${FLA_LAK}?tab=markets`, '.game--nhl'],
  ['nhl-game-players', `./#/nhl/game/${FLA_LAK}?tab=players`, '.game--nhl'],
  ['nhl-market', `./#/nhl/market/${TOTAL}?event=${FLA_LAK}`, '.nsc__t'],
  ['nhl-team', `./#/nhl/team/${LAK}`, '.team'],
  ['nhl-goalie', `./#/nhl/player/${KUEMPER}`, 'main h1'],
  ['nhl-scorecard', './#/nhl/scorecard', '.nsc'],
] as const) {
  test(`${name} has no horizontal overflow and no serious a11y violations @smoke`, async ({ page }) => {
    await page.goto(url);
    await page.locator(wait).first().waitFor();
    await ready(page);
    await noHorizontalOverflow(page, name);
    const res = await new AxeBuilder({ page }).include(wait === '.game--nhl' ? wait : 'main').analyze();
    const bad = res.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  if (['nhl-home', 'nhl-game', 'nhl-game-script', 'nhl-scorecard'].includes(name)) {
    test(`${name} @visual`, async ({ page, isMobile }) => {
      await page.goto(url);
      await page.locator(wait).first().waitFor();
      await ready(page);
      await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: !isMobile });
    });
  }
}

test.describe('a started and finished slate (the real 2026-10-07 publication)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-08T05:00:00Z'));
    await serveNhl(page, NHL_FINAL_FIXTURE);
  });

  test('finals list for review with the score, live games as live, no pregame research offered @smoke', async ({ page }) => {
    await page.goto('./#/nhl');
    await expect(page.locator('.nsl')).toHaveCount(3);
    await expect(page.locator('.nsl--final')).toHaveCount(2);
    await expect(page.locator('.nsl--final').filter({ hasText: 'COL' })).toContainText(/WPG 3/);
    await expect(page.getByText(/Every game on this slate has started/)).toBeVisible();
    await noHorizontalOverflow(page, 'nhl-home-final');
  });

  test('a final game reviews the frozen pregame read against what happened @smoke', async ({ page }) => {
    await page.goto(`./#/nhl/game/${COL_WPG}`);
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
    await expect(page.getByText(/Goaltending steals it · forecast 8% \(ranked 6 of 7\)/)).toBeVisible();
    await expect(page.getByLabel('Final: COL 2, WPG 3')).toBeVisible();
    await expect(page.locator('.gh__score')).toHaveCount(2);
    await expect(page.getByText(/frozen at/).first()).toBeVisible();
    await noHorizontalOverflow(page, 'nhl-game-final');
    const bad = (await new AxeBuilder({ page }).include('.game--nhl').analyze()).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('a live game shows its frozen research and never presents live prices as pregame @journey', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-08T02:30:00Z'));
    await page.goto(`./#/nhl/game/${EDM_ANA}`);
    await expect(page.getByText(/Puck has dropped\./)).toBeVisible();
    await expect(page.getByText('Pregame model win probability')).toBeVisible();
    await page.goto(`./#/nhl/game/${EDM_ANA}?tab=markets`);
    await expect(page.getByText(/prices move with the score and are not pregame research/)).toBeVisible();
  });
});
