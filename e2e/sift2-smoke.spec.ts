import { test, expect } from '@playwright/test';

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
});

test('SIFT 2.0 hero preview preserves heading and phone toggle @smoke', async ({ page }) => {
  await page.goto('#/design/sift2/hero');
  await expect(page.getByRole('heading', { level: 1, name: 'Buffalo Bills at Kansas City Chiefs' })).toBeVisible();
  await page.getByRole('button', { name: 'Preview phone width' }).click();
  await expect(page.getByRole('button', { name: 'Show full width' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
