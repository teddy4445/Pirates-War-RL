import { defineConfig, devices } from "@playwright/test";

const previewPort = Number(process.env.PLAYWRIGHT_PORT ?? 4273);
const subpathPort = Number(process.env.PLAYWRIGHT_SUBPATH_PORT ?? 4274);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${previewPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    { command: `npm run preview -- --host 127.0.0.1 --port ${previewPort}`, port: previewPort, reuseExistingServer: true },
    { command: `node tools/static_subpath_server.mjs dist ${subpathPort}`, port: subpathPort, reuseExistingServer: true },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
