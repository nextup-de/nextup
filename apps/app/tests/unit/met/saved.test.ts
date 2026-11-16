// "Saved per year" on the Dashboard (features/metrics/impact.ts): the sum of the confirmed, better results, one row each,
// the same number the pilot report counts; a typed but unconfirmed figure is never in the sum.
import { describe, expect, it } from "vitest";
import { savedPerYear } from "@/features/metrics/impact";
import { pilotMetrics } from "@/features/metrics/pilot";
import type { KpiProject, LedgerInput } from "@/features/metrics/types";

type M = KpiProject["measures"][number];
// A confirmed result on day 60 unless the test says otherwise; an unconfirmed one has no confirmation day.
const m = (o: Partial<M> = {}): M => {
  const r = { verified: true, better: true, eur: null, kwh: null, co2Kg: null, scrap: null, check: 30, ...o };
  return { confirmedDay: r.verified ? 60 : null, ...r };
};
const project = (id: string, o: Partial<KpiProject> = {}): KpiProject => ({
  caseId: "c-" + id, raiserUnitId: null, decidedDay: 5, doneDay: 50, measures: [], premiumsEur: 0, projectId: id, title: "Project " + id, ...o,
});
const period = { from: 0, to: 100 };
const ledger: LedgerInput = {
  cases: [], facts: { answers: { yes: 0, yesProject: 0, question: 0, handed: 0, no: 0 }, override: { proposed: 0, overridden: 0, rate: null } },
  org: { units: [], roles: [] }, promiseDays: 5, today: 100, demoClock: false, stalled: [],
};
const pilotSavings = (projects: KpiProject[]) =>
  pilotMetrics({ ledger, projects, period, peopleInScope: 50, baseline: null, imported: {} }).find((x) => x.key === "verifiedSavingsEur")!.value;

describe("Saved per year", () => {
  it("sums only the results a second person confirmed with a better verdict, one row per result, biggest first", () => {
    const projects = [
      project("a", { measures: [m({ eur: 12000, check: 30, co2Kg: 400 })] }),
      project("b", { measures: [m({ eur: 50000, check: 90, kwh: 9000, scrap: 120 })] }),
      project("c", { measures: [m({ eur: 7000, verified: false })] }), // typed, not confirmed
      project("d", { measures: [m({ eur: 3000, better: false })] }), // confirmed, but not better
    ];
    const saved = savedPerYear(projects, period, null)!;
    expect(saved.eur).toBe(62000);
    expect(saved.rows).toEqual([
      { projectId: "b", title: "Project b", check: 90, eur: 50000 },
      { projectId: "a", title: "Project a", check: 30, eur: 12000 },
    ]);
    expect([saved.co2Kg, saved.kwh, saved.scrap]).toEqual([400, 9000, 120]);
  });

  it("keeps what is typed but not confirmed out of the sum and reports it apart", () => {
    const saved = savedPerYear([project("a", { measures: [m({ eur: 10000 }), m({ eur: 7000, verified: false, check: 90 })] })], period, null)!;
    expect(saved.eur).toBe(10000);
    expect(saved.rows.map((r) => r.eur)).toEqual([10000]);
    expect(saved.unconfirmedEur).toBe(7000);
  });

  it("is nothing while no confirmed result saved a euro (DESIGN_RULES §2: no 0)", () => {
    expect(savedPerYear([], period, null)).toBeNull();
    expect(savedPerYear([project("a", { measures: [m({ eur: 9000, verified: false })] })], period, null)).toBeNull();
    expect(savedPerYear([project("a", { measures: [m({ co2Kg: 300 })] })], period, null)).toBeNull();
  });

  it("counts the results confirmed in the period, in the unit scope only", () => {
    const projects = [
      project("in", { raiserUnitId: "u1", measures: [m({ eur: 1000 })] }),
      project("later", { raiserUnitId: "u1", doneDay: 90, measures: [m({ eur: 2000, confirmedDay: 120 })] }),
      project("before", { raiserUnitId: "u1", doneDay: -40, measures: [m({ eur: 4000, confirmedDay: -10 })] }),
      project("other", { raiserUnitId: "u2", measures: [m({ eur: 8000 })] }),
    ];
    expect(savedPerYear(projects, period, null)!.eur).toBe(9000);
    expect(savedPerYear(projects, period, (u) => u === "u1")!.eur).toBe(1000);
    expect(savedPerYear(projects, period, (u) => u === "u3")).toBeNull();
  });

  it("is the pilot report's verified savings when the results were confirmed in the period their projects finished in", () => {
    const projects = [
      project("a", { measures: [m({ eur: 12000 }), m({ eur: 3000, verified: false, check: 90 })] }),
      project("b", { measures: [m({ eur: 50000, check: 90 })] }),
      project("c", { doneDay: 150, measures: [m({ eur: 999, confirmedDay: 160 })] }),
    ];
    expect(savedPerYear(projects, period, null)!.eur).toBe(pilotSavings(projects));
  });
});
