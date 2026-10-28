// Visual regression for the 26 locked research designs and the four root tabs (e2e/support/fidelityScenes.ts), from the COMMITTED real-document fixtures only
// (offline, each family on its pinned clock, quote prices from freshQuotes, animations off, web fonts loaded). Chromium phone project only (390x844).
// The baselines were generated against the PRODUCTION build served by `vite preview` (V3_SERVER=preview after `npm run build:e2e`, the server CI uses): the dev
// server transforms CSS differently and, from a symlinked node_modules, cannot serve the web fonts, so it is not expected to match.
//
// Baselines: e2e/v3-fidelity.spec.ts-snapshots/<scene>-v3-phone-linux.png, generated in the Linux Chromium sandbox
// (SIFT_CHROMIUM=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome; CI Linux is the same family). Regenerate after an intended visual change with
//   V3_PROJECTS=v3-phone SIFT_CHROMIUM=... npx playwright test -c playwright.v3.config.ts --workers=1 e2e/v3-fidelity.spec.ts --update-snapshots
// and review the images in the diff. A different OS or browser build is NOT expected to match (font rasterisation), see docs/sift3/qa/impl/fidelity/REPORT.md.
//
// V3_FIDELITY_OUT=<dir> writes each scene as a 2x PNG instead of asserting (the comparison images in docs/sift3/qa/impl/fidelity use this);
// V3_FIDELITY_VIEWPORT=375x667 changes the phone; V3_FIDELITY_ONLY=P1,SD2 picks scenes.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { SCENES, serveScene, steady } from './support/fidelityScenes';

const OUT = process.env.V3_FIDELITY_OUT;
const [W, H] = (process.env.V3_FIDELITY_VIEWPORT ?? '390x844').split('x').map(Number);
const ONLY = process.env.V3_FIDELITY_ONLY?.split(',');

test.use({ timezoneId: 'America/New_York', locale: 'en-US', viewport: { width: W, height: H }, deviceScaleFactor: OUT ? 2 : 1 });
test.setTimeout(150_000);

// Reviewed thresholds. Three consecutive runs on this machine gave 0 differing pixels for all 30 scenes, so the budget is for cross-machine rasterisation only:
// 0.2% of the 390x844 frame (about 660 pixels: less than one line of text set in a different weight) with a per-pixel colour tolerance of 0.2 (YIQ).
// A moved card, a missing element, a wrapped or truncated label or a changed colour token exceeds it.
const THRESHOLD = { maxDiffPixelRatio: 0.002, threshold: 0.2 };

test.describe('Visual fidelity: locked designs and root tabs @v3-visual', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'baselines are Chromium (Linux) only');
  for (const s of SCENES.filter((x) => !ONLY || ONLY.includes(x.id))) {
    test(`${s.id}: ${s.title}`, async ({ page }) => {
      await serveScene(page, s.family);
      await page.goto(`./#${s.route}`);
      await expect(page.locator('[data-v3-shell]')).toBeVisible();
      await expect(page.locator(s.ready).first()).toBeVisible({ timeout: 90_000 });
      await page.waitForTimeout(500);
      await s.prep?.(page);
      await steady(page);
      if (OUT) { mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: join(OUT, `${s.id}-${W}x${H}.png`) }); return; }
      await expect(page).toHaveScreenshot(`${s.id}.png`, { animations: 'disabled', caret: 'hide', ...THRESHOLD });
    });
  }
});
