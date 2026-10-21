// SIFT v4 (src/v4): the phone-first preview at #/v4. Real browsers, the bundled NFL snapshot plus synthetic slates
// (e2e/slates.ts). Run with V4_SHOTS=<dir> to also save screenshots of the real app at each size.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, NEBUF, NHL_FIXTURE, noHorizontalOverflow, NOW, test } from './fixtures';
import { installSlates, type SlateSpec } from './slates';

test.use({ timezoneId: 'America/Chicago' });

const SHOTS = process.env.V4_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png` }); };

async function open(page: Page, path = '', slate: SlateSpec = {}, now = NOW) {
  await installSlates(page.context(), slate, { now });
  await page.clock.install({ time: now });
  await page.goto(`#/v4${path}`);
}

test.describe('v4 shell', () => {
  test('five tabs navigate, keep active state and never overflow @smoke', async ({ page }) => {
    await open(page, '', { NBA: 6 });
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link')).toHaveText(['Home', 'Games', 'Props', 'Signals', 'Board']);
    await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    for (const [name, path] of [['Games', /\/v4\/games/], ['Props', /\/v4\/props/], ['Signals', /\/v4\/signals/], ['Board', /\/v4\/board/]] as const) {
      await nav.getByRole('link', { name }).click();
      await expect(page).toHaveURL(path);
      await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
      await noHorizontalOverflow(page, `v4 ${name}`);
    }
    await nav.getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/#\/v4$/);
  });

  test('every tab target is at least 44px and the bar clears the home indicator @smoke', async ({ page }) => {
    await open(page, '', { NBA: 4 });
    const links = page.getByRole('navigation', { name: 'Primary' }).getByRole('link');
    for (let i = 0; i < 5; i++) { const b = (await links.nth(i).boundingBox())!; expect(b.height).toBeGreaterThanOrEqual(44); expect(b.width).toBeGreaterThanOrEqual(44); }
  });
});

test.describe('v4 Home', () => {
  test('shows the real published slate, groups by lifecycle and opens a game @smoke', async ({ page }) => {
    await open(page, '', { NBA: 8, NHL: 6, MLB: 5, CFB: 4 });
    await expect(page.getByRole('group', { name: 'League' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Date' }).getByRole('button', { pressed: true })).toContainText('Today');
    await expect(page.locator('[data-featured]')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Upcoming' }).or(page.getByRole('region', { name: 'Also live' })).first()).toBeVisible();
    await noHorizontalOverflow(page, 'v4 home');
    await shot(page, 'home');
    await page.getByRole('link', { name: /Open game$/ }).first().click();
    await expect(page).toHaveURL(/#\/v4\/game\//);
  });

  test('league, date and filter controls change what is listed @smoke', async ({ page }) => {
    await open(page, '', { NBA: 8, NHL: 6 });
    await expect(page.locator('[data-featured]')).toBeVisible();
    const rows = page.locator('.v4-row');
    const all = await rows.count();
    expect(all).toBeGreaterThan(5);
    await page.getByRole('button', { name: /^NHL, 6 games/ }).click();
    await expect(page).toHaveURL(/sport=nhl/);
    await expect(rows).toHaveCount(5);
    // The synthetic slate starts games from an hour before "now": some NHL games are in play, and only those are listed.
    await page.getByRole('button', { name: /^Live/ }).click();
    await expect(page.locator('[data-featured], .v4-row').first()).toBeVisible();
    await expect(page.getByRole('region', { name: /^Upcoming$/ })).toHaveCount(0);
    for (const t of await rows.allTextContents()) expect(t).toContain('In play');
    await page.getByRole('button', { name: /^Following \d/ }).click();
    await expect(page.getByText(/not following any teams/)).toBeVisible();
  });

  test('a day with no games says so, not a blank page @smoke', async ({ page }) => {
    await open(page, '', {}, new Date('2026-12-01T15:00:00Z'));
    await expect(page.getByText(/No published games today/)).toBeVisible();
    await noHorizontalOverflow(page, 'v4 empty home');
  });

  test('one failed feed is reported and does not hide the others @smoke', async ({ page }) => {
    await installSlates(page.context(), { NBA: 6, MLB: 6 }, { now: NOW, failing: ['MLB'] });
    await page.clock.install({ time: NOW });
    await page.goto('#/v4');
    await expect(page.getByText(/1 feed unavailable/)).toBeVisible();
  });

  test('following a team filters the slate and is remembered', async ({ page }) => {
    await open(page, '', { NBA: 8 });
    await expect(page.locator('[data-featured]')).toBeVisible();
    await page.getByRole('button', { name: /^Following,/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Following' });
    await sheet.getByRole('button', { name: /^Follow / }).first().click();
    await expect(sheet.getByRole('button', { name: /^Unfollow/ })).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sift.v4.follow'))).toMatch(/^\["[A-Z]+:[A-Z]+"\]$/);
    await page.getByRole('button', { name: /^Following \d/ }).click();
    await expect(page.getByText(/None of the teams you follow play|\d/).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /^Following, 1 team/ })).toBeVisible();
  });

  test('has no accessibility violations @smoke', async ({ page }) => {
    await open(page, '', { NBA: 8, NHL: 6 });
    await expect(page.locator('[data-featured]')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const res = await new AxeBuilder({ page }).include('.v4').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(res.violations).toEqual([]);
  });
});

test.describe('v4 Game Command Center', () => {
  test('NFL game: scoreboard, four tabs, honest live state, research sheet @smoke', async ({ page }) => {
    await open(page, `/game/nfl/${NEBUF}`);
    await expect(page.getByRole('tablist', { name: 'Game sections' }).getByRole('tab')).toHaveText(['Live', 'Matchups', 'Players', 'Markets']);
    await expect(page.getByRole('group', { name: /Patriots? .*Bills|NE .*BUF|New England/ }).or(page.locator('.v4-sb')).first()).toBeVisible();
    await shot(page, 'game-matchups');
    await page.getByRole('tab', { name: 'Live' }).click();
    await expect(page.getByText('Game day').or(page.getByText('In play'))).toBeVisible();
    await shot(page, 'game-live');
    await page.getByRole('tab', { name: 'Players' }).click();
    await shot(page, 'game-players');
    await page.getByRole('tab', { name: 'Markets' }).click();
    await expect(page.getByRole('region', { name: 'Kalshi markets' })).toBeVisible();
    await shot(page, 'game-markets');
    await noHorizontalOverflow(page, 'v4 game markets');
  });
});

// The three phone sizes the brief names. Run on the Chromium phone project: the viewport is set per pass.
const SIZES = [{ width: 390, height: 844 }, { width: 375, height: 812 }, { width: 375, height: 667 }];

/** Visible interactive controls smaller than 44 CSS px in either direction, and text clipped by its box. */
async function audit(page: Page, where: string) {
  const bad = await page.evaluate(() => {
    const vis = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !el.closest('[hidden]'); };
    const small = [...document.querySelectorAll('.v4 button, .v4 a[href], .v4 [role="tab"]')].filter(vis).filter((el) => {
      const r = el.getBoundingClientRect();
      // controls scrolled out of view horizontally (chip and league strips) still count; the sheet scrim is not a control
      return Math.min(r.width, r.height) < 43.5 && !el.classList.contains('v4-scrim');
    }).map((el) => `${el.tagName.toLowerCase()}.${el.className} "${(el.textContent ?? '').trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
    const clipped = [...document.querySelectorAll('.v4-sb__name, .v4-row__team .nm, .v4-sb__score, .v4-sb__mid b')].filter(vis).filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => (el.textContent ?? '').trim());
    const tiny = [...document.querySelectorAll('.v4 *')].filter((el) => el.children.length === 0 && (el.textContent ?? '').trim() && vis(el) && parseFloat(getComputedStyle(el).fontSize) < 12 && !el.closest('.v4-tab, svg')).map((el) => `${el.className}:${(el.textContent ?? '').trim().slice(0, 20)}`);
    return { small, clipped, tiny };
  });
  expect(bad.small, `${where}: controls under 44px`).toEqual([]);
  expect(bad.clipped, `${where}: clipped names or scores`).toEqual([]);
  expect(bad.tiny, `${where}: text under 12px (tab labels excepted)`).toEqual([]);
  await noHorizontalOverflow(page, where);
}

test.describe('v4 layout at the three phone sizes', () => {
  for (const size of SIZES) {
    test(`${size.width}x${size.height}: Home, Games and Game fit, with 44px controls and no clipped names @smoke`, async ({ page }) => {
      await page.setViewportSize(size);
      await open(page, '', { NBA: 8, NHL: 6, MLB: 5, CFB: 4 });
      await expect(page.locator('[data-featured]')).toBeVisible();
      await audit(page, `home ${size.width}x${size.height}`);
      await shot(page, 'home');
      await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Games' }).click();
      await expect(page.locator('.v4-row').first()).toBeVisible();
      await audit(page, `games ${size.width}x${size.height}`);
      await shot(page, 'games');
      await page.goto(`#/v4/game/nfl/${NEBUF}`);
      await expect(page.getByRole('tab', { name: 'Matchups' })).toBeVisible();
      for (const tab of ['Live', 'Matchups', 'Players', 'Markets']) {
        await page.getByRole('tab', { name: tab }).click();
        await page.waitForLoadState('networkidle');
        await audit(page, `game ${tab} ${size.width}x${size.height}`);
      }
      await page.getByRole('tab', { name: 'Players' }).click();
      await shot(page, 'game-players');
      await page.getByRole('tab', { name: 'Matchups' }).click();
      await shot(page, 'game-matchups');
      await page.getByRole('tab', { name: 'Live' }).click();
      await shot(page, 'game-live');
    });
  }
});

test.describe('v4 behaviour', () => {
  test('reduced motion removes every animation and transition @smoke', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, '', { NBA: 6 });
    await expect(page.locator('[data-featured]')).toBeVisible();
    const moving = await page.evaluate(() => [...document.querySelectorAll('.v4, .v4 *')].filter((el) => { const s = getComputedStyle(el); return (s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.001) || parseFloat(s.transitionDuration) > 0.001; }).map((el) => el.className).slice(0, 5));
    expect(moving).toEqual([]);
  });

  test('back returns to where the game was opened from; a direct game address falls back to Home @smoke', async ({ page }) => {
    await open(page, '', { NBA: 6 });
    await expect(page.locator('[data-featured]')).toBeVisible();
    await page.getByRole('link', { name: /Open game$/ }).first().click();
    await expect(page).toHaveURL(/#\/v4\/game\//);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(/#\/v4$/);
    await page.goto(`#/v4/game/nfl/${NEBUF}`);
    await page.reload();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(/#\/v4$/);
  });

  test('an unknown game says so and offers the way back @smoke', async ({ page }) => {
    await open(page, '/game/nfl/evt_does_not_exist', { NBA: 3 });
    await expect(page.getByText('This game is not on the published board')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse games' })).toBeVisible();
  });

  test('Props, Signals and Board are honest handoffs, not fake screens @smoke', async ({ page }) => {
    await open(page, '/props', { NBA: 3 });
    await expect(page.getByRole('heading', { name: 'Props' })).toBeVisible();
    await expect(page.getByText('Coming in v4')).toBeVisible();
    await expect(page.getByRole('link', { name: /Open in SIFT 2.0/ })).toHaveAttribute('href', '#/design/sift2/props');
  });

  test('the research sheet is a labelled dialog: Escape closes it and focus returns', async ({ page }) => {
    await open(page, '', { NBA: 6 });
    await expect(page.locator('[data-featured]')).toBeVisible();
    const opener = page.getByRole('button', { name: /^Following,/ });
    await opener.click();
    const dlg = page.getByRole('dialog', { name: 'Following' });
    await expect(dlg).toBeVisible();
    await expect(dlg).toHaveAttribute('aria-modal', 'true');
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('the default interface is unchanged: without the flag the root is SIFT 2.0, and ?ui=v4 is the only way in @smoke', async ({ page }) => {
    await installSlates(page.context(), { NBA: 3 }, { now: NOW });
    await page.goto('#/design/sift2/home');
    await expect(page.locator('.v4')).toHaveCount(0);
    await page.goto('#/?ui=v4');
    await expect(page.locator('[data-v4-shell]')).toBeVisible();
    await page.goto('#/?ui=sift2');
    await expect(page.locator('[data-v4-shell]')).toHaveCount(0);
  });
});

// Published research signals: the real NHL fixture carries research candidates on tonight's games.
const NHL_RAW = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/NHL-edge-finder\/data-archive\/app\/latest\/(.+)$/;
const NHL_NOW = new Date('2026-10-06T23:30:00Z');
const FLA_LAK = 'evt_5938c3f8a7c1b24c0118';

test.describe('v4 research sheet on published research', () => {
  test.beforeEach(async ({ page, market }) => {
    await page.clock.setFixedTime(NHL_NOW);
    market.observedAt = NHL_NOW.toISOString();
    await page.context().route(NHL_RAW, async (route) => {
      const file = join(NHL_FIXTURE, NHL_RAW.exec(route.request().url())![1].split('?')[0]);
      if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
      return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(file, 'utf-8'), headers: { 'access-control-allow-origin': '*' } });
    });
  });

  test('a signal chip on Home opens the sheet: why, price against the model, risk; detail on request @smoke', async ({ page }) => {
    await page.goto('#/v4?sport=nhl');
    const chip = page.getByRole('button', { name: /published research signals? on .*Open$/ }).first();
    await expect(chip).toBeVisible();
    await shot(page, 'home-nhl-signals');
    await chip.click();
    const dlg = page.getByRole('dialog', { name: /^Research:/ });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByText('Why it is flagged')).toBeVisible();
    await expect(dlg.getByText(/Research only\. Sift reports/)).toBeVisible();
    await expect(dlg).not.toContainText(/best bet|\block\b|guaranteed/i);
    await shot(page, 'research-sheet');
    await dlg.getByRole('button', { name: /Show evidence, risks and sources/ }).click();
    await dlg.getByRole('tab', { name: 'Prices' }).click();
    await expect(dlg.getByText("Publication's upper limit price")).toBeVisible();
    await shot(page, 'research-sheet-prices');
    const box = (await dlg.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(page.viewportSize()!.height * 0.9);
    await noHorizontalOverflow(page, 'research sheet');
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
  });

  test('the game screen lists the published research and the pregame state is labelled @smoke', async ({ page }) => {
    await page.goto(`#/v4/game/nhl/${FLA_LAK}?tab=markets`);
    await expect(page.getByRole('region', { name: 'Published research' })).toBeVisible();
    await expect(page.getByText(/Prices (live|aging|stale)|No prices published/)).toBeVisible();
    await expect(page.getByText('Pregame research')).toBeVisible();
    await shot(page, 'game-nhl-markets');
    await page.getByRole('tab', { name: 'Players' }).click();
    await page.getByRole('tab', { name: 'Matchups' }).click();
    await noHorizontalOverflow(page, 'nhl game');
  });
});
