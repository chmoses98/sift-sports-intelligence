// SIFT 2.0 mobile UX and large-slate stabilization, in real browsers at the project's own viewport (Pixel 7 Chromium 390,
// iPhone 15 Pro WebKit 393, iPhone SE WebKit 375, desktop 1280). Slates are synthetic (e2e/slates.ts) on top of the bundled
// NFL snapshot, so 0 / 2 / 10 / 40 / 100+ game days and every sport mix run deterministically.
//   - Home: Top Props as readable full-width rows; the featured game is shown once; Today's games previews at most six.
//   - Games: every game listed, grouped by sport and hour, in the page flow (no nested scrolling).
//   - Market board: compact phone controls, secondary filters in a sheet.
//   - Game Command Center: section tabs pin below the safe-area inset and never cover content.
//   - Props: the game picker is a searchable sheet on phones and the native select on desktop.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, NEBUF, noHorizontalOverflow, NOW, test } from './fixtures';
import { installSlates, type SlateSpec } from './slates';

test.use({ timezoneId: 'America/Chicago' });

const isPhone = () => (test.info().project.use.viewport?.width ?? 1280) < 720;
const SIFT = '#/design/sift2';

async function open(page: Page, path: string, slate: SlateSpec = {}, opts: { now?: Date; days?: number[]; failing?: ('MLB' | 'NBA')[] } = {}) {
  const now = opts.now ?? NOW;
  await installSlates(page.context(), slate, { now, days: opts.days, failing: opts.failing });
  await page.clock.install({ time: now });
  await page.goto(`${SIFT}/${path}`);
}

/** Elements inside `root` that scroll vertically on their own: a nested scroll container on a long list. */
const nestedScrollers = (page: Page, root: string) =>
  page.evaluate((sel) => [...document.querySelectorAll(`${sel} *`)].filter((el) => {
    const s = getComputedStyle(el);
    return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1 && s.display !== 'none';
  }).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`), root);

test.describe('Home', () => {
  test('Top Props are readable rows on a phone and cards on desktop, never slivers @smoke', async ({ page }) => {
    await open(page, 'home', { NBA: 40, NHL: 10, MLB: 15, CFB: 6 });
    const sec = page.locator('section.htp');
    await expect(sec.getByRole('heading', { name: /Top props/i })).toBeVisible();
    if (isPhone()) {
      const rows = sec.locator('.htp-row');
      await expect(rows).toHaveCount(3);
      const vw = page.viewportSize()!.width;
      for (let i = 0; i < 3; i++) {
        const box = (await rows.nth(i).boundingBox())!;
        expect(box.width, `prop row ${i} width`).toBeGreaterThan(vw - 40);
        expect(box.height, `prop row ${i} height`).toBeLessThan(330);
        await expect(rows.nth(i).locator('.htp-row__name')).toBeVisible();
        await expect(rows.nth(i).locator('.htp-row__team')).toContainText(/^\s*[A-Z]{2,3}/);
        await expect(rows.nth(i).locator('.htp-num--line b')).toHaveText(/^\d+(\.\d)?$/);
        await expect(rows.nth(i).locator('.htp-num--proj')).toBeVisible();
        await expect(rows.nth(i).locator('.htp-auth')).toHaveText('Research only');
      }
      const all = sec.getByRole('link', { name: /See all props/ });
      await expect(all).toBeVisible();
      await all.click();
      await expect(page).toHaveURL(/#\/design\/sift2\/props/);
    } else {
      const cards = sec.locator('.htp-card');
      await expect(cards.first()).toBeVisible();
      expect(await cards.count()).toBeGreaterThan(1);
      for (let i = 0; i < Math.min(3, await cards.count()); i++) expect((await cards.nth(i).boundingBox())!.width).toBeGreaterThan(300);
    }
  });

  test('the featured game appears once and Today’s games previews at most six, with a link to all of them @smoke', async ({ page }) => {
    await open(page, 'home', { NBA: 40, NHL: 10, MLB: 15, CFB: 6 });
    await expect(page.locator('.s2-broadcast')).toHaveCount(1);
    const preview = page.getByRole('list', { name: "Today's games preview" });
    await expect(preview).toBeVisible();
    const n = await preview.locator('li').count();
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(6);
    // no row repeats the featured game's teams
    const featuredName = (await page.locator('.s2-broadcast').getByRole('heading').first().textContent()) ?? '';
    for (const label of await preview.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('aria-label') ?? ''))) expect(featuredName && label.includes(featuredName)).toBeFalsy();
    await expect(page.locator('.s2-match-card')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Today.s matchups/i })).toHaveCount(0);
    await noHorizontalOverflow(page, 'home with a 70-game slate');
    await page.getByRole('link', { name: /^View all/ }).first().click();
    await expect(page).toHaveURL(/#\/design\/sift2\/games/);
    await expect(page.getByRole('heading', { level: 1, name: 'Games', exact: true })).toBeVisible();
  });

  test('"What matters today" names only games on today’s local date; later games sit under Coming up @smoke', async ({ page }) => {
    await open(page, 'home');
    const intel = page.getByRole('region', { name: 'What matters today' });
    await expect(intel).toBeVisible();
    const today = intel.locator('ul.sift2-home__findings').first();
    await expect(today.locator('li').first()).toBeVisible();
    // NFL week 4: Sunday games are today; the Monday night game (ATL–NO) is a later day
    await expect(today).not.toContainText(/ATL|NO\b/);
    const coming = intel.locator('.sift2-home__coming');
    await expect(coming.getByRole('heading', { name: 'Coming up' })).toBeVisible();
    await expect(coming).toContainText(/Mon, Oct 5/);
    await expect(coming).not.toContainText(/today/i);
  });

  test('a day with no games shows empty states, not blank sections @smoke', async ({ page }) => {
    await open(page, 'home', {}, { now: new Date('2026-12-01T15:00:00Z') });
    await expect(page.getByText(/No games published for today/)).toBeVisible();
    await expect(page.getByText(/No research findings for games on December 1/)).toBeVisible();
    await expect(page.getByRole('heading', { name: "Today's games" })).toBeVisible();
    await noHorizontalOverflow(page, 'empty home');
  });

  test('one failed sport feed is reported and does not hide the others @smoke', async ({ page }) => {
    await open(page, 'home', { NBA: 12, MLB: 12 }, { failing: ['MLB'] });
    await expect(page.getByTestId('feed-coverage')).toContainText('1 sport feeds unavailable');
    await expect(page.getByRole('list', { name: "Today's games preview" })).toBeVisible();
  });

  test('has no accessibility violations @smoke', async ({ page }) => {
    await open(page, 'home', { NBA: 10, NHL: 6 });
    await expect(page.getByRole('list', { name: "Today's games preview" })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const res = await new AxeBuilder({ page }).include('.sift2-home').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(res.violations).toEqual([]);
  });
});

test.describe('Games', () => {
  const BIG: SlateSpec = { NBA: 60, NHL: 30, MLB: 30, CBB: 40, CFB: 8 };
  test('a 170-game multi-sport slate stays browsable: grouped by sport, no nested scrolling, nothing sideways @smoke', async ({ page }) => {
    await open(page, 'games', BIG);
    const groups = page.locator('.s2-gg__sport');
    await expect(groups.first()).toBeVisible();
    // every sport present is its own section, in navigation order, with its true count
    const heads = await groups.locator('.s2-gg__h').allInnerTexts();
    expect(heads.map((h) => h.split('\n')[0].trim())).toEqual(expect.arrayContaining(['NFL', 'NBA', 'NHL', 'MLB', 'CFB', 'CBB']));
    const counts = Object.fromEntries(heads.map((h) => [h.split('\n')[0].trim(), Number(/(\d+) game/.exec(h)![1])]));
    expect(counts.NBA).toBe(60);
    expect(counts.CBB).toBe(40);
    expect(counts.NHL).toBe(30);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(14 + 60 + 30 + 30 + 40 + 8);
    // long sports are capped in view with a way to reveal them all; nothing is deleted
    const nba = groups.filter({ hasText: /^NBA/ });
    await expect(nba.locator('.s2-gr')).toHaveCount(20);
    await nba.getByRole('button', { name: /Show all 60 NBA games/ }).click();
    await expect(nba.locator('.s2-gr')).toHaveCount(60);
    expect(await nestedScrollers(page, '.s2-games')).toEqual([]);
    await noHorizontalOverflow(page, 'games 170');
    // hour sub-headings exist within a sport
    expect(await nba.locator('.s2-gg__t').count()).toBeGreaterThan(2);
  });

  test('sport and date filters narrow the list without clipping controls @smoke', async ({ page }) => {
    await open(page, 'games', { NBA: 12, NHL: 8 }, { days: [0, 0, 1] });
    await page.getByRole('group', { name: 'Sport' }).getByRole('button', { name: /^NHL/ }).click();
    await expect(page).toHaveURL(/sport=nhl/);
    await expect(page.locator('.s2-gg__sport')).toHaveCount(1);
    await expect(page.locator('.s2-gg__h')).toContainText('NHL');
    await (isPhone() ? page.getByRole('button', { name: 'Next day' }) : page.getByRole('button', { name: /^Mon/ })).click();
    await expect(page).toHaveURL(/date=2026-10-05/);
    await noHorizontalOverflow(page, 'games filtered');
    for (const b of await page.locator('.s2-games__filters button:visible').all()) {
      const box = (await b.boundingBox())!;
      expect(box.x, 'a filter control is clipped on the left').toBeGreaterThanOrEqual(-1);
    }
  });

  test('an empty day shows a useful state @smoke', async ({ page }) => {
    await open(page, 'games', {}, { now: new Date('2026-12-01T15:00:00Z') });
    await expect(page.getByRole('heading', { name: 'No published games in this view' })).toBeVisible();
    await noHorizontalOverflow(page, 'empty games');
  });

  test('long team names never widen the page @smoke', async ({ page }) => {
    await open(page, 'games', { CFB: 10 });
    const longName = page.locator('.s2-gr', { hasText: /Albany|Seawolves/ }).first();
    await expect(longName).toBeVisible();
    await noHorizontalOverflow(page, 'games long names');
    const box = (await longName.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  });

  test('rows are one tap targets (a single research link each) and pass accessibility checks @smoke', async ({ page }) => {
    await open(page, 'games', { NBA: 10 });
    const rows = page.locator('.s2-gr');
    await expect(rows.first()).toBeVisible();
    for (const r of await rows.all()) expect(await r.locator('a').count()).toBe(1);
    const h = (await rows.first().boundingBox())!.height;
    expect(h).toBeGreaterThanOrEqual(44);
    expect(h).toBeLessThan(110);
    const res = await new AxeBuilder({ page }).include('.s2-games').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(res.violations).toEqual([]);
  });
});

test.describe('Market board', () => {
  test('phone filters collapse into a sheet; the active filter stays visible; search stays on screen @smoke', async ({ page }) => {
    test.skip(!isPhone(), 'the compact controls are the phone layout');
    await open(page, 'intelligence/markets', { NBA: 12, NHL: 8, MLB: 6, CFB: 5 });
    const mkc = page.locator('.mkc');
    await expect(mkc).toBeVisible();
    await expect(mkc.getByRole('searchbox')).toBeVisible();
    // the first opportunity or empty state starts high on the page: the controls take no more than ~230px
    const box = (await mkc.boundingBox())!;
    expect(box.height).toBeLessThan(230);
    await noHorizontalOverflow(page, 'market board phone');
    await mkc.getByRole('button', { name: /Filters/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Tomorrow' }).click();
    await expect(page).toHaveURL(/when=tomorrow/);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(mkc.getByRole('button', { name: /Day: Tomorrow/ })).toBeVisible();
    await expect(mkc.getByRole('button', { name: /Filters/ })).toContainText('1');
    await mkc.getByRole('button', { name: 'Full cards' }).click();
    await expect(page).toHaveURL(/view=cards/);
    await noHorizontalOverflow(page, 'market board phone, filtered');
  });

  test('desktop keeps the full filter rows', async ({ page }) => {
    test.skip(isPhone(), 'desktop layout');
    await open(page, 'intelligence/markets', { NBA: 6 });
    await expect(page.getByRole('group', { name: 'When' })).toBeVisible();
    await expect(page.locator('.mkc')).toHaveCount(0);
  });
});

test.describe('Game Command Center', () => {
  test('section tabs pin below the safe-area inset, cover nothing, and keep every tab reachable @smoke', async ({ page }) => {
    test.skip(!isPhone(), 'sticky tabs are the phone layout');
    await page.clock.install({ time: NOW });
    await page.goto(`${SIFT}/nfl/game/${NEBUF}`);
    const bar = page.locator('.sift2-command > nav.gtabs');
    await expect(bar).toBeVisible();
    // an installed iPhone app reports a status-bar inset (viewport-fit=cover); simulate a Dynamic Island phone
    const INSET = 47;
    await page.addStyleTag({ content: `:root{--safe-t:${INSET}px !important}` });
    await expect(bar.locator('.fx-tab')).toHaveCount(8);
    for (const y of [0, 350, 900, 1800]) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(150);
      const r = (await bar.boundingBox())!;
      if (y > 0) expect(Math.round(r.y), `bar top at scroll ${y}`).toBe(INSET);
      expect(r.height).toBeGreaterThanOrEqual(50);
      // the element right below the bar is page content, not the bar, and the bar never exceeds the viewport width
      expect(r.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
      const covered = await page.evaluate(({ x, yy }) => document.elementFromPoint(x, yy)?.closest('nav.gtabs') != null, { x: page.viewportSize()!.width / 2, yy: r.y + r.height + 6 });
      expect(covered, `content just under the bar at scroll ${y} is the bar`).toBe(false);
    }
    await noHorizontalOverflow(page, 'game page, scrolled');
    // every tab is reachable: scroll the strip, tap Game Scripts, the current tab stays visible and the route/tab state is kept
    const scripts = bar.getByRole('link', { name: 'Game Scripts' });
    await scripts.scrollIntoViewIfNeeded();
    await scripts.click();
    await expect(page).toHaveURL(/tab=script/);
    const current = bar.locator('[aria-current="page"]');
    await expect(current).toContainText('Game Scripts');
    const cb = (await current.boundingBox())!;
    expect(cb.x).toBeGreaterThanOrEqual(0);
    expect(cb.x + cb.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  });
});

test.describe('Game tab strips follow the current tab only where SIFT 2.0 asks for it', () => {
  test('SIFT 2.0: opening a game on a tab that is off-screen brings that tab into view @smoke', async ({ page }) => {
    test.skip(!isPhone(), 'the strip scrolls sideways on phones');
    await page.clock.install({ time: NOW });
    await page.goto(`${SIFT}/nfl/game/${NEBUF}?tab=markets`);
    const bar = page.locator('.sift2-command > nav.gtabs');
    const current = bar.locator('[aria-current="page"]');
    await expect(current).toContainText('Markets');
    await expect.poll(async () => { const b = (await current.boundingBox())!; return b.x >= 0 && b.x + b.width <= page.viewportSize()!.width; }).toBe(true);
    expect(await bar.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  });

  test('the classic game page keeps its tab strip exactly as laid out (nothing scrolls it) @smoke', async ({ page }) => {
    await page.clock.install({ time: NOW });
    await page.goto(`./#/nfl/game/${NEBUF}?tab=markets`);
    const strip = page.locator('nav.gtabs--fx').first();
    await expect(strip.locator('[aria-current="page"]')).toContainText('Markets');
    expect(await page.locator('.sift2-command').count()).toBe(0);
    await page.waitForTimeout(300);
    expect(await strip.evaluate((el) => el.scrollLeft)).toBe(0);
  });
});

test.describe('Prop explorer game picker', () => {
  test('a searchable sheet of matchup tiles on phones; the native select on desktop @smoke', async ({ page }) => {
    await page.clock.install({ time: NOW });
    await page.goto(`${SIFT}/props`);
    if (!isPhone()) {
      await expect(page.getByRole('combobox', { name: /Game/ })).toBeVisible();
      return;
    }
    const trigger = page.getByRole('button', { name: /Game.*All games|Game.*@/ });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const sheet = page.getByRole('dialog', { name: 'Choose a game' });
    await expect(sheet).toBeVisible();
    // two columns of tiles with both marks, abbreviations and the time
    const tiles = sheet.locator('.gpick__tile');
    expect(await tiles.count()).toBeGreaterThan(8);
    const a = (await tiles.nth(0).boundingBox())!;
    const b = (await tiles.nth(1).boundingBox())!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(b.x).toBeGreaterThan(a.x + a.width - 2);
    await expect(tiles.first().locator('img, .teammark').first()).toBeVisible();
    await noHorizontalOverflow(page, 'game picker');
    // search, choose, and the sheet closes with the choice applied
    await sheet.getByRole('searchbox').fill('buf');
    await expect(sheet.locator('.gpick__tile')).toHaveCount(1);
    await sheet.locator('.gpick__tile').click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: /Game.*NE @ BUF/ })).toBeVisible();
    await expect(page.locator('.tprow').first()).toContainText(/BUF|NE/);
    // All games restores the full slate
    await page.getByRole('button', { name: /Game.*NE @ BUF/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /All games/ }).click();
    await expect(page.getByRole('button', { name: /Game.*All games/ })).toBeVisible();
  });
});
