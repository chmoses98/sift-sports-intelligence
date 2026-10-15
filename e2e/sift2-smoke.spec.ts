import AxeBuilder from '@axe-core/playwright';
import { test, expect, NOW } from './fixtures';

test.beforeEach(async ({ page }) => page.clock.install({ time: NOW }));

// SIFT 2.0 remains isolated from the production Home route.
// Smoke checks cover actual browser layout, not model performance or price accuracy.
test('SIFT 2.0 Home renders published-data states without horizontal overflow @smoke', async ({ page }) => {
  await page.goto('#/design/sift2/home');
  await expect(page.getByRole('heading', { level: 1, name: "Today's command center" })).toBeVisible();
  await expect(page.getByRole('heading', { name: "Today's games" })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Player Prop Explorer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What matters today' })).toBeVisible();
  await expect(page.getByText('DESIGN PREVIEW · PUBLISHED SLATE')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('link', { name: /Open current prop board/ })).toHaveAttribute('href', /props/);
  await expect(page.getByRole('link', { name: /Open intelligence/ })).toHaveAttribute('href', /intelligence/);
  await expect(page.getByText('Loading published slate…')).toBeHidden();
  const accessibility = await new AxeBuilder({ page }).include('.sift2-home').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.sift2-home__marks')).toBeVisible();
  await expect(page.locator('.sheet[aria-hidden="true"]')).toBeHidden();
  await page.screenshot({ path: test.info().outputPath('sift2-home.png'), fullPage: true });
  await page.screenshot({ path: test.info().outputPath('sift2-home-viewport.png') });
});

test('SIFT 2.0 hero preview preserves heading and phone toggle @smoke', async ({ page }) => {
  await page.goto('#/design/sift2/hero');
  await expect(page.getByRole('heading', { level: 1, name: 'Buffalo Bills at Kansas City Chiefs' })).toBeVisible();
  await page.getByRole('button', { name: 'Preview phone width' }).click();
  await expect(page.getByRole('button', { name: 'Show full width' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
