import { defineConfig, devices } from "@playwright/test";

// Always runs against the production build (vite preview), never the dev server.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // other agents share this CPU; more than 2 workers times out
  workers: 2,
  // shared machine (other agents run browsers on 43xx): one retry absorbs contention timeouts
  retries: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:4331/pulse-energy-grid/" },
  webServer: {
    // restart-on-exit wrapper: a reaped preview comes back by itself (ENGINEERING_DECISIONS #30)
    command: "npm run build && node tests/serve.mjs",
    url: "http://localhost:4331/pulse-energy-grid/",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
});
