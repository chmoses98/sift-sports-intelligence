// SIFT 3.0 Game Detail and Matchup (locked designs G1 to G3) against REAL published documents (the committed `game` fixture family in fixtures/real, offline;
// V3_REAL_FEEDS=live refills a scratch cache). DAL at PHI, week 7 (2026-10-26) is the reference game; when it has left the
// publication the research specs skip rather than assert on a different game. Every tap-matrix row owned by milestone 5 is exercised
// against the real components, Back is asserted to restore the screen's exact state and scroll, and prices are made current by fixing
// the browser clock just after the publication's quote capture (the quote gate is the app's own; nothing is stubbed).
import { test, expect, type Locator, type Page } from '@playwright/test';
import { feedNow, freshQuotes, useRealFeeds } from './support/realFeeds';

const GAME = '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3';
// The fixture family describes one instant (feedNow('game'): its clock pin in fixtures/real/MANIFEST.json) and is refreshed from time to time, so nothing here hard-codes an
// instant. The browser clock is that instant and the live-quote feed's observation times are re-stamped to it (freshQuotes: a test transformation of the
// timestamps only, every price is the published one), so live prices are current under the quote gate and the event document's older capture is withheld.
const FAMILY = 'game' as const;
const CAPTURE = feedNow(FAMILY);

test.beforeEach(async ({ page }) => {
  await useRealFeeds(page, { family: FAMILY });
  await freshQuotes(page, { family: FAMILY });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.clock.setFixedTime(CAPTURE);
});

const y = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
const hash = (page: Page) => page.evaluate(() => location.hash);
const histLen = (page: Page) => page.evaluate(() => history.length);
const scrollTo = async (page: Page, to: number) => { await page.evaluate((t) => window.scrollTo(0, t), to); await page.waitForTimeout(250); };

async function open(page: Page, query = '') {
  await page.goto(`./#${GAME}${query}`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  const missing = page.getByText('This game is not on the published slate');
  const ready = page.locator('.v3-gh, .mx-ubar, [data-testid=tug-rows]').first();
  await Promise.race([ready.waitFor({ timeout: 30_000 }), missing.waitFor({ timeout: 30_000 })]).catch(() => {});
  test.skip(await missing.isVisible().catch(() => false), 'the reference game is no longer on the published slate');
}
async function matchup(page: Page, query = '') {
  await open(page, `?v=1&tab=matchup${query}`);
  await expect(page.getByTestId(/unit=/.test(query) ? 'unit-view' : 'tug-rows')).toBeVisible({ timeout: 30_000 });
}

/** Tap a target, check where it goes (`data-dest` and the address), then Back and check the screen is exactly as it was left. */
async function tap(page: Page, target: Locator, dest: RegExp, kind: string) {
  const before = await hash(page);
  const at = await y(page);
  await expect(target).toHaveAttribute('data-tap', kind);
  // `data-dest` is the route (no hash); the address bar carries it after the hash
  await expect(target).toHaveAttribute('data-dest', new RegExp(dest.source.replace(/^#\??/, '')));
  await target.scrollIntoViewIfNeeded();
  const scrolled = await y(page);
  await target.click();
  await expect(page).toHaveURL(dest);
  await page.goBack();
  await expect.poll(() => hash(page)).toBe(before);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => Math.abs((await y(page)) - scrolled)).toBeLessThanOrEqual(6);
  void at;
}

test.describe('Game Detail: tabs by sport @v3', () => {
  test('NFL has five tabs; hockey has Overview and Props; a tab the sport lacks falls back to Overview', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('tab')).toHaveText(['Overview', 'Game Script', 'Matchup', 'Props', 'Stats']);
    await page.goto('./#/v3/game/nhl/demo_van_tbl?demo=1');
    await expect(page.getByRole('tab').first()).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(2);
    await page.goto('./#/v3/game/nhl/demo_van_tbl?demo=1&v=1&tab=matchup');
    await expect(page.getByRole('tab', { selected: true })).toHaveText(/Live|Overview/);
  });
  test('the old tab value main still opens Overview', async ({ page }) => {
    await open(page, '?tab=main');
    await expect(page.getByRole('tab', { selected: true })).toHaveText('Overview');
  });
});

test.describe('Matchup (G1) @v3', () => {
  test('rows are the published league ranks, the tilt follows the displayed gap, and the counts add up to the units shown', async ({ page }) => {
    await matchup(page);
    const rows = page.locator('.mx-tug__in');
    expect(await rows.count()).toBeGreaterThan(0);
    const pills = await rows.evaluateAll((els) => els.map((e) => (e.querySelector('.mx-tilt')?.textContent ?? '').trim()));
    const even = pills.filter((p) => /^Even/.test(p)).length;
    const gaps = pills.map((p) => Number((/[+−](\d+)/.exec(p) ?? [])[1]));
    for (const [i, p] of pills.entries()) { if (/^Even/.test(p)) expect(gaps[i]).toBeLessThanOrEqual(15); else expect(gaps[i]).toBeGreaterThan(15); }
    // the selected direction's tile counts equal the rows on screen
    const tile = page.locator('.mx-sg[aria-pressed=true]');
    await expect(tile).toContainText(`${even} even`);
    const total = pills.length;
    const label = await tile.getAttribute('aria-label');
    const m = /(\d+) favour .*?, (\d+) even, (\d+) favour .*?, of (\d+) units/.exec(label ?? '')!;
    expect(Number(m[1]) + Number(m[2]) + Number(m[3])).toBe(Number(m[4]));
    expect(Number(m[4])).toBe(total);
    await expect(page.locator('.mx-sg[aria-pressed=true] .mx-gb i')).toHaveCount(total);
  });

  test('header team, tilt pill and marker logos open the team; offense and defense values open the statistic with the team selected', async ({ page }) => {
    await matchup(page);
    await tap(page, page.locator('.v3-gh__logo').first(), /#\/v3\/team\/nfl\/DAL$/, 'team'); // 28
    await tap(page, page.locator('.mx-tilt[data-tap=team]').first(), /#\/v3\/team\/nfl\/(DAL|PHI)$/, 'team'); // 29
    await tap(page, page.locator('.mx-mk[data-tap=team]').first(), /#\/v3\/team\/nfl\/(DAL|PHI)$/, 'team'); // 30
    await tap(page, page.locator('.mx-tv__c[data-tap=stat]').first(), /#\/v3\/stat\/nfl\/adj_off_epa\?v=1&win=ADJ_RIDGE&sel=PHI&opp=DAL$/, 'stat'); // 31
    await tap(page, page.locator('.mx-tv__c[data-tap=stat]').nth(1), /#\/v3\/stat\/nfl\/adj_def_epa\?v=1&win=ADJ_RIDGE&sel=DAL&opp=PHI$/, 'stat'); // 32
  });

  test('the direction control switches in place: history is replaced, scroll stays, Back leaves the screen', async ({ page }) => {
    await matchup(page);
    await scrollTo(page, 300);
    const len = await histLen(page);
    const at = await y(page);
    await page.locator('.mx-sg[data-dir=DAL]').click();
    await expect(page).toHaveURL(/dir=DAL/);
    await expect(page.locator('.mx-sg[data-dir=DAL]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.mx-tv__c[data-tap=stat]').first()).toHaveAttribute('data-dest', /adj_off_epa\?v=1&win=ADJ_RIDGE&sel=DAL&opp=PHI/);
    expect(await histLen(page)).toBe(len);
    expect(Math.abs((await y(page)) - at)).toBeLessThanOrEqual(6);
    await page.locator('.mx-sg[data-dir=PHI]').click();
    await expect(page).not.toHaveURL(/dir=/);
  });

  test('a unit row opens the expanded unit as a history step; Back restores tab, direction, Lens and scroll exactly', async ({ page }) => {
    await matchup(page, '&dir=DAL');
    await page.getByTestId('sift-lens').getByRole('button', { name: /SIFT Lens/ }).click();
    await expect(page).toHaveURL(/lens=1/);
    await scrollTo(page, 520);
    const before = await hash(page);
    const at = await y(page);
    const len = await histLen(page);
    // 33: the row body (not a logo, pill or value) opens the unit
    const row = page.locator('.v3-navrow.mx-tug').nth(1);
    await expect(row.locator('.v3-navrow__main')).toHaveAttribute('data-tap', 'game');
    await row.scrollIntoViewIfNeeded();
    await row.locator('.v3-navrow__main').click({ position: { x: 40, y: 14 } });
    await expect(page).toHaveURL(/unit=pass/);
    await expect(page.getByTestId('unit-view')).toBeVisible();
    expect(await histLen(page)).toBe(len + 1);
    await page.goBack();
    await expect.poll(() => hash(page)).toBe(before);
    await expect(page.getByTestId('tug-rows')).toBeVisible();
    await expect(page.locator('.mx-sg[aria-pressed=true]')).toHaveAttribute('data-dir', 'DAL');
    await expect(page.locator('.mx-lh')).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(async () => Math.abs((await y(page)) - at)).toBeLessThanOrEqual(8);
  });
});

test.describe('SIFT Lens @v3', () => {
  test('collapsed by default with an observation and a counter-case; evidence on tap; each evidence row opens its statistic', async ({ page }) => {
    await matchup(page);
    const lens = page.getByTestId('sift-lens');
    await expect(lens).toContainText('Widest gap:');
    await expect(lens).toContainText('Counter-case:');
    await expect(lens.locator('.mx-evid')).toHaveCount(0);
    await expect(lens.locator('.mx-lh')).toHaveAttribute('aria-expanded', 'false');
    const len = await histLen(page);
    await lens.locator('.mx-lh').click();
    await expect(page).toHaveURL(/lens=1/);
    expect(await histLen(page)).toBe(len);
    await expect(lens.locator('.mx-evr')).toHaveCount(3);
    await expect(lens).toContainText('descriptive visual heuristic');
    await expect(lens).toContainText('not a prediction');
    await expect(lens).toContainText('15 or less is Even');
    await tap(page, lens.locator('.mx-evr').first(), /#\/v3\/stat\/nfl\/adj_(off|def)_[a-z_]+\?v=1&win=ADJ_RIDGE&sel=[A-Z]+&opp=[A-Z]+/, 'stat'); // 34
    await expect(page).toHaveURL(/lens=1/);
    await expect(lens.locator('.mx-evr')).toHaveCount(3);
  });
});

test.describe('Key matchups and game shape @v3', () => {
  test('avatar opens the player, price the addressed contract sheet, the unit fact the statistic', async ({ page }) => {
    await matchup(page);
    const km = page.getByTestId('key-matchups');
    await expect(km.locator('.mx-km').first()).toBeVisible();
    await tap(page, km.locator('.mx-av').first(), /#\/v3\/player\/nfl\/prt_[0-9a-f]+/, 'player'); // 35
    const price = km.locator('.mx-kp').first();
    await expect(price).toHaveAttribute('data-tap', 'price');
    await expect(price).toHaveAttribute('data-dest', /sheet=contract&tk=KXNFL/);
    await expect(km.locator('.mx-kp', { hasText: /\d+¢/ }).first()).toBeVisible(); // current under the fixed clock: the quote gate passes where a live price exists
    const url = await hash(page);
    await price.click(); // 36
    await expect(page).toHaveURL(/sheet=contract&tk=KXNFL/);
    await page.goBack();
    await expect.poll(() => hash(page)).toBe(url);
    await tap(page, km.locator('.mx-kt__f').first(), /#\/v3\/stat\/nfl\/adj_def_(db|rush)_epa\?v=1&win=ADJ_RIDGE&sel=[A-Z]+&opp=[A-Z]+$/, 'stat'); // 37
  });

  test('game shape comes only from the approved projection authority, or says why it is absent; its team opens the team', async ({ page }) => {
    await matchup(page);
    const shape = page.getByTestId('game-shape');
    await expect(shape).toContainText('research-only');
    await expect(shape.locator('.mx-sr, .x-lock').first()).toBeVisible();   // the projection can answer after the card is drawn: branch on what it answered, not on the first look
    const bars = shape.locator('.mx-sr');
    if (await bars.count()) {
      await tap(page, bars.first().locator('.mx-sr__t'), /#\/v3\/team\/nfl\/(DAL|PHI)$/, 'team'); // 38
    } else {
      await expect(shape.locator('.x-lock')).toContainText(/\w/);
    }
  });
});

test.describe('Overview (G2) @v3', () => {
  test('win price, player, team row and props row are targets with one meaning', async ({ page }) => {
    await open(page);
    const win = page.getByTestId('win-price').locator('.mx-win__t').first();
    await expect(win).toContainText(/\d+¢/);
    const url = await hash(page);
    await expect(win).toHaveAttribute('data-dest', /sheet=contract&tk=KXNFLGAME-26OCT26DALPHI-DAL/);
    await win.click(); // 39
    await expect(page).toHaveURL(/sheet=contract&tk=KXNFLGAME-26OCT26DALPHI-DAL/);
    await page.goBack();
    await expect.poll(() => hash(page)).toBe(url);
    await tap(page, page.getByTestId('players-to-research').locator('.mx-av').first(), /#\/v3\/player\/nfl\/prt_/, 'player'); // 40
    await tap(page, page.getByTestId('game-teams').locator('a[data-tap=team]').first(), /#\/v3\/team\/nfl\/DAL$/, 'team'); // 41
    // 42: Prop Discovery is a later milestone; the address is built with the route builder and does not resolve to its screen yet
    const props = page.locator('a.mx-prow');
    await expect(props).toHaveAttribute('data-tap', 'props');
    await expect(props).toHaveAttribute('data-dest', /#?\/v3\/props\?v=1&game=evt_cd335cc6d5f5b8d8f7b3$/);
  });

  test('a withheld price prints a dash and is still a target', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-26T23:30:00Z'));
    await open(page);
    const win = page.getByTestId('win-price').locator('.mx-win__t').first();
    await expect(win).toContainText('—');
    await expect(win).toHaveAttribute('data-tap', 'price');
  });
});

test.describe('missing quotes @v3', () => {
  test('with no usable quote every price in the Matchup tab and the Lens prints a dash and is still the addressed contract target', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-27T03:00:00Z'));
    await matchup(page, '&lens=1');
    const km = page.getByTestId('key-matchups');
    const prices = km.locator('.mx-kp');
    expect(await prices.count()).toBeGreaterThan(0);
    for (const p of await prices.all()) { await expect(p).toContainText('—'); await expect(p).toHaveAttribute('data-tap', 'price'); await expect(p).toHaveAttribute('data-dest', /sheet=contract&tk=KXNFL/); }
    await expect(page.getByTestId('sift-lens')).not.toContainText('to win.'); // the market line needs both win prices to pass the gate
    await expect(page.getByTestId('sift-lens')).not.toContainText(/\d+¢/);
  });
});

test.describe('Expanded unit (G2) @v3', () => {
  test('strips open the statistic, the player row opens the player, the team total row opens the game', async ({ page }) => {
    await matchup(page, '&dir=DAL&unit=pass');
    const unit = page.getByTestId('unit-view');
    await expect(unit).toContainText('Percentile gap · tilt');
    await expect(unit.locator('.mx-sl')).toHaveCount(2);
    await tap(page, unit.locator('.mx-sl').first(), /#\/v3\/stat\/nfl\/adj_off_db_epa\?v=1&win=ADJ_RIDGE&sel=DAL&opp=PHI$/, 'stat'); // 43
    await tap(page, unit.locator('.mx-sl').nth(1), /#\/v3\/stat\/nfl\/adj_def_db_epa\?v=1&win=ADJ_RIDGE&sel=PHI&opp=DAL$/, 'stat'); // 44
    const markets = page.getByTestId('unit-markets');
    await tap(page, markets.locator('.mx-av').first(), /#\/v3\/player\/nfl\/prt_/, 'player'); // 45
    await tap(page, markets.locator('.v3-navrow__main').first(), /#\/v3\/game\/nfl\/evt_cd335cc6d5f5b8d8f7b3$/, 'game'); // 46
    await expect(unit.locator('.x-lock')).toContainText('Weekly trend is locked');
  });
  test('a shared link into a unit has no history below it: Back closes the unit', async ({ page }) => {
    await matchup(page, '&unit=rush');
    await page.getByRole('button', { name: 'Back' }).first().click();
    await expect(page).not.toHaveURL(/unit=/);
  });
});

test.describe('quality @v3', () => {
  for (const q of ['', '?v=1&tab=matchup', '?v=1&tab=matchup&unit=pass&dir=DAL&lens=1']) {
    test(`no horizontal scroll and no freshness words in the research blocks ${q || '(overview)'}`, async ({ page }) => {
      for (const w of [390, 375]) {
        await page.setViewportSize({ width: w, height: 844 });
        if (q.includes('unit')) await matchup(page, q.replace('?v=1&tab=matchup', '')); else if (q) await matchup(page); else await open(page);
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        const text = await page.locator('.mx, [data-testid=win-price], [data-testid=players-to-research], [data-testid=game-teams]').allInnerTexts();
        expect(text.join('\n')).not.toMatch(/\bago\b|last known|\bstale\b|updated|just now|\b\d+m\b|Published matchup rows ·|\d\d:\d\dZ/i);
      }
    });
  }
});

test.describe('missing data and laziness @v3', () => {
  test('team profiles that are not published give the locked "No matchup rows" state, never a substitute; the Overview still works', async ({ page }) => {
    await page.route(/\/explorer\/teams\/prt_/, (r) => r.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } }));
    await open(page, '?v=1&tab=matchup');
    await expect(page.getByText('No matchup rows.')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.mx-tug')).toHaveCount(0);
    await expect(page.getByTestId('sift-lens')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page.getByTestId('win-price')).toBeVisible();
    await expect(page.getByTestId('game-teams')).toBeVisible();
  });
  test('the Overview loads no team profile; the Matchup tab loads both, once', async ({ page }) => {
    const profiles: string[] = [];
    page.on('request', (r) => { if (/\/explorer\/teams\/prt_/.test(r.url())) profiles.push(r.url()); });
    await open(page);
    await expect(page.getByTestId('game-teams')).toBeVisible();
    await page.waitForTimeout(1500);
    expect(profiles).toHaveLength(0);
    await page.getByRole('tab', { name: 'Matchup' }).click();
    await expect(page.getByTestId('tug-rows')).toBeVisible({ timeout: 30_000 });
    expect(new Set(profiles).size).toBe(2);
  });
});

test.describe('a completed game @v3', () => {
  test('uses the same route, shows no price or props row, and keeps both team rows', async ({ page }) => {
    await page.goto('./#/v3/game/nfl/evt_0e858f7285b411adf630');
    await expect(page.locator('[data-v3-shell]')).toBeVisible();
    const ok = await page.getByTestId('game-teams').waitFor({ timeout: 30_000 }).then(() => true, () => false);
    test.skip(!ok, 'the completed reference game is no longer on the slate');
    await expect(page.getByTestId('win-price')).toHaveCount(0);
    await expect(page.locator('a.mx-prow')).toHaveCount(0);
    await expect(page.getByRole('tab', { selected: true })).toHaveText('Recap');
    await expect(page.locator('.v3-gh__fin')).toHaveText('FINAL');
    await expect(page.locator('.v3-gh__sc .num')).toContainText(/\d+.\d+/); // the final score is the hero's
    await expect(page.getByText('Result not reported yet')).toHaveCount(0);
  });
});
