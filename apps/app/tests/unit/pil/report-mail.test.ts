import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { PILOT_METRIC_KEYS, type PilotReport, type ZiRow } from "@/features/metrics/types";
import { gateOf } from "@/features/notify/gate";
import { isoWeekLabel, pilotReportDraft, pilotReportDue, pilotReportKey } from "@/features/pilot/report-mail";

const unit = (label: string, hidden: boolean): ZiRow => ({
  unitId: label, label, depth: 0, headcount: hidden ? 3 : 40, participationPct: hidden ? null : 61, ideasPer100: hidden ? null : 777,
  implementationPct: null, medianDaysToDecision: null, savingsEur: null, energyKwh: null, co2Kg: null, premiumsEur: null, hidden,
});

const REPORT: PilotReport = {
  companyId: "c1", period: { from: 1, to: 5 }, fromDate: "2026-11-02", toDate: "2026-11-06",
  baseline: { fromDay: 1, toDay: 2, fromDate: "2026-10-19", toDate: "2026-10-30", imported: {}, source: "counted" },
  metrics: PILOT_METRIC_KEYS.map((key) => ({
    key,
    value: key === "casesPer10" ? 4.2 : key === "firstReasonedAnswer" ? 1.6 : key === "withinPromisePct" ? 84 : key === "participationPct" ? 61 : null,
    baseline: key === "casesPer10" ? 1.8 : key === "firstReasonedAnswer" ? 6.5 : key === "withinPromisePct" ? 41 : null,
    hidden: false, note: null,
  })),
  zi: { company: unit("Acme", false), units: [unit("Assembly", false), unit("Paint", false), unit("Tiny A", true), unit("Tiny B", true)] },
};
const WEEK = { monday: "2026-11-02", sunday: "2026-11-08", week: 45, pilotWeek: 2 };
const draft = (locale: "en" | "de", report = REPORT) =>
  pilotReportDraft({ userId: "u1", company: "Acme Automotive", week: WEEK, report, locale, baseUrl: "https://app.test/acme" });

describe("PIL report mail", () => {
  it("holds the four numbers and the baseline in English", () => {
    const d = draft("en");
    expect(d.template).toBe("pilot.report");
    expect(d.subject).toBe("NextUp pilot report, week 45: Acme Automotive");
    expect(d.text).toContain("Week 45 · 2 Nov-8 Nov 2026 · pilot week 2");
    expect(d.text).toContain("Cases per 10 people: 4.2 (Baseline: 1.8)");
    expect(d.text).toContain("First answer (median): 1.6 working days (Baseline: 6.5 working days)");
    expect(d.text).toContain("Answered on time: 84 % (Baseline: 41 %)");
    expect(d.text).toContain("Using NextUp: 61 % (Baseline: –)");
    expect(d.text).toContain("https://app.test/acme/settings/pilot-report");
    expect(d.link).toBe("https://app.test/acme/settings/pilot-report");
  });

  it("is in German for a German recipient", () => {
    const d = draft("de");
    expect(d.subject).toBe("NextUp-Pilotbericht, KW 45: Acme Automotive");
    expect(d.text).toContain("Fälle pro 10 Personen: 4,2 (Ausgangswert: 1,8)");
    expect(d.text).toContain("Nach Einheit: 2 Einheiten gezeigt, 2 ausgeblendet (weniger als 5 Personen).");
    expect(d.text).toContain("Bericht öffnen");
  });

  it("counts units and names none, and shows no unit number", () => {
    const d = draft("en");
    expect(d.text).toContain("By unit: 2 units shown, 2 hidden (fewer than 5 people).");
    for (const label of ["Assembly", "Paint", "Tiny A", "Tiny B", "777", "77.7"]) expect(d.text).not.toContain(label);
    expect(d.data).toMatchObject({ unitsShown: 2, unitsHidden: 2 });
  });

  it("shows a dash for no baseline and the too-few text for a hidden metric", () => {
    const none = draft("en", { ...REPORT, baseline: null });
    expect(none.text).toContain("Cases per 10 people: 4.2 (Baseline: –)");
    const hidden = draft("en", { ...REPORT, metrics: REPORT.metrics.map((m) => (m.key === "participationPct" ? { ...m, hidden: true } : m)) });
    expect(hidden.text).toContain("Using NextUp: Too few to show");
  });

  it("keys a mail by ISO week and user", () => {
    expect(isoWeekLabel("2026-11-02")).toBe("2026-W45");
    expect(isoWeekLabel("2026-12-28")).toBe("2026-W53");
    expect(isoWeekLabel("2025-12-29")).toBe("2026-W01");
    expect(pilotReportKey("2026-11-02", "u1")).toBe("pilot:2026-W45:u1");
    expect(draft("en").key).toBe("pilot:2026-W45:u1");
  });

  it("is due from 07:00 Berlin on the first working day of the week, for the week before", () => {
    const cal = DEFAULT_CALENDAR;
    expect(pilotReportDue(new Date("2026-11-09T07:00:00+01:00"), cal, 7)).toBe("2026-11-02");
    expect(pilotReportDue(new Date("2026-11-09T06:59:00+01:00"), cal, 7)).toBeNull();
    expect(pilotReportDue(new Date("2026-11-09T18:00:00+01:00"), cal, 7)).toBe("2026-11-02");
    expect(pilotReportDue(new Date("2026-11-10T09:00:00+01:00"), cal, 7)).toBeNull(); // Tuesday: Monday was a workday
    expect(pilotReportDue(new Date("2026-11-14T09:00:00+01:00"), cal, 7)).toBeNull(); // Saturday
  });

  it("moves to Tuesday when Monday is not a working day", () => {
    const cal = { ...DEFAULT_CALENDAR, extraHolidays: ["2026-11-09"] };
    expect(pilotReportDue(new Date("2026-11-09T09:00:00+01:00"), cal, 7)).toBeNull();
    expect(pilotReportDue(new Date("2026-11-10T07:30:00+01:00"), cal, 7)).toBe("2026-11-02");
    expect(pilotReportDue(new Date("2026-11-11T09:00:00+01:00"), cal, 7)).toBeNull();
  });

  it("the gate lets pilot.report out without the notifications switch, and holds it in sandbox", () => {
    const company = { stage: "pilot", notifications: false, n8n: false };
    expect(gateOf(company, "mail", "pilot.report")).toEqual({ send: true });
    expect(gateOf(company, "mail", "pilot.report", { template: false, all: null })).toEqual({ send: false, reason: "opted out" });
    expect(gateOf({ ...company, stage: "sandbox" }, "mail", "pilot.report")).toEqual({ send: false, reason: "sandbox" });
    expect(gateOf(company, "mail", "digest")).toEqual({ send: false, reason: "switched off" });
  });
});
