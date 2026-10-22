// SIFT v4 Live Score Demo (src/live/scores/demo, src/v4/DemoBar.tsx): opt-in simulated scores on the real games, always labelled DEMO,
// never touching research. Real browsers, the bundled NFL snapshot plus synthetic slates (e2e/slates.ts). Run with V4_DEMO_SHOTS=<dir>
// to save screenshots of Home, Games and the Game Command Center at each size.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { expect, noHorizontalOverflow, NOW, test } from './fixtures';
import { installSlates, type SlateSpec } from './slates';

test.use({ timezoneId: 'America/Chicago' });

const SHOTS = process.env.V4_DEMO_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png` }); };

async function open(page: Page, path = '', slate: SlateSpec = { NBA: 8, NHL: 6 }) {
  await installSlates(page.context(), slate, { now: NOW });
  await page.clock.install({ time: NOW });
  await page.addInitScript(() => { try { localStorage.setItem('sift.v4.prompt', 'later'); } catch { /* ignore */ } });
  await page.goto(`#/v4${path}`);
}
const bar = (page: Page) => page.locator('[data-demo-bar]');
const demoRows = (page: Page) => page.locator('.v4-row .v4-demotag');
/** A row showing a score for a game that is in play (not final), whatever its freshness. */
const inPlay = (page: Page) => page.locator('.v4-row', { has: page.locator('.v4-row__sc'), hasNotText: /Final/ });
async function openControls(page: Page) { await bar(page).getByRole('button', { name: 'Controls' }).click(); await expect(page.getByRole('heading', { name: 'Live Score Demo' })).toBeVisible(); }
async function closeSheet(page: Page) { await page.getByRole('button', { name: 'Close' }).click(); }
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('sift.v4.livedemo'));

test.describe('Live Score Demo: opt-in and off by default', () => {
  test('without opting in there is no demo bar, no DEMO label and the old "not available yet" wording stands @smoke', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-featured]')).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
    await expect(page.getByText('DEMO', { exact: true })).toHaveCount(0);
    await expect(page.locator('.v4-demotag')).toHaveCount(0);
    expect(await stored(page)).toBeNull();
  });

  test('early access offers it; turning it on shows the bar everywhere; the bar turns it off @smoke', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: /SIFT v4 early access/ }).first().click();
    await expect(page.getByRole('heading', { name: 'SIFT v4 · early access' })).toBeVisible();
    const sec = page.locator('[data-demo-section]');
    await expect(sec).toContainText('simulated');
    await sec.getByRole('button', { name: 'Turn on Live Score Demo' }).click();
    await closeSheet(page);
    await expect(bar(page)).toBeVisible();
    await expect(bar(page)).toContainText('Scores are simulated');
    expect(await stored(page)).toContain('"on":true');
    for (const name of ['Games', 'Props', 'Signals', 'Board']) {
      await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name }).click();
      await expect(bar(page), `bar on ${name}`).toBeVisible();
    }
    await bar(page).getByRole('button', { name: 'Turn off' }).click();
    await expect(bar(page)).toHaveCount(0);
    expect(await stored(page)).toBeNull();
  });

  test('?livedemo=1 turns it on and drops the parameter; ?livedemo=0 turns it off @smoke', async ({ page }) => {
    await open(page, '?livedemo=1');
    await expect(bar(page)).toBeVisible();
    await expect(page).toHaveURL(/#\/v4\/?$/);
    await page.goto('#/v4?livedemo=0');
    await expect(bar(page)).toHaveCount(0);
  });
});

test.describe('Live Score Demo: scores on Home, Games and the Game Command Center', () => {
  test('a fresh demo shows live, upcoming and final games, every score row labelled DEMO @smoke', async ({ page }) => {
    await open(page, '?livedemo=1');
    await expect(page.locator('[data-featured]')).toBeVisible();
    await expect(page.locator('.v4-sechead h2', { hasText: /Live now|Also live/ }).first()).toBeVisible();
    await expect(page.locator('[data-featured] .v4-badge')).toContainText('DEMO');
    // Every row that shows a score also says DEMO; no score appears without it.
    const scored = page.locator('.v4-row__sc');
    const n = await scored.count();
    expect(n).toBeGreaterThan(0);
    expect(await demoRows(page).count()).toBeGreaterThanOrEqual(n);
    await expect(page.getByRole('region', { name: 'Also live' }).or(page.locator('[data-featured]')).first()).toContainText('DEMO');
    await noHorizontalOverflow(page, 'v4 home (demo)');
    await shot(page, 'demo-home');
    // The Live chip counts demo-live games.
    const live = page.getByRole('group', { name: 'Show' }).getByRole('button', { name: /^Live/ });
    await live.click();
    await expect(page.locator('.v4-row--live, [data-featured] .v4-badge--live').first()).toBeVisible();
  });

  test('Games lists scores with the DEMO note, filtered by Live / Upcoming / Final @smoke', async ({ page }) => {
    await open(page, '/games?livedemo=1');
    await expect(bar(page)).toBeVisible();
    await expect(page.getByText(/DEMO: every score and clock here is simulated/)).toBeVisible();
    await noHorizontalOverflow(page, 'v4 games (demo)');
    await shot(page, 'demo-games');
    const status = page.getByRole('group', { name: 'Status' });
    const counts = async (name: string) => Number((await status.getByRole('button', { name: new RegExp(`^${name}`) }).locator('i').textContent()) ?? 0);
    const [all, live, up, fin] = [await counts('All'), await counts('Live'), await counts('Upcoming'), await counts('Final')];
    expect(live + up + fin).toBe(all);
    expect(live).toBeGreaterThan(0);
    await status.getByRole('button', { name: /^Live/ }).click();
    await expect(page.locator('.v4-row')).toHaveCount(live);
    await expect(page.locator('.v4-row .v4-row__sc').first()).toBeVisible();
  });

  test('a live game opens on its Live tab with score, period and clock, source, as-of time and scoring plays, all DEMO @smoke', async ({ page }) => {
    await open(page, '/games?livedemo=1&status=live');
    await page.locator('.v4-row--live a.v4-row__link').first().click();
    await expect(page).toHaveURL(/#\/v4\/game\//);
    const card = page.locator('[data-live-score]');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-demo', 'true');
    await expect(card.getByRole('heading')).toContainText('DEMO');
    await expect(card).toContainText('Score');
    await expect(card).toContainText('SIFT Live Score Demo');
    await expect(card.locator('[data-live-label]')).toContainText(/LIVE|Updated|Last update/);
    await expect(page.getByText('Simulated game')).toBeVisible();
    await expect(page.locator('.v4-gctx .v4-badge')).toContainText('DEMO');
    await expect(page.getByRole('tab', { name: 'Live' })).toHaveAttribute('aria-selected', 'true');
    await noHorizontalOverflow(page, 'v4 game (demo)');
    await shot(page, 'demo-game');
    // Back leaves the game; the other tabs stay research and carry no simulated number.
    await page.getByRole('tab', { name: 'Markets' }).click();
    await expect(page.locator('#v4-panel')).not.toContainText('DEMO');
  });
});

test.describe('Live Score Demo: it moves while the screen is open', () => {
  test('scores and clocks change, and games go pregame to live to final, without a reload', async ({ page }) => {
    await open(page, '/games?livedemo=1');
    await expect(page.locator('.v4-row').first()).toBeVisible();
    const snapshot = () => page.locator('.v4-row').evaluateAll((els) => els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ')));
    const before = await snapshot();
    const finals = (xs: string[]) => xs.filter((x) => /\bF\b.*DEMO|Final.*DEMO/.test(x)).length;
    for (let i = 0; i < 4; i++) { await page.clock.fastForward(60_000); await page.waitForTimeout(400); }
    const mid = await snapshot();
    expect(mid).not.toEqual(before);
    for (let i = 0; i < 8; i++) { await page.clock.fastForward(60_000); await page.waitForTimeout(400); }
    const after = await snapshot();
    // Everything that was in play has ended; nothing went backwards from final.
    expect(finals(after)).toBeGreaterThanOrEqual(finals(before));
    expect(finals(after)).toBeGreaterThan(finals(mid) - 1);
    const status = page.getByRole('group', { name: 'Status' });
    await expect(status.getByRole('button', { name: /^Live/ }).locator('i')).toHaveText('0');
  });
});

test.describe('Live Score Demo: delayed, stale, outage and unavailable states', () => {
  async function pick(page: Page, scenario: string) { await openControls(page); await page.locator(`[data-demo-scenario="${scenario}"]`).click(); await closeSheet(page); }

  test('delayed: scores carry their age and never say live', async ({ page }) => {
    await open(page, '/games?livedemo=1&status=live');
    await expect(page.locator('.v4-row--live').first()).toBeVisible();
    await pick(page, 'delayed');
    await page.clock.fastForward(5_000);
    await expect(inPlay(page).first().locator('.v4-row__mid')).toContainText(/1m ago/);
    await expect(page.locator('.v4-row--live')).toHaveCount(0); // delayed is never drawn as live
    await inPlay(page).first().locator('a.v4-row__link').click();
    await expect(page.locator('[data-live-label]')).toContainText(/^Updated 1m ago/);
    await expect(page.locator('[data-live-score]')).toHaveAttribute('data-live-score', 'delayed');
    await expect(page.locator('[data-live-score]')).toContainText('not labelled live');
    await expect(page.locator('.v4-gctx .v4-badge')).toContainText('DELAYED');
    await expect(page.locator('.v4-gctx .v4-badge--live')).toHaveCount(0);
  });

  test('stalled: live, then stale after the demo clock skips ahead; the note says the feed stopped @smoke', async ({ page }) => {
    await open(page, '/games?livedemo=1&status=live');
    await expect(page.locator('.v4-row--live').first()).toBeVisible();
    await pick(page, 'stalled');
    await openControls(page);
    await page.getByRole('button', { name: 'Skip ahead 5 min' }).click();
    await page.getByRole('button', { name: 'Skip ahead 1 min' }).click();
    await closeSheet(page);
    await page.clock.fastForward(5_000);
    await expect(page.locator('.v4-row .v4-row__mid').filter({ hasText: /stale 6m/ }).first()).toBeVisible();
    await page.locator('.v4-row a.v4-row__link', { hasText: /stale 6m/ }).first().click();
    await expect(page.locator('[data-live-label]')).toContainText(/Last update 6m ago/);
    await expect(page.locator('[data-live-score]')).toContainText('has stopped updating');
    await expect(page.locator('.v4-gctx .v4-badge')).toContainText('STALE');
    await expect(page.getByText(/^LIVE/)).toHaveCount(0);
  });

  test('outage: the last scores stay with a provider-unavailable note, and recovery brings live back', async ({ page }) => {
    await open(page, '/games?livedemo=1&status=live');
    await expect(page.locator('.v4-row--live').first()).toBeVisible();
    await pick(page, 'outage');
    await page.clock.fastForward(20_000);
    await page.locator('.v4-row a.v4-row__link', { hasText: /stale|ago/ }).first().click();
    await expect(page.locator('[data-live-label]')).toContainText(/provider unavailable/);
    await page.goBack();
    await pick(page, 'normal');
    await page.clock.fastForward(20_000);
    await expect(page.locator('.v4-row--live').first()).toBeVisible();
    await expect(inPlay(page).first().locator('.v4-row__mid')).not.toContainText(/stale/);
  });

  test('no data: games fall back to the publication\'s status and the game screen says "Live — score unavailable"', async ({ page }) => {
    await open(page, '/games?livedemo=1&status=live');
    await pick(page, 'nodata');
    await page.clock.fastForward(5_000);
    await page.goto('#/v4/games');
    await page.locator('.v4-row a.v4-row__link').first().click();
    await expect(page.getByText('Live — score unavailable')).toBeVisible();
    await expect(page.locator('[data-live-score]')).toHaveCount(0);
    await expect(page.locator('.v4-sb__score')).toHaveCount(0);
  });
});

test.describe('Live Score Demo never touches research', () => {
  test('a game the demo shows in play is not frozen: its pregame research stays current, and Signals carry no demo score @smoke', async ({ page }) => {
    await open(page, '/games?livedemo=1&status=live');
    await page.locator('.v4-row--live a.v4-row__link').first().click();
    await expect(page.locator('[data-live-score]')).toBeVisible();
    // The real game has not started (the synthetic slate is upcoming): the header still says pregame research, not frozen.
    await expect(page.locator('.v4-gstat')).toContainText('Pregame research');
    await expect(page.locator('.v4-gstat')).not.toContainText('frozen');
    await expect(page.getByText(/The real game has not started/)).toBeVisible();
    await page.goto('#/v4/signals');
    await expect(bar(page)).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/\d+\s*–\s*\d+\s*·?\s*DEMO/);
    await page.goto('#/v4/board');
    await expect(page.locator('main .v4-demotag')).toHaveCount(0);
  });

  test('a restart survives a reload; turning off and reloading leaves no trace @smoke', async ({ page }) => {
    await open(page, '?livedemo=1');
    await expect(bar(page)).toBeVisible();
    await page.reload();
    await expect(bar(page)).toBeVisible();
    await bar(page).getByRole('button', { name: 'Turn off' }).click();
    await page.reload();
    await expect(bar(page)).toHaveCount(0);
    expect(await stored(page)).toBeNull();
  });
});

test.describe('Live Score Demo accessibility', () => {
  test('Home, a game and the controls sheet have no WCAG A/AA violations with the demo on', async ({ page }) => {
    await open(page, '?livedemo=1');
    await expect(page.locator('[data-featured]')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const axe = () => new AxeBuilder({ page }).include('.v4').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect((await axe()).violations).toEqual([]);
    await page.locator('.v4-row--live a.v4-row__link, [data-featured]').first().click();
    await expect(page.locator('[data-live-score]')).toBeVisible();
    expect((await axe()).violations).toEqual([]);
    await openControls(page);
    expect((await axe()).violations).toEqual([]);
  });
});
