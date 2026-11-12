import { describe, expect, it } from "vitest";
import { breakdown } from "@/features/metrics/breakdown";
import { breakdownCsv, csvFileName } from "@/features/metrics/csv";
import { hiddenTiles, scopeCases, waitLedger } from "@/features/metrics/ledger";
import type { LedgerCase, LedgerInput } from "@/features/metrics/types";
import { createT } from "@/i18n";

const lc = (over: Partial<LedgerCase>): LedgerCase => ({
  caseId: "c", kind: "problem", status: "open", open: false, unitId: null, roleId: null, raisedDay: 90,
  firstResponseDay: 91, firstReasonedAnswerDay: 92, decidedDay: null, decision: null, withProject: false, reasoned: true,
  dueDay: 95, lastDay: 92, escalatedDay: null, raiserKey: "SECRET-KEY", raiserUnitId: null, ...over,
});

const unit = (id: string, parentId: string | null, people: number) => ({ id, name: id === "plant" ? "Plant; North" : id, parentId, people, headcount: people });
// Plant > Quality (6) > Lab (3), plus Plant > Assembly (8) and Plant > Paint (7)
const input = (extra: ReturnType<typeof unit>[] = []): LedgerInput => ({
  cases: [
    lc({ caseId: "1", unitId: "quality", roleId: "r-big" }),
    lc({ caseId: "2", unitId: "lab", roleId: "r-small" }),
    lc({ caseId: "3", unitId: "lab", roleId: "r-small", escalatedDay: 93 }),
    lc({ caseId: "4", unitId: "plant", roleId: "r-big", firstResponseDay: 99, firstReasonedAnswerDay: 99 }),
  ],
  facts: { answers: { yes: 0, yesProject: 0, question: 0, handed: 0, no: 0 }, override: { proposed: 0, overridden: 0, rate: null } },
  org: {
    units: [unit("plant", null, 20), unit("quality", "plant", 6), unit("lab", "quality", 3), ...extra],
    roles: [{ id: "r-big", title: 'Lead "A"', unitId: "quality", people: 6 }, { id: "r-small", title: "Tech", unitId: "lab", people: 2 }],
  },
  promiseDays: 5, today: 100, demoClock: true, stalled: [],
});
const period = { from: 71, to: 100 };

describe("MET breakdown", () => {
  it("hides Lab and, with no sibling to hide, its parent Quality, but still counts Lab in Plant", () => {
    const rows = breakdown(input(), period, "unit");
    expect(rows.map((r) => [r.id, r.depth, r.hidden])).toEqual([["plant", 0, false], ["quality", 1, true], ["lab", 2, true]]);
    expect(rows[0].cases).toBe(4); // Lab's two cases are in the roll-up
    for (const r of rows.slice(1)) expect(r).toMatchObject({ cases: null, firstReasonedAnswer: null, onTimePct: null, pastPromise: null, escalated: null });
  });

  it("hides the smallest visible sibling when a parent has one, so Lab cannot be derived by subtraction", () => {
    const rows = breakdown(input([unit("assembly", "plant", 8), unit("paint", "plant", 7)]), period, "unit");
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    // Lab is Quality's only child, so Quality hides with it; Plant's other children stay visible.
    expect(by.lab.hidden).toBe(true);
    expect(by.quality.hidden).toBe(true);
    expect(by.assembly.hidden).toBe(false);
    expect(by.plant.cases).toBe(4);
  });

  it("hides a sibling when a hidden child has visible siblings", () => {
    const wide = input([unit("lab2", "quality", 9)]);
    const rows = breakdown(wide, period, "unit");
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.lab.hidden).toBe(true);
    expect(by.lab2.hidden).toBe(true); // the only visible sibling goes with it
    expect(by.quality.hidden).toBe(false); // Quality alone no longer reveals Lab
  });

  it("hides a role with 2 holders and keeps the visible one", () => {
    const rows = breakdown(input(), period, "role");
    expect(rows.find((r) => r.id === "r-small")).toMatchObject({ hidden: true, cases: null });
    expect(rows.find((r) => r.id === "r-big")).toMatchObject({ hidden: false, cases: 2, firstReasonedAnswer: 5.5, onTimePct: 50 });
  });

  it("hides every tile of a scope of 3 people", () => {
    const scoped = scopeCases(input(), "lab");
    expect(scoped.hidden).toBe(true);
    const tiles = waitLedger({ ...input(), cases: scoped.cases }, period, null, {}).tiles;
    expect(hiddenTiles(tiles).every((t) => t.hidden && t.value === null)).toBe(true);
    expect(scopeCases(input(), "plant").hidden).toBe(false);
  });

  it("applies the same suppression in the CSV, in en and de", () => {
    const rows = breakdown(input(), period, "unit");
    const en = breakdownCsv(rows, "en", createT("en")).trim().split("\n");
    const de = breakdownCsv(rows, "de", createT("de")).trim().split("\n");
    expect(en[0]).toBe("Unit or role;Cases;First reasoned answer (days, median);On time (%);Open cases past promise;Escalated");
    expect(en[1]).toBe('"Plant; North";4;2;75;0;1');
    expect(en[2]).toBe("quality;too few;too few;too few;too few;too few");
    expect(de[0].startsWith("Einheit oder Rolle;Fälle;")).toBe(true);
    expect(de[1]).toBe('"Plant; North";4;2;75;0;1');
    expect(de[3]).toBe("lab;zu wenige;zu wenige;zu wenige;zu wenige;zu wenige");
    const roles = breakdownCsv(breakdown(input(), period, "role"), "en", createT("en")).split("\n");
    expect(roles[1]).toBe('"Lead ""A""";2;5.5;50;0;0');
    expect(breakdownCsv(breakdown(input(), period, "role"), "de", createT("de")).split("\n")[1]).toBe('"Lead ""A""";2;5,5;50;0;0');
  });

  it("names no raiser key in any row or CSV line", () => {
    for (const kind of ["unit", "role"] as const) {
      const rows = breakdown(input(), period, kind);
      expect(JSON.stringify(rows)).not.toContain("SECRET-KEY");
      expect(breakdownCsv(rows, "de", createT("de"))).not.toContain("SECRET-KEY");
    }
  });

  it("names the file after prefix, company and dates", () => {
    expect(csvFileName("wait-ledger", "Acme Co", "2026-10-05", "2026-11-03")).toBe("wait-ledger-acme-co-2026-10-05-2026-11-03.csv");
  });
});
