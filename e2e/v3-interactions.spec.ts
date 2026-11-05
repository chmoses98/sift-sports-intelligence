// Sprint 2026-11-05 interaction regressions (sample data, no network): the whole game card opens the game while its nested controls stay independent,
// the game switcher rail never reorders or jumps when a tile is chosen, and search has a visible exit, a correct Back and is reachable from detail screens.
import { test, expect, type Page } from '@playwright/test';

test.setTimeout(90_000);
const WELCOMED = () => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true })); } catch { /* storage blocked */ } };
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await page.addInitScript(WELCOMED);
});
const go = async (page: Page, path: string) => { await page.goto(`./#${path}`); await expect(page.locator('[data-v3-shell]')).toBeVisible(); await page.waitForTimeout(300); };
const hash = (page: Page) => page.evaluate(() => location.hash);

test.describe('sprint interactions @v3', () => {
  test('every part of a game card opens the game; team, lines, star and bell stay independent', async ({ page }) => {
    await go(page, '/v3?demo=1&sport=nba');
    const card = page.locator('.v3-gc').first();
    await expect(card).toBeVisible();
    const b = (await card.boundingBox())!;
    // A grid of plain taps across the card: wherever the tap lands on nothing interactive, the card opens its game.
    const points: [number, number][] = [[24, 12], [b.width * 0.5, 12], [b.width * 0.55, 40], [b.width * 0.45, b.height - 10], [b.width - 70, b.height / 2]];
    for (const [dx, dy] of points) {
      await go(page, '/v3?demo=1&sport=nba');
      const owner = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e?.closest('a,button')?.className ?? 'none'; }, [b.x + dx, b.y + dy]);
      if (/v3-gc__team|v3-lines|v3-star|v3-bell|v3-iconbtn/.test(String(owner))) continue;   // an interactive child owns this point: covered below
      await page.mouse.click(b.x + dx, b.y + dy);
      await expect(page).toHaveURL(/#\/v3\/game\//);
    }
    // Nested actions stay independent: team -> team page, lines -> contract sheet, star -> follows without navigating.
    await go(page, '/v3?demo=1&sport=nba');
    await page.locator('.v3-gc').first().locator('.v3-gc__team').first().click();
    await expect(page).toHaveURL(/#\/v3\/team\//);
    await go(page, '/v3?demo=1&sport=nba');
    await page.locator('.v3-gc').first().locator('.v3-lines').click();
    await expect(page).not.toHaveURL(/#\/v3\/game\//);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.goBack();
    await go(page, '/v3?demo=1&sport=nba');
    const before = await hash(page);
    await page.locator('.v3-gc').first().locator('.v3-star').click();
    expect(await hash(page)).toBe(before);
  });

  test('choosing a rail tile moves the highlight only: no reorder, no scroll to the front', async ({ page }) => {
    await go(page, '/v3?demo=1&sport=cfb');
    await page.locator('.v3-gc').first().locator('a.v3-gc__hit').click({ position: { x: 24, y: 12 } });
    await expect(page.locator('.v3-sw__rail')).toBeVisible();
    const order = () => page.locator('.v3-sw__tile').evaluateAll((els) => els.map((e) => e.querySelector('b')?.textContent ?? ''));
    const left = () => page.locator('.v3-sw__rail').evaluate((e) => (e as HTMLElement).scrollLeft);
    const tiles = page.locator('.v3-sw__tile');
    const n = await tiles.count();
    test.skip(n < 3, 'needs at least three games on the rail');
    const o0 = await order();
    const x0 = await left();
    // Pick a tile that is fully visible and not the first.
    const pick = await tiles.evaluateAll((els) => { const r = els[0].parentElement!.getBoundingClientRect(); return els.findIndex((e, i) => i > 0 && !e.classList.contains('is-cur') && e.getBoundingClientRect().left >= r.left && e.getBoundingClientRect().right <= r.right); });
    test.skip(pick < 0, 'no fully visible tile to pick');
    await tiles.nth(pick).locator('.v3-sw__hit').click();
    await expect(tiles.nth(pick)).toHaveClass(/is-cur/);
    expect(await order()).toEqual(o0);
    expect(Math.abs((await left()) - x0)).toBeLessThanOrEqual(1);
  });

  test('search: visible Back and Close return to where it was opened; typing adds no history; reachable from a game', async ({ page }) => {
    await go(page, '/v3?demo=1&sport=nba');
    const home = await hash(page);
    await page.getByRole('link', { name: 'Search' }).click();
    await expect(page).toHaveURL(/#\/v3\/search/);
    await page.getByLabel('Search players, teams, games and statistics').fill('cel');
    await page.getByLabel('Search players, teams, games and statistics').fill('celt');
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page).toHaveURL(new RegExp(home.replace(/[?]/g, '\\?')));
    // Search from a game screen, then the Back arrow returns to that game.
    await page.locator('.v3-gc').first().locator('a.v3-gc__hit').click({ position: { x: 24, y: 12 } });
    await expect(page).toHaveURL(/#\/v3\/game\//);
    const game = await hash(page);
    await page.locator('.v3-gh').getByRole('link', { name: 'Search' }).click();
    await expect(page).toHaveURL(/#\/v3\/search/);
    await page.getByRole('button', { name: 'Back' }).click();
    expect(await hash(page)).toBe(game);
    // A search opened directly has nothing to go back to: Close goes Home.
    const fresh = await page.context().newPage();
    await fresh.addInitScript(WELCOMED);
    await go(fresh, '/v3/search?demo=1');
    await fresh.getByRole('button', { name: 'Close' }).click();
    await expect(fresh).toHaveURL(/#\/v3(\?|$)/);
  });

  test('compact Home rows show about twice as many games, keep every tap region, and the choice persists', async ({ page }) => {
    await go(page, '/v3?demo=1&sport=nba');
    const visible = () => page.evaluate(() => [...document.querySelectorAll('.v3-gc,.v3-gcc')].filter((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }).length);
    const fullH = await page.locator('.v3-gc').first().evaluate((e) => e.getBoundingClientRect().height);
    await page.getByRole('button', { name: /Switch to compact view/ }).click();
    await expect(page.locator('.v3-gcc').first()).toBeVisible();
    await expect(page.locator('.v3-gc')).toHaveCount(0);
    const compactH = await page.locator('.v3-gcc').first().evaluate((e) => e.getBoundingClientRect().height);
    expect(compactH).toBeLessThanOrEqual(fullH * 0.62);
    await page.screenshot({ path: 'docs/sprint/2026-11-05/home-compact.png' });
    // Tap regions: whole row opens the game, team opens the team, line opens the sheet, star does not navigate.
    const st = (await page.locator('.v3-gcc__st').first().boundingBox())!;
    await page.mouse.click(st.x + st.width / 2, st.y + st.height / 2);   // the status text is not a control: the row's own link takes the tap
    await expect(page).toHaveURL(/#\/v3\/game\//);
    await page.goBack();
    await expect(page.locator('.v3-gcc').first()).toBeVisible();
    await page.locator('.v3-gcc__team').first().click();
    await expect(page).toHaveURL(/#\/v3\/team\//);
    await page.goBack();
    await page.locator('.v3-gcc__line').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.goBack();
    const h = await page.evaluate(() => location.hash);
    await page.locator('.v3-gcc__star').first().click();
    expect(await page.evaluate(() => location.hash)).toBe(h);
    // The choice is remembered on this device (and a second visit to Home opens compact).
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sift3.prefs') ?? '{}').homeDensity)).toBe('compact');
    await go(page, '/v3?demo=1&sport=nba');
    await expect(page.locator('.v3-gcc').first()).toBeVisible();
    expect(await visible()).toBeGreaterThanOrEqual(2);
  });
});
