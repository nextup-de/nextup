// What features/metrics/overview.ts still counts for the Dashboard, on the static demo's seed.
import { describe, expect, it } from "vitest";
import { STATIC_DEMO_SEED as SEED } from "@/features/demo/static-demo";
import { deliveredCount, stallSplit } from "@/features/metrics/overview";

describe("stallSplit", () => {
  it("adds up the routing reasons against the total", () => {
    const s = stallSplit(SEED.stall);
    expect(s).toMatchObject({ total: 60, routing: 40 });
    expect(s?.parts.map((p) => p.routing)).toEqual([true, true, false, false]);
    expect(s?.parts.map((p) => p.pct)).toEqual([38, 28, 20, 13]);
  });
  it("is null with no waiting recorded", () => {
    expect(stallSplit([])).toBeNull();
  });
});

describe("deliveredCount", () => {
  it("counts outcomes that met or beat the promise", () => {
    expect(deliveredCount(SEED.outcomes)).toBe(3);
  });
});
