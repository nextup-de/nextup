import { describe, expect, it } from "vitest";
import { calendarSpec, DEFAULT_CALENDAR, DEMO_CLOCK } from "@/features/clock";
import { contentOnly } from "@/features/demo/content";
import { LOCAL_SEED } from "@/features/demo";
import { SEED } from "@/features/demo/seed";
import { parseSeed } from "@/features/demo/parse";
import { STATIC_DEMO_SEED } from "@/features/demo/static-demo";

describe("CLK clock spec", () => {
  it("calendarSpec(null) is the default calendar", () => {
    expect(calendarSpec(null)).toEqual(DEFAULT_CALENDAR);
  });
  it("falls back per field", () => {
    const s = calendarSpec({ region: "XX", workdays: [9] });
    expect(s.region).toBe("DE");
    expect(s.workdays).toEqual([1, 2, 3, 4, 5]);
    expect(calendarSpec({ region: "DE-BY", workdays: [1, 2, 8, 0] })).toMatchObject({ region: "DE-BY", workdays: [1, 2] });
  });
  it("drops extra dates that are not ISO dates", () => {
    const s = calendarSpec({ extraHolidays: ["2026-12-24", "24.12.2026", "2026-02-30", 5], extraWorkdays: ["2026-12-26", "x"] });
    expect(s.extraHolidays).toEqual(["2026-12-24"]);
    expect(s.extraWorkdays).toEqual(["2026-12-26"]);
  });
  it("parseSeed ignores a stored clock", () => {
    const blob = { ...contentOnly(SEED), clock: { mode: "workdays" } };
    expect(parseSeed(blob).clock).toEqual(DEMO_CLOCK);
  });
  it("contentOnly gives the demo clock", () => {
    expect(contentOnly({ ...SEED, clock: { mode: "workdays", calendar: DEFAULT_CALENDAR } }).clock).toEqual(DEMO_CLOCK);
  });
  it("the no-database seeds run in demo mode", () => {
    expect(LOCAL_SEED.clock).toEqual(DEMO_CLOCK);
    expect(STATIC_DEMO_SEED.clock).toEqual(DEMO_CLOCK);
  });
});
