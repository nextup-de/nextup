import { describe, expect, it } from "vitest";
import { barHeights, ringOffset, shares, trendLabels, trendPaths, trendPoints } from "@/features/metrics/dashboard";
import { createT } from "@/i18n";

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

  it("turns a share into a ring offset", () => {
    expect(ringOffset(0.84)).toBe("34.2");
    expect(ringOffset(0)).toBe("213.6");
    expect(ringOffset(2)).toBe("0.0");
  });
});

describe("trend labels", () => {
  const en = createT("en"), de = createT("de");
  const steps = (dates: (string | null)[]) => dates.map((endDate) => ({ endDate }));

  it("names each step by the month its last day falls in, never a step number", () => {
    const trend = steps(["2026-06-12", "2026-07-24", "2026-09-04", "2026-10-16", "2026-11-27"]);
    expect(trendLabels(trend, en)).toEqual(["Jun", "Jul", "Sep", "Oct", "Nov"]);
    expect(trendLabels(trend, de)).toEqual(["Jun", "Jul", "Sep", "Okt", "Nov"]);
    expect(trendLabels(trend, de).join(" ")).not.toMatch(/−|-\d/);
  });

  it("adds the year when the steps cross one", () => {
    expect(trendLabels(steps(["2025-12-10", "2026-01-23"]), en)).toEqual(["Dec ’25", "Jan ’26"]);
  });

  it("counts back from now in a simulated company, which has no calendar", () => {
    expect(trendLabels(steps([null, null, null]), en)).toEqual(["2 mo ago", "1 mo ago", "now"]);
    expect(trendLabels(steps([null, null]), de)).toEqual(["vor 1 Mon.", "jetzt"]);
  });
});
