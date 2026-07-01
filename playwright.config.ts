import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests that run against a *deployed* instance over HTTP.
 * Defaults to the live production URL; override with E2E_BASE_URL to point at a
 * preview deployment or a local `npm run dev` server.
 *
 * These are intentionally separate from the Vitest unit suite (which is scoped
 * to `tests/**\/*.test.ts`) and are NOT run by `npm test`. Run with `npm run e2e`.
 */
const baseURL = process.env.E2E_BASE_URL ?? "https://reviewops-agent.vercel.app";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
