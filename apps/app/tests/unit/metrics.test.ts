import { describe, expect, it } from "vitest";
import { median, pctWithin } from "@/features/metrics";

describe("median", () => {
  it("handles odd and even counts", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it("is null for no data", () => {
    expect(median([])).toBeNull();
  });
});

describe("pctWithin", () => {
  it("rounds to whole percent", () => {
    expect(pctWithin([1, 2, 30], 14)).toBe(67);
  });
});
