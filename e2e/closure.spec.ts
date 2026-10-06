// Owner-review closure regressions on the real publication: position-aware usage, rankings not
// percentiles anywhere in the research UI, "Matchup Context" instead of "Against whom", and the
// raw-vs-opponent-adjusted comparison.
import type { Page } from '@playwright/test';
import { ALLEN, BUF, expect, ML_ID, NEBUF, NOW, test } from './fixtures';

const NE = 'prt_3d9358b1e2ac7256767d';
const COOK = 'prt_c4d635de928fd38b27a7'; // RB
const SHAKIR = 'prt_3ae1a23ecb6d2cfe7295'; // WR
const KINCAID = 'prt_0b25c756b147b1d41458'; // TE

test.beforeEach(async ({ page }) => page.clock.install({ time: NOW }));

async function usage(page: Page, id: string) {
  await page.goto(`./#/nfl/player/${id}`);
  const sec = page.locator('section, .stratum').filter({ has: page.getByRole('heading', { name: 'Usage & Role', exact: true }) }).first();
  await expect(sec).toBeVisible();
  return sec;
}

test('a QB page never shows receiving usage (Josh Allen has a published 0.98% target share)', async ({ page }) => {
  const sec = await usage(page, ALLEN);
  await expect(sec.getByText('Carry share', { exact: true })).toBeVisible();
  await expect(sec.getByText(/target share|reception|receiving/i)).toHaveCount(0);
});

test('RB usage still renders rushing and receiving shares', async ({ page }) => {
  const sec = await usage(page, COOK);
  await expect(sec.getByText('Carry share', { exact: true })).toBeVisible();
  await expect(sec.getByText('Target share', { exact: true })).toBeVisible();
});

test('WR usage renders target share and hides a token carry share', async ({ page }) => {
  const sec = await usage(page, SHAKIR);
  await expect(sec.getByText('Target share', { exact: true })).toBeVisible();
  await expect(sec.getByText('Carry share', { exact: true })).toHaveCount(0);
});

test('TE usage renders target share', async ({ page }) => {
  const sec = await usage(page, KINCAID);
  await expect(sec.getByText('Target share', { exact: true })).toBeVisible();
});

const SCREENS: [string, string, (p: Page) => Promise<unknown>][] = [
  ['home', './#/', (p) => p.getByRole('heading', { name: 'Today on Sift' }).waitFor()],
  ['nfl-home', './#/nfl', (p) => p.getByRole('heading', { name: 'Script Outlook' }).waitFor()],
  ['game', `./#/nfl/game/${NEBUF}`, (p) => p.getByRole('heading', { name: 'What Matters' }).waitFor()],
  ['game-matchup', `./#/nfl/game/${NEBUF}?tab=matchup`, (p) => p.getByRole('heading', { name: 'Unit by unit' }).waitFor()],
  ['game-trends', `./#/nfl/game/${NEBUF}?tab=trends`, (p) => p.locator('main').waitFor()],
  ['team', `./#/nfl/team/${BUF}`, (p) => p.getByRole('heading', { name: /Buffalo Bills/i, level: 1 }).waitFor()],
  ['metric', `./#/nfl/metric/met_nfl.adj_def_db_epa?team=${BUF}&opp=${NE}`, (p) => p.getByText('League median').waitFor()],
  ['raw-metric', `./#/nfl/metric/met_nfl.off_epa_play?team=${BUF}&opp=${NE}`, (p) => p.getByText('League median').waitFor()],
  ['player', `./#/nfl/player/${ALLEN}`, (p) => p.getByRole('heading', { name: 'Markets', exact: true }).waitFor()],
  ['market', `./#/nfl/market/${ML_ID}?event=${NEBUF}`, (p) => p.getByRole('heading', { name: 'Model evidence' }).waitFor()],
];

for (const [name, url, ready] of SCREENS) {
  test(`${name}: rankings, not percentiles; no "Against whom"`, async ({ page }) => {
    await page.goto(url);
    await ready(page);
    await page.waitForTimeout(600);
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/percentile/i);
    expect(text).not.toMatch(/against whom/i);
    const titles = await page.locator('[title], [aria-label]').evaluateAll((els) => els.map((e) => `${e.getAttribute('title') ?? ''} ${e.getAttribute('aria-label') ?? ''}`).join(' '));
    expect(titles).not.toMatch(/percentile/i);
  });
}

test('full league ranking uses ranks only', async ({ page }) => {
  await page.goto(`./#/nfl/metric/met_nfl.adj_def_db_epa?team=${BUF}`);
  await page.getByRole('link', { name: /Full NFL ranking/ }).click();
  await expect(page.locator('.rankbars__row')).toHaveCount(32);
  expect(await page.locator('body').innerText()).not.toMatch(/percentile/i);
});

test('Matchup Context explains raw vs opponent-adjusted with ranks, the change and a plain reading', async ({ page }) => {
  await page.goto(`./#/nfl/metric/met_nfl.adj_def_db_epa?team=${BUF}&opp=${NE}`);
  await expect(page.getByRole('heading', { name: 'Matchup Context' })).toBeVisible();
  const cmp = page.locator('.adjcmp');
  await expect(cmp).toBeVisible();
  await expect(cmp.getByText('Raw', { exact: true })).toBeVisible();
  await expect(cmp.getByText('Opponent-adjusted', { exact: true })).toBeVisible();
  await expect(cmp.getByText('Adjustment', { exact: true })).toBeVisible();
  await expect(cmp.locator('.adjcmp__read')).toHaveText(/rating|league average/);
  await expect(cmp.getByText('lower is better')).toBeVisible();
});
