// SIFT v4 real live scores: the user path in real browsers, with the feeds' network answers mocked (page.route), because e2e runs without the
// internet. The mocks are TEST FIXTURES shaped like the real payloads recorded in tests/fixtures/live-scores/real; nothing here is shipped data.
// What is proved: off by default (no request leaves the page), the opt-in, identity matching with decoys, labels and attribution, freshness
// (live, stale, outage), ESPN behind its own switch, and that research is not touched.
import type { Page, Request } from '@playwright/test';
import { expect, noHorizontalOverflow, NOW, test } from './fixtures';
import { installSlates } from './slates';
import { board } from './slates';

test.use({ timezoneId: 'America/Chicago' });

type Item = ReturnType<typeof board>['items'][number];
const N = 12;
const items = (): Item[] => board('NBA', N, { now: NOW }).items;

interface Feed { mode: 'ok' | 'down'; updated: string; state: Record<number, { status: string; text: string; hs: string; as: string }> }
const sc = (it: Item, f: Feed['state'][number], i: number) => {
  const by = (id: string) => it.participants.find((p) => p.participant_id === id)!;
  return { home: by(it.home_participant).display_name, away: by(it.away_participant).display_name, home_score: f.hs, away_score: f.as, status: f.status, status_text: f.text, time: it.start_time_utc.replace('Z', '+00:00'), competition: 'National Basketball Association', url: `/basketball/match/x-${i}/` };
};

async function open(page: Page, feed: Feed, path = '') {
  await installSlates(page.context(), { NBA: N }, { now: NOW });
  const seen: Request[] = [];
  await page.route(/^https:\/\/sportscore\.com\//, async (route) => {
    seen.push(route.request());
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (feed.mode === 'down') return route.fulfill({ status: 503, headers: cors, body: '{}' });
    const its = items();
    const matches = its.map((it, i) => (feed.state[i] ? sc(it, feed.state[i], i) : null)).filter(Boolean) as ReturnType<typeof sc>[];
    // Decoys a correct matcher must refuse: the same teams a day later, and a different competition with the same names.
    if (its[0] && feed.state[0]) {
      matches.push({ ...sc(its[0], { status: 'live', text: 'Q1', hs: '9', as: '9' }, 90), time: new Date(Date.parse(its[0].start_time_utc) + 86400000).toISOString().replace('Z', '+00:00') });
      matches.push({ ...sc(its[0], { status: 'live', text: 'Q1', hs: '1', as: '2' }, 91), competition: 'EuroLeague' });
    }
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ sport: 'basketball', date: '2026-10-04', count: matches.length, matches, updated: feed.updated }) });
  });
  const espn: Request[] = [];
  await page.route(/^https:\/\/site\.api\.espn\.com\//, (route) => { espn.push(route.request()); return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ leagues: [{ abbreviation: 'NBA' }], events: [] }) }); });
  await page.clock.install({ time: NOW });
  await page.addInitScript(() => { try { localStorage.setItem('sift.v4.prompt', 'later'); } catch { /* ignore */ } });
  await page.goto(`#/v4${path}`);
  return { seen, espn };
}
const live = (): Feed => ({ mode: 'ok', updated: NOW.toISOString(), state: { 0: { status: 'live', text: 'Q3', hs: '61', as: '58' }, 1: { status: 'finished', text: 'Finished', hs: '104', as: '99' }, 2: { status: 'notstarted', text: 'Not started', hs: '', as: '' } } });
const note = (page: Page) => page.locator('[data-feed-note]');
const scoreRows = (page: Page) => page.locator('.v4-row', { has: page.locator('.v4-row__sc') });

test.describe('real live scores: off by default', () => {
  test('nothing is requested and nothing changes until the viewer turns live scores on @smoke', async ({ page }) => {
    const { seen, espn } = await open(page, live());
    await expect(page.locator('[data-featured]')).toBeVisible();
    await page.clock.fastForward(10_000);
    expect(seen).toHaveLength(0);
    expect(espn).toHaveLength(0);
    await expect(note(page)).toHaveCount(0);
    await expect(page.locator('.v4-row__sc')).toHaveCount(0);
  });

  test('early access offers it; ESPN is a separate switch that stays disabled until live scores are on @smoke', async ({ page }) => {
    const { seen, espn } = await open(page, live());
    await page.getByRole('button', { name: /SIFT v4 early access/ }).first().click();
    const sec = page.locator('[data-live-scores-section]');
    await expect(sec).toContainText('Powered by SportScore');
    await expect(sec).toContainText('robot, spider, script, or other automated means');
    await expect(sec.locator('[data-espn-toggle]')).toBeDisabled();
    await sec.locator('[data-live-scores-on]').click();
    await expect(sec.locator('[data-espn-toggle]')).toBeEnabled();
    await expect.poll(() => seen.length).toBeGreaterThan(0);
    expect(espn).toHaveLength(0); // enabling the permitted feed never touches ESPN
  });
});

test.describe('real live scores: SportScore (NBA)', () => {
  test('a live, a final and a not-started game: scores only where a game is matched with certainty, always with the source @smoke', async ({ page }) => {
    const { seen } = await open(page, live(), '?livescores=1');
    await expect.poll(() => seen.length).toBeGreaterThan(0);
    const req = seen[0].url();
    expect(req).toContain('/api/v1/fixtures/?sport=basketball&date=2026-10-04');
    expect(req).toContain('limit=200');
    expect(seen[0].headers()['authorization']).toBeUndefined(); // a simple, credential-free GET: no preflight, no key
    expect(seen[0].headers()['cookie']).toBeUndefined();
    await expect(note(page)).toContainText('Scores from SportScore');
    const link = note(page).getByRole('link', { name: 'Powered by SportScore' });
    await expect(link).toHaveAttribute('href', 'https://sportscore.com/');
    await expect(link).toHaveAttribute('rel', /dofollow/);
    // the live game is the featured card with the feed's score and the status text; the final is a row with F; the decoys (a day later, EuroLeague) never appear
    const featured = page.locator('[data-featured]');
    await expect(featured).toContainText('LIVE');
    await expect(featured.locator('.v4-sb__score').first()).toHaveText('58');
    await expect(featured.locator('.v4-sb__score').last()).toHaveText('61');
    await expect(scoreRows(page)).toHaveCount(1);
    await expect(scoreRows(page).first()).toContainText('Final');
    await expect(page.locator('main')).not.toContainText(/\bQ1\b/);
    await noHorizontalOverflow(page, 'v4 home (real scores)');
  });

  test('a live game opens on its Live tab with the score, the feed status, the source link and the as-of time; research stays pregame @smoke', async ({ page }) => {
    await open(page, live(), '/games?livescores=1&status=live');
    const row = scoreRows(page).filter({ hasNotText: /Final/ }).first();
    await expect(row).toBeVisible();
    await row.locator('a.v4-row__link').click();
    const card = page.locator('[data-live-score]');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-source', 'sportscore');
    await expect(card).toContainText('SportScore free API');
    await expect(card.getByRole('link', { name: 'Powered by SportScore' })).toHaveAttribute('href', 'https://sportscore.com/');
    await expect(card.locator('[data-live-label]')).toContainText(/LIVE|Updated/);
    await expect(page.locator('.v4-gctx .v4-badge')).toContainText(/LIVE|DELAYED/);
    // No clock is invented: the feed gave a status text, which is shown as the period, and nothing else
    await expect(card).toContainText('Q3');
    await expect(page.locator('main')).not.toContainText('DEMO');
  });

  test('a feed that stops changing goes stale with its age; one that fails says it is not answering, and recovery brings it back', async ({ page, errors }) => {
    errors.allow(/status of 503.*sportscore\.com/); // the simulated outage below: the browser logs every failed load
    const feed = live();
    await open(page, feed, '/games?livescores=1&status=live');
    await expect(scoreRows(page).first()).toBeVisible();
    // the feed keeps answering with the same `updated` time: 6 minutes later its score is stale, not live
    await page.clock.fastForward(6 * 60_000);
    await expect(page.locator('.v4-row .v4-row__mid').filter({ hasText: /stale 6m/ }).first()).toBeVisible();
    await expect(page.locator('.v4-row--live', { has: page.locator('.v4-row__sc') })).toHaveCount(0);
    // outage: the last answer stays, with an honest note
    feed.mode = 'down';
    await page.clock.fastForward(30_000);
    await expect(note(page)).toContainText(/not answering/);
    // recovery with a fresh time
    feed.mode = 'ok'; feed.updated = new Date(NOW.getTime() + 6.6 * 60_000).toISOString(); feed.state[0] = { status: 'live', text: 'Q4', hs: '70', as: '66' };
    await page.clock.fastForward(60_000);
    await expect(page.locator('.v4-row .v4-row__mid').filter({ hasText: /stale/ })).toHaveCount(0);
    await expect(page.locator('main')).toContainText('70');
  });

  test('turning live scores off stops requests and removes every score', async ({ page }) => {
    const { seen } = await open(page, live(), '/games?livescores=1');
    await expect(scoreRows(page).first()).toBeVisible();
    await page.goto('#/v4?livescores=0');
    const before = seen.length;
    await page.clock.fastForward(60_000);
    expect(seen.length).toBe(before);
    await expect(page.locator('.v4-row__sc')).toHaveCount(0);
    await expect(note(page)).toHaveCount(0);
  });
});

test.describe('real live scores: ESPN is its own, labelled choice', () => {
  test('only after its own switch does ESPN get a request, and its scores are used only for games the permitted feed does not hold', async ({ page }) => {
    const { espn } = await open(page, live(), '?livescores=1');
    await page.clock.fastForward(20_000);
    expect(espn).toHaveLength(0);
    await page.getByRole('button', { name: /SIFT v4 early access/ }).first().click();
    await page.locator('[data-espn-toggle]').click();
    await expect.poll(() => espn.length).toBeGreaterThan(0);
    expect(espn.some((r) => r.url().includes('/apis/site/v2/sports/basketball/nba/scoreboard'))).toBe(true);
    expect(espn.every((r) => r.headers()['authorization'] === undefined)).toBe(true);
  });
});
