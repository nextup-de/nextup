// Playwright, demo suite (`npm run e2e`). No database, no login: the app runs exactly like
// `npm run dev` does on a laptop without Postgres - the built-in acme company, the event log in
// localStorage, the dev panel to switch person. That makes it safe for CI and for anyone.
//
// It runs a production build (`next build` + `next start`) on its own port, not `next dev`:
// Next 16 allows one `next dev` per folder (.next/dev/lock), so this never fights with the dev
// server you already have open. The database suite is playwright.db.config.ts.
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e/demo",
  // One browser, one company, localStorage per test: tests are independent, so run them side by side.
  fullyParallel: true,
  // The loop tests are whole stories (raise, ask, answer, decide), not single clicks.
  timeout: 90_000,
  // Role homes are a client-side redirect after the page hydrates; give assertions room to wait.
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"], ["html", { open: "on-failure" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The raise box plays its evaluation one step per second; reduced motion makes it land fast.
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    // next.config.ts builds `output: "standalone"` for Docker, so `next start` prints a warning that
    // it wants .next/standalone/server.js. It still serves the build (pages, assets, actions) fine.
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    // Reuse a server you started yourself (faster reruns); CI always builds fresh.
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    // Empty, not unset: Next does not let .env.local fill a variable that is already defined, so
    // these switch the database and sessions off even on a machine whose .env.local has both.
    env: { DATABASE_URL: "", AUTH_SECRET: "" },
  },
});
