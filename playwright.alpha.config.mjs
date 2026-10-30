import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./alpha-lab",
  testMatch: "**/*.spec.mjs",
  fullyParallel: true,
  retries: 0,
  use: { baseURL: "http://127.0.0.1:5181/", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone-webkit", use: { ...devices["iPhone 13"] } }
  ],
  webServer: {
    command: "npx vite --config vite.alpha.config.mjs --host 127.0.0.1 --port 5181 --strictPort",
    url: "http://127.0.0.1:5181/",
    timeout: 45000,
    reuseExistingServer: !process.env.CI
  }
});