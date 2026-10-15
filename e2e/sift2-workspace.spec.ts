import AxeBuilder from '@axe-core/playwright';
import { test, expect, NOW, NEBUF, noHorizontalOverflow } from './fixtures';

test.beforeEach(async ({ page }) => page.clock.install({ time: NOW }));

test('Game Command Center keeps primary tabs and deep research available @smoke', async ({ page }) => {
  await page.goto(`#/design/sift2/nfl/game/${NEBUF}`);
  await expect(page.locator('.sift2-command .gov--dash')).toBeVisible();
  const evidence = page.locator('.sift2-command__evidence');
  await expect(evidence).not.toHaveAttribute('open');
  await evidence.locator(':scope > summary').click();
  await expect(page.getByRole('heading', { name: 'What Matters', exact: true })).toBeVisible();
  await evidence.locator(':scope > summary').click();
  const game = page.locator('.sift2-command');
  const a11y = await new AxeBuilder({ page }).include('.sift2-command').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('sift2-game-overview.png'), fullPage: true });
  await page.screenshot({ path: test.info().outputPath('sift2-game-viewport.png') });
  await expect(game.getByRole('link', { name: 'Overview', exact: true })).toBeVisible();
  await game.getByRole('link', { name: 'Matchups', exact: true }).click();
  await expect(page).toHaveURL(/design\/sift2\/nfl\/game\/.*tab=matchup/);
  await expect(page.getByRole('heading', { name: 'Unit by unit', exact: true })).toBeVisible();
  await game.getByRole('link', { name: 'Players', exact: true }).click();
  await expect(page).toHaveURL(/tab=props/);
  await game.locator('summary').filter({ hasText: 'More game research' }).click();
  await game.locator('.sift2-command__more').getByRole('link', { name: 'Scripts', exact: true }).click();
  await expect(page).toHaveURL(/tab=script/);
  await expect(page.getByRole('heading', { name: 'Choose a script', exact: true })).toBeVisible();
  await noHorizontalOverflow(page, 'SIFT 2.0 game');
  await page.screenshot({ path: test.info().outputPath('sift2-game.png'), fullPage: true });
});

for (const [slug, title] of [['props', 'Player prop explorer'], ['intelligence', 'Terminal'], ['lab', 'Research Lab']]) {
  test(`SIFT 2.0 ${slug} reuses published research and fits the screen @smoke`, async ({ page }) => {
    await page.goto(`#/design/sift2/${slug}`);
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
    await expect(page.locator('.sift2-workspace .skel')).toHaveCount(0);
    await noHorizontalOverflow(page, `SIFT 2.0 ${slug}`);
    await expect(page.getByRole('navigation', { name: 'SIFT 2.0 preview destinations' })).toBeVisible();
    const a11y = await new AxeBuilder({ page }).include('.sift2-workspace').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(a11y.violations).toEqual([]);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: test.info().outputPath(`sift2-${slug}.png`), fullPage: true });
  });
}
