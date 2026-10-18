// MLB on Sift: the MLB vertical against the real edge-finder-api publication of 2026-10-07 (tests/fixtures/mlb, with
// synthetic mlb.player_prop.v1 objects on LAD@ATL), served in place of raw.githubusercontent.com so the run is
// deterministic and offline. Home → slate → game (lines, starting pitchers) → player props (projection, statuses,
// unsupported markets) → a player's profile; the fallback game with no projections; live quotes over props.
// Phone and desktop (Chromium) only: these titles carry no @smoke/@journey tag, so the WebKit projects skip them.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, MLB_FIXTURE, noHorizontalOverflow, test } from './fixtures';

const MLB_RAW = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/edge-finder-api\/main\/app\/latest\/(.+)$/;
const MLB_NOW = new Date('2026-10-07T20:10:00Z');
const LADATL = 'evt_f809f61380cdbb0eb4f0';
const MILSD = 'evt_f5eb66fea0cf02bbe998';
const GLASNOW = 'prt_337d5d123a707f99b0ea';
const KS7 = 'KXMLBKS-26OCT071800LADATL-LADTGLASNOW31-7';
const BANNED = /\bedge\b|\block\b|best bet|guaranteed|\bproven\b|\bprofitable\b|confidence/i;

async function serveMlb(page: Page) {
  await page.context().route(MLB_RAW, async (route) => {
    const rel = MLB_RAW.exec(route.request().url())![1].split('?')[0];
    const file = join(MLB_FIXTURE, rel);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(file, 'utf-8'), headers: { 'access-control-allow-origin': '*' } });
  });
}

test.beforeEach(async ({ page, market }) => {
  await page.clock.setFixedTime(MLB_NOW);
  market.observedAt = MLB_NOW.toISOString();
  await serveMlb(page);
});

test('MLB home → slate → game: baseball lines and starting pitchers', async ({ page }) => {
  await page.goto('./#/mlb');
  await expect(page.getByRole('heading', { name: 'MLB', level: 1 })).toBeVisible();
  await noHorizontalOverflow(page, 'mlb home');
  await page.goto('./#/mlb/slate');
  await page.getByRole('link', { name: /Los Angeles Dodgers at Atlanta Braves/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Game Lines' })).toBeVisible();
  const lines = page.locator('section.mlines');
  await expect(lines.getByRole('link', { name: 'Braves moneyline' })).toBeVisible();
  await expect(lines.getByRole('link', { name: 'Run in 1st inning' })).toBeVisible();
  await expect(page.getByText(/First pitch/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Starting pitchers' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tyler Glasnow', level: 4 })).toBeVisible();
  const text = await page.locator('.game--mlb').innerText();
  expect(text).not.toMatch(/Falcons|KXMLB|What Matters|Kicked off/);
  await noHorizontalOverflow(page, 'mlb game');
  // Matchup inputs and the price history, from the event research document
  await page.locator('.gtabs').getByRole('link', { name: 'Matchup', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Model inputs, side by side' })).toBeVisible();
  await noHorizontalOverflow(page, 'mlb matchup');
});

// The projection feed for the probable starter: strikeouts is a promoted MLB stat, so its expected value and rung
// probabilities come from the selected model; the publisher's per-rung model number is not shown beside it.
const MLB_PROJ = /raw\.githubusercontent\.com\/chmoses98\/edge-finder-api\/projection-data\/projections\/mlb\/latest\.json/;
const mlbFeed = () => ({
  schema: 'sift.projections.v1', sport: 'MLB', generated_utc: '2026-10-07T18:00:00Z', data_asof_utc: '2026-10-07T18:00:00Z',
  model: { id: 'pf-mlb', version: 'pf-1.2.1', authority: 'research_only' }, families: { pitcher_strikeouts: { readiness: 'READY', model: 'F', reason: '' } }, games: [],
  players: [{ player_id: '607192', name: 'Tyler Glasnow', team: 'LAD', opponent: 'ATL', game_id: 'g', family: 'pitcher_strikeouts', mean: 7.4, median: 7, p10: 4, p90: 11,
    thresholds: { '5': 0.86, '7': 0.58, '9': 0.27 }, readiness: 'READY', gate: { status: 'PASS', findings: [] },
    participation: { status: 'CONFIRMED_ACTIVE', certainty: 'CONFIRMED', source: 'mlb_lineup_card', captured_utc: '2026-10-07T18:00:00Z', reasons: [] }, data_asof_utc: '2026-10-07T18:00:00Z' }],
});

test('MLB player props: market everywhere, one projection per stat, statuses with reasons', async ({ page }) => {
  await page.context().route(MLB_PROJ, (r) => r.fulfill({ json: mlbFeed(), headers: { 'access-control-allow-origin': '*' } }));
  await page.goto(`./#/mlb/game/${LADATL}?tab=props`);
  const sec = page.locator('#g-mlb-props');
  await expect(sec.getByRole('region', { name: 'Pitchers' })).toBeVisible();
  await expect(sec.getByRole('region', { name: 'Hitters' })).toBeVisible();
  await expect(sec.getByText('Research — not validated for betting').first()).toBeVisible();
  const ks = sec.getByRole('row').filter({ hasText: 'Tyler Glasnow records 7+ strikeouts' });
  await expect(ks.getByLabel('Projection 58%')).toBeVisible();
  await expect(ks.getByLabel(/^Model/)).toHaveCount(0);                // never beside the previous model's number
  await expect(sec.getByText('Proj. 7.4 K (p10–p90 4–11)').first()).toBeVisible();
  await expect(ks.getByLabel(/^Market \d+%/)).toBeVisible();
  const betts = sec.getByRole('row').filter({ has: page.getByText('Mookie Betts records 1+ hits', { exact: true }) });
  await expect(betts.getByText('Not projected — lineup unconfirmed')).toBeVisible();
  await expect(betts.getByLabel(/^Model/)).toHaveCount(0);
  await expect(sec.getByRole('region', { name: 'Other player markets' }).getByText('No projection published').first()).toBeVisible();
  // the promoted pitcher stat carries none of the previous publication's drivers, validation or provenance (unit-tested)
  await expect(sec.getByText('Opp lineup K%')).toHaveCount(0);
  expect(await sec.innerText()).not.toMatch(BANNED);
  await noHorizontalOverflow(page, 'mlb props');
  const axe = await new AxeBuilder({ page }).include('#g-mlb-props').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(blocking.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  await sec.getByRole('link', { name: 'Tyler Glasnow' }).click();
  await expect(page).toHaveURL(new RegExp(`#/mlb/player/${GLASNOW}`));
  await expect(page.getByRole('heading', { name: 'Tyler Glasnow', level: 1 })).toBeVisible();
});

test('MLB props follow the live market clock (relay quote over the publication capture)', async ({ page, market }) => {
  market.set(KS7, 0.7, 0.72);
  await page.goto(`./#/mlb/game/${LADATL}?tab=props`);
  const ks = page.locator('#g-mlb-props').getByRole('row').filter({ hasText: 'Tyler Glasnow records 7+ strikeouts' });
  await expect(ks.getByLabel('Market 71%, bid 70¢, ask 72¢')).toBeVisible();
  // answered by the relay mock: by ticker, or by the strikeout series' sweep (KXMLB* series only, GET only)
  expect(market.requests.some((r) => r.tickers.includes(KS7) || r.event === 'series:KXMLBKS')).toBe(true);
  expect(market.requests.every((r) => /\/markets\?/.test(r.url))).toBe(true);
});

test('MLB game with no player-prop projections lists its markets by player, "No projection published"', async ({ page }) => {
  await page.goto(`./#/mlb/game/${MILSD}?tab=props`);
  const sec = page.locator('#g-mlb-props');
  await expect(sec.getByRole('heading', { name: 'Manny Machado', level: 4 })).toBeVisible();
  await expect(sec.getByText('No projection published').first()).toBeVisible();
  await expect(sec.getByLabel(/^Model/)).toHaveCount(0);
  await noHorizontalOverflow(page, 'mlb props fallback');
  await page.goto(`./#/mlb/game/${MILSD}?tab=injuries`);
  await expect(page.getByText('Injuries are not published for MLB')).toBeVisible();
});
