import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    { command: "npm run preview -- --host 127.0.0.1", port: 4173, reuseExistingServer: true },
    { command: "node tools/static_subpath_server.mjs dist 4174", port: 4174, reuseExistingServer: true },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
