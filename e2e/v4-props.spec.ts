// SIFT v4 Props (src/v4/Props.tsx, PropDetail.tsx, PropSheet.tsx): the Prop Explorer, the player detail, the research sheet
// and Save, in real browsers over the bundled NFL publication (e2e/fixtures.ts) and the promoted-stat projection feed for
// ATL at NO (e2e/projectionDoc.ts). Run with V4_SHOTS=<dir> to also save screenshots of the real app.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, NEBUF, NHL_FIXTURE, noHorizontalOverflow, NOW, test } from './fixtures';
import { BANNED, GAME, OLAVE, serve } from './projectionDoc';
import { installSlates } from './slates';

test.use({ timezoneId: 'America/Chicago' });
const SHOTS = process.env.V4_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png` }); };

async function open(page: Page, path = '/props', now = NOW) {
  await page.clock.install({ time: now });
  await page.goto(`#/v4${path}`);
}
const rows = (page: Page) => page.locator('.v4-prow');
const tray = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('sift.researchTray.v1') ?? 'null'));

test.describe('v4 Prop Explorer', () => {
  test('lists the published NFL props player by player, with the Kalshi price beside the model @smoke', async ({ page }) => {
    await serve(page.context());
    await open(page);
    await expect(page.getByRole('heading', { name: 'Props', level: 1 })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Sport' }).getByRole('button', { name: /NFL/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page).first()).toBeVisible();
    expect(await rows(page).count()).toBeGreaterThan(5);
    const first = rows(page).first().getByRole('link');
    await expect(first).toHaveAttribute('aria-label', /Kalshi over .*Open player/);
    await expect(page.locator('.v4-prow .v4-kal').first()).toContainText('Kalshi');
    await expect(page.getByText(/Research only/).first()).toBeVisible();
    await expect(page.locator('main')).not.toContainText(BANNED);
    await noHorizontalOverflow(page, 'v4 props');
    await shot(page, 'props-explorer');
  });

  test('game, category and search narrow the list; clearing restores it @smoke', async ({ page }) => {
    await serve(page.context());
    await open(page);
    await expect(rows(page).first()).toBeVisible();
    const all = await page.getByRole('group', { name: 'Game' }).getByRole('button').count();
    expect(all).toBeGreaterThan(2);
    // a game
    await page.getByRole('group', { name: 'Game' }).getByRole('button').nth(1).click();
    await expect(page).toHaveURL(/game=evt_/);
    const inGame = await rows(page).count();
    expect(inGame).toBeGreaterThan(0);
    const names = await page.locator('.v4-prow__m').allTextContents();
    expect(new Set(names.map((n) => n.split('·')[1]?.trim().split(' ')[0])).size).toBeLessThanOrEqual(2);
    // a category
    await page.getByRole('group', { name: 'Prop category' }).getByRole('button', { name: /^Receiving/ }).click();
    await expect(page).toHaveURL(/cat=receiving/);
    for (const t of await page.locator('.v4-prow__n small').allTextContents()) expect(t).toMatch(/rec|long rec|rush\+rec|receptions/);
    // search
    await page.getByRole('button', { name: 'Search players' }).click();
    const input = page.getByRole('searchbox', { name: /Search players/ });
    await expect(input).toBeFocused();
    await input.fill('zzzz-nobody');
    await expect(page.getByText('No props match')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByText('No props match')).toHaveCount(0);
    expect(await rows(page).count()).toBeGreaterThan(inGame);
    await noHorizontalOverflow(page, 'v4 props filtered');
  });

  test('search finds a player by name and the ranking sheet changes the order @smoke', async ({ page }) => {
    await serve(page.context());
    await open(page);
    await expect(rows(page).first()).toBeVisible();
    await page.getByRole('button', { name: 'Search players' }).click();
    await page.getByRole('searchbox', { name: /Search players/ }).fill('allen');
    await expect(rows(page).first()).toContainText('Allen');
    for (const t of await page.locator('.v4-prow__t > b').allTextContents()) expect(t.toLowerCase()).toContain('allen');
    await page.getByRole('button', { name: 'Clear search' }).click();
    const opener = page.getByRole('button', { name: /^Rank props by/ });
    await opener.click();
    const dlg = page.getByRole('dialog', { name: 'Rank props' });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('radio')).toHaveCount(3);
    await dlg.getByRole('radio', { name: /Projection vs line/ }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page).toHaveURL(/sort=gap/);
    await expect(page.getByRole('button', { name: /Rank props by: Projection vs line/ })).toBeFocused();
    await expect(rows(page).first()).toBeVisible();
  });

  test('MLB and NHL are said to carry props on each game, with no invented projection @smoke', async ({ page }) => {
    await installSlates(page.context(), { MLB: 4 }, { now: NOW });
    await open(page, '/props?sport=mlb');
    await expect(page.getByText('MLB props live on each game')).toBeVisible();
    await expect(page.getByText(/no simulated player projection/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search players' })).toHaveCount(0);
    await noHorizontalOverflow(page, 'v4 props mlb');
  });

  test('an unreachable publication says so, not "no props" @smoke', async ({ page, errors }) => {
    errors.allow(/status of 500/);
    await page.context().route(/raw\.githubusercontent\.com\/chmoses98\/nfl-edge-finder\//, (r) => r.fulfill({ status: 500, body: 'x', headers: { 'access-control-allow-origin': '*' } }));
    await page.context().route(/\/data\/nfl\/app\/latest\//, (r) => r.fulfill({ status: 500, body: 'x' }));
    await open(page);
    await expect(page.getByRole('alert')).toContainText(/unavailable/i);
    await expect(page.getByRole('alert')).toContainText(/not a no-props verdict/);
  });

  test('has no accessibility violations @smoke', async ({ page }) => {
    await serve(page.context());
    await open(page);
    await expect(rows(page).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    const res = await new AxeBuilder({ page }).include('.v4').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(res.violations).toEqual([]);
  });
});

test.describe('v4 Player detail', () => {
  const OLAVE_URL = `/props/nfl/${GAME}/${OLAVE}?stat=receptions`;

  test('shows the one projection, the Kalshi ladder and the model on the same side, fee included @smoke', async ({ page }) => {
    await serve(page.context());
    await open(page, OLAVE_URL);
    await expect(page.getByRole('heading', { name: 'Chris Olave', level: 1 })).toBeVisible();
    // the one selected projection (7.3), never the established simulation's 6.3
    await expect(page.locator('.v4-tile--model')).toContainText('7.3');
    await expect(page.locator('main')).not.toContainText('6.3');
    await expect(page.locator('.v4-tile--mkt')).toContainText('Kalshi line');
    const ladder = page.getByRole('region', { name: /Receptions/ });
    await expect(ladder.locator('.v4-lad__row').first()).toBeVisible();
    expect(await ladder.locator('.v4-lad__row').count()).toBeGreaterThan(1);
    await expect(ladder.locator('.v4-lad__row.is-main')).toContainText('At the line');
    // a model probability on the main rung, and the break-even after fee beside the price
    await expect(ladder.locator('.v4-lad__row.is-main .v4-lad__m')).toContainText('%');
    await expect(ladder.locator('.v4-lad__row.is-main small')).toContainText(/BE \d+%/);
    // the other side of the same contracts
    await ladder.getByRole('button', { name: 'Under' }).click();
    await expect(page).toHaveURL(/side=under/);
    await expect(ladder.locator('.v4-lad__head')).toContainText('Kalshi No');
    await expect(ladder.locator('.v4-lad__row.is-main .v4-lad__m')).toContainText('%');
    await expect(page.locator('main')).not.toContainText(BANNED);
    await expect(page.locator('main')).not.toContainText(/recommend(ed)? bet|best bet|\block\b/i);
    await noHorizontalOverflow(page, 'v4 player detail');
    await shot(page, 'props-detail');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/props-detail-full-${page.viewportSize()!.width}.png`, fullPage: true });
  });

  test('the ladder opens on the main line and two rungs either side; every line is one tap away @smoke', async ({ page }) => {
    await serve(page.context());
    await open(page, OLAVE_URL);
    const ladder = page.getByRole('region', { name: /Receptions/ });
    await expect(ladder.locator('.v4-lad__row')).toHaveCount(5);
    await expect(ladder.locator('.v4-lad__row.is-main')).toBeVisible();
    await ladder.getByRole('button', { name: /^Show all \d+ lines/ }).click();
    expect(await ladder.locator('.v4-lad__row').count()).toBeGreaterThan(7);
    await ladder.getByRole('button', { name: 'Show fewer lines' }).click();
    await expect(ladder.locator('.v4-lad__row')).toHaveCount(5);
  });

  test('a gap is an investigated signal only where the publication holds one, else an unexplained difference; missing projections say why @smoke', async ({ page }) => {
    await serve(page.context());
    await open(page, OLAVE_URL);
    await expect(page.locator('.v4-diff').first()).toBeVisible();
    const tag = await page.locator('.v4-diff__tag').first().textContent();
    expect(tag).toMatch(/Unexplained difference|Investigated research signal|Model and market are close|Price not current|No projection to compare|No price to compare/);
    // without a feed the promoted stat is withheld: a reason, no number, no comparison
    const p2 = await page.context().newPage();
    await p2.clock.install({ time: NOW });
    await p2.context().route(/projections\/nfl\/latest\.json/, (r) => r.fulfill({ status: 404, body: 'x', headers: { 'access-control-allow-origin': '*' } }));
    await p2.goto(`#/v4${OLAVE_URL}`);
    await expect(p2.locator('.v4-tile--model b')).toHaveText(/Withheld|—/);
    await expect(p2.locator('.v4-diff__tag').first()).toHaveText(/No projection to compare|Price not current/);
    await expect(p2.locator('main')).toContainText(/Projection withheld|No simulation row|simulates no distribution/);
    await expect(p2.locator('.v4-lad__row.is-main .v4-lad__m')).toHaveText('—');
  });

  test('a stale Kalshi price is never presented as current @smoke', async ({ page }) => {
    await serve(page.context());
    // the publication's own captures are hours older than "now": with no newer live quote the prices are context only
    await page.context().route(/relay\.sift\.invalid/, (r) => r.abort());
    await open(page, OLAVE_URL, new Date(NOW.getTime() + 20 * 3600_000));
    await expect(page.locator('.v4-lad__q')).toContainText(/stale|no capture time|No Kalshi quote/i);
    await expect(page.locator('.v4-lad__row.is-main .v4-lad__d')).toHaveText('—');
    await expect(page.locator('.v4-lad__p.is-stale').first()).toBeVisible();
  });

  test('Research details opens the sheet; Save writes the research tray and survives a reload @smoke', async ({ page }) => {
    await serve(page.context());
    await open(page, OLAVE_URL);
    await expect(page.locator('.v4-tile--model')).toBeVisible();
    await page.getByRole('button', { name: 'Research details', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: /^Research:/ });
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText(/Research only|published signal/);
    await expect(dlg).toContainText(/does not recommend a bet/);
    await page.waitForTimeout(500); // the sheet rises over 0.34 s: capture it settled
    await shot(page, 'props-research-sheet');
    const save = dlg.getByRole('button', { name: /^Save to My Board/ });
    await save.click();
    await expect(dlg.getByRole('button', { name: /^Remove from My Board/ })).toHaveAttribute('aria-pressed', 'true');
    const t = await tray(page);
    expect(t.tray.items.length).toBe(1);
    expect(t.tray.items[0].ref_kind).toBe('MARKET');
    expect(JSON.stringify(t.labels)).toMatch(/Chris Olave receptions/);
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    // the header control shows saved, and the tray survives a reload (same store as every interface)
    await page.reload();
    await expect(page.getByRole('button', { name: /^Remove from My Board/ }).first()).toBeVisible();
    // toggling off removes the item
    await page.getByRole('button', { name: /^Remove from My Board/ }).first().click();
    expect((await tray(page)).tray.items.length).toBe(0);
  });

  test('after kickoff nothing new is saved as pregame research @smoke', async ({ page }) => {
    await serve(page.context());
    await open(page, OLAVE_URL, new Date('2026-10-06T03:00:00Z'));
    await expect(page.getByRole('heading', { name: 'Chris Olave', level: 1 })).toBeVisible();
    const save = page.getByRole('button', { name: /cannot be saved after kickoff/ });
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText(/Pregame research · frozen at kickoff/).first()).toBeVisible();
    // an aria-disabled control still takes a tap: it explains itself and saves nothing
    await save.click({ force: true });
    await expect(page.getByRole('status').filter({ hasText: /can’t be saved after kickoff/ })).toBeVisible();
    expect((await tray(page))?.tray?.items?.length ?? 0).toBe(0);
  });

  test('every control is at least 44px and nothing clips at the three phone sizes @smoke', async ({ page }) => {
    await serve(page.context());
    for (const size of [{ width: 390, height: 844 }, { width: 375, height: 812 }, { width: 375, height: 667 }]) {
      await page.setViewportSize(size);
      for (const path of ['/props', OLAVE_URL]) {
        await open(page, path);
        await expect(page.locator('.v4-prow, .v4-tile--model').first()).toBeVisible();
        const bad = await page.evaluate(() => {
          const vis = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
          const small = [...document.querySelectorAll('.v4 button, .v4 a[href], .v4 input')].filter(vis).filter((el) => Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height) < 43.5).map((el) => `${el.tagName}.${el.className} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
          const clipped = [...document.querySelectorAll('.v4-prow__t > b, .v4-prow__n b, .v4-tile b, .v4-lad__l b, .v4-h1')].filter(vis).filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => (el.textContent ?? '').trim());
          const tiny = [...document.querySelectorAll('.v4 *')].filter((el) => el.children.length === 0 && (el.textContent ?? '').trim() && vis(el) && parseFloat(getComputedStyle(el).fontSize) < 12 && !el.closest('.v4-tab, svg')).map((el) => `${el.className}:${(el.textContent ?? '').trim().slice(0, 20)}`);
          return { small, clipped, tiny };
        });
        expect(bad.small, `${path} ${size.width}x${size.height}: controls under 44px`).toEqual([]);
        expect(bad.clipped, `${path} ${size.width}x${size.height}: clipped text`).toEqual([]);
        expect(bad.tiny, `${path} ${size.width}x${size.height}: text under 12px`).toEqual([]);
        await noHorizontalOverflow(page, `${path} ${size.width}x${size.height}`);
        await shot(page, path === '/props' ? 'props-explorer' : 'props-detail');
      }
    }
  });

  test('an unknown player says so and offers the way back; an unreadable game is not "no props" @smoke', async ({ page }) => {
    await serve(page.context());
    await open(page, `/props/nfl/${GAME}/prt_nobody`);
    await expect(page.getByText('No published props for this player')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to props' })).toBeVisible();
    await open(page, `/props/nfl/evt_missing/${OLAVE}`);
    await expect(page.getByRole('alert')).toContainText(/unavailable/);
    await expect(page.getByRole('alert')).toContainText(/not a no-props verdict/);
  });

  test('has no accessibility violations @smoke', async ({ page }) => {
    await serve(page.context());
    await open(page, OLAVE_URL);
    await expect(page.locator('.v4-tile--model')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const res = await new AxeBuilder({ page }).include('.v4').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(res.violations).toEqual([]);
  });
});

test.describe('v4 Props navigation', () => {
  test('Props row -> player detail -> back keeps the filters; the tab bar stays on Props @smoke', async ({ page }) => {
    await serve(page.context());
    await open(page, '/props?cat=receiving');
    await expect(rows(page).first()).toBeVisible();
    await rows(page).first().getByRole('link').click();
    await expect(page).toHaveURL(/#\/v4\/props\/nfl\/evt_[^/]+\/prt_[^/?]+/);
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Props' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(/cat=receiving/);
    await expect(page.getByRole('group', { name: 'Prop category' }).getByRole('button', { name: /^Receiving/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('Game Players -> player detail keeps the game and player; All props for this game opens the explorer on it @smoke', async ({ page }) => {
    await serve(page.context());
    await open(page, `/game/nfl/${NEBUF}?tab=players`);
    await expect(page.locator('.v4-prow').first()).toBeVisible();
    await page.locator('.v4-prow').first().getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`#/v4/props/nfl/${NEBUF}/prt_`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Game', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#/v4/game/nfl/${NEBUF}\\?tab=players`));
    await page.getByRole('link', { name: 'All props for this game' }).click();
    await expect(page).toHaveURL(new RegExp(`#/v4/props\\?game=${NEBUF}`));
    await expect(page.getByRole('group', { name: 'Game' }).getByRole('button', { pressed: true })).not.toContainText('All games');
  });

  test('Home -> Props opens the explorer for the featured game @smoke', async ({ page }) => {
    await installSlates(page.context(), { NBA: 3 }, { now: NOW });
    await open(page, '');
    await expect(page.locator('[data-featured]')).toBeVisible();
    const link = page.getByRole('link', { name: /Player props/ }).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/#\/v4\/props/);
    await expect(page.getByRole('heading', { name: 'Props', level: 1 })).toBeVisible();
  });
});

// Published research signals: the real NHL fixture lists game props on its game pages.
const NHL_RAW = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/NHL-edge-finder\/data-archive\/app\/latest\/(.+)$/;
test('NHL props point at the game page markets @smoke', async ({ page, market }) => {
  await page.clock.setFixedTime(new Date('2026-10-06T23:30:00Z'));
  market.observedAt = '2026-10-06T23:30:00Z';
  await page.context().route(NHL_RAW, async (route) => {
    const file = join(NHL_FIXTURE, NHL_RAW.exec(route.request().url())![1].split('?')[0]);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(file, 'utf-8'), headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('#/v4/props?sport=nhl');
  await expect(page.getByText('NHL props live on each game')).toBeVisible();
  const link = page.getByRole('link', { name: /@/ }).first();
  await expect(link).toBeVisible();
  await expect(link).toContainText(/player market/);
  await link.click();
  await expect(page).toHaveURL(/#\/v4\/game\/nhl\/.*tab=markets/);
});
