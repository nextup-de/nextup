import { describe, expect, it } from "vitest";
import { dayFormatter } from "@/features/cases/rows";
import { DEFAULT_CALENDAR, DEMO_CLOCK } from "@/features/clock";
import { workdayOf } from "@/features/clock/calendar";

const cal = DEFAULT_CALENDAR;
const at = (iso: string) => workdayOf(new Date(`${iso}T10:00:00+02:00`), cal);

describe("CLK day labels", () => {
  const today = new Date("2026-05-04T09:00:00+02:00");
  const f = dayFormatter(today, at("2026-05-04"), "en", { mode: "workdays", calendar: cal });

  it("calls the log day Today and the working day before it Yesterday (1 May is a holiday)", () => {
    expect(f(at("2026-05-04"))).toBe("today");
    expect(f(at("2026-04-30"))).toBe("yesterday");
  });
  it("shows an older working day as its date", () => {
    expect(f(at("2026-04-20"))).toBe("20 Apr");
  });
  it("keeps the demo labels in demo mode", () => {
    const d = dayFormatter(today, 3, "en", DEMO_CLOCK);
    expect(d(3)).toBe("today");
    expect(d(2)).toBe("yesterday");
    expect(d(0)).toBe("4 May");
    expect(dayFormatter(today, 3, "en")(0)).toBe("4 May");
  });
});
