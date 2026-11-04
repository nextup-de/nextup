// The load acceptance (TST-L1, D8): tests/load/**. Deliberately NOT in vitest.config.ts - it needs Postgres, a
// production build and minutes. Run it from apps/app:
//
//     TST_ACCOUNTS=200 npx vitest run --config vitest.load.config.ts tests/load/musterwerk-load.test.ts
//
// The global setup builds and starts `next start -p 3103` (TENANT_MODE=path) unless TST_BASE_URL points at a running server.
import { defineConfig } from "vitest/config";
import path from "node:path";

process.env.TZ = "Europe/Berlin";

export default defineConfig({
  test: {
    include: ["tests/load/**/*.test.ts"],
    globalSetup: ["tests/load/global-setup.ts"],
    env: { TZ: "Europe/Berlin" },
    // A build, a Musterwerk of thousands of people and a minute-long run.
    testTimeout: 30 * 60_000,
    hookTimeout: 30 * 60_000,
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
