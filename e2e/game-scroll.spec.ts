// The game-script selector scrolls with the page. It used to be position: sticky inside the Scripts tab, which pinned a
// 360px panel over the research below it on every viewport and intercepted taps on phones. These checks fail if it
// ever sticks again: the panel must leave the viewport as the page scrolls, and the content under it must be tappable.
import { expect, NEBUF, noHorizontalOverflow, NOW, test } from './fixtures';

test.beforeEach(async ({ page }) => page.clock.install({ time: NOW }));

test('the script selector is in normal flow and never covers the research below it @smoke', async ({ page }) => {
  await page.goto(`./#/nfl/game/${NEBUF}?tab=script`);
  await page.getByRole('heading', { name: 'Choose a script' }).waitFor();
  const panel = page.locator('.fr-theater > .fr-scards');
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((el) => getComputedStyle(el).position)).not.toBe('sticky');
  const before = (await panel.boundingBox())!;
  // Scroll well past the panel: in normal flow it leaves the viewport entirely.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(150);
  const after = (await panel.boundingBox())!;
  expect(after.y, 'the script selector moved with the page').toBeLessThan(before.y);
  expect(after.y + after.height, 'the script selector left the viewport').toBeLessThanOrEqual(0);
  // The last block of the selected-script view ("What breaks it") is reachable: nothing intercepts the tap.
  const breaks = page.locator('.breaks__a').first();
  await breaks.scrollIntoViewIfNeeded();
  await breaks.click({ trial: true });
  await noHorizontalOverflow(page, 'game scripts');
});

// Scroll and navigation (repair sprint #27): a new screen opens at the top; a tab switch or a selection on the same
// screen never throws the page back to the top; back returns to where the reader was, even though the page
// re-loads its data; nothing scrolled into view hides under the sticky header and section tabs.
const scrollY = (page: import('@playwright/test').Page) => page.evaluate(() => Math.round(window.scrollY));

test('switching game tabs keeps the tabs in view instead of jumping to the top @smoke', async ({ page }) => {
  await page.goto(`./#/nfl/game/${NEBUF}`);
  await page.getByRole('heading', { name: 'What Matters' }).waitFor();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  const tabs = page.getByRole('navigation', { name: 'Game sections' });
  await tabs.getByRole('link', { name: 'Props' }).click();
  await expect(page).toHaveURL(/tab=props/);
  await page.waitForTimeout(250);
  const header = (await page.locator('.topbar').boundingBox())!;
  const box = (await tabs.boundingBox())!;
  expect(await scrollY(page), 'the page did not reset to the top').toBeGreaterThan(100);
  expect(Math.abs(box.y - (header.y + header.height)), 'the tabs sit just under the header').toBeLessThan(16);
});

test('selecting another script deep in the Scripts tab does not throw the page back to the top @smoke', async ({ page }) => {
  await page.goto(`./#/nfl/game/${NEBUF}?tab=script`);
  await page.getByRole('heading', { name: 'Choose a script' }).waitFor();
  // "What breaks it" sits at the foot of the selected script: each link selects another script (?script=).
  const other = page.locator('.breaks__a').first();
  await other.scrollIntoViewIfNeeded();
  const before = await scrollY(page);
  expect(before).toBeGreaterThan(400);
  await other.click();
  await expect(page).toHaveURL(/script=/);
  await page.waitForTimeout(250);
  expect(await scrollY(page), 'a selection on the same screen keeps the reader near where they were').toBeGreaterThan(before - 400);
});

test('a new screen opens at the top and back returns to the reader’s place @journey', async ({ page }) => {
  await page.goto(`./#/nfl/game/${NEBUF}?tab=players`);
  const player = page.locator('main a[href*="/nfl/player/"]').nth(3);
  await player.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 200));
  await page.waitForTimeout(200);
  const before = await scrollY(page);
  expect(before).toBeGreaterThan(300);
  await player.click();
  await expect(page).toHaveURL(/\/nfl\/player\//);
  await page.locator('main h1').first().waitFor();
  expect(await scrollY(page), 'the player page opens at the top').toBeLessThan(5);
  await page.goBack();
  await expect(page).toHaveURL(/tab=players/);
  await expect.poll(() => scrollY(page), { message: 'back restores the position once the page has loaded' }).toBeGreaterThan(before - 40);
  expect(Math.abs((await scrollY(page)) - before)).toBeLessThan(40);
});

test('the sticky header and game tabs never cover a section scrolled into view', async ({ page }) => {
  await page.goto(`./#/nfl/game/${NEBUF}`);
  await page.getByRole('heading', { name: 'What Matters' }).waitFor();
  const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop));
  const header = (await page.locator('.topbar').boundingBox())!;
  const tabs = (await page.getByRole('navigation', { name: 'Game sections' }).boundingBox())!;
  expect(pad, 'scroll padding clears the header and the sticky tabs').toBeGreaterThanOrEqual(header.height + tabs.height);
});
