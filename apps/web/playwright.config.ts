import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: process.env.TICKETING_E2E_BASE_URL ?? "http://127.0.0.1:3013",
    trace: "retain-on-failure",
  },
  webServer: process.env.CI
    ? {
        command: "npm run dev -- --hostname 127.0.0.1 --port 3013",
        url: "http://127.0.0.1:3013/tickets/toegang",
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
});
