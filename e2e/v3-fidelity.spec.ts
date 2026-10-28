// Visual regression for the 26 locked research designs and the four root tabs (e2e/support/fidelityScenes.ts), from the COMMITTED real-document fixtures only
// (offline, each family on its pinned clock, quote prices from freshQuotes, animations off, web fonts loaded). Chromium phone project only (390x844).
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

// A regression this small is a real change (one text line is about 0.6% of the frame); anti-aliasing noise between runs is far below it.
const THRESHOLD = { maxDiffPixelRatio: 0.004, threshold: 0.2 };

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
