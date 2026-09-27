// The database-backed suite. Deliberately a SEPARATE config from vitest.config.ts:
// `npm test` must stay DB-free, because CI runs it with no Postgres and .github/ is not ours to
// change. Run this one with ops/test-db.sh.
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/db/**/*.test.ts"],
    setupFiles: ["tests/db/setup.ts"],
    // These suites share one database; running files in parallel would interleave truncations.
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
