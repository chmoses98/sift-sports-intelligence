// Live game experience on Game Detail: a game in play leads with the live game (state, then plays, then player performances), then markets, then research, and the pregame
// analysis stays on the page. Real published documents for the slate (the committed `props` fixture family, fixtures/real; offline, fixed clock). Every live NETWORK answer
// below is a TEST FIXTURE shaped like the real feed, stubbed in the browser; none of it ships:
//   * SportScore (NBA; cleared, score + period only) answers like its real `/api/v1/fixtures/` payload (tests/fixtures/live-scores/real/sportscore-live-basketball.json shape),
//   * MLB StatsAPI (BLOCKED-ON-RIGHTS, src/v3/data/live/rights.ts) answers like the schedule and live feed (tests/v3/fixtures/live/*.shape.json: hand-written, not recordings).
// MLB is enabled only on the dev server the specs start (playwright.v3.config.ts, V3_LIVE_DETAIL_MLB=1); a production build asserts the blocked state instead.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { feedNow, freshQuotes, useRealFeeds as serveRealFeeds } from './support/realFeeds';
import { fixtureGames, type FxGame } from './support/propsFixture';

const MLB_ON = process.env.V3_LIVE_DETAIL_MLB === '1';
const json = (n: string) => JSON.parse(readFileSync(join('tests', 'v3', 'fixtures', 'live', n), 'utf8'));
const AGE = /\bago\b|\d+\s?(s|sec|min|mins|minutes)\b old|updated \d|as of \d|last known/i;

let NBA: FxGame;
let MLB: FxGame | undefined;
test.beforeAll(async () => {
  const gs = await fixtureGames('props');
  const nba = gs.find((x) => x.slug === 'nba');
  if (!nba) throw new Error('the props family holds no NBA game after its clock');
  NBA = nba;
  MLB = gs.find((x) => x.slug === 'mlb');
});
const IN_PLAY = 40 * 60_000; // the browser clock is 40 minutes into the game

interface Counts { mlb: string[]; sportscore: number; feeds: number }

async function setup(page: Page, g: FxGame, o: { sportscore?: { updatedAgeS: number; hs?: string; as?: string; text?: string } | 'down'; mlb?: { ageS?: number; status?: number }; /** the browser clock keeps running from the pinned instant (polling specs); otherwise it is fixed */ flow?: boolean } = {}): Promise<Counts> {
  const counts: Counts = { mlb: [], sportscore: 0, feeds: 0 };
  const clock = g.startMs + IN_PLAY;
  await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ onboarded: true })); localStorage.setItem('sift.v4.livescores', '1'); } catch { /* ignore */ } });
  void feedNow('props');
  await serveRealFeeds(page, { family: 'props' });
  await freshQuotes(page, { family: 'props' });
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  await page.route(/^https:\/\/sportscore\.com\//, async (route) => {
    counts.sportscore += 1;
    const s = o.sportscore;
    if (!s || s === 'down') return route.fulfill({ status: s ? 503 : 200, headers: cors, body: s ? '{}' : JSON.stringify({ sport: 'basketball', matches: [] }) });
    const u = new URL(route.request().url());
    const day = new Date(g.startMs).toISOString().slice(0, 10);
    const own = u.searchParams.get('sport') === 'basketball' && u.searchParams.get('date') === day;
    const m = { home: g.home.name, away: g.away.name, home_score: s.hs ?? '58', away_score: s.as ?? '61', status: 'live', status_text: s.text ?? '3rd quarter', time: new Date(g.startMs).toISOString().replace('Z', '+00:00'), competition: 'National Basketball Association', url: '/basketball/match/live/' };
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ sport: 'basketball', date: day, count: own ? 1 : 0, matches: own ? [m] : [], updated: new Date(clock - s.updatedAgeS * 1000).toISOString() }) });
  });
  await page.route(/^https:\/\/statsapi\.mlb\.com\//, async (route) => {
    const url = route.request().url();
    counts.mlb.push(url);
    if (!MLB_ON) return route.abort(); // a build that may not read MLB must never get here (asserted by the specs)
    if (o.mlb?.status) return route.fulfill({ status: o.mlb.status, headers: cors, body: '{}' });
    if (url.includes('/schedule')) {
      const s = json('mlb-schedule.shape.json');
      s.dates[0].games[0].gameDate = new Date(g.startMs).toISOString();
      s.dates[0].games[0].teams.away.team.name = g.away.name;
      s.dates[0].games[0].teams.home.team.name = g.home.name;
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(s) });
    }
    counts.feeds += 1; // each later answer has the away side scoring once more (React dev mode may ask twice at mount, so the specs compare, not pin)
    const f = json('mlb-feed-live.shape.json');
    f.gameData.teams.away.name = g.away.name;
    f.gameData.teams.home.name = g.home.name;
    f.liveData.linescore.teams.away.runs = 2 + counts.feeds;
    const t = new Date(clock - (o.mlb?.ageS ?? 10) * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    f.metaData.timeStamp = `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}_${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`;
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(f) });
  });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com|sportscore\.com|statsapi\.mlb\.com)/, (r) => r.abort());
  if (o.flow) await page.clock.setSystemTime(new Date(clock)); else await page.clock.setFixedTime(new Date(clock));
  return counts;
}
const open = async (page: Page, g: FxGame, q = '') => { await page.goto(`./#/v3/game/${g.slug}/${g.eventId}${q}`); await expect(page.locator('[data-v3-shell]')).toBeVisible(); await expect(page.locator('.v3-gh')).toBeVisible(); };
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const top = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!.y;

test.describe('live game: NBA (SportScore, score and period only) @v3', () => {
  test('a game in play leads with the live game, then markets, and the pregame analysis stays on the page', async ({ page }) => {
    const c = await setup(page, NBA, { sportscore: { updatedAgeS: 10 } });
    await open(page, NBA);
    await expect(page.getByRole('tab', { selected: true })).toHaveText('Live');
    const st = page.getByTestId('live-state');
    await expect(st).toBeVisible({ timeout: 20_000 });
    await expect(st.getByTestId('live-score')).toContainText(/61.*58/);
    await expect(st.getByTestId('live-period')).toContainText(/3rd quarter/i);
    await expect(st.getByTestId('live-clock')).toContainText('Not published by the feed');
    await expect(st.getByTestId('live-situation')).toContainText('not available');
    // the honest states for what a score-only feed cannot carry
    await expect(page.getByTestId('live-pbp').getByTestId('live-unavailable')).toContainText('publishes the score and period only');
    await expect(page.getByTestId('live-performances').getByTestId('live-unavailable')).toContainText('publishes the score and period only');
    await expect(page.getByTestId('live-plays')).toHaveCount(0);
    // the licence condition: a visible, crawlable credit next to the data
    const a = st.getByRole('link', { name: 'Powered by SportScore' });
    await expect(a).toBeVisible();
    await expect(a).toHaveAttribute('rel', /dofollow/);
    // order: live state, plays, performances, markets, then the research; pregame analysis still on the page
    await expect(page.getByTestId('pregame-analysis')).toBeVisible({ timeout: 30_000 });
    const ys = [await top(page, '[data-testid="live-state"]'), await top(page, '[data-testid="live-pbp"]'), await top(page, '[data-testid="live-performances"]'), await top(page, '[aria-label="Market prices"]'), await top(page, '[data-testid="pregame-analysis"]')];
    expect(ys).toEqual([...ys].sort((x, y) => x - y));
    expect(new Set(ys).size).toBe(ys.length);
    // nothing for MLB was requested, and no feed age leaks into the UI
    expect(c.mlb).toEqual([]);
    expect(await page.locator('[data-v3-shell]').innerText()).not.toMatch(AGE);
    expect(await noOverflow(page)).toBe(true);
  });

  test('the live block has no axe violation and every control in it is at least 44 points', async ({ page }) => {
    await setup(page, NBA, { sportscore: { updatedAgeS: 10 } });
    await open(page, NBA);
    await expect(page.getByTestId('live-state')).toBeVisible({ timeout: 20_000 });
    const r = await new AxeBuilder({ page }).include('[data-testid="live-state"]').include('[data-testid="live-pbp"]').include('[data-testid="live-performances"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    for (const el of await page.locator('[data-testid="live-state"] :is(a, button)').all()) {
      const b = (await el.boundingBox())!;
      expect(Math.min(b.width, b.height), await el.innerText()).toBeGreaterThanOrEqual(44);
    }
  });

  test('the jump from the state block reaches the pregame analysis', async ({ page }) => {
    await setup(page, NBA, { sportscore: { updatedAgeS: 10 } });
    await open(page, NBA);
    await expect(page.getByTestId('pregame-analysis')).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByTestId('jump-pregame').click();
    await expect(page.getByTestId('pregame-analysis')).toBeInViewport({ timeout: 5000 });
  });

  test('a delayed score keeps the one muted word; a score older than five minutes is withheld ("Score unavailable")', async ({ page }) => {
    await setup(page, NBA, { sportscore: { updatedAgeS: 150 } });
    await open(page, NBA);
    await expect(page.getByTestId('live-score')).toContainText(/61.*58/, { timeout: 20_000 });
    await expect(page.getByTestId('live-state').locator('[data-delayed]')).toHaveText('Delayed');
    expect(await page.getByTestId('live-state').innerText()).not.toMatch(AGE);
  });

  for (const [name, s] of [['older than five minutes', { updatedAgeS: 600 }], ['down', 'down']] as const) {
    test(`a score ${name} leaves honest "unavailable" states and never a number`, async ({ page }) => {
      await setup(page, NBA, { sportscore: s });
      await open(page, NBA);
      await expect(page.getByTestId('live-score')).toContainText('Score unavailable', { timeout: 20_000 });
      await expect(page.getByTestId('live-state').locator('.num')).toHaveCount(0);
      await expect(page.getByTestId('live-pbp').getByTestId('live-unavailable')).toBeVisible();
    });
  }

  test('switching live scores off stops every request and says so', async ({ page }) => {
    const c = await setup(page, NBA, { sportscore: { updatedAgeS: 10 } });
    await page.addInitScript(() => { try { localStorage.setItem('sift.v4.livescores', '0'); } catch { /* ignore */ } });
    await open(page, NBA);
    await expect(page.getByTestId('live-unavailable')).toContainText('Live updates are turned off', { timeout: 20_000 });
    await expect(page.getByTestId('live-state')).toHaveCount(0);
    expect(c.sportscore).toBe(0);
  });
});

test.describe('live game: MLB (state, plays, box score; BLOCKED-ON-RIGHTS) @v3', () => {
  test('a production build never reads MLB: blocked state, no score, no request', async ({ page }) => {
    test.skip(MLB_ON || !MLB, MLB_ON ? 'this server enables the MLB source for test (see the next specs)' : 'the props family holds no MLB game');
    const c = await setup(page, MLB!);
    await open(page, MLB!);
    await expect(page.getByTestId('live-state')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('live-score')).toContainText('Score unavailable');
    await expect(page.getByTestId('live-pbp').getByTestId('live-unavailable')).toContainText('not connected');
    await expect(page.getByTestId('live-plays')).toHaveCount(0);
    await page.waitForTimeout(1500);
    expect(c.mlb).toEqual([]);
    await expect(page.getByTestId('pregame-analysis')).toBeVisible({ timeout: 30_000 });
  });

  test('with the source enabled (test build): the hero and the state block carry the feed\'s score, count and runners; plays are the feed\'s own sentences; leaders are box-score lines', async ({ page }) => {
    test.skip(!MLB_ON || !MLB, MLB_ON ? 'the props family holds no MLB game' : 'MLB is not enabled in this build (rights): see the blocked-state spec');
    const c = await setup(page, MLB!);
    await open(page, MLB!);
    await expect(page.getByRole('tab', { selected: true })).toHaveText('Live');
    const st = page.getByTestId('live-state');
    await expect(st.getByTestId('live-score')).toContainText(/3.2/, { timeout: 20_000 });
    await expect(st.getByTestId('live-period')).toContainText('Top 7th');
    await expect(st.getByTestId('live-clock')).toContainText('Baseball has no game clock');
    await expect(st.getByTestId('live-situation')).toContainText('1 out, 2-1 count, runners on 1st and 3rd');
    await expect(page.locator('.v3-gh__sc .num')).toHaveText(/3.*2/); // the hero shows the same verified score
    const plays = page.getByTestId('live-plays').getByRole('listitem');
    await expect(plays).toHaveCount(5);
    await expect(plays.first()).toContainText('Test Batter Four singles');
    await expect(plays.last()).toContainText('strikes out swinging');
    await expect(page.getByTestId('live-leaders')).toContainText('Test Hitter Nine');
    await expect(page.getByTestId('live-leaders')).toContainText('2-for-3, HR, 2 RBI');
    await expect(page.getByTestId('live-source')).toBeVisible();
    expect(c.mlb.some((u) => u.includes('/schedule'))).toBe(true);
    expect(c.mlb.some((u) => u.includes('/game/900001/feed/live'))).toBe(true);
    // order: state, plays, performances, markets, pregame analysis
    await expect(page.getByTestId('pregame-analysis')).toBeVisible({ timeout: 30_000 });
    const ys = [await top(page, '[data-testid="live-state"]'), await top(page, '[data-testid="live-pbp"]'), await top(page, '[data-testid="live-performances"]'), await top(page, '[aria-label="Market prices"]'), await top(page, '[data-testid="pregame-analysis"]')];
    expect(ys).toEqual([...ys].sort((x, y) => x - y));
    expect(await noOverflow(page)).toBe(true);
    expect(await page.locator('[data-v3-shell]').innerText()).not.toMatch(AGE);
    const r = await new AxeBuilder({ page }).include('[data-testid="live-state"]').include('[data-testid="live-pbp"]').include('[data-testid="live-performances"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });

  test('a delayed answer is marked with the one muted word and its plays stay', async ({ page }) => {
    test.skip(!MLB_ON || !MLB, 'MLB is not enabled in this build (rights)');
    await setup(page, MLB!, { mlb: { ageS: 150 } });
    await open(page, MLB!);
    await expect(page.getByTestId('live-state').locator('[data-delayed]')).toHaveText('Delayed', { timeout: 20_000 });
    await expect(page.getByTestId('live-plays')).toBeVisible();
    expect(await page.getByTestId('live-state').innerText()).not.toMatch(AGE);
  });

  test('a stale answer (over five minutes) is withheld everywhere, with a retry; the hero prints no score', async ({ page }) => {
    test.skip(!MLB_ON || !MLB, 'MLB is not enabled in this build (rights)');
    await setup(page, MLB!, { mlb: { ageS: 900 } });
    await open(page, MLB!);
    await expect(page.getByTestId('live-score')).toContainText('over five minutes', { timeout: 20_000 });
    await expect(page.getByTestId('live-plays')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.locator('.v3-gh__sc .num')).toHaveCount(0);
  });

  test('a feed that errors says so, shows no score and invents no play', async ({ page }) => {
    test.skip(!MLB_ON || !MLB, 'MLB is not enabled in this build (rights)');
    await setup(page, MLB!, { mlb: { status: 503 } });
    await open(page, MLB!);
    await expect(page.getByTestId('live-pbp').getByTestId('live-unavailable')).toContainText('did not answer', { timeout: 20_000 });
    await expect(page.getByTestId('live-plays')).toHaveCount(0);
    await expect(page.getByTestId('live-score')).toContainText('Score unavailable');
    await expect(page.locator('.v3-gh__sc .num')).toHaveCount(0);
  });

  test('polling is visibility-aware: a hidden tab asks nothing; returning to it refreshes at once with the newer answer', async ({ page }) => {
    test.skip(!MLB_ON || !MLB, 'MLB is not enabled in this build (rights)');
    test.setTimeout(120_000);
    const c = await setup(page, MLB!, { flow: true });
    await page.addInitScript(() => {
      (window as unknown as { __vis: string }).__vis = 'visible';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window as unknown as { __vis: string }).__vis });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => (window as unknown as { __vis: string }).__vis === 'hidden' });
    });
    await open(page, MLB!);
    await expect(page.getByTestId('live-score')).toContainText(/MIL \d+.2 TB/, { timeout: 20_000 });
    await page.waitForTimeout(500); // let a dev-mode second mount request settle
    const before = c.mlb.filter((u) => u.includes('/feed/live')).length;
    const awayRuns = async () => Number(/MIL\s+(\d+)/.exec(await page.getByTestId('live-score').innerText())?.[1]);
    const first = await awayRuns();
    await page.evaluate(() => { (window as unknown as { __vis: string }).__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(23_000); // longer than one poll interval (20 s)
    expect(c.mlb.filter((u) => u.includes('/feed/live')).length).toBe(before);
    await page.evaluate(() => { (window as unknown as { __vis: string }).__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(awayRuns, { timeout: 10_000 }).toBeGreaterThan(first); // the newer answer (the away side scored again)
    expect(c.mlb.filter((u) => u.includes('/feed/live')).length).toBeGreaterThan(before);
  });
});

test.describe('demo mode keeps its sample drive card, and only there @v3', () => {
  test('a sample live game shows the Sample drive and last play; no live feed is requested for it', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ onboarded: true })); } catch { /* ignore */ } });
    const hosts: string[] = [];
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => { hosts.push(new URL(r.request().url()).host); return r.abort(); });
    await page.goto('./#/v3/game/cfb/demo_uga_fla?demo=1');
    await expect(page.locator('[data-v3-shell]')).toBeVisible();
    await expect(page.getByLabel('Current drive')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Last play')).toContainText('Sample play');
    await expect(page.getByTestId('live-state')).toHaveCount(0);
    expect(hosts.filter((h) => /sportscore|mlb/.test(h))).toEqual([]);
  });
});
