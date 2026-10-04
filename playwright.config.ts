import { defineConfig, devices } from '@playwright/test';

// Sift's acceptance suite runs against the production build (vite preview) at the GitHub Pages base
// path. The build must be made with `npm run build:e2e` (CI does): it points the live-quote relay at
// https://relay.sift.invalid/kalshi, which e2e/fixtures.ts answers deterministically.
//
// The matrix is small on purpose — one project per real layout class:
//   phone      Chromium, 390x844 (Android-class phone)          full journey, live market, degraded, visual, a11y
//   desktop    Chromium, 1280x900                               full journey, live market, degraded, visual, a11y
//   iphone     WebKit, iPhone 15 Pro (393x852, touch, Safari)   full journey, live market core, visual, smoke
//   iphone-se  WebKit, iPhone SE 3rd gen (375x667, smallest current iPhone)  smoke (layout, overflow, fixed controls)
const iphoneOnly = /@(smoke|journey|live|visual|diag)/;
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: {
    timeout: 20_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  use: {
    baseURL: 'http://localhost:4173/sift-sports-intelligence/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/sift-sports-intelligence/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'iphone', use: { ...devices['iPhone 15 Pro'] }, grep: iphoneOnly },
    { name: 'iphone-se', use: { ...devices['iPhone SE (3rd gen)'] }, grep: /@smoke/ },
  ],
});
