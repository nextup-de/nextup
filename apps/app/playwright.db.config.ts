// Playwright, database suite (`npm run e2e:db`). Needs Postgres and the admin code from
// .env.local - the same setup as `npm run dev` with /admin working (docs/DEPLOY.md, README).
//
// Every test here creates its own throwaway company through /admin and deletes it at the end, so
// it can run against the shared local database without touching acme or anyone's login codes.
import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { randomBytes } from "node:crypto";
import { checkoutPort } from "./playwright.ports";

// The tests need ADMIN_ACCESS_CODE too, not only the server - read .env.local the way Next does.
loadEnvConfig(process.cwd());

// Its own port per checkout (playwright.ports.ts); E2E_DB_PORT overrides it.
const PORT = Number(process.env.E2E_DB_PORT) || checkoutPort(3200);
const vaultKey = process.env.CONNECTOR_VAULT_KEY || randomBytes(32).toString("hex");
// The spec files seal secrets themselves (tests/db/test-company.ts) and run in worker processes that
// inherit this env: export the key so they and both servers use the same one (CI sets none).
process.env.CONNECTOR_VAULT_KEY = vaultKey;
const BASE = `http://localhost:${PORT}`;

// The company's IT and privacy console (ITC) exists only in a one-company stack (TENANT_MODE single,
// COMPANY_SLUG set), so its spec runs against a second server started that way; every other spec here
// runs against the path-mode server. Both serve the one build.
export const CONSOLE_SLUG = "itc-console";
const CONSOLE_PORT = PORT + 1;
const CONSOLE_BASE = `http://localhost:${CONSOLE_PORT}`;
const CONSOLE_SPEC = /itc-console[.]spec[.]ts$/;
// TST_BASE_URL: the spec runs against a server that already runs (ops/tst/vm-run.sh), so nothing starts here,
// and no report server waits for someone to close it.
const REMOTE = !!process.env.TST_BASE_URL;

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
  // A timing glitch must not turn main red, and make orch revert an innocent merge: a real bug fails twice.
  retries: process.env.CI ? 1 : 0,
  reporter: REMOTE ? [["list"]] : [["list"], ["html", { open: "on-failure" }]],
  use: {
    baseURL: BASE,
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    { name: "path", testIgnore: CONSOLE_SPEC },
    { name: "console", testMatch: CONSOLE_SPEC, use: { baseURL: CONSOLE_BASE } },
  ],
  webServer: REMOTE ? undefined : [
    {
      // next.config.ts builds `output: "standalone"` for Docker, so `next start` prints a warning that
      // it wants .next/standalone/server.js. It still serves the build (pages, assets, actions) fine.
      command: `npm run build && npx next start -p ${PORT}`,
      url: `${BASE}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      // Links and redirects the app builds from these must point at this server, not :3000.
      // Managers enrol an authenticator (ADM-E1); the secret is sealed with the vault key.
      env: { CONNECTOR_VAULT_KEY: vaultKey, AUTH_URL: BASE, APP_DOMAIN: `localhost:${PORT}`, TENANT_MODE: "path", PUBLIC_SCHEME: "http" },
    },
    {
      // Started after the first, so the build is there. Same vault key: the spec seals secrets itself.
      command: `npx next start -p ${CONSOLE_PORT}`,
      url: `${CONSOLE_BASE}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { CONNECTOR_VAULT_KEY: vaultKey, AUTH_URL: CONSOLE_BASE, APP_DOMAIN: `localhost:${CONSOLE_PORT}`, TENANT_MODE: "single", COMPANY_SLUG: CONSOLE_SLUG, PUBLIC_SCHEME: "http" },
    },
  ],
});
