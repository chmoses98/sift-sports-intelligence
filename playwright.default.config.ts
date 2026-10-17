import { defineConfig, devices } from '@playwright/test';

// The release configuration: a build with SIFT 2.0 as the default interface (npm run build:e2e:default), served from
// dist-default at the GitHub Pages base path. The legacy acceptance suite (playwright.config.ts) runs against the
// classic build; this one proves what replacing production changes: classic addresses answer with SIFT 2.0.
const port = Number(process.env.SIFT_E2E_DEFAULT_PORT || 4175);
export default defineConfig({
  testDir: './e2e-default',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [['list']],
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  use: { baseURL: `http://localhost:${port}/sift-sports-intelligence/`, trace: 'retain-on-failure', serviceWorkers: 'block' },
  webServer: {
    command: `node scripts/e2e-preview.mjs --outDir dist-default --port ${port}`,
    url: `http://localhost:${port}/sift-sports-intelligence/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'iphone', use: { ...devices['iPhone 15 Pro'] } },
  ],
});
