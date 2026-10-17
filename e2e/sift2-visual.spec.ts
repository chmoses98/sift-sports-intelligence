// Visual regression for SIFT 2.0, the interface production ships (the classic screens are covered by visual.spec.ts).
// Home, Games, the Game Command Center (overview and Markets), the Market board and the Player Prop Explorer, in Chromium phone and
// desktop and WebKit iPhone. Deterministic like visual.spec.ts: the bundled NFL publication, fixture quotes stamped at a fixed time,
// a fixed clock, animations off, fonts and held images settled. Baselines live in e2e/__screenshots__/<project>/ and are rendered on
// CI's Linux runners (the visual-baselines workflow), so they match what CI compares against.
import type { Page } from '@playwright/test';
import { expect, NEBUF, NOW, test } from './fixtures';
import { installSlates } from './slates';

const SIFT = '#/design/sift2';
/**
 * The venue art (stadium photo, and the team-crest watermark behind a hero that has no photo) is decorative, fetched after first paint
 * and held as a blob (useHeldImage), so how much of it has appeared at capture time varies from one render to the next on a loaded CI
 * runner (iPhone Home and Games: the crest's blur present in one run, absent in another). The screens are compared for layout, text and
 * controls with that art masked; the art itself is checked by hero.spec.ts.
 */
const ART = '.s2-venue-art';

/** Fonts loaded, no skeletons, and every image the screen has already started (stadium art, logos) decoded: a half-loaded photo is noise. */
async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.skel')).toHaveCount(0);
  // Logos and photos are fetched after first paint and held as blobs (useHeldImage), so an <img> can mount a moment after the
  // page looks ready: capture only once the set of images has stopped changing and every one is decoded. A shot taken earlier
  // differs from one taken later (the crest's blur appears behind the hero).
  const images = () => page.evaluate(() => `${document.images.length}:${[...document.images].filter((i) => !i.complete).length}`);
  await expect.poll(async () => {
    const before = await images();
    await page.waitForTimeout(500);
    return before === (await images()) && before.endsWith(':0');
  }).toBe(true);
  await page.waitForLoadState('networkidle');
  await page.mouse.move(0, 0);
}

test.beforeEach(async ({ page, market }) => {
  // Every sport beside the bundled NFL publication is synthetic (e2e/slates.ts), so Home, Games and the Market board show a
  // realistic multi-sport day that never changes.
  await installSlates(page.context(), { NBA: 8, NHL: 6, MLB: 5, CFB: 4 }, { now: NOW });
  await page.clock.setFixedTime(NOW);
  market.observedAt = NOW.toISOString();
});

const SCREENS: { name: string; url: string; wait: (p: Page) => Promise<unknown>; full?: boolean; mask?: string[] }[] = [
  { name: 'sift2-home', url: `${SIFT}/home`, wait: (p) => p.getByRole('heading', { name: "Today's games" }).waitFor(), full: true },
  { name: 'sift2-games', url: `${SIFT}/games`, wait: (p) => p.locator('.s2-gg__list .s2-gr').first().waitFor() },
  { name: 'sift2-game', url: `${SIFT}/nfl/game/${NEBUF}`, wait: (p) => p.locator('.sift2-command > nav.gtabs').waitFor(), full: true },
  { name: 'sift2-market-board', url: `${SIFT}/intelligence/markets`, wait: (p) => p.locator('.mktboard').waitFor() },
  { name: 'sift2-props', url: `${SIFT}/props`, wait: (p) => p.locator('.tprow').first().waitFor() },
];

for (const s of SCREENS) {
  test(`${s.name} @visual`, async ({ page, isMobile }) => {
    await page.goto(s.url);
    await s.wait(page);
    await ready(page);
    // Phones are compared viewport by viewport (a full-page capture would include the fixed bottom bar mid-page).
    await expect(page).toHaveScreenshot(`${s.name}.png`, { fullPage: !!s.full && !isMobile, mask: [page.locator(ART), ...(s.mask ?? []).map((m) => page.locator(m))] });
  });
}

// The Markets tab is where the filter bar once ran past the viewport; its quote-freshness line changes when the live check lands, at
// engine-dependent times, so it is masked. The tab is shown scrolled to the board's own filter bar, under the sticky tabs.
test('sift2-game-markets @visual', async ({ page }) => {
  await page.goto(`${SIFT}/nfl/game/${NEBUF}?tab=markets`);
  const board = page.locator('#g-markets');
  await expect(board.locator('.mboard__bar')).toBeVisible();
  // Prices are the publication's capture until the first live quote lands, at an engine-dependent moment: capture after it.
  await expect(board.locator('.gquote .qchip')).toHaveAttribute('data-quote-source', 'live');
  await ready(page);
  await board.locator('.mboard__bar').evaluate((bar) => {
    const tabs = document.querySelector<HTMLElement>('.sift2-command > nav.gtabs');
    const stuck = tabs ? parseFloat(getComputedStyle(tabs).top) + tabs.offsetHeight : 0;
    window.scrollTo(0, Math.round(bar.getBoundingClientRect().top + window.scrollY - stuck - 8));
  });
  await expect(page).toHaveScreenshot('sift2-game-markets.png', { mask: [board.locator('.gquote'), page.locator(ART)] });
});
