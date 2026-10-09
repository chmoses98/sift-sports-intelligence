// The Sift verdict strip across sports: every game page opens with what the sport's own candidate layer says about
// that game through the shared opportunity system — research-candidate cards where the publication flags some, or
// "no published opportunity" with the publication's reason. Fixtures are the same trimmed real publications the
// sport specs use (NHL, MLB, tennis) and the synthetic CBB fixture; offline and deterministic.
import type { Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, MLB_FIXTURE, NHL_FIXTURE, noHorizontalOverflow, test } from './fixtures';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const NHL_RAW = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/NHL-edge-finder\/data-archive\/app\/latest\/(.+)$/;
const MLB_RAW = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/edge-finder-api\/main\/app\/latest\/(.+)$/;
const TENNIS_RAW = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/Tennis-Edge-Finder\/tennis-data\/tennis-edge-finder\/data\/app\/latest\/(.+)$/;
const TENNIS_FIXTURE = join(HERE, '..', 'tests', 'fixtures', 'tennis', 'app', 'latest');
/** Florida at Los Angeles: four research candidates published (e2e/nhl.spec.ts). */
const FLA_LAK = 'evt_5938c3f8a7c1b24c0118';
/** Dodgers at Braves: one research candidate and seven judged passes (e2e/mlb.spec.ts). */
const LADATL = 'evt_f809f61380cdbb0eb4f0';
/** Khachanov v Fery: three research candidates, every one research only (e2e/tennis.spec.ts). */
const KHA_FER = 'evt_626bc16043b56b7b1921';

async function serve(page: Page, raw: RegExp, dir: string) {
  await page.context().unroute(raw);
  await page.context().route(raw, async (route) => {
    const file = join(dir, raw.exec(route.request().url())![1].split('?')[0]);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(file, 'utf-8'), headers: { 'access-control-allow-origin': '*' } });
  });
}

const BANNED = /\block\b|best bet|guaranteed|\bproven\b|\bprofitable\b/i;

test('an NHL game opens with its research candidates as verdict cards, research only, before the story @journey', async ({ page, market }) => {
  const now = new Date('2026-10-06T23:30:00Z');
  await page.clock.setFixedTime(now);
  market.observedAt = now.toISOString();
  await serve(page, NHL_RAW, NHL_FIXTURE);
  await page.goto(`./#/nhl/game/${FLA_LAK}`);
  const v = page.getByTestId('game-opportunities');
  await expect(v.getByRole('heading', { name: 'Sift verdict' })).toBeVisible();
  const cards = v.locator('.opp');
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(cards.first().getByText('Research candidate')).toBeVisible();
  await expect(cards.first()).toContainText(/Break-even/);
  await expect(cards.first()).toContainText(/Bet up to/);
  expect(await v.textContent()).not.toMatch(BANNED);
  await expect(v.getByRole('link', { name: 'NHL opportunities' })).toHaveAttribute('href', '#/nhl');
  // The strip sits above the game's own story.
  const [vy, sy] = await Promise.all([v.boundingBox(), page.getByRole('heading', { name: 'How this game is most likely to play' }).boundingBox()]);
  expect(vy!.y).toBeLessThan(sy!.y);
  await noHorizontalOverflow(page, 'nhl verdict');
});

test('an MLB game shows its one candidate and says the rest were judged and passed @journey', async ({ page, market }) => {
  const now = new Date('2026-10-07T20:10:00Z');
  await page.clock.setFixedTime(now);
  market.observedAt = now.toISOString();
  await serve(page, MLB_RAW, MLB_FIXTURE);
  await page.goto(`./#/mlb/game/${LADATL}`);
  const v = page.getByTestId('game-opportunities');
  await expect(v.getByRole('heading', { name: 'Sift verdict' })).toBeVisible();
  await expect(v.locator('.opp').first()).toBeVisible();
  await expect(v.locator('.opp').first().getByText('Research candidate')).toBeVisible();
  expect(await v.textContent()).not.toMatch(/undefined|NaN/);
});

test('a tennis match opens with research candidates that say the market beats the model @journey', async ({ page, market }) => {
  const now = new Date('2026-10-09T06:00:00Z');
  await page.clock.setFixedTime(now);
  market.observedAt = now.toISOString();
  await serve(page, TENNIS_RAW, TENNIS_FIXTURE);
  await page.goto(`./#/tennis/game/${KHA_FER}`);
  const v = page.getByTestId('game-opportunities');
  await expect(v.getByRole('heading', { name: 'Sift verdict' })).toBeVisible();
  const first = v.locator('.opp').first();
  await expect(first).toBeVisible();
  await expect(first.getByText('Research candidate')).toBeVisible();
  await first.getByRole('button', { name: /Evidence/ }).click();
  await expect(first.getByText(/Brier/).first()).toBeVisible();
  expect(await v.textContent()).not.toMatch(/Bet up to/);
  await noHorizontalOverflow(page, 'tennis verdict');
});

test('CBB: the home carries the Opportunities panel and a game says no contract is mapped, as a result @smoke', async ({ page, cbb }) => {
  void cbb;
  await page.goto('./#/cbb');
  await expect(page.getByRole('heading', { name: 'Opportunities' })).toBeVisible();
  await expect(page.getByText(/maps no Kalshi contract/).first()).toBeVisible();
  await page.locator('.cmq a, .cup a, a[href*="/cbb/game/"]').first().click();
  await expect(page).toHaveURL(/#\/cbb\/game\//);
  const v = page.getByTestId('game-opportunities');
  await expect(v.getByRole('heading', { name: 'Sift verdict' })).toBeVisible();
  await expect(v.getByText('No published opportunity on this game.')).toBeVisible();
  await expect(v).toContainText(/maps no Kalshi contract/);
});
