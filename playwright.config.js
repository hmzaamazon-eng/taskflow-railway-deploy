// Playwright E2E config for TaskFlow.
// Boots the real app server (node server.js) with no DATABASE_URL — the API then
// returns 503 and the front-end falls back to its localStorage cache, which is
// exactly the persistence path these tests exercise (add → save → reload).
const { defineConfig, devices } = require("@playwright/test");

const PORT = process.env.E2E_PORT || 4599;
const BASE = `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 40000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE,
    actionTimeout: 10000,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "on-first-retry",
  },
  webServer: {
    command: "node server.js",
    url: `${BASE}/healthz`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  // Four real-world viewports. Phone/tablet use device presets (touch + UA);
  // laptop/desktop use explicit viewports.
  projects: [
    { name: "iphone", use: { ...devices["iPhone 13"] } },
    { name: "ipad", use: { ...devices["iPad (gen 7)"] } },
    { name: "laptop", use: { viewport: { width: 1366, height: 768 } } },
    { name: "desktop", use: { viewport: { width: 1920, height: 1080 } } },
  ],
});
