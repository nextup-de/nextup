import { describe, expect, it } from "vitest";
import { ziKpis } from "@/features/metrics/zi";
import type { KpiProject, LedgerCase, MetricsOrg } from "@/features/metrics/types";

const period = { from: 0, to: 100 };
let n = 0;
const idea = (o: Partial<LedgerCase> = {}): LedgerCase => ({
  caseId: `c${n++}`, kind: "idea", status: "open", open: true, unitId: null, roleId: null, raisedDay: 10,
  firstResponseDay: null, firstReasonedAnswerDay: null, decidedDay: null, decision: null, withProject: false,
  reasoned: false, dueDay: 15, lastDay: 10, escalatedDay: null, raiserKey: null, raiserUnitId: null, ...o,
});
const by = (unit: string | null, key: string, o: Partial<LedgerCase> = {}) => idea({ raiserUnitId: unit, raiserKey: key, ...o });
const people = (unit: string, count: number, o: Partial<LedgerCase> = {}) => Array.from({ length: count }, (_, i) => by(unit, `${unit}-${i}`, o));
const project = (o: Partial<KpiProject> = {}): KpiProject => ({
  caseId: `p${n++}`, raiserUnitId: "a", decidedDay: 20, doneDay: 50, measures: [], premiumsEur: 0, ...o,
});
const unit = (id: string, parentId: string | null, headcount: number) => ({ id, name: id.toUpperCase(), parentId, people: headcount, headcount });
const org = (...units: ReturnType<typeof unit>[]): MetricsOrg => ({ units, roles: [] });

describe("MET ZI KPIs", () => {
  it("gives the hand-computed figures of a unit with headcount 40 and 8 raisers", () => {
    const cases = [
      ...people("a", 8, { raisedDay: 10, decidedDay: 14, decision: "yes" }),
      by("a", "a-0", { raisedDay: 10, decidedDay: 20 }), // a second idea of one raiser: 9 ideas, still 8 raisers; 10 days
    ];
    const projects = [project({ decidedDay: 20, doneDay: 50 }), project({ decidedDay: 30, doneDay: null }), project({ decidedDay: 40, doneDay: 60 }), project({ decidedDay: 41, doneDay: null })];
    const { units, company } = ziKpis({ cases, projects, org: org(unit("a", null, 40)), period });
    const a = units[0];
    expect(a.hidden).toBe(false);
    expect(a.headcount).toBe(40);
    expect(a.participationPct).toBe(20); // 8 / 40
    expect(a.ideasPer100).toBe(22.5); // 9 / 40 * 100
    expect(a.implementationPct).toBe(50); // 2 of 4 projects decided in the period are done
    expect(a.medianDaysToDecision).toBe(4); // eight ideas with 4 days, one with 10
    expect(company.participationPct).toBe(20);
  });

  it("hides a unit with headcount 4 and one with 3 raisers without exposing a derivable total", () => {
    const cases = [...people("a", 6), ...people("b", 6), ...people("c", 3), ...people("d", 6)];
    const o = org(unit("a", null, 20), unit("b", null, 20), unit("c", null, 20), unit("d", null, 4));
    const { units, company } = ziKpis({ cases, projects: [], org: o, period });
    const row = (id: string) => units.find((u) => u.unitId === id)!;
    expect(row("c").hidden).toBe(true); // 3 raisers
    expect(row("d").hidden).toBe(true); // headcount 4
    for (const id of ["c", "d"]) {
      expect(row(id)).toMatchObject({ participationPct: null, ideasPer100: null, headcount: 0, medianDaysToDecision: null });
    }
    expect(company.hidden).toBe(false); // two hidden units cannot be solved apart
  });

  it("hides one more sibling when a single hidden child could be solved from the total", () => {
    const cases = [...people("a", 6), ...people("b", 7), ...people("c", 3)];
    const o = org(unit("a", null, 20), unit("b", null, 20), unit("c", null, 20));
    const { units } = ziKpis({ cases, projects: [], org: o, period });
    const hidden = units.filter((u) => u.hidden).map((u) => u.unitId);
    expect(hidden).toHaveLength(2);
    expect(hidden).toContain("c");
    expect(hidden).toContain("a"); // the smaller visible sibling
  });

  it("hides the parent when its only child is hidden, and the company with too few contributors", () => {
    const cases = [...people("p", 6), ...people("k", 3)];
    const o = org(unit("p", null, 20), unit("k", "p", 8));
    const { units } = ziKpis({ cases, projects: [], org: o, period });
    expect(units.map((u) => [u.unitId, u.hidden, u.depth])).toEqual([["p", true, 0], ["k", true, 1]]);
    const small = ziKpis({ cases: people("a", 4), projects: [], org: org(unit("a", null, 30)), period });
    expect(small.company.hidden).toBe(true);
  });

  it("counts only verified better measures, and sums premiums", () => {
    const m = (o: Partial<KpiProject["measures"][number]>) => ({ verified: true, better: true, eur: null, kwh: null, co2Kg: null, ...o });
    const projects = [
      project({ measures: [m({ eur: 1000, kwh: 200, co2Kg: 50 }), m({ verified: false, eur: 9999 }), m({ better: false, eur: 7777 })], premiumsEur: 100 }),
      project({ measures: [m({ eur: 500 })], premiumsEur: 50 }),
      project({ raiserUnitId: "b", measures: [m({ verified: false, eur: 400 })] }), // a project, but nothing countable
    ];
    const cases = [...people("a", 6), ...people("b", 6), ...people("c", 6)];
    const o = org(unit("a", null, 20), unit("b", null, 20), unit("c", null, 20));
    const { units, company } = ziKpis({ cases, projects, org: o, period });
    const row = (id: string) => units.find((u) => u.unitId === id)!;
    expect(row("a")).toMatchObject({ savingsEur: 1500, energyKwh: 200, co2Kg: 50, premiumsEur: 150 });
    expect(row("b")).toMatchObject({ savingsEur: 0, energyKwh: 0, co2Kg: 0, premiumsEur: 0 });
    expect(row("c")).toMatchObject({ savingsEur: null, premiumsEur: null }); // no project at all
    expect(company).toMatchObject({ savingsEur: 1500, premiumsEur: 150 });
  });

  it("counts a raiser without a seat only in the company row", () => {
    const cases = [...people("a", 5), by(null, "nobody")];
    const { units, company } = ziKpis({ cases, projects: [], org: org(unit("a", null, 20)), period });
    expect(units[0].participationPct).toBe(25); // 5 / 20
    expect(company.participationPct).toBe(30); // 6 / 20
  });

  it("returns no field that holds a raiser key", () => {
    const cases = [...people("a", 6), by(null, "secret-key")];
    const out = ziKpis({ cases, projects: [], org: org(unit("a", null, 20)), period });
    expect(JSON.stringify(out)).not.toMatch(/secret-key|a-0|raiserKey/);
  });
});
