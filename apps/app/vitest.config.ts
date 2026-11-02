import { defineConfig } from "vitest/config";
import path from "node:path";

// The app shows every time in Europe/Berlin (src/i18n/format.ts), and the unit tests write their dates as Berlin
// wall-clock times. Pinned here so a test reads the same on a CI runner in UTC as on a machine in Germany.
process.env.TZ = "Europe/Berlin";

export default defineConfig({
  test: { include: ["tests/unit/**/*.test.ts"], env: { TZ: "Europe/Berlin" } },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
