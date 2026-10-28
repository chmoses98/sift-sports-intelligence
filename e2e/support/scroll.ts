// Scroll helpers for specs that compare the page's offset before and after an action.
import type { Locator, Page } from '@playwright/test';

/** Two animation frames: scroll events and the app's reaction to them have run (scroll events are dispatched in the rendering step, before the next frame's callbacks). */
export const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/**
 * Take the offset a test compares against AFTER Playwright has done its own scrolling for `target`. A click scrolls its target into view first when something
 * (a sticky bar, the tab bar) covers it at the current offset, and on a short phone that is the usual case: measuring before the click then measures an offset the
 * click itself changes. A trial click performs the same actionability checks and scrolling without clicking, so the offset read afterwards is the one the real click
 * starts from and the one the app must preserve.
 */
export async function offsetBeforeClick(page: Page, target: Locator): Promise<number> {
  await target.click({ trial: true });
  await frames(page);
  return page.evaluate(() => Math.round(window.scrollY));
}
