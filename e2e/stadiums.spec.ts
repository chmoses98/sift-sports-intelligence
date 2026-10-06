// Stadium media (phone + desktop Chromium; tagged @smoke so WebKit iPhones run it too): the right
// derivative per viewport, the roof / weather scene on the hero, the designed fallback where no photo is
// approved, a published neutral site honoured, no sideways scroll and no accessibility regression.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, NEBUF, noHorizontalOverflow, NOW, test } from './fixtures';

const LV = 'evt_73e8c61bbaf3676c7782'; // KC @ LV, Allegiant Stadium (fixed roof, approved photo)
const LONDON = 'evt_3b227bf15128bfcc8a91'; // WAS "home" at Tottenham Hotspur Stadium (neutral site)

function stadiumRequests(page: Page) {
  const seen: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/stadiums/')) seen.push(r.url().split('/').pop()!);
  });
  return seen;
}

test.beforeEach(async ({ page }) => page.clock.install({ time: NOW }));

test('an approved photo is served as the mobile crop on phones and the desktop file otherwise @smoke', async ({ page, isMobile }) => {
  const seen = stadiumRequests(page);
  await page.goto(`./#/nfl/game/${LV}`);
  await page.getByRole('heading', { name: 'Model Read' }).waitFor();
  const bg = page.locator('.mh__bg');
  await expect(bg.locator('img')).toBeVisible();
  expect(seen).toEqual([isMobile ? 'allegiant-stadium-m.webp' : 'allegiant-stadium.webp']);
  // A fixed roof: the indoor scene, no weather layers, and the text says so.
  await expect(bg).toHaveAttribute('data-scene', 'indoor');
  expect(await bg.getAttribute('data-layers')).toBeNull();
  await expect(bg).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.mh .wx')).toContainText('Indoor');
  // The credit still links to the provenance table.
  await expect(page.locator('.mh__credit')).toContainText('CC BY-SA 2.0');
  // Decorative: the image is not exposed, and the box does not shift when it arrives.
  await expect(bg.locator('img')).toHaveAttribute('alt', '');
  await noHorizontalOverflow(page, 'game with stadium photo');
});

test('no approved photo: the designed fallback, no stadium download @smoke', async ({ page }) => {
  const seen = stadiumRequests(page);
  await page.goto(`./#/nfl/game/${NEBUF}`);
  await page.getByRole('heading', { name: 'Model Read' }).waitFor();
  await expect(page.locator('.mh--nophoto .mh__bg .sfb')).toBeVisible();
  await expect(page.locator('.mh__venue')).toContainText('Highmark Stadium');
  expect(seen).toEqual([]);
  // Outdoor, with a published kickoff forecast: the scene is decided (it renders no layer without a photo).
  await expect(page.locator('.mh__bg')).toHaveAttribute('data-scene', /^outdoor/);
});

test('a neutral-site game shows the published venue, not the nominal home stadium', async ({ page }) => {
  const seen = stadiumRequests(page);
  await page.goto(`./#/nfl/game/${LONDON}`);
  await page.getByRole('heading', { name: 'Model Read' }).waitFor();
  await expect(page.locator('.mh__venue')).toContainText('Tottenham Hotspur Stadium');
  await expect(page.locator('.mh__venue')).toContainText('London');
  await expect(page.locator('.mh--nophoto .sfb__fascia')).toContainText('Tottenham Hotspur Stadium');
  expect(seen).toEqual([]);
});

test('stadium hero pages stay accessible', async ({ page }) => {
  await page.goto(`./#/nfl/game/${LV}`);
  await page.getByRole('heading', { name: 'Model Read' }).waitFor();
  await expect(page.locator('.mh__bg img')).toBeVisible();
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = res.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(blocking.map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
});
