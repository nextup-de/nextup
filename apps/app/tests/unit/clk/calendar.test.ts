import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR, type CalendarSpec } from "@/features/clock";
import { addWorkdays, berlinDate, dateOfWorkday, isWorkday, workdayOf } from "@/features/clock/calendar";
import { easterSunday, holidaysOf } from "@/features/clock/holidays";

const DE = DEFAULT_CALENDAR;
const FEDERAL_2026 = [
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01", "2026-05-14", "2026-05-25", "2026-10-03", "2026-12-25", "2026-12-26",
];

describe("CLK working days", () => {
  it("computes Easter", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
  });

  it("DE has exactly the nine federal days", () => {
    expect(holidaysOf(2026, "DE")).toEqual(FEDERAL_2026);
  });

  it("adds the state days", () => {
    const by = holidaysOf(2026, "DE-BY");
    for (const d of ["2026-01-06", "2026-06-04", "2026-11-01", ...FEDERAL_2026]) expect(by).toContain(d);
    expect(by).toHaveLength(12);
    const sn = holidaysOf(2026, "DE-SN");
    expect(sn).toContain("2026-11-18");
    expect(sn).toContain("2026-10-31");
    expect(holidaysOf(2026, "DE-BE")).toContain("2026-03-08");
    expect(holidaysOf(2027, "DE-SN")).toContain("2027-11-17");
    expect(holidaysOf(2026, "DE-BY")).toEqual([...holidaysOf(2026, "DE-BY")].sort());
  });

  it("skips weekends and holidays", () => {
    expect(isWorkday("2026-05-14", DE)).toBe(false);
    expect(isWorkday("2026-05-16", DE)).toBe(false);
    expect(isWorkday("2026-05-15", DE)).toBe(true);
  });

  it("uses the Berlin date", () => {
    expect(berlinDate(new Date("2026-04-30T23:30:00Z"))).toBe("2026-05-01");
    expect(workdayOf(new Date("2026-05-01T10:00:00Z"), DE)).toBe(workdayOf(new Date("2026-04-30T10:00:00Z"), DE));
    expect(workdayOf(new Date("2026-04-30T23:30:00Z"), DE)).toBe(workdayOf(new Date("2026-04-30T10:00:00Z"), DE));
  });

  it("adds working days across a holiday", () => {
    expect(addWorkdays("2026-04-30", 1, DE)).toBe("2026-05-04");
  });

  it("round-trips working days", () => {
    for (const d of ["2025-01-02", "2026-04-30", "2026-05-04", "2026-12-23"]) {
      expect(dateOfWorkday(workdayOf(new Date(`${d}T12:00:00Z`), DE), DE)).toBe(d);
    }
    expect(dateOfWorkday(1, DE)).toBe("2025-01-02");
  });

  it("honours extraHolidays and extraWorkdays", () => {
    const cal: CalendarSpec = { ...DE, extraHolidays: ["2026-05-04"], extraWorkdays: ["2026-05-02"] };
    expect(isWorkday("2026-05-04", cal)).toBe(false);
    expect(addWorkdays("2026-04-30", 1, cal)).toBe("2026-05-02");
    expect(addWorkdays("2026-05-02", 1, cal)).toBe("2026-05-05");
    expect(workdayOf(new Date("2026-05-02T10:00:00Z"), cal)).toBe(workdayOf(new Date("2026-04-30T10:00:00Z"), cal) + 1);
  });
});
