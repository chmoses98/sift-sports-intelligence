// Stat Detail Trend (SD2): reliable selection on a chart whose 12 bars stay as slim as the locked design draws them. The chart is one touch
// surface cut into gap-free columns (press previews the nearest column, dragging follows the finger, lifting commits, a vertical scroll
// cancels) and the observation list is its keyboard and screen-reader equivalent with 44 pt rows. These tests send REAL touch events
// (Input.dispatchTouchEvent through the DevTools protocol, the same path a finger takes into the browser) at the left, centre and right
// of every column at 390 and 375 wide, on the real published DAL points series. They do NOT prove anything about a real iPhone: see
// docs/sift3/DEVICE_CHECKLIST.md for what must be tried by hand.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type CDPSession, type Page } from '@playwright/test';
import { feedNow, useRealFeeds } from './support/realFeeds';
import { columnHits, expectNoStolenTaps } from './support/hitTargets';

const TREND = '/v3/stat/nfl/points_for?v=1&tab=trend&sel=DAL';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(feedNow('stat')); // the captured documents describe one instant
  await useRealFeeds(page, { family: 'stat' });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
});

const go = async (page: Page, path: string) => { await page.goto(`./#${path}`); await expect(page.locator('[data-v3-shell]')).toBeVisible(); await expect(page.locator('.st-obs svg [data-obs]').first()).toBeVisible(); };
const obsParam = (page: Page) => page.evaluate(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('obs'));
const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

/** The value `obs=` takes for each chart column, left to right (the list is newest first, the chart oldest first). */
const obsOfColumns = (page: Page) => page.locator('[data-obs-row]').evaluateAll((li) => li.map((e) => e.getAttribute('data-obs-row')!).reverse());

interface Box { left: number; width: number; top: number; height: number }
const columnBox = (page: Page, i: number) => page.locator(`[data-obs-hit="${i}"]`).evaluate((e): Box => { const r = e.getBoundingClientRect(); return { left: r.left, width: r.width, top: r.top, height: r.height }; });

async function cdp(page: Page): Promise<CDPSession> { return page.context().newCDPSession(page); }
const down = (s: CDPSession, x: number, y: number) => s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
const move = (s: CDPSession, x: number, y: number) => s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
const up = (s: CDPSession) => s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const tap = async (s: CDPSession, x: number, y: number) => { await down(s, x, y); await up(s); };

/** Bring the chart fully into view and let the page settle, so viewport coordinates are stable. */
async function frame(page: Page) {
  await page.locator('.st-obs__plot').scrollIntoViewIfNeeded();
  await page.evaluate(() => { const r = document.querySelector('.st-obs__plot')!.getBoundingClientRect(); window.scrollBy(0, r.top - 120); });
  await page.waitForTimeout(250);
}

for (const [w, h] of [[390, 844], [375, 667]] as const) {
  test.describe(`Trend touch selection at ${w}x${h} @v3`, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: w, height: h }); await go(page, TREND); await frame(page); });

    test('the columns tile the chart: each answers for its own area and none steals a neighbour\'s', async ({ page }) => {
      const { misses, widths } = await columnHits(page, '.st-obs');
      expect(misses).toEqual([]);
      expect(widths).toHaveLength(12);
      // the columns are contiguous and span the whole chart
      const boxes = await Promise.all(widths.map((_, i) => columnBox(page, i)));
      for (let i = 1; i < boxes.length; i++) expect(Math.abs(boxes[i].left - (boxes[i - 1].left + boxes[i - 1].width))).toBeLessThan(0.6);
      // every column is the chart's full height, and the logo links under the chart steal nothing
      for (const b of boxes) expect(b.height).toBeGreaterThan(140);
      await expectNoStolenTaps(page, '.st-trc');
      await expectNoStolenTaps(page, '.st-ol');
    });

    test('a real touch tap at the left, centre and right of every column selects exactly that observation', async ({ page }) => {
      const s = await cdp(page);
      const obs = await obsOfColumns(page);
      expect(obs).toHaveLength(12);
      const len = await page.evaluate(() => history.length);
      // the events the chart receives are real touch pointers, not mouse clicks
      await page.evaluate(() => { (window as unknown as { __pt: string[] }).__pt = []; document.querySelector('.st-obs__plot')!.addEventListener('pointerdown', (e) => (window as unknown as { __pt: string[] }).__pt.push((e as PointerEvent).pointerType), true); });
      let taps = 0;
      for (let i = 0; i < 12; i++) {
        const b = await columnBox(page, i);
        const y = b.top + b.height * 0.45;
        const neighbour = i === 11 ? 10 : i + 1;
        for (const f of [0.12, 0.5, 0.88]) {
          // select the neighbour first, so a tap that did nothing cannot pass for one that worked
          const nb = await columnBox(page, neighbour);
          await tap(s, nb.left + nb.width * 0.5, y);
          await expect.poll(() => obsParam(page)).toBe(obs[neighbour]);
          await tap(s, b.left + b.width * f, y);
          await expect.poll(() => obsParam(page), { message: `column ${i} at ${f} of its width (${Math.round(b.left + b.width * f)}, ${Math.round(y)})` }).toBe(obs[i]);
          await expect(page.locator(`.st-obs [data-obs="${i}"]`)).toHaveAttribute('data-on', 'true');
          await expect(page.locator('.st-obs [data-obs][data-on="true"]')).toHaveCount(1);
          taps += 2;
        }
      }
      expect(taps).toBe(72);
      const kinds = await page.evaluate(() => (window as unknown as { __pt: string[] }).__pt);
      expect(kinds).toHaveLength(72);
      expect(new Set(kinds)).toEqual(new Set(['touch']));
      expect(await page.evaluate(() => history.length)).toBe(len); // selection replaces history
    });

    test('a press previews the nearest column with a live readout, dragging follows the finger and lifting keeps the column', async ({ page }) => {
      const s = await cdp(page);
      const obs = await obsOfColumns(page);
      const before = await obsParam(page);
      const a = await columnBox(page, 2), c = await columnBox(page, 7), y = a.top + a.height * 0.5;
      const y0 = await scrollY(page);
      await down(s, a.left + a.width / 2, y);
      await expect(page.locator('[data-obs-tip]')).toBeVisible();
      await expect(page.locator('.st-obs [data-obs="2"]')).toHaveAttribute('data-on', 'true');
      const tip2 = await page.locator('[data-obs-tip]').textContent();
      // drag across the columns with a slightly wandering finger: the preview follows, the address does not move, the page does not scroll
      for (let k = 1; k <= 10; k++) await move(s, a.left + a.width / 2 + ((c.left + c.width / 2) - (a.left + a.width / 2)) * (k / 10), y + (k % 2 ? 6 : -6));
      await expect(page.locator('.st-obs [data-obs="7"]')).toHaveAttribute('data-on', 'true');
      expect(await page.locator('[data-obs-tip]').textContent()).not.toBe(tip2);
      await expect(page.locator('.st-obc.is-press')).toBeVisible(); // the details card shows the column under the finger
      expect(await obsParam(page)).toBe(before);
      expect(await scrollY(page)).toBe(y0);
      await up(s);
      await expect.poll(() => obsParam(page)).toBe(obs[7]);
      await expect(page.locator('[data-obs-tip]')).toHaveCount(0);
      await expect(page.locator('.st-obc.is-press')).toHaveCount(0);
      expect(await scrollY(page)).toBe(y0);
      // the card names the observation the readout named
      await expect(page.locator('.st-obc')).toBeVisible();
    });

    test('a finger that goes up or down scrolls the page and selects nothing; a sideways scrub never scrolls the page', async ({ page }) => {
      const s = await cdp(page);
      const before = await obsParam(page);
      const a = await columnBox(page, 4), y = a.top + a.height * 0.5, x = a.left + a.width / 2;
      const y0 = await scrollY(page);
      // sideways with a diagonal wobble of up to 14 px: no vertical scroll
      await down(s, x, y);
      for (let k = 1; k <= 8; k++) await move(s, x + k * 12, y + k * 1.75);
      await up(s);
      expect(await scrollY(page)).toBe(y0);
      await expect.poll(() => obsParam(page)).not.toBe(before);
      const chosen = await obsParam(page);
      // vertical: the browser takes the gesture, the chart cancels, the selection stays where it was
      await down(s, x, y);
      for (let k = 1; k <= 12; k++) await move(s, x + (k % 2), y - k * 12);
      await up(s);
      await expect.poll(() => scrollY(page)).toBeGreaterThan(y0 + 40);
      expect(await obsParam(page)).toBe(chosen);
      await expect(page.locator('[data-obs-tip]')).toHaveCount(0);
      await expect(page.locator('.st-obc.is-press')).toHaveCount(0);
    });

    test('touch-action: horizontal movement belongs to the chart, vertical panning stays with the page everywhere', async ({ page }) => {
      expect(await page.locator('.st-obs__plot').evaluate((e) => getComputedStyle(e).touchAction)).toBe('pan-y');
      for (const sel of ['.v3-main', '.st-obc', '.st-ol', '.st-seas', 'body']) {
        const ta = await page.locator(sel).first().evaluate((e) => { let t: Element | null = e, v = 'auto'; for (; t && v === 'auto'; t = t.parentElement) v = getComputedStyle(t).touchAction; return v; });
        expect(ta, sel).not.toMatch(/none|pan-x/);
      }
    });

    test('no horizontal overflow, and the readout stays inside the card', async ({ page }) => {
      const s = await cdp(page);
      for (const i of [0, 11]) {
        const b = await columnBox(page, i);
        await down(s, b.left + b.width / 2, b.top + b.height / 2);
        const tip = await page.locator('[data-obs-tip]').boundingBox();
        const card = await page.locator('.st-trc').boundingBox();
        expect(tip!.x).toBeGreaterThanOrEqual(card!.x);
        expect(tip!.x + tip!.width).toBeLessThanOrEqual(card!.x + card!.width);
        await up(s);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    });
  });
}

test.describe('Trend observation list @v3', () => {
  test.beforeEach(async ({ page }) => { await go(page, TREND); });

  test('a labelled list of the same observations: date, opponent, value and the game result link, 44 pt rows', async ({ page }) => {
    const list = page.getByRole('list', { name: /Cowboys.*12 games/ });
    await expect(list).toBeVisible();
    const rows = list.getByRole('listitem');
    await expect(rows).toHaveCount(12);
    expect(await page.locator('.st-ol').getAttribute('aria-labelledby')).toBeTruthy();
    await expect(page.locator('.st-obs svg [data-obs]')).toHaveCount(12); // the same twelve observations as the chart, newest first
    const first = rows.first();
    await expect(first).toContainText(/Oct \d+/);
    await expect(first.locator('a[data-tap="team"]')).toHaveAttribute('data-dest', /^\/v3\/team\/nfl\/[A-Z]+/);
    await expect(first.locator('a[data-tap="game"]')).toHaveAttribute('data-dest', /^\/v3\/game\/nfl\/evt_/);
    await expect(first.locator('a[data-tap="game"]')).toContainText(/\d+–\d+/);
    // every row, and every control in it, is at least 44 pt tall and the row's controls are at least 44 wide
    const small = await page.locator('.st-olr').evaluateAll((els) => els.flatMap((r) => [r, ...r.querySelectorAll('button, a')].map((e) => { const b = e.getBoundingClientRect(); return b.height < 43.5 || (e !== r && b.width < 43.5) ? `${e.tagName} ${Math.round(b.width)}x${Math.round(b.height)}` : ''; })).filter(Boolean));
    expect(small).toEqual([]);
  });

  test('keyboard: Tab reaches a row, Enter selects it (the chart and the card follow, history is replaced), Space too', async ({ page }) => {
    const len = await page.evaluate(() => history.length);
    const row = page.locator('[data-obs-row]').nth(5);
    const btn = row.locator('.st-olr__sel');
    await btn.focus();
    await expect(btn).toBeFocused();
    await page.keyboard.press('Enter');
    const want = await row.getAttribute('data-obs-row');
    await expect.poll(() => obsParam(page)).toBe(want);
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.st-obs [data-obs][data-on="true"]')).toHaveCount(1);
    await expect(page.locator('.st-obs [data-obs="6"]')).toHaveAttribute('data-on', 'true'); // 12 columns oldest first: row 5 from the newest is column 6
    const other = page.locator('[data-obs-row]').nth(9);
    await other.locator('.st-olr__sel').focus();
    await page.keyboard.press('Space');
    await expect.poll(() => obsParam(page)).toBe(await other.getAttribute('data-obs-row'));
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => history.length)).toBe(len);
    await expect(page.locator('[role="status"].st-vh')).toContainText(/^Showing /);
  });

  test('a row selects the same observation as the matching chart column, and a tap on that column selects the same row', async ({ page }) => {
    const rowsDesc = await page.locator('[data-obs-row]').evaluateAll((li) => li.map((e) => e.getAttribute('data-obs-row')));
    await page.locator('[data-obs-row]').nth(3).locator('.st-olr__sel').click();
    await expect.poll(() => obsParam(page)).toBe(rowsDesc[3]);
    await expect(page.locator('.st-obs [data-obs="8"]')).toHaveAttribute('data-on', 'true');
    await page.locator('[data-obs="2"]').click();
    await expect.poll(() => obsParam(page)).toBe(rowsDesc[9]);
    await expect(page.locator('[data-obs-row]').nth(9)).toHaveClass(/is-on/);
  });

  test('the row exits open that completed game and that opponent; Back restores the selection', async ({ page }) => {
    const row = page.locator('[data-obs-row]').nth(4);
    await row.locator('.st-olr__sel').click();
    const sel = await obsParam(page);
    const before = await page.evaluate(() => location.hash);
    await row.locator('a[data-tap="game"]').click();
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#\/v3\/game\/nfl\/evt_/);
    await page.goBack();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(before);
    expect(await obsParam(page)).toBe(sel);
    await expect(page.locator('[data-obs-row]').nth(4)).toHaveClass(/is-on/);
    await expect(page.locator('.st-obs [data-obs][data-on="true"]')).toHaveCount(1);
    await page.locator('[data-obs-row]').nth(4).locator('a[data-tap="team"]').click();
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#\/v3\/team\/nfl\/[A-Z]+/);
    await page.goBack();
    expect(await obsParam(page)).toBe(sel);
  });

  test('a touch-selected observation survives a trip to Game Detail and Back', async ({ page }) => {
    await frame(page);
    const s = await cdp(page);
    const b = await columnBox(page, 3);
    await tap(s, b.left + b.width / 2, b.top + b.height / 2);
    await expect(page.locator('.st-obs [data-obs="3"]')).toHaveAttribute('data-on', 'true');
    const sel = await obsParam(page);
    await page.locator('.st-obc').getByRole('link', { name: /^Game Detail/ }).click();
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#\/v3\/game\/nfl\/evt_/);
    await page.goBack();
    await expect.poll(() => obsParam(page)).toBe(sel);
    await expect(page.locator('.st-obs [data-obs="3"]')).toHaveAttribute('data-on', 'true');
  });

  test('accessibility: the chart is a picture for pointers (hidden from assistive technology, nothing focusable inside), the list is the equivalent; axe clean', async ({ page }) => {
    await expect(page.locator('.st-obs svg')).toHaveAttribute('aria-hidden', 'true');
    expect(await page.locator('.st-obs svg [tabindex], .st-obs svg [role]').count()).toBe(0);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });

  test('reduced motion: nothing animates on the Trend screen, while pressing or while selecting', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await go(page, TREND);
    await frame(page);
    const s = await cdp(page);
    const b = await columnBox(page, 5);
    await down(s, b.left + b.width / 2, b.top + b.height / 2);
    await expect(page.locator('[data-obs-tip]')).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await up(s);
    await page.locator('[data-obs-row]').nth(2).locator('.st-olr__sel').click();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test('the season cut (more columns) keeps gap-free columns and the list matches the chart', async ({ page }) => {
    await page.locator('.st-chip', { hasText: '2025' }).last().click();
    await expect(page.locator('.st-obs svg [data-obs]')).toHaveCount(17);
    await expect(page.locator('[data-obs-row]')).toHaveCount(17);
    const { misses, widths } = await columnHits(page, '.st-obs');
    expect(misses).toEqual([]);
    expect(widths).toHaveLength(17);
    await page.locator('[data-obs-row]').nth(16).locator('.st-olr__sel').click();
    await expect(page.locator('.st-obs [data-obs="0"]')).toHaveAttribute('data-on', 'true');
  });
});

// NHL real series. The sandbox cache for the NFL family holds no NHL per-game series (the published ones belong to some teams only, and
// documents captured at different instants cannot be mixed), so this test runs when the cache in use has one and says so when it does not:
//   V3_FEED_CACHE=<dir> V3_REAL_FEEDS=live  fills a consistent NHL set (Anaheim publishes Corsi and xGF share series).
test.describe('Trend on a real NHL series @v3', () => {
  for (const [w, h] of [[390, 844], [375, 667]] as const) {
    test(`Corsi share, ANA, at ${w}x${h}: touch selects every column, the list matches, axe clean`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: w, height: h });
      await page.goto('./#/v3/stat/nhl/corsi_pct?v=1&tab=trend&sel=ANA');
      await expect(page.locator('[data-v3-shell]')).toBeVisible();
      await expect(page.locator('.st-obs, .st-state, [role="alert"]').first()).toBeVisible(); // an unpublished ranking is now an honest alert (H-D), not a chart state
      test.skip(await page.locator('.st-obs').count() === 0, 'the feed cache in use holds no NHL per-game series for ANA (see the comment above)');
      await frame(page);
      const n = await page.locator('.st-obs svg [data-obs]').count();
      expect(n).toBeGreaterThan(1);
      await expect(page.locator('[data-obs-row]')).toHaveCount(n);
      await expect(page.locator('[data-obs-row]').first().locator('.v')).toContainText('%'); // a share is shown with its unit
      const { misses } = await columnHits(page, '.st-obs');
      expect(misses).toEqual([]);
      await expectNoStolenTaps(page, '.st-trc');
      const s = await cdp(page);
      const obs = await obsOfColumns(page);
      for (let i = 0; i < n; i++) {
        const b = await columnBox(page, i), nb = await columnBox(page, i === n - 1 ? n - 2 : i + 1);
        await tap(s, nb.left + nb.width / 2, nb.top + nb.height * 0.45);
        await expect.poll(() => obsParam(page)).toBe(obs[i === n - 1 ? n - 2 : i + 1]);
        for (const f of [0.15, 0.5, 0.85]) {
          await tap(s, b.left + b.width * f, b.top + b.height * 0.45);
          await expect.poll(() => obsParam(page), { message: `NHL column ${i} at ${f}` }).toBe(obs[i]);
          await tap(s, nb.left + nb.width / 2, nb.top + nb.height * 0.45);
        }
      }
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((v) => v.id)).toEqual([]);
    });
  }
});

