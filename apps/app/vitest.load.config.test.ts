// TST-L1: the unit config must not pick up the load acceptance (it needs Postgres and a build), and the load
// config must. Only k6.test.ts, which needs neither, is in both.
import { describe, expect, it } from "vitest";
import load from "./vitest.load.config";
import unit from "./vitest.config";

describe("TST load config", () => {
  it("the unit config runs no database-backed load test", () => {
    const include = unit.test?.include ?? [];
    expect(include).not.toContain("tests/load/**/*.test.ts");
    expect(include.filter((p) => p.includes("tests/load"))).toEqual(["tests/load/k6.test.ts"]);
  });

  it("the load config includes tests/load and starts the server in a global setup", () => {
    expect(load.test?.include).toEqual(["tests/load/**/*.test.ts"]);
    expect(load.test?.globalSetup).toEqual(["tests/load/global-setup.ts"]);
    expect(load.test?.testTimeout).toBeGreaterThanOrEqual(10 * 60_000);
  });
});
