import AxeBuilder from '@axe-core/playwright';
import { test, expect, NOW, noHorizontalOverflow } from './fixtures';
test.use({ timezoneId: 'America/Chicago' });
const CHI = 'evt_6cec3c5b2b52dd5a55a4';
test.beforeEach(async ({ page }) => page.clock.install({ time: NOW }));

test('Games broadcast layout uses the actual approved venue and filters @smoke', async ({ page, isMobile }) => {
  if (!isMobile) await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(`#/design/sift2/games?game=${CHI}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Games', exact: true })).toBeVisible();
  await expect(page.locator('.s2-games__lead .s2-broadcast[data-hero-kind="photo"] .hart__photo')).toBeVisible();
  await expect(page.locator('.s2-games__lead .s2-broadcast')).toContainText('Soldier Field');
  await noHorizontalOverflow(page, 'Games reference layout');
  const a11y = await new AxeBuilder({ page }).include('.s2-games').withTags(['wcag2a','wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('games-reference.png'), fullPage: true, scale: 'css' });
  await page.screenshot({ path: test.info().outputPath('games-viewport.png') });
  await page.getByRole('group', { name: 'Game status', exact: true }).getByRole('button', { name: 'final', exact: true }).click();
  await expect(page).toHaveURL(/status=final/);
  await noHorizontalOverflow(page, 'Filtered games');
});

test('Game Command Center presents approved venue art and four primary tabs @smoke', async ({ page, isMobile }) => {
  if (!isMobile) await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(`#/design/sift2/nfl/game/${CHI}`);
  await expect(page.locator('.sift2-command .s2-broadcast[data-hero-kind="photo"] .hart__photo')).toBeVisible();
  await expect(page.locator('.sift2-command .gov--dash')).toBeVisible();
  const a11y = await new AxeBuilder({ page }).include('.sift2-command').withTags(['wcag2a','wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);
  await noHorizontalOverflow(page, 'Photo game reference layout');
  if (!isMobile) {
    expect((await page.locator('.gdash__read').boundingBox())!.width).toBeGreaterThan(230);
    expect((await page.locator('.gdash__scripts').boundingBox())!.width).toBeGreaterThan(230);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('command-reference.png'), fullPage: true, scale: 'css' });
  await page.screenshot({ path: test.info().outputPath('command-viewport.png') });
  await page.locator('.sift2-command>.gtabs').getByRole('link', { name: 'Players', exact: true }).click();
  await expect(page).toHaveURL(/tab=props/);
  await expect(page.locator('.s2-player-list .s2-player').first()).toBeVisible();
  const query = page.getByRole('searchbox', { name: 'Search players, props or markets' });
  await query.fill('zz-no-player');
  await expect(page.getByText(/No published player snapshots match/)).toBeVisible();
  await query.fill('');
  await noHorizontalOverflow(page, 'Game player research');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: test.info().outputPath('command-players.png'), fullPage: true, scale: 'css' });
  await page.getByRole('button', { name: 'Alt lines & full research' }).click();
  await expect(page.locator('#s2-full-props')).toHaveAttribute('open');
  await expect(page).toHaveURL(/tab=props/);
});
