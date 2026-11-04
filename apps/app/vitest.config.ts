import { defineConfig } from "vitest/config";
import path from "node:path";

// The app shows every time in Europe/Berlin (src/i18n/format.ts), and the unit tests write their dates as Berlin
// wall-clock times. Pinned here so a test reads the same on a CI runner in UTC as on a machine in Germany.
process.env.TZ = "Europe/Berlin";

export default defineConfig({
  // 30 s: on a PC with five lanes a test that loads ESLint or scans src can pass 5 s without being wrong.
  // tests/load needs Postgres and a build and has its own config (vitest.load.config.ts); only k6.test.ts, which needs
  // neither, runs here, and so does the test of the two configs.
  test: { include: ["tests/unit/**/*.test.ts", "tests/load/k6.test.ts", "vitest.load.config.test.ts"], env: { TZ: "Europe/Berlin" }, testTimeout: 30_000 },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
