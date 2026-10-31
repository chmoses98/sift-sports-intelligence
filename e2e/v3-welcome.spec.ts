// The first-run Welcome sheet: a truthful, aspirational description (no "never a pick", no claim that SIFT never will), the same sheet layout,
// no horizontal overflow at 320 to 430 pt, and the way out always reachable. Real published documents (the sheet opens only over real data).
import { test, expect } from '@playwright/test';
import { feedNow, useRealFeeds } from './support/realFeeds';

const FAMILY = 'game' as const; // the committed `game` fixture family (fixtures/real)

test.setTimeout(120_000);
test.describe.configure({ mode: 'parallel' });
test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

for (const w of [320, 375, 390, 430]) {
  test(`Welcome at ${w} pt: connected intelligence, honest about today, nothing implied`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 });
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
    await page.clock.setFixedTime(feedNow(FAMILY));
    await useRealFeeds(page, { family: FAMILY });
    await page.goto('./#/v3');
    const sheet = page.locator('.v3-welcome');
    await expect(sheet).toBeVisible({ timeout: 40_000 });
    const text = (await sheet.innerText()).replace(/\s+/g, ' ');
    // What it says: connected sports and market intelligence, the direction, and what is true today.
    expect(text).toContain('SIFT connects sports and market intelligence');
    for (const part of ['schedules', 'team and player research', 'Kalshi prices', 'observed history']) expect(text).toContain(part);
    expect(text).toContain('building toward surfacing validated betting opportunities as the evidence earns them');
    expect(text).toContain('Today SIFT shows research, prices and history, and model estimates only where they have passed validation');
    expect(text).toContain('No account. No alerts unless you ask.');
    // What it must not say: the old absolute, or anything that implies picks, edges or recommendations exist today or never will.
    expect(text).not.toMatch(/never a pick|research, never|never will|no picks|will never/i);
    expect(text).not.toMatch(/\b(guaranteed|sure thing|best bet|today's picks|our picks)\b/i);
    // The layout is the sheet's own: title, close, the follow grid, one call to action; nothing sideways.
    await expect(page.getByText('Welcome to SIFT').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    expect(await sheet.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    await expect(sheet.locator('.v3-wt')).toHaveCount(12);
    const cta = sheet.getByRole('button', { name: 'Explore without setup' });
    await cta.scrollIntoViewIfNeeded();
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(sheet).toHaveCount(0);
  });
}

test('Welcome is shown once: a viewer who has been welcomed goes straight to Home', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ onboarded: true })); } catch { /* */ } });
  await page.clock.setFixedTime(feedNow(FAMILY));
  await useRealFeeds(page, { family: FAMILY });
  await page.goto('./#/v3');
  await expect(page.locator('.v3-gclist .v3-gc').first()).toBeVisible({ timeout: 40_000 });
  await expect(page.locator('.v3-welcome')).toHaveCount(0);
});
