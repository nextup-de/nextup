import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { nextDaysOff } from "@/features/settings/calendar-view";

describe("nextDaysOff", () => {
  it("lists weekends and holidays in order, with their reason", () => {
    // Thu 24 Dec 2026: Christmas Fri 25, Sat 26, Sun 27, then Sat 2 / Sun 3 Jan (1 Jan is a holiday too).
    expect(nextDaysOff("2026-12-24", DEFAULT_CALENDAR, 5)).toEqual([
      { date: "2026-12-25", reason: "holiday" },
      { date: "2026-12-26", reason: "holiday" },
      { date: "2026-12-27", reason: "weekend" },
      { date: "2027-01-01", reason: "holiday" },
      { date: "2027-01-02", reason: "weekend" },
    ]);
  });

  it("marks the company's own days off and skips its extra working days", () => {
    const cal = { ...DEFAULT_CALENDAR, extraHolidays: ["2026-11-04"], extraWorkdays: ["2026-11-07"] };
    expect(nextDaysOff("2026-11-03", cal, 2)).toEqual([
      { date: "2026-11-04", reason: "extra" },
      { date: "2026-11-08", reason: "weekend" },
    ]);
  });
});
