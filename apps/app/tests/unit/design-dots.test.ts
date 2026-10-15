import { describe, expect, it } from "vitest";
import { DOTS_DEFAULT, normalizeDots } from "@/features/design/dots";

describe("normalizeDots", () => {
  it("keeps values in range", () => {
    expect(normalizeDots({ dotsStrength: 0.35, dotSpacing: 60 })).toEqual({ dotsStrength: 0.35, dotSpacing: 60 });
  });
  it("pulls out-of-range values in", () => {
    expect(normalizeDots({ dotsStrength: 3, dotSpacing: 2 })).toEqual({ dotsStrength: 1, dotSpacing: 24 });
    expect(normalizeDots({ dotsStrength: -1, dotSpacing: 900 })).toEqual({ dotsStrength: 0, dotSpacing: 140 });
  });
  it("falls back on missing or broken values", () => {
    expect(normalizeDots({})).toEqual(DOTS_DEFAULT);
    expect(normalizeDots({ dotsStrength: "a", dotSpacing: Number.NaN })).toEqual(DOTS_DEFAULT);
  });
  it("rounds to the slider steps", () => {
    expect(normalizeDots({ dotsStrength: 0.2345, dotSpacing: 41.6 })).toEqual({ dotsStrength: 0.23, dotSpacing: 42 });
  });
});
