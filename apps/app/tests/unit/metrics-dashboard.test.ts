import { describe, expect, it } from "vitest";
import { barHeights, pastPromise, ringOffset, shares, trendPaths, trendPoints } from "@/features/metrics/dashboard";

describe("dashboard metrics", () => {
  it("spreads trend points from 4% to 96% and scales against yMax", () => {
    const p = trendPoints([0, 40, 80], 80);
    expect(p.map((x) => x.x)).toEqual([4, 50, 96]);
    expect(p.map((x) => x.y)).toEqual([100, 50, 0]);
  });

  it("clamps values over yMax to the top", () => {
    expect(trendPoints([120], 80)[0].y).toBe(0);
  });

  it("draws a line and closes the area to the baseline", () => {
    const { line, area } = trendPaths(trendPoints([20, 40], 80));
    expect(line).toBe("M4.00 75.00 L96.00 50.00");
    expect(area).toBe(line + " L96.00 100 L4.00 100 Z");
    expect(trendPaths([])).toEqual({ line: "", area: "" });
  });

  it("keeps bars above the floor", () => {
    expect(barHeights([0, 50, 100], 12)).toEqual([12, 50, 100]);
    expect(barHeights([0, 0], 4)).toEqual([4, 4]);
  });

  it("rounds shares of the total", () => {
    expect(shares([22, 19, 31, 14, 52])).toEqual([16, 14, 22, 10, 38]);
    expect(shares([0, 0])).toEqual([0, 0]);
  });

  it("flags waits past the promise, except running work", () => {
    expect(pastPromise(6.8, 5)).toBe(true);
    expect(pastPromise(5, 5)).toBe(false);
    expect(pastPromise(41, 5, true)).toBe(false);
  });

  it("turns a share into a ring offset", () => {
    expect(ringOffset(0.84)).toBe("34.2");
    expect(ringOffset(0)).toBe("213.6");
    expect(ringOffset(2)).toBe("0.0");
  });
});
