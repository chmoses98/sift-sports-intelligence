// CFB through the CFB Script Engine: the same SIFT game page, driven by a market-blind football read.
// The CFB publication is served from tests/fixtures/cfb (a trimmed, real cfb-edge-finder export) in place
// of raw.githubusercontent.com, so the run is deterministic and offline.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, noHorizontalOverflow, test } from './fixtures';

const FIXTURE = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'tests', 'fixtures', 'cfb', 'app', 'latest');
const CFB_RAW = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/cfb-edge-finder\/main\/app\/latest\/(.+)$/;
/** The research-signals contract (src/data/sports.ts CFB_RESEARCH_SIGNALS_URL), answered from its fixture. */
const CFB_SIGNALS = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/cfb-edge-finder\/research-signals\/signals\/cfb_research_signals\.json(\?.*)?$/;
const SIGNALS_FIXTURE = join(FIXTURE, '..', '..', 'signals', 'cfb_research_signals.json');
/** The CFB fixture's own clock: the morning after its capture, week 6 still to play (two Wednesday games in progress). */
const CFB_NOW = new Date('2026-10-08T12:00:00Z');

/** Georgia at Alabama, 2026-10-10: HIGH data confidence, a shootout primary and a grind danger. */
export const UGA_ALA = 'evt_93e12676ae9337017c63';
/** LSU at Kentucky: an away-control primary with secondary and danger scripts. */
export const LSU_UK = 'evt_8c3166866b2bfa530c17';
/** Albany vs Stony Brook: the engine could not match the game; markets only. */
export const ALBY_STON = 'evt_776097ba6eef448fb340';
/** Iowa St. at BYU: SCRIPTS_GENERATED (two scripts). */
export const ISU_BYU = 'evt_1f7f2822f37fb1a8e34e';
/** New Mexico St. at Florida International: SINGLE_SCRIPT. */
export const NMSU_FIU = 'evt_f39ef6a955b04b97fe84';
/** Jacksonville St. at Kennesaw St.: NO_SCRIPT_CLEARED_EVIDENCE. */
export const JVST_KENN = 'evt_e56d7cee653c3507226b';
/** Sacramento St. at Bowling Green: Strong CONTROL priced at 28¢, a Market Disagreement. */
export const SAC_BGSU = 'evt_f32aa654d1e5ccd474f9';
/** Stanford at Notre Dame: Strong CONTROL with no offer below $1. */
export const STAN_ND = 'evt_7ca164d80f042f650a5c';
const EMPTY = 'No script cleared its evidence requirement';

async function serveCfb(page: Page) {
  await page.context().route(CFB_SIGNALS, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(SIGNALS_FIXTURE, 'utf-8'), headers: { 'access-control-allow-origin': '*' } }));
  await page.context().route(CFB_RAW, async (route) => {
    const rel = CFB_RAW.exec(route.request().url())![1].split('?')[0];
    const file = join(FIXTURE, rel);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(file, 'utf-8'), headers: { 'access-control-allow-origin': '*' } });
  });
}

async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.skel')).toHaveCount(0);
  await page.mouse.move(0, 0);
}

test.beforeEach(async ({ page, market }) => {
  await page.clock.setFixedTime(CFB_NOW);
  market.observedAt = CFB_NOW.toISOString();
  await serveCfb(page);
});

test('the CFB home leads with Top CFB Signals; Value Watch filters the cards @smoke', async ({ page }) => {
  await page.goto('./#/cfb');
  await expect(page.getByRole('heading', { name: 'Top CFB Signals' })).toBeVisible();
  const vw = page.getByRole('region', { name: 'Value Watch' });
  await expect(vw.getByRole('link')).toHaveCount(3);
  await expect(vw).toContainText('BYU · Moderate Control');
  await expect(vw).toContainText('BYU win · 79¢');
  await expect(page.getByRole('region', { name: 'Market Disagreement' }).getByRole('link')).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'CFB Research Signals' })).toContainText('No prospective settlements yet.');
  const cards = page.locator('.cfcards .cfc');
  await expect(cards).toHaveCount(9);
  const byu = page.locator(`.cfc[data-event="${ISU_BYU}"]`);
  await expect(byu).toContainText('BYU control edge · slower pace');
  await expect(byu).toContainText('Value Watch');
  await expect(byu).toContainText('Historical margin: +3 to +24 (middle half)');
  await page.getByRole('group', { name: 'Filter games' }).getByRole('button', { name: 'Value Watch' }).click();
  await expect(cards).toHaveCount(3);
  await expect(page).toHaveURL(/f=value-watch/);
  await expect(page.locator(`.cfc[data-event="${STAN_ND}"]`)).toHaveCount(0);
  // the whole schedule stays below
  await expect(page.getByRole('region', { name: 'Full Schedule' }).locator('[data-event]')).toHaveCount(11);
  const text = (await page.locator('.cfh').innerText()).toLowerCase();
  expect(text).not.toContain('+ev');
  expect(text).not.toContain('probability');
  expect(text).not.toMatch(/\d+% (chance|likely)/);
});

test('a V2 game leads with the Quick Read; every older panel waits in a closed Deep Dive @smoke', async ({ page }) => {
  await page.goto(`./#/cfb/game/${LSU_UK}`);
  const q = page.getByTestId('cfb-quick-read');
  await expect(q).toBeVisible();
  await expect(q).toContainText('LSU holds a control edge in this matchup. Expect a faster game.');
  await expect(q).toContainText('LSU · Moderate Control');
  await expect(q).toContainText('LSU win · 76¢');
  await expect(q).toContainText('Value Watch — Promising early market evidence');
  await expect(q).toContainText('Initial priced n = 6');
  await expect(page.getByRole('region', { name: 'Best Research' })).toContainText('Middle 50%');
  const deep = page.getByRole('region', { name: 'Deep Dive' });
  await expect(deep.locator('details.cfdd__s')).toHaveCount(6);
  await expect(deep.locator('details.cfdd__s[open]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Likely Game Scripts' })).toBeHidden();
  await deep.getByText('All claims & scripts').click();
  await expect(page.getByRole('heading', { name: 'Likely Game Scripts' })).toBeVisible();
  await expect(page.locator('.eng-scard')).toHaveCount(3);
  const text = (await page.locator('.cfov').innerText()).toLowerCase();
  expect(text).not.toContain('+ev');
  expect(text).not.toMatch(/\d+% likely/);
  expect(text).not.toContain('fair value');
});

test('a Strong CONTROL game the market doubts says so, the explanation one tap down @smoke', async ({ page }) => {
  await page.goto(`./#/cfb/game/${SAC_BGSU}`);
  const q = page.getByTestId('cfb-quick-read');
  await expect(q).toContainText('Sacramento State win · 28¢');
  await expect(q).toContainText('Market Disagreement');
  await expect(q).not.toContainText('Value Watch');
  await expect(q.getByText('not a betting rule', { exact: false })).toBeHidden();
  await q.getByText('Why this is flagged').click();
  await expect(q.getByText('not a betting rule', { exact: false })).toBeVisible();
});

test('a 1.1.0 game keeps the football read, then scripts, then the bets that survive them @smoke', async ({ page }) => {
  await page.goto(`./#/cfb/game/${NMSU_FIU}`);
  await expect(page.getByRole('heading', { name: 'SIFT Read' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Likely Game Scripts' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bets That Survive Multiple Scripts' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Matchup Edges' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Data Confidence' })).toBeVisible();
  await expect(page.getByTestId('cfb-quick-read')).toHaveCount(0);
  await expect(page.locator('.eng-scard')).toHaveCount(1);
  const text = (await page.locator('.ov--engine').innerText()).toLowerCase();
  expect(text).not.toContain('+ev');
  expect(text).not.toMatch(/\d+% likely/);
  expect(text).not.toContain('fair value');
});

test('why this bet opens the scripts, conditions, evidence and price behind a row @journey', async ({ page }) => {
  await page.goto(`./#/cfb/game/${UGA_ALA}`);
  await page.getByRole('region', { name: 'Deep Dive' }).getByText('Markets', { exact: true }).click();
  const toggle = page.getByRole('button', { name: /why this bet/i }).first();
  await toggle.click();
  const why = page.getByRole('region', { name: /^Why / }).first();
  await expect(why).toBeVisible();
  await expect(why).toContainText('Required football conditions');
  await expect(why).toContainText('Pays when');
  await expect(why).toContainText(/Primary/);
});

test('the script tab shows the causal chain with the findings that justify each step @journey', async ({ page }) => {
  await page.goto(`./#/cfb/game/${LSU_UK}?tab=script`);
  const steps = page.locator('.chain > li');
  await expect(steps.first()).toBeVisible();
  expect(await steps.count()).toBeGreaterThanOrEqual(3);
  await page.locator('.chain .fchip > summary').first().click();
  await expect(page.locator('.chain .fchip[open]').first()).toContainText(/opponent-adjusted|out-rates|owns/i);
  await expect(page.getByRole('heading', { name: 'Markets this script settles' })).toBeVisible();
});

test('the matchup tab publishes every metric with raw, adjusted and rank @journey', async ({ page }) => {
  await page.goto(`./#/cfb/game/${UGA_ALA}?tab=matchup`);
  await expect(page.getByRole('heading', { name: 'Matchup findings' })).toBeVisible();
  await expect(page.locator('.mettab').first()).toBeVisible();
  await expect(page.locator('.mettab__sub').first()).toContainText(/adj|raw/);
});

test('a game the engine could not read says so and keeps the markets @smoke', async ({ page }) => {
  await page.goto(`./#/cfb/game/${ALBY_STON}`);
  await expect(page.getByText('No script engine read for this game')).toBeVisible();
});

test('every engine state renders as published: two scripts, one script, or the honest empty state @smoke', async ({ page }) => {
  await page.goto(`./#/cfb/game/${ISU_BYU}`);
  await expect(page.locator('.eng-scard')).toHaveCount(2);
  await expect(page.getByText(EMPTY)).toHaveCount(0);

  await page.goto(`./#/cfb/game/${NMSU_FIU}`);
  await expect(page.locator('.eng-scard')).toHaveCount(1);
  await expect(page.locator('.eng-scard')).toContainText('Primary');
  await expect(page.getByText(EMPTY)).toHaveCount(0);
  await page.locator('.gtabs').getByRole('link', { name: 'Scripts', exact: true }).click();
  await expect(page.locator('.chain > li').first()).toBeVisible();
  await expect(page.getByText(EMPTY)).toHaveCount(0);

  await page.goto(`./#/cfb/game/${JVST_KENN}`);
  await expect(page.locator('.game--engine')).toBeVisible();
  await expect(page.getByText(EMPTY)).toBeVisible();
  await expect(page.locator('.eng-scard')).toHaveCount(0);
});

test('the CFB hero shows both teams\' committed logos, loaded @smoke', async ({ page }) => {
  const served: string[] = [];
  page.on('response', (r) => r.url().includes('/teams/cfb/') && r.ok() && served.push(r.url()));
  for (const [id, files] of [[ISU_BYU, ['66.webp', '252.webp']], [NMSU_FIU, ['166.webp', '2229.webp']]] as const) {
    await page.goto(`./#/cfb/game/${id}`);
    const logos = page.locator('.gh__team img.teammark--logo') /* the two teams; the identity line repeats the home mark */;
    await expect(logos).toHaveCount(2);
    await expect.poll(() => logos.evaluateAll((els) => els.every((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await expect(page.locator('.gh .teammark--text')).toHaveCount(0);
    // the held image is a blob of the committed file: the site served exactly these two
    for (const f of files) expect(served.some((u) => u.endsWith(`/teams/cfb/${f}`)), f).toBe(true);
  }
});

for (const [name, url] of [
  ['cfb-home', './#/cfb'],
  ['cfb-home-value-watch', './#/cfb?f=value-watch'],
  ['cfb-game', `./#/cfb/game/${UGA_ALA}`],
  ['cfb-game-quickread', `./#/cfb/game/${LSU_UK}`],
  ['cfb-game-strong', `./#/cfb/game/${SAC_BGSU}`],
  ['cfb-game-script', `./#/cfb/game/${LSU_UK}?tab=script`],
  ['cfb-game-matchup', `./#/cfb/game/${UGA_ALA}?tab=matchup`],
] as const) {
  const root = name.startsWith('cfb-home') ? '.cfh' : '.game--engine';
  test(`${name} has no horizontal overflow and no serious a11y violations @smoke`, async ({ page }) => {
    await page.goto(url);
    await page.locator(root).waitFor();
    await ready(page);
    await noHorizontalOverflow(page, name);
    const res = await new AxeBuilder({ page }).include(root).analyze();
    const bad = res.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test(`${name} @visual`, async ({ page, isMobile }) => {
    await page.goto(url);
    await page.locator(root).waitFor();
    await ready(page);
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: !isMobile });
  });
}

// No game in the CFB fixture publishes NO_SUPPORTED_CLAIM (the no-claim Quick Read is covered from
// tests/fixtures/cfb-v2/no_claim.json in tests/cfbGamePage.test.tsx).
test.skip('cfb-game-noclaim @visual', () => {});
