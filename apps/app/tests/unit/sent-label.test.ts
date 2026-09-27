// sentLabel(): when an inbox item arrived, as the "Waiting on you" card prints it.
import { describe, expect, it } from "vitest";
import { sentLabel } from "@/features/cases/rows";

const now = new Date(2026, 8, 24, 17, 30); // Thursday 24 Sep 2026
const at = (y: number, m: number, d: number, h = 9, min = 5) => new Date(y, m, d, h, min);

describe("sentLabel", () => {
  it("today: the clock time when it is known, else 'Today'", () => {
    expect(sentLabel(at(2026, 8, 24, 9, 5), now, true)).toBe("09:05");
    expect(sentLabel(at(2026, 8, 24), now, false)).toBe("Today");
  });
  it("yesterday, by calendar day - not by 24 hours", () => {
    expect(sentLabel(at(2026, 8, 23, 23, 59), now, true)).toBe("Yesterday");
  });
  it("two to six days back: the weekday", () => {
    expect(sentLabel(at(2026, 8, 22), now, false)).toBe("Tuesday");
    expect(sentLabel(at(2026, 8, 18), now, false)).toBe("Friday");
  });
  it("a week or more this year: day and short month", () => {
    expect(sentLabel(at(2026, 8, 17), now, false)).toBe("17 Sept");
  });
  it("an earlier year: with the year", () => {
    expect(sentLabel(at(2025, 8, 5), now, false)).toBe("5 Sept 2025");
  });
});
