// Chip rails (ui/ChipRail.tsx, ui/rail.css): every row of chips, sport tabs and filter pills is ONE non-wrapping, snapping, scrolling row at every phone
// width from 320 to 430 pt; its scrollbar is hidden; an edge fade says there is more; the active chip is scrolled into view; the targets are 44 pt;
// DOM order is visual order; the page never scrolls sideways. Real published documents on the fixed clock (eight sports, so the rails really overflow).
import { test, expect, type Page } from '@playwright/test';
import { feedNow, useRealFeeds } from './support/realFeeds';

test.setTimeout(120_000);
test.describe.configure({ mode: 'parallel' });
test.use({ timezoneId: 'America/New_York', locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ onboarded: true })); } catch { /* */ } });
  await page.clock.setFixedTime(feedNow());
  await useRealFeeds(page);
});

const WIDTHS = [320, 360, 375, 390, 430];
const go = async (page: Page, path: string, ready: string) => {
  await page.goto(`./#${path}`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  await page.waitForSelector(ready, { timeout: 30_000 });
  await page.waitForTimeout(400);
};

interface RailFacts { count: number; rows: number; overflowX: string; snap: string; scrollbar: string; scrollW: number; clientW: number; fade: string | null; pageOverflow: number; inOrder: boolean; hit: number[]; wrap: string; clippedLabels: number }
/** Everything the rail rule promises, measured in the page. `hitSel` are the targets whose 44 pt area is checked (default: the rail's children). */
const facts = (page: Page, sel: string, hitSel?: string): Promise<RailFacts> => page.evaluate(([s, h]) => {
  const rail = document.querySelector<HTMLElement>(s)!;
  const kids = [...rail.children] as HTMLElement[];
  const cs = getComputedStyle(rail);
  const tops = kids.map((k) => Math.round(k.getBoundingClientRect().top));
  const lefts = kids.map((k) => k.getBoundingClientRect().left);
  const targets = h ? [...rail.querySelectorAll<HTMLElement>(h)] : kids;
  // A 44 pt target: the point 21 pt above and below the target's centre still answers to the target.
  const hit = targets.map((k) => {
    const r = k.getBoundingClientRect();
    const railR = rail.getBoundingClientRect();
    const vl = Math.max(r.left, railR.left, 0), vr = Math.min(r.right, railR.right, innerWidth); // the part of the chip that is on screen
    if (vr - vl < 12) return 44; // scrolled out of the rail: not hit-testable here
    const cx = (vl + vr) / 2;
    const up = document.elementFromPoint(cx, r.top + r.height / 2 - 21), dn = document.elementFromPoint(cx, r.top + r.height / 2 + 21);
    return (up && k.contains(up) ? 1 : 0) + (dn && k.contains(dn) ? 1 : 0) === 2 ? 44 : 0;
  });
  return {
    count: kids.length, rows: new Set(tops).size, overflowX: cs.overflowX, snap: cs.scrollSnapType, scrollbar: cs.scrollbarWidth, scrollW: rail.scrollWidth, clientW: rail.clientWidth,
    fade: rail.getAttribute('data-fade'), pageOverflow: document.documentElement.scrollWidth - innerWidth, inOrder: lefts.every((x, i) => i === 0 || x >= lefts[i - 1]),
    hit, wrap: cs.flexWrap, clippedLabels: kids.filter((k) => k.scrollWidth > k.clientWidth + 1).length,
  };
}, [sel, hitSel] as const);

function expectRail(f: RailFacts, w: number, what: string) {
  const m = `${what} at ${w}`;
  expect(f.wrap, `${m}: nowrap`).toBe('nowrap');
  expect(f.rows, `${m}: one row`).toBe(1);
  expect(f.overflowX, `${m}: scrolls sideways`).toBe('auto');
  expect(f.snap, `${m}: snaps`).toContain('x');
  expect(f.scrollbar, `${m}: scrollbar hidden`).toBe('none');
  expect(f.pageOverflow, `${m}: page overflow`).toBeLessThanOrEqual(0);
  expect(f.inOrder, `${m}: DOM order is visual order`).toBe(true);
  expect(f.hit.every((x) => x === 44), `${m}: 44 pt hit areas ${f.hit}`).toBe(true);
  if (f.scrollW > f.clientW + 2) expect(['end', 'start', 'both'], `${m}: an overflowing rail fades the edge that has more`).toContain(f.fade);
  else expect(f.fade, `${m}: a rail that fits has no fade`).toBe('none');
}

for (const w of WIDTHS) {
  test.describe(`rails at ${w} pt`, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: w, height: 844 }); });

    test('Games: state chips and sport tabs are single scrolling rails', async ({ page }) => {
      await go(page, '/v3/games', '.v3-gclist .v3-gc');
      const states = await facts(page, '.v3-chips--states', '.v3-chip');
      expectRail(states, w, 'Game state chips');
      expect(states.count).toBe(5);
      expectRail(await facts(page, '.v3-rail'), w, 'Game sport tabs');
    });

    test('Home: sport chips are a single scrolling rail', async ({ page }) => {
      await go(page, '/v3', '.v3-feat');
      const f = await facts(page, '.v3-chips--home', '.v3-chip');
      expectRail(f, w, 'Home sport chips');
      expect(f.count).toBeGreaterThan(4);
    });

    test('Prop Discovery: sport and statistic rails are single scrolling rails', async ({ page }) => {
      await go(page, '/v3/props', '.pd-rail a');
      expectRail(await facts(page, '.pd-rail', 'a'), w, 'Props sport rail');
      expectRail(await facts(page, '.pd-fams', 'a'), w, 'Props statistic rail');
    });

    test('Game props tab: statistic chips are a single scrolling rail', async ({ page }) => {
      await go(page, '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3?tab=props', '[aria-label="Stat"] .v3-chip');
      expectRail(await facts(page, '[aria-label="Stat"]', '.v3-chip'), w, 'Game stat chips');
    });

    test('Following: the section segments stay on one row, fully readable', async ({ page }) => {
      await go(page, '/v3/following', '.v3-seg--box');
      const f = await facts(page, '.v3-seg--box');
      expect(f.rows, 'one row').toBe(1);
      expect(f.clippedLabels, 'no segment label is clipped').toBe(0);
      expect(f.pageOverflow).toBeLessThanOrEqual(0);
      expect(f.inOrder).toBe(true);
    });
  });
}

test.describe('the active chip is scrolled into view', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 320, height: 844 }); });
  const within = (page: Page, rail: string, chip: string) => page.evaluate(([r, c]) => {
    const rr = document.querySelector(r!)!.getBoundingClientRect(), cr = document.querySelector(c!)!.getBoundingClientRect();
    return cr.left >= rr.left - 0.5 && cr.right <= rr.right + 0.5;
  }, [rail, chip]);

  test('opening Games on the last state chip shows it', async ({ page }) => {
    await go(page, '/v3/games?state=final', '.v3-chips--states .v3-chip[aria-pressed="true"]');
    await page.waitForTimeout(300);
    expect(await within(page, '.v3-chips--states', '.v3-chips--states .v3-chip[aria-pressed="true"]')).toBe(true);
    expect(await page.locator('.v3-chips--states').getAttribute('data-fade')).toBe('start'); // scrolled to the end: the fade is on the start edge
  });

  test('choosing a chip that sits past the edge scrolls it in; choosing one back scrolls back', async ({ page }) => {
    await go(page, '/v3/games', '.v3-gclist .v3-gc');
    const rail = page.locator('.v3-chips--states');
    expect(await rail.getAttribute('data-fade')).toBe('end');
    // "Upcoming" is a chip whose right half starts beyond the 320 pt edge: scrolling the rail by hand then tapping it keeps it visible.
    await rail.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await page.waitForTimeout(150);
    await page.locator('.v3-chips--states .v3-chip', { hasText: 'Final' }).click();
    await expect(page).toHaveURL(/state=final/);
    await page.waitForTimeout(400);
    expect(await within(page, '.v3-chips--states', '.v3-chips--states .v3-chip[aria-pressed="true"]')).toBe(true);
    await rail.evaluate((el) => { el.scrollLeft = 0; });
    await page.waitForTimeout(150);
    await page.locator('.v3-chips--states .v3-chip', { hasText: 'Following' }).click();
    await page.waitForTimeout(500);
    expect(await within(page, '.v3-chips--states', '.v3-chips--states .v3-chip[aria-pressed="true"]')).toBe(true);
  });

  test('a rail the viewer scrolled by hand is not yanked back by a re-render', async ({ page }) => {
    await go(page, '/v3/games', '.v3-gclist .v3-gc');
    const rail = page.locator('.v3-chips--states');
    await rail.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await page.waitForTimeout(150);
    const at = await rail.evaluate((el) => el.scrollLeft);
    await page.clock.fastForward(61_000); // the slate clock ticks and the screen re-renders
    await page.waitForTimeout(400);
    expect(await rail.evaluate((el) => el.scrollLeft)).toBe(at);
  });

  test('opening Home on a sport past the edge shows its chip', async ({ page }) => {
    await go(page, '/v3?sport=tennis', '.v3-feat, .v3-state');
    await page.waitForTimeout(300);
    expect(await within(page, '.v3-chips--home', '.v3-chips--home .v3-chip[aria-pressed="true"]')).toBe(true);
  });

  test('keyboard focus order follows the visual order and the focused chip is reachable', async ({ page }) => {
    await go(page, '/v3/games', '.v3-gclist .v3-gc');
    await page.locator('.v3-chips--states .v3-chip').first().focus();
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) { seen.push((await page.evaluate(() => document.activeElement?.textContent ?? '')).replace(/\d+$/, '').trim()); await page.keyboard.press('Tab'); }
    expect(seen).toEqual(['Following', 'Live', 'Today', 'Upcoming', 'Final']);
  });
});
