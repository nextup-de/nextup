import { describe, expect, it } from "vitest";
import { scoreBand, scoreCase } from "@/features/scoring";

const base = { routeId: null, upside: "", body: "", age: 0, open: true };

describe("scoreCase", () => {
  it("a bare case scores the base only", () => {
    expect(scoreCase(base, 5)).toEqual({ value: 35, parts: [] });
  });
  it("routed, with upside and detail, waiting past the promise adds every part", () => {
    const s = scoreCase({ routeId: "r1", upside: "30 h / month", body: "x".repeat(40), age: 7, open: true }, 5);
    expect(s.parts.map((p) => p.points)).toEqual([20, 15, 10, 7, 5]);
    expect(s.value).toBe(92);
  });
  it("caps at 96 and stops counting waiting once closed", () => {
    expect(scoreCase({ routeId: "r1", upside: "y", body: "x".repeat(40), age: 40, open: true, affected: 3 }, 5).value).toBe(96);
    expect(scoreCase({ ...base, age: 40, open: false }, 5).value).toBe(35);
  });
  it("new information re-evaluates: +5 per update, capped at 10", () => {
    expect(scoreCase({ ...base, updates: 1 }, 5)).toEqual({ value: 40, parts: [{ label: "New information", points: 5 }] });
    expect(scoreCase({ ...base, updates: 3 }, 5).parts).toEqual([{ label: "New information ×3", points: 10 }]);
  });
  it("bands", () => {
    expect([scoreBand(35), scoreBand(60), scoreBand(80)]).toEqual(["low", "mid", "high"]);
  });
});
