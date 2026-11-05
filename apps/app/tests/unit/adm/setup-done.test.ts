import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { DEFAULT_RULES } from "@/features/knowledge/rules";
import { setupDoneFacts, workdayRange } from "@/features/settings/setup-done";

describe("setup finish page facts", () => {
  it("marks values that still equal the default", () => {
    const facts = setupDoneFacts(DEFAULT_RULES, DEFAULT_CALENDAR, null);
    expect(facts.rulesDefault).toBe(true);
    expect(facts.calendarDefault).toBe(true);
  });

  it("does not mark saved values as the default", () => {
    const facts = setupDoneFacts({ ...DEFAULT_RULES, promiseDays: 3 }, { ...DEFAULT_CALENDAR, region: "DE-BY" }, "/admin");
    expect(facts).toMatchObject({ promiseDays: 3, rulesDefault: false, region: "DE-BY", calendarDefault: false, consoleHref: "/admin" });
  });

  it("writes weekdays as a range, or a list when they have gaps", () => {
    expect(workdayRange([1, 2, 3, 4, 5], "en")).toBe("Mon-Fri");
    expect(workdayRange([1, 3], "en")).toBe("Mon, Wed");
    expect(workdayRange([2], "en")).toBe("Tue");
    expect(workdayRange([], "en")).toBe("");
  });
});
