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
