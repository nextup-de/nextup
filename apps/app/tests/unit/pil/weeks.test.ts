import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { dateOfWorkday } from "@/features/clock/calendar";
import { PILOT_METRIC_KEYS, type PilotReport, type ZiRow } from "@/features/metrics/types";
import { reportCsv, reportCsvName } from "@/features/pilot/report-csv";
import { isMonday, isoWeekNumber, mondayOf, pilotWeeks, weekPeriod } from "@/features/pilot/weeks";
import { parseCsv } from "@/features/api/csv";

const at = (iso: string) => new Date(`${iso}T10:00:00+01:00`);

describe("PIL weeks", () => {
  it("weekPeriod covers a week's working days", () => {
    const p = weekPeriod("2026-11-09", DEFAULT_CALENDAR);
    expect(p).not.toBeNull();
    expect(p!.to - p!.from).toBe(4);
    expect(dateOfWorkday(p!.from, DEFAULT_CALENDAR)).toBe("2026-11-09");
    expect(dateOfWorkday(p!.to, DEFAULT_CALENDAR)).toBe("2026-11-13");
  });

  it("weekPeriod handles a holiday Monday and is null for a week without a working day", () => {
    // 2026-05-25 is Whit Monday.
    const p = weekPeriod("2026-05-25", DEFAULT_CALENDAR);
    expect(dateOfWorkday(p!.from, DEFAULT_CALENDAR)).toBe("2026-05-26");
    expect(dateOfWorkday(p!.to, DEFAULT_CALENDAR)).toBe("2026-05-29");
    expect(weekPeriod("2026-05-25", { ...DEFAULT_CALENDAR, workdays: [1] })).toBeNull();
  });

  it("names Mondays and ISO week numbers", () => {
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
    expect(isoWeekNumber("2026-11-09")).toBe(46);
    expect(isoWeekNumber("2024-12-30")).toBe(1);
    expect(isMonday("2026-11-09")).toBe(true);
    expect(isMonday("2026-11-10")).toBe(false);
    expect(isMonday("2026-02-30")).toBe(false);
  });

  it("counts pilot weeks from the first move to pilot", () => {
    const moves = [{ at: at("2026-10-14"), before: null, after: "sandbox" }, { at: at("2026-11-11"), before: "sandbox", after: "pilot" }];
    const r = pilotWeeks(moves, at("2026-11-25"));
    expect(r.state).toBe("running");
    expect(r.weeks.map((w) => [w.week, w.pilotWeek])).toEqual([[46, 1], [47, 2], [48, 3]]);
    expect(r.weeks[0].monday).toBe("2026-11-09");
  });

  it("has no weeks before the pilot and pauses in sandbox", () => {
    expect(pilotWeeks([{ at: at("2026-10-14"), before: null, after: "sandbox" }], at("2026-11-25"))).toEqual({ state: "before", weeks: [], pausedSince: null });
    const back = pilotWeeks(
      [{ at: at("2026-11-11"), before: "sandbox", after: "pilot" }, { at: at("2026-11-19"), before: "pilot", after: "sandbox" }],
      at("2026-12-30"),
    );
    expect(back.state).toBe("paused");
    expect(back.pausedSince).toBe("2026-11-19");
    expect(back.weeks.map((w) => w.week)).toEqual([46, 47]);
  });

  it("leaves a hidden unit's numbers empty in the CSV", () => {
    const row = (label: string, hidden: boolean): ZiRow => ({
      unitId: label, label, depth: 0, headcount: hidden ? 3 : 40, participationPct: 55, ideasPer100: 12, implementationPct: 20,
      medianDaysToDecision: 2, savingsEur: 100, energyKwh: 1, co2Kg: 2, premiumsEur: 5, hidden,
    });
    const report: PilotReport = {
      companyId: "c", period: { from: 1, to: 5 }, fromDate: null, toDate: null, baseline: null,
      metrics: PILOT_METRIC_KEYS.map((key) => ({ key, value: 7, baseline: null, hidden: key === "participationPct", note: null })),
      zi: { company: row("All", false), units: [row("Werk", false), row("Small", true)] },
    };
    const csv = parseCsv(reportCsv([{ fromDate: "2026-11-09", toDate: "2026-11-15", report }], "fewer than 5 people"));
    const col = (name: string) => csv.header.indexOf(name);
    const [company, shown, hidden] = csv.rows;
    expect(company[col("participationPct")]).toBe("");
    expect(company[col("casesPer10")]).toBe("7");
    expect(shown[col("participationPct")]).toBe("55");
    expect(hidden[col("hidden")]).toBe("fewer than 5 people");
    for (const name of ["participationPct", "implementationPct", "ideasPer100", "savingsEur"]) expect(hidden[col(name)]).toBe("");
    expect(hidden[col("people")]).toBe("3");
    expect(reportCsvName("acme", "2026-11-09", "2026-11-15")).toBe("acme-pilot-report-2026-11-09-2026-11-15.csv");
  });
});
