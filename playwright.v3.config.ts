import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// SIFT 3.0 acceptance: the v3 specs (e2e/v3*.spec.ts). Three projects, individually selectable:
//   v3-phone       Chromium, Pixel 7 (390 x 844)
//   v3-iphone      WebKit, iPhone 15 Pro
//   v3-iphone-se   WebKit, iPhone SE (3rd gen, 375 x 667)
//
//   npx playwright test -c playwright.v3.config.ts                          locally: the Chromium project; in CI (CI=true): all three
//   V3_PROJECTS=v3-iphone npx playwright test -c playwright.v3.config.ts     exactly the named project(s), comma separated, anywhere
//   V3_WEBKIT=1 npx playwright test -c playwright.v3.config.ts               locally: all three (needs `npx playwright install webkit`)
//
// Server: by default the Vite dev server (the fast local loop). With V3_SERVER=preview the specs run against the PRODUCTION build served at the GitHub Pages
// base path (`npm run build:e2e` first; this is what .github/workflows/v3-ci.yml does). V3_BASE names any other running server. V3_PORT picks the port.
//
// Real-document specs read the committed fixture bundle (fixtures/real) offline on each family's pinned clock; see fixtures/real/README.md.
// V3_REAL_FEEDS=live refills a scratch cache from the network instead.
//
// Browsers: in the build sandbox the pre-installed Chromium has a different build number than the pinned Playwright expects, so SIFT_CHROMIUM (or the
// known sandbox path) is used as the executable, and Playwright's own WebKit cannot be downloaded there (WebKitGTK, scripts/v3-qa, is the engine check
// there). CI installs both engines and runs all three projects.
const ci = !!process.env.CI;
const chromium = process.env.SIFT_CHROMIUM ?? ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find(existsSync);
const port = Number(process.env.V3_PORT || 5173);
const base = process.env.V3_BASE ?? `http://localhost:${port}/sift-sports-intelligence/`;
const wantWebkit = process.env.V3_WEBKIT === '1' || ci;

const all = [
  { name: 'v3-phone', engine: 'chromium', use: { ...devices['Pixel 7'], browserName: 'chromium' as const, viewport: { width: 390, height: 844 }, launchOptions: chromium ? { executablePath: chromium } : {} } },
  { name: 'v3-iphone', engine: 'webkit', use: { ...devices['iPhone 15 Pro'] } },
  { name: 'v3-iphone-se', engine: 'webkit', use: { ...devices['iPhone SE (3rd gen)'] } },
];
const only = process.env.V3_PROJECTS?.split(',').map((s) => s.trim()).filter(Boolean);
for (const n of only ?? []) if (!all.some((p) => p.name === n)) throw new Error(`V3_PROJECTS names an unknown project "${n}" (v3-phone, v3-iphone, v3-iphone-se)`);
const projects = all.filter((p) => (only ? only.includes(p.name) : p.engine === 'chromium' || wantWebkit)).map(({ name, use }) => ({ name, use }));

export default defineConfig({
  testDir: './e2e',
  testMatch: /v3.*\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL: base, trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'block' },
  webServer: process.env.V3_BASE
    ? undefined
    : {
        command: process.env.V3_SERVER === 'preview' ? `node scripts/e2e-preview.mjs --port ${port}` : `npx vite --port ${port} --strictPort`,
        url: base,
        reuseExistingServer: !ci,
        timeout: 90_000,
      },
  projects,
});
