// The NFL home as one composition: Slate Priorities fills the desktop's right side beside the featured game
// (no empty band), leads the page on phones, every item opens a real game or market (and Back returns), nothing
// points at a game that has kicked off, and the whole page is set in Barlow. Bundled week-4 snapshot, game-day
// clock, fixture quotes (e2e/fixtures.ts).
import { expect, noHorizontalOverflow, NOW, test } from './fixtures';

test('NFL home: Slate Priorities beside the featured game on desktop, first on phones @smoke', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/nfl');
  const rail = page.getByRole('region', { name: 'Where to look first' });
  await expect(rail).toBeVisible();
  await expect(rail.locator('.prio__i--edge')).toBeVisible();
  // The Top SIFT Edge always says something: an edge, or plainly that none qualifies.
  await expect(rail.locator('.prio__i--edge')).toContainText(/SIFT edge|Top SIFT edge/i);
  await noHorizontalOverflow(page, 'nfl-home');

  const feat = page.locator('.shome__feat');
  const r = (await rail.boundingBox())!;
  const f = (await feat.boundingBox())!;
  const vw = page.viewportSize()!.width;
  if (vw >= 1100) {
    // Side by side, top-aligned, same height: the right column is the rail, not empty space.
    expect(r.x).toBeGreaterThan(f.x + f.width);
    expect(Math.abs(r.y - f.y)).toBeLessThan(2);
    expect(Math.abs(r.height - f.height)).toBeLessThan(2);
  } else {
    // Phones and tablets: the rail comes before the featured game, near the top of the page.
    expect(r.y).toBeLessThan(f.y);
    expect(r.y).toBeLessThan(400);
  }

  // Every item links into a game or market of an upcoming, not-yet-kicked-off game.
  const hrefs = await rail.locator('a.prio__a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
  expect(hrefs.length).toBeGreaterThan(0);
  expect(hrefs.length).toBeLessThanOrEqual(5);
  const board = await page.evaluate(async () => (await fetch('./data/nfl/app/latest/board.json')).json());
  const upcoming = new Set(board.items.filter((i: { status: string; start_time_utc: string }) => i.status === 'SCHEDULED' && Date.parse(i.start_time_utc) > NOW.getTime()).map((i: { event_id: string }) => i.event_id));
  for (const h of hrefs) {
    const evt = /evt_[0-9a-f]+/.exec(h)![0];
    expect(upcoming.has(evt), `${h} points at a game that is not upcoming`).toBe(true);
  }

  // Click through and come back.
  await rail.locator('a.prio__a').first().click();
  await expect(page).toHaveURL(/#\/nfl\/(game|market)\//);
  await page.goBack();
  await expect(rail).toBeVisible();

  // Barlow is the face actually rendering, with no earlier face loaded.
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return { body: getComputedStyle(document.body).fontFamily, loaded: [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family.replace(/"/g, '')) };
  });
  expect(fonts.body).toMatch(/^"?Barlow"?,/);
  expect(fonts.loaded).toContain('Barlow');
  expect(fonts.loaded.filter((x) => /Instrument|Roboto/.test(x))).toEqual([]);
});
