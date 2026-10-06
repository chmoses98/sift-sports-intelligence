// Page context is never stale: a player page's breadcrumb runs through HIS game, whatever was open before,
// on in-app navigation, direct links, back/forward and refresh. The featured game carries no decorative
// script bar. On phones, nothing visible is left under the fixed tab bar at the end of a page.
import type { Page } from '@playwright/test';
import { ALLEN, expect, NEBUF, NOW, test } from './fixtures';

const ATLNO = 'evt_639f74e87ff25310c542';
const BIJAN = 'prt_5927da3683214ca87558';
const crumbs = (page: Page) => page.locator('.trail li');
async function expectCrumbs(page: Page, labels: string[]) {
  await expect(crumbs(page)).toHaveText(labels);
}

test.beforeEach(async ({ page }) => page.clock.setFixedTime(NOW));

test('players opened from different games each show their own game', async ({ page }) => {
  await page.goto(`./#/nfl/game/${NEBUF}`);
  await page.getByRole('heading', { name: 'What Matters' }).waitFor();
  await page.goto(`./#/nfl/game/${ATLNO}`);
  await page.getByRole('heading', { name: 'What Matters' }).waitFor();
  await expectCrumbs(page, ['NFL', 'ATL @ NO']);
  await page.locator('.pcard__who').filter({ hasText: 'Bijan Robinson' }).first().click();
  await expect(page.getByRole('heading', { name: 'Bijan Robinson', level: 1 })).toBeVisible();
  await expectCrumbs(page, ['NFL', 'ATL @ NO', 'Bijan Robinson']);
  await page.goto(`./#/nfl/game/${NEBUF}`);
  await page.getByRole('heading', { name: 'What Matters' }).waitFor();
  await expectCrumbs(page, ['NFL', 'NE @ BUF']);
  await page.goto(`./#/nfl/player/${ALLEN}`);
  await expect(page.getByRole('heading', { name: 'Josh Allen', level: 1 })).toBeVisible();
  await expectCrumbs(page, ['NFL', 'NE @ BUF', 'Josh Allen']);
});

test('a direct link with another game in the path, back/forward and refresh never leak context', async ({ page }) => {
  await page.goto(`./#/nfl/game/${NEBUF}`);
  await page.getByRole('heading', { name: 'What Matters' }).waitFor();
  // Bijan plays ATL @ NO: the stale NE @ BUF step must not become his context.
  await page.goto(`./#/nfl/player/${BIJAN}`);
  await expect(page.getByRole('heading', { name: 'Bijan Robinson', level: 1 })).toBeVisible();
  await expectCrumbs(page, ['NFL', 'ATL @ NO', 'Bijan Robinson']);
  await expect(crumbs(page).filter({ hasText: 'NE @ BUF' })).toHaveCount(0);
  await page.goBack();
  await page.getByRole('heading', { name: 'What Matters' }).waitFor();
  await expectCrumbs(page, ['NFL', 'NE @ BUF']);
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Bijan Robinson', level: 1 })).toBeVisible();
  await expectCrumbs(page, ['NFL', 'ATL @ NO', 'Bijan Robinson']);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bijan Robinson', level: 1 })).toBeVisible();
  await expectCrumbs(page, ['NFL', 'ATL @ NO', 'Bijan Robinson']);
  // The ATL @ NO step is a real link to his game.
  await expect(crumbs(page).getByRole('link', { name: 'ATL @ NO' })).toHaveAttribute('href', `#/nfl/game/${ATLNO}`);
});

test('the featured game states its most likely script in words, with no decorative script bar', async ({ page }) => {
  for (const url of ['./#/', './#/nfl']) {
    await page.goto(url);
    const card = page.locator('.fcard').first();
    await expect(card).toBeVisible();
    await expect(card.locator('.fcard__lead')).toContainText(/Most likely: .+ \d+%/);
    await expect(page.locator('.sbar, .sbar__seg')).toHaveCount(0);
  }
});

test('phones: at the end of every page nothing visible sits under the tab bar @smoke', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the tab bar is a phone control');
  for (const url of ['./#/', './#/news', `./#/nfl/game/${ATLNO}`, `./#/nfl/game/${ATLNO}?tab=props`, `./#/nfl/player/${BIJAN}`, './#/nfl']) {
    await page.goto(url);
    await page.locator('main h1, main h2').first().waitFor();
    await expect(page.locator('.skel, .gcard__hook--load')).toHaveCount(0);
    // Layout, not scroll timing (WebKit scrolls asynchronously): fully scrolled, the bar covers the last
    // bar-height of the document, so every visible control must end above that band.
    const hidden = await page.evaluate(() => {
      const barH = document.querySelector('.bottombar')!.getBoundingClientRect().height;
      const end = document.documentElement.scrollHeight - barH;
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('main a, main button, main summary, footer a')) {
        const r = el.getBoundingClientRect();
        const visible = r.height > 0 && (el.checkVisibility ? el.checkVisibility() : true) && !el.closest('details:not([open]) > :not(summary)');
        const bottom = r.bottom + window.scrollY;
        if (visible && bottom > end + 1) out.push(`${el.tagName} "${el.textContent?.trim().slice(0, 30)}" ends at ${Math.round(bottom)} vs ${Math.round(end)}`);
      }
      return out;
    });
    expect(hidden, url).toEqual([]);
  }
});
