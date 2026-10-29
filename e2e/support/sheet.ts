import { expect, type Page } from '@playwright/test';

/**
 * Escape, once the open sheet is ready for it. A sheet is in the DOM (and visible) a moment before the effect that moves focus into it and attaches its Escape handler
 * has run, so a key pressed the instant the dialog appears can be lost on a slower engine or runner. Focus inside the dialog is the signal that step has happened.
 */
export async function escapeSheet(page: Page) {
  await expect(page.locator('[role="dialog"]:focus-within')).toHaveCount(1);
  await page.keyboard.press('Escape');
}
