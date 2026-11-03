// Playwright, database suite (`npm run e2e:db`). Needs Postgres and the admin code from
// .env.local - the same setup as `npm run dev` with /admin working (docs/DEPLOY.md, README).
//
// Every test here creates its own throwaway company through /admin and deletes it at the end, so
// it can run against the shared local database without touching acme or anyone's login codes.
import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { randomBytes } from "node:crypto";

// The tests need ADMIN_ACCESS_CODE too, not only the server - read .env.local the way Next does.
loadEnvConfig(process.cwd());

const PORT = 3101;
const BASE = `http://localhost:${PORT}`;

// The company's IT and privacy console (ITC) exists only in a one-company stack (TENANT_MODE single,
// COMPANY_SLUG set), so its spec runs the server that way; every other spec here runs in path mode.
export const CONSOLE_SLUG = "itc-console";
const consoleRun = process.argv.some((a) => a.includes("itc-console"));

export default defineConfig({
  testDir: "tests/e2e/db",
  // One admin session and several logins share the cookie jar per test; keep them in order.
  fullyParallel: false,
  workers: 1,
  // The loop tests are whole stories (raise, ask, answer, decide), not single clicks.
  timeout: 90_000,
  // Role homes are a client-side redirect after the page hydrates; give assertions room to wait.
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "on-failure" }]],
  use: {
    baseURL: BASE,
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    // next.config.ts builds `output: "standalone"` for Docker, so `next start` prints a warning that
    // it wants .next/standalone/server.js. It still serves the build (pages, assets, actions) fine.
    command: `npm run build && npx next start -p ${PORT}`,
    url: `${BASE}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    // Links and redirects the app builds from these must point at this server, not :3000.
    // Managers enrol an authenticator (ADM-E1); the secret is sealed with the vault key. A fresh random
    // one per run when .env.local has none, so CI needs no stored secret.
    env: { CONNECTOR_VAULT_KEY: process.env.CONNECTOR_VAULT_KEY || randomBytes(32).toString("hex"), AUTH_URL: BASE, APP_DOMAIN: `localhost:${PORT}`, TENANT_MODE: consoleRun ? "single" : "path", ...(consoleRun ? { COMPANY_SLUG: CONSOLE_SLUG } : {}), PUBLIC_SCHEME: "http" },
  },
});
