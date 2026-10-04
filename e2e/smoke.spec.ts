// Responsive smoke (owner spec O + T) on every project — Chromium phone/desktop, WebKit iPhone 15 Pro
// and the small WebKit iPhone SE: every key screen loads, nothing scrolls sideways, fixed controls
// are on screen and not covered, the tray sheet is reachable, chart labels stay inside the screen,
// market controls are real touch targets, safe areas are honoured, and copy has a fallback.
import type { Page } from '@playwright/test';
import { ALLEN, BUF, expect, ML_ID, NEBUF, noHorizontalOverflow, NOW, test } from './fixtures';

const SCREENS: [string, string, (p: Page) => Promise<unknown>][] = [
  ['home', './#/', (p) => p.getByRole('heading', { name: 'Sift' }).waitFor()],
  ['slate', './#/nfl', (p) => p.getByText('RESEARCH SNAPSHOT').waitFor()],
  ['game', `./#/nfl/game/${NEBUF}`, (p) => p.getByRole('heading', { name: 'How they match up' }).waitFor()],
  ['team', `./#/nfl/team/${BUF}`, (p) => p.getByRole('heading', { name: /Buffalo Bills/i, level: 1 }).waitFor()],
  ['metric', `./#/nfl/metric/met_nfl.adj_def_db_epa?team=${BUF}`, (p) => p.getByText('League median').waitFor()],
  ['player', `./#/nfl/player/${ALLEN}`, (p) => p.getByRole('heading', { name: 'Markets vs projection' }).waitFor()],
  ['market', `./#/nfl/market/${ML_ID}?event=${NEBUF}`, (p) => p.getByRole('heading', { name: 'Model evidence' }).waitFor()],
  ['packet', `./#/packet?sport=nfl&scope=GAME&event=${NEBUF}`, (p) => p.getByRole('button', { name: 'COPY FOR CHATGPT' }).waitFor({ timeout: 60_000 })],
];

/**
 * Can the user tap `sel`? Playwright's actionability check scrolls it into view and fails if another
 * element (a fixed bar, a sheet, a toast) would receive the tap — the same in WebKit and Chromium.
 */
async function notCovered(page: Page, sel: string) {
  try {
    await page.locator(sel).first().click({ trial: true, timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function bottomBarOnScreen(page: Page, isMobile: boolean) {
  const bar = page.locator('.bottombar');
  if (!isMobile) {
    await expect(bar).toBeHidden();
    return;
  }
  const box = (await bar.boundingBox())!;
  const vh = page.viewportSize()!.height;
  expect(box.y + box.height, 'bottom navigation clipped').toBeLessThanOrEqual(vh + 1);
  expect(box.y).toBeGreaterThan(vh / 2);
}

/** Every SVG text label inside the visible width (no chart label hangs off a phone screen). */
async function chartLabelsInside(page: Page, name: string) {
  const out = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return [...document.querySelectorAll('svg text')]
      .map((t) => ({ t: (t.textContent ?? '').slice(0, 30), r: t.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.left < -1 || r.right > w + 1))
      .map(({ t, r }) => `${t} [${Math.round(r.left)}..${Math.round(r.right)} of ${w}]`);
  });
  expect(out, `${name}: chart labels outside the screen`).toEqual([]);
}

test.beforeEach(async ({ page }) => page.clock.install({ time: NOW }));

for (const [name, url, ready] of SCREENS) {
  test(`${name}: loads, fits, fixed controls on screen @smoke`, async ({ page, isMobile }) => {
    await page.goto(url);
    await ready(page);
    await noHorizontalOverflow(page, name);
    await bottomBarOnScreen(page, isMobile);
    await chartLabelsInside(page, name);
    // The last thing on the page can be scrolled clear of the fixed bottom navigation.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await notCovered(page, '.foot a:last-child'), `${name}: footer covered by a fixed layer`).toBe(true);
  });
}

test('market controls are real touch targets; packet controls are never under the bottom bar @smoke', async ({ page, isMobile }) => {
  await page.goto(`./#/nfl/game/${NEBUF}`);
  await expect(page.getByRole('heading', { name: 'How they match up' })).toBeVisible();
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('.mrow, .rungcell, .seg__b, .savebtn, .bottombar__a, .btn')]
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => ({ c: e.className, h: Math.round(e.getBoundingClientRect().height) }))
      .filter((x) => x.h > 0 && x.h < 32),
  );
  expect(small, 'interactive market controls below a usable touch height').toEqual([]);
  await page.goto(`./#/packet?sport=nfl&scope=GAME&event=${NEBUF}`);
  await expect(page.getByRole('button', { name: 'COPY FOR CHATGPT' })).toBeVisible({ timeout: 60_000 });
  for (const sel of ['.btn--copy', '.preflight .btn', '.copybar .btn--ghost']) {
    expect(await notCovered(page, sel), `${sel} covered (mobile=${isMobile})`).toBe(true);
  }
});

test('the research tray sheet opens fully on screen and its build button is reachable @smoke', async ({ page, isMobile }) => {
  await page.goto(`./#/nfl/player/${ALLEN}`);
  await page.getByRole('button', { name: /^Save .* to research tray$/ }).first().click();
  await (isMobile ? page.locator('.bottombar button') : page.locator('.traybtn')).click();
  const drawer = page.getByRole('complementary', { name: 'Research tray' });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('.tray__item')).toHaveCount(1);
  const vp = page.viewportSize()!;
  // (polled: the sheet slides in with a CSS transition)
  await expect.poll(async () => { const b = (await drawer.boundingBox())!; return b.y + b.height; }, { message: 'tray sheet extends below the screen' }).toBeLessThanOrEqual(vp.height + 1);
  expect((await drawer.boundingBox())!.y).toBeGreaterThanOrEqual(-1);
  expect(await notCovered(page, '.drawer__foot .btn--primary'), 'tray build button unreachable').toBe(true);
  await noHorizontalOverflow(page, 'tray');
});

test('iOS safe areas: viewport-fit=cover and the bottom bar pads by the inset @smoke', async ({ page }) => {
  await page.goto('./#/');
  const meta = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(meta).toContain('viewport-fit=cover');
  const usesInset = await page.evaluate(() =>
    [...document.styleSheets].some((s) => {
      try {
        return [...s.cssRules].some((r) => r.cssText.includes('safe-area-inset-bottom'));
      } catch {
        return false;
      }
    }),
  );
  expect(usesInset).toBe(true);
});

test('copy falls back to selecting the packet text when the clipboard is blocked @smoke', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('blocked', 'NotAllowedError')) } });
    document.execCommand = () => false;
  });
  await page.goto(`./#/packet?sport=nfl&scope=GAME&event=${NEBUF}`);
  const copy = page.getByRole('button', { name: 'COPY FOR CHATGPT' });
  await expect(copy).toBeVisible({ timeout: 60_000 });
  await copy.click();
  await expect(page.getByText('This browser blocked clipboard access')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().length ?? 0)).toBeGreaterThan(10_000);
  await expect(page.getByLabel('Packet text')).toContainText('EDGE FINDER HANDICAP PACKET');
});
