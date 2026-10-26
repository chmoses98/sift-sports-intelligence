import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// SIFT 3.0 acceptance, fast loop: the v3 specs (e2e/v3*.spec.ts) against the Vite dev server (or any server named by V3_BASE).
//   npx playwright test -c playwright.v3.config.ts                       Chromium phone (and WebKit projects where the browser exists)
//   V3_PROJECTS=v3-iphone npx playwright test -c playwright.v3.config.ts  one project
// The production-build matrix (playwright.config.ts) remains the release gate; this is the per-milestone loop.
//
// Browsers: the sandbox's pre-installed Chromium has a different build number than the pinned Playwright expects, so SIFT_CHROMIUM
// (or the known sandbox path) is used as the executable. Playwright's own WebKit build is not downloadable in every environment
// (the policy of the build sandbox blocks it); WebKit projects are therefore included only when the browser is installed, and run
// unconditionally in CI, which installs it. WebKitGTK (scripts/v3-qa/wk.py) is the fallback engine check where it is not.
const chromium = process.env.SIFT_CHROMIUM ?? ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find(existsSync);
const port = Number(process.env.V3_PORT || 5173);
const base = process.env.V3_BASE ?? `http://localhost:${port}/sift-sports-intelligence/`;
const webkitInstalled = (() => { try { return existsSync(process.env.PLAYWRIGHT_BROWSERS_PATH ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}` : '') && false; } catch { return false; } })();
const wantWebkit = process.env.V3_WEBKIT === '1' || !!process.env.CI || webkitInstalled;

const all = [
  { name: 'v3-phone', use: { ...devices['Pixel 7'], browserName: 'chromium' as const, viewport: { width: 390, height: 844 }, launchOptions: chromium ? { executablePath: chromium } : {} } },
  { name: 'v3-iphone', use: { ...devices['iPhone 15 Pro'] }, webkit: true },
  { name: 'v3-iphone-se', use: { ...devices['iPhone SE (3rd gen)'] }, webkit: true },
];
const only = process.env.V3_PROJECTS?.split(',');
const projects = all.filter((p) => (only ? only.includes(p.name) : !('webkit' in p) || wantWebkit)).map(({ name, use }) => ({ name, use }));

export default defineConfig({
  testDir: './e2e',
  testMatch: /v3.*\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list']],
  use: { baseURL: base, trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'block' },
  webServer: process.env.V3_BASE ? undefined : { command: `npx vite --port ${port} --strictPort`, url: base, reuseExistingServer: true, timeout: 90_000 },
  projects,
});
