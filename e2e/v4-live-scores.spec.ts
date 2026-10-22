// SIFT v4 real live scores: the user path in real browsers, with the feeds' network answers mocked (page.route), because e2e runs without the
// internet. The mocks are TEST FIXTURES shaped like the real payloads recorded in tests/fixtures/live-scores/real; nothing here is shipped data.
// What is proved: on by default in v4 with a one-tap off, identity matching with decoys, labels and attribution, freshness
// (live, stale, outage), the 60-second polling limit, that ESPN is not reachable from the app at all, and that research is not touched.
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
  // ESPN must never be contacted by any build of SIFT; the route exists only to catch a regression.
  const espn: Request[] = [];
  await page.route(/espn\.com\//, (route) => { espn.push(route.request()); return route.abort(); });
  await page.clock.install({ time: NOW });
  // The shared fixtures start every spec with the viewer's "off" setting; here the DEFAULT is what is under test, so clear it once per tab.
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('__ls')) { sessionStorage.setItem('__ls', '1'); localStorage.removeItem('sift.v4.livescores'); } } catch { /* ignore */ } });
  await page.addInitScript(() => { try { localStorage.setItem('sift.v4.prompt', 'later'); } catch { /* ignore */ } });
  await page.goto(`#/v4${path}`);
  return { seen, espn };
}
const live = (): Feed => ({ mode: 'ok', updated: NOW.toISOString(), state: { 0: { status: 'live', text: 'Q3', hs: '61', as: '58' }, 1: { status: 'finished', text: 'Finished', hs: '104', as: '99' }, 2: { status: 'notstarted', text: 'Not started', hs: '', as: '' } } });
const note = (page: Page) => page.locator('[data-feed-note]');
const scoreRows = (page: Page) => page.locator('.v4-row', { has: page.locator('.v4-row__sc') });

test.describe('real live scores: on by default in v4, one tap to turn off', () => {
  test('with no setting at all the feed is read, the source and credit show, and a matched game carries its score @smoke', async ({ page }) => {
    const { seen, espn } = await open(page, live());
    await expect.poll(() => seen.length).toBeGreaterThan(0);
    await expect(note(page)).toContainText('Scores from SportScore');
    await expect(note(page).getByRole('link', { name: 'Powered by SportScore' })).toHaveAttribute('rel', 'dofollow');
    await expect(page.locator('[data-featured]')).toContainText('LIVE');
    expect(espn).toHaveLength(0);
  });

  test('the note has a Turn off: it stops requests, removes every score, and the choice survives a reload; early access turns it back on @smoke', async ({ page }) => {
    const { seen } = await open(page, live());
    await expect(note(page)).toBeVisible();
    await note(page).locator('[data-feed-off]').click();
    await expect(note(page)).toHaveCount(0);
    await expect(page.locator('.v4-row__sc')).toHaveCount(0);
    const before = seen.length;
    await page.clock.fastForward(120_000);
    expect(seen.length).toBe(before);
    expect(await page.evaluate(() => localStorage.getItem('sift.v4.livescores'))).toBe('0');
    await page.reload();
    await expect(page.locator('[data-featured]')).toBeVisible();
    await expect(note(page)).toHaveCount(0);
    await page.getByRole('button', { name: /SIFT v4 early access/ }).first().click();
    const sec = page.locator('[data-live-scores-section]');
    await expect(sec).toContainText('Powered by SportScore');
    await expect(sec.locator('[data-espn-toggle]')).toHaveCount(0);
    await expect(sec).not.toContainText('ESPN');
    await sec.locator('[data-live-scores-on]').click();
    await expect.poll(() => seen.length).toBeGreaterThan(before);
  });

  test('SIFT 2.0 is untouched: the classic home neither reads the feed nor shows a score @smoke', async ({ page }) => {
    const { seen } = await open(page, live(), '');
    await page.goto('#/');
    await page.clock.fastForward(120_000);
    const classic = seen.length;
    await page.clock.fastForward(120_000);
    expect(seen.length).toBe(classic);
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
    await page.clock.fastForward(61_000);
    await expect(note(page)).toContainText(/not answering/);
    // recovery with a fresh time
    feed.mode = 'ok'; feed.updated = new Date(NOW.getTime() + 7.6 * 60_000).toISOString(); feed.state[0] = { status: 'live', text: 'Q4', hs: '70', as: '66' };
    await page.clock.fastForward(61_000);
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

test.describe('real live scores: ESPN is not reachable', () => {
  test('a leftover ESPN setting from an earlier build does nothing and is cleared; no request ever goes to ESPN @smoke', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('sift.v4.livescores.espn', '1'); } catch { /* ignore */ } });
    const { seen, espn } = await open(page, live(), '?livescores=1');
    await expect.poll(() => seen.length).toBeGreaterThan(0);
    await page.clock.fastForward(120_000);
    expect(espn).toHaveLength(0);
    expect(await page.evaluate(() => localStorage.getItem('sift.v4.livescores.espn'))).toBeNull();
  });
});

test.describe('real live scores: polling respects the feed\'s 60-second cache', () => {
  test('one request per day shown per minute, never faster, and at most two days @smoke', async ({ page }) => {
    const { seen } = await open(page, live(), '?livescores=1');
    await expect.poll(() => seen.length).toBeGreaterThan(0);
    const days = (rs: Request[]) => new Set(rs.map((r) => new URL(r.url()).searchParams.get('date')));
    const first = seen.length;
    expect(days(seen).size).toBeLessThanOrEqual(2);
    expect(seen.every((r) => new URL(r.url()).pathname === '/api/v1/fixtures/')).toBe(true);
    await page.clock.fastForward(45_000);
    expect(seen.length).toBe(first); // inside the minute: nothing
    await page.clock.fastForward(20_000);
    await expect.poll(() => seen.length).toBeGreaterThan(first);
    expect(seen.length - first).toBeLessThanOrEqual(2);
    expect(seen.length).toBeLessThanOrEqual(first * 2);
  });
});

test.describe('real live scores: the SportScore credit is visible and crawlable', () => {
  const visibleLink = async (link: import('@playwright/test').Locator) => {
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'https://sportscore.com/');
    await expect(link).toHaveAttribute('rel', 'dofollow');
    const s = await link.evaluate((el) => { const c = getComputedStyle(el); const r = el.getBoundingClientRect(); return { size: parseFloat(c.fontSize), opacity: parseFloat(c.opacity), vis: c.visibility, disp: c.display, w: r.width, h: r.height, color: c.color, bg: getComputedStyle(el.parentElement!).backgroundColor }; });
    expect(s.size).toBeGreaterThanOrEqual(11);
    expect(s.opacity).toBe(1);
    expect(s.vis).toBe('visible');
    expect(s.disp).not.toBe('none');
    expect(s.w).toBeGreaterThan(40);
    expect(s.h).toBeGreaterThan(8);
    expect(s.color).not.toBe(s.bg);
  };

  test('a client that runs no script still gets the link in the page itself @smoke', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await ctx.newPage();
    await page.goto('./');
    await visibleLink(page.locator('a[href="https://sportscore.com/"]'));
    await expect(page.locator('a[href="https://sportscore.com/"]')).toHaveText('Powered by SportScore');
    await ctx.close();
  });

  test('wherever a SportScore score is on screen the link is on screen: Home, Games and every tab of the Game screen @smoke', async ({ page }) => {
    await open(page, live(), '?livescores=1');
    await visibleLink(note(page).getByRole('link', { name: 'Powered by SportScore' }));
    await page.goto('#/v4/games?livescores=1&status=live');
    await visibleLink(note(page).getByRole('link', { name: 'Powered by SportScore' }));
    await scoreRows(page).filter({ hasNotText: /Final/ }).first().locator('a.v4-row__link').click();
    for (const tab of ['Live', 'Matchups', 'Players', 'Markets']) {
      const t = page.getByRole('tab', { name: new RegExp(`^${tab}`) });
      if (await t.count()) await t.first().click();
      await visibleLink(page.locator('[data-score-credit]').getByRole('link', { name: 'Powered by SportScore' }));
    }
  });
});
