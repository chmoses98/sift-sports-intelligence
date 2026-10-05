// Automated accessibility (axe-core, WCAG 2.0/2.1 A + AA rules) on Sift's high-value screens. The
// gate is: no CRITICAL or SERIOUS violation caused by the app. Moderate/minor findings are attached
// to the report for review. Exceptions are listed below with their reason; there are none silently.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { ALLEN, BUF, expect, ML_ID, NEBUF, NOW, test } from './fixtures';

/** Documented exceptions (rule id -> why). Keep empty unless a finding is a tool false positive. */
const EXCEPTIONS: Record<string, string> = {};

const SCREENS: [string, string, (p: Page) => Promise<unknown>][] = [
  ['home', './#/', (p) => p.getByRole('heading', { name: 'Today on Sift' }).waitFor()],
  ['nfl-home', './#/nfl', (p) => p.getByText('RESEARCH SNAPSHOT').waitFor()],
  ['slate', './#/nfl/slate', (p) => p.getByRole('heading', { name: /2026 REG Week 4/i }).waitFor()],
  ['game', `./#/nfl/game/${NEBUF}`, (p) => p.getByRole('heading', { name: 'Model Read' }).waitFor()],
  ['game-script', `./#/nfl/game/${NEBUF}?tab=script`, (p) => p.getByRole('heading', { name: 'Choose a script' }).waitFor()],
  ['game-matchup', `./#/nfl/game/${NEBUF}?tab=matchup`, (p) => p.getByRole('heading', { name: 'How they match up' }).waitFor()],
  ['team', `./#/nfl/team/${BUF}`, (p) => p.getByRole('heading', { name: /Buffalo Bills/i, level: 1 }).waitFor()],
  ['metric', `./#/nfl/metric/met_nfl.adj_def_db_epa?team=${BUF}`, (p) => p.getByText('League median').waitFor()],
  ['ranking', `./#/nfl/ranking/rnk_${'x'}`, async () => {}],
  ['player', `./#/nfl/player/${ALLEN}`, (p) => p.getByRole('heading', { name: 'Markets vs projection' }).waitFor()],
  ['market', `./#/nfl/market/${ML_ID}?event=${NEBUF}`, (p) => p.getByRole('heading', { name: 'Model evidence' }).waitFor()],
  ['packet', `./#/packet?sport=nfl&scope=GAME&event=${NEBUF}`, (p) => p.getByRole('button', { name: 'COPY FOR CHATGPT' }).waitFor({ timeout: 60_000 })],
  ['status', './#/status', (p) => p.getByRole('heading', { name: 'Live market quotes' }).waitFor()],
];

async function scan(page: Page, name: string) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(Object.keys(EXCEPTIONS)).analyze();
  const blocking = res.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  const other = res.violations.filter((v) => !blocking.includes(v));
  const fmt = (vs: typeof res.violations) => vs.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}x) e.g. ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`).join('\n');
  if (other.length) await test.info().attach(`${name}-axe-moderate.txt`, { body: fmt(other), contentType: 'text/plain' });
  expect(blocking.length, `${name}: critical/serious accessibility violations\n${fmt(blocking)}`).toBe(0);
}

test.beforeEach(async ({ page }) => page.clock.install({ time: NOW }));

for (const [name, url, ready] of SCREENS) {
  if (name === 'ranking') continue; // reached by navigation below (its id comes from the metric screen)
  test(`axe: ${name} @a11y`, async ({ page }) => {
    await page.goto(url);
    await ready(page);
    await scan(page, name);
  });
}

test('axe: league ranking and the open research tray @a11y', async ({ page }) => {
  await page.goto(`./#/nfl/metric/met_nfl.adj_def_db_epa?team=${BUF}`);
  await page.getByRole('link', { name: /Full NFL ranking/ }).click();
  await expect(page.locator('.rankbars__row')).toHaveCount(32);
  await scan(page, 'ranking');
  await page.goto(`./#/nfl/team/${BUF}`);
  await page.getByRole('button', { name: /^Save .* to research tray$/ }).first().click();
  await page.locator('.bottombar__tray, .traybtn').filter({ visible: true }).first().click();
  await expect(page.getByRole('complementary', { name: 'Research tray' })).toBeVisible();
  await scan(page, 'tray');
});

// Loading states are scanned on purpose, not by luck of timing. CI once caught the home screen
// mid-load (two skeletons labelled with aria-label on a role-less <div>: serious
// aria-prohibited-attr, reported against :root because the nodes unmounted during the scan). Holding
// the research reads keeps every skeleton on screen for the whole scan, under the same gate.
const LOADING: [string, string][] = [
  ['home', './#/'],
  ['nfl-home', './#/nfl'],
  ['game', `./#/nfl/game/${NEBUF}`],
  ['packet', `./#/packet?sport=nfl&scope=GAME&event=${NEBUF}`],
];

for (const [name, url] of LOADING) {
  test(`axe: ${name} while loading @a11y`, async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/data/nfl/**', async (route) => {
      await held;
      await route.fallback();
    });
    await page.goto(url);
    const skeletons = page.locator('.skel');
    await expect(skeletons.first()).toBeVisible();
    await scan(page, `${name}-loading`);
    await expect(skeletons.first()).toBeVisible(); // the scan really covered the loading state
    // Each placeholder is announced as a status with text, never a labelled generic.
    await expect(page.getByRole('status').filter({ hasText: 'Loading…' }).first()).toBeAttached();
    release();
  });
}
