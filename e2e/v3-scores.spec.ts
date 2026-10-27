// Scores: a verified but delayed score stays visible with one subtle "Delayed" word; an unverified or unreliable score is never shown
// ("Score unavailable"); a score is never fabricated. Real published documents for the slate (the disk cache: the NBA board, WAS at CHA starts
// 2026-10-26T23:00Z); the licensed free score feed's network answer (SportScore) is a TEST FIXTURE shaped like its real payload, because e2e has no
// internet: the app's own identity matching and freshness clock decide what is shown. The browser clock is 40 minutes into the game.
// Separate from quote freshness: no age or timestamp appears anywhere.
import { test, expect, type Page } from '@playwright/test';
import { feedNow, freshQuotes, useRealFeeds } from './support/realFeeds';

const GAME = '/v3/game/nba/evt_2645d372317f1b85690a';
const START = Date.parse('2026-10-26T23:00:00Z');
const CLOCK = START + 40 * 60_000;
const AGE = /\bago\b|\d+\s?(s|sec|min|mins|minutes)\b old|updated \d|as of \d|last known|stale/i;

interface Feed { updatedAgeS: number; status?: string; text?: string; hs?: string; as?: string; teams?: { home: string; away: string } }

async function setup(page: Page, feed: Feed | 'down') {
  void feedNow();
  await useRealFeeds(page);
  await freshQuotes(page);
  await page.route(/^https:\/\/sportscore\.com\//, async (route) => {
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (feed === 'down') return route.fulfill({ status: 503, headers: cors, body: '{}' });
    // The app asks for each UTC day of its games: answer the game's own day (and sport) only, as the real feed does.
    const u = new URL(route.request().url());
    const own = u.searchParams.get('sport') === 'basketball' && u.searchParams.get('date') === '2026-10-26';
    const t = feed.teams ?? { home: 'Charlotte Hornets', away: 'Washington Wizards' };
    const m = { home: t.home, away: t.away, home_score: feed.hs ?? '58', away_score: feed.as ?? '61', status: feed.status ?? 'live', status_text: feed.text ?? 'Q3', time: new Date(START).toISOString().replace('Z', '+00:00'), competition: 'National Basketball Association', url: '/basketball/match/was-cha/' };
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ sport: 'basketball', date: '2026-10-26', count: own ? 1 : 0, matches: own ? [m] : [], updated: new Date(CLOCK - feed.updatedAgeS * 1000).toISOString() }) });
  });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com|sportscore\.com)/, (r) => r.abort());
  await page.addInitScript(() => { try { localStorage.setItem('sift.v4.livescores', '1'); } catch { /* ignore */ } });
  await page.clock.setFixedTime(new Date(CLOCK));
}
const go = async (page: Page, path: string) => { await page.goto(`./#${path}`); await expect(page.locator('[data-v3-shell]')).toBeVisible(); };
const card = (page: Page) => page.locator('.v3-gc', { hasText: 'Hornets' }).first();

test.describe('scores on Games, Home and Game Detail @v3', () => {
  test('a fresh verified score is shown with no extra status word', async ({ page }) => {
    await setup(page, { updatedAgeS: 10 });
    await go(page, '/v3/games?sport=nba&state=live');
    await expect(card(page).locator('.v3-gc__sc').first()).toHaveText('61', { timeout: 20_000 });
    await expect(card(page).locator('.v3-gc__sc').nth(1)).toHaveText('58');
    await expect(card(page).locator('[data-delayed]')).toHaveCount(0);
    expect(await card(page).innerText()).not.toMatch(/Score unavailable|Delayed/);
  });

  test('a delayed verified score stays visible with one muted "Delayed" word on the Games card, the scoreboard tile and the Game Detail hero, with no age', async ({ page }) => {
    await setup(page, { updatedAgeS: 150 });
    await go(page, '/v3/games?sport=nba&state=live');
    const c = card(page);
    await expect(c.locator('.v3-gc__sc').first()).toHaveText('61', { timeout: 20_000 });
    await expect(c.locator('.v3-gc__sc').nth(1)).toHaveText('58');
    await expect(c.locator('.v3-gc__live [data-delayed]')).toHaveText('Delayed');
    await expect(c.locator('.v3-gc__hit')).toHaveAttribute('aria-label', /61 to 58.*delayed/i);
    expect(await c.innerText()).not.toMatch(AGE);
    expect(await c.innerText()).not.toMatch(/Score unavailable/);
    // the word sits in the existing status line: it adds no row and does not widen the card
    const box = await c.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Home: the scoreboard tile
    await go(page, '/v3');
    const tile = page.locator('.v3-tile', { hasText: 'CHA' }).first();
    if (await tile.count()) {
      await expect(tile.locator('.v3-tile__r em').first()).toHaveText('61', { timeout: 20_000 });
      await expect(tile.locator('[data-delayed]')).toHaveText('Delayed');
    }
    expect(await page.locator('[data-v3-shell]').innerText()).not.toMatch(AGE);
    // Game Detail hero
    await go(page, GAME);
    const hero = page.locator('.v3-gh');
    await expect(hero.locator('.v3-gh__sc .num')).toHaveText(/61.*58/, { timeout: 20_000 });
    await expect(hero.locator('.v3-gh__st [data-delayed]')).toHaveText('Delayed');
    expect(await hero.innerText()).not.toMatch(AGE);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('a score older than five minutes is unreliable: no score on any surface, "Score unavailable", and no Delayed word', async ({ page }) => {
    await setup(page, { updatedAgeS: 600 });
    await go(page, '/v3/games?sport=nba&state=live');
    const c = card(page);
    await expect(c).toBeVisible({ timeout: 20_000 });
    await expect(c.locator('.v3-gc__src')).toHaveText('Score unavailable', { timeout: 20_000 });
    await expect(c.locator('.v3-gc__sc')).toHaveCount(0);
    await expect(c.locator('[data-delayed]')).toHaveCount(0);
    await go(page, GAME);
    await expect(page.locator('.v3-gh')).toBeVisible();
    await expect(page.locator('.v3-gh__sc .num')).toHaveCount(0);
    await expect(page.locator('.v3-gh [data-delayed]')).toHaveCount(0);
    await expect(page.locator('.v3-gh__sit')).toContainText('Score unavailable');
  });

  test('a score from a different pair of teams is never attached to this game (no fabricated or borrowed score)', async ({ page }) => {
    await setup(page, { updatedAgeS: 10, teams: { home: 'Boston Celtics', away: 'Chicago Bulls' } });
    await go(page, '/v3/games?sport=nba&state=live');
    const c = card(page);
    await expect(c).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    await expect(c.locator('.v3-gc__sc')).toHaveCount(0);
    await expect(c.locator('.v3-gc__src')).toHaveText('Score unavailable');
  });

  test('the feed being down shows no score and no error text on the card', async ({ page }) => {
    await setup(page, 'down');
    await go(page, '/v3/games?sport=nba&state=live');
    const c = card(page);
    await expect(c).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    await expect(c.locator('.v3-gc__sc')).toHaveCount(0);
    await expect(c.locator('.v3-gc__src')).toHaveText('Score unavailable');
  });
});
