import { describe, expect, it } from "vitest";
import { shownRows } from "@/features/metrics/breakdown-view";
import type { BreakdownRow } from "@/features/metrics/types";

const row = (id: string, depth: number, over: Partial<BreakdownRow> = {}): BreakdownRow => ({
  kind: "unit", id, label: id, depth, cases: 0, firstReasonedAnswer: null, onTimePct: null, pastPromise: 0, escalated: 0, hidden: false, ...over,
});
const ids = (r: ReturnType<typeof shownRows>) => r.rows.map((x) => x.row.id);

describe("MET breakdown rows on the Dashboard", () => {
  it("leaves out a unit with no case, nothing past its promise and nothing escalated", () => {
    const r = shownRows([row("a", 0, { cases: 3 }), row("b", 0), row("c", 0, { pastPromise: 1 }), row("d", 0, { escalated: 2 })]);
    expect(ids(r)).toEqual(["a", "c", "d"]);
    expect(r.hidden).toBe(0);
  });

  it("leaves out a unit under 5 people and only counts it, never showing its figures", () => {
    const r = shownRows([row("a", 0, { cases: 4 }), row("small", 0, { hidden: true, cases: null, pastPromise: null, escalated: null })]);
    expect(ids(r)).toEqual(["a"]);
    expect(r.hidden).toBe(1);
  });

  it("keeps a parent as a heading without figures when only a unit under it has cases", () => {
    const r = shownRows([row("site", 0, { hidden: true, cases: null }), row("dept", 1, { cases: 5 }), row("idle", 1)]);
    expect(ids(r)).toEqual(["site", "dept"]);
    expect(r.rows[0]).toMatchObject({ parentId: null, hasKids: true, figures: false });
    expect(r.rows[1]).toMatchObject({ parentId: "site", hasKids: false, figures: true });
  });

  it("names the nearest unit above as the parent across levels", () => {
    const r = shownRows([row("z", 0, { cases: 9 }), row("p", 1, { cases: 4 }), row("a", 2, { cases: 2 }), row("q", 1, { cases: 1 }), row("w", 0, { cases: 1 })]);
    expect(r.rows.map((x) => [x.row.id, x.parentId])).toEqual([["z", null], ["p", "z"], ["a", "p"], ["q", "z"], ["w", null]]);
    expect(r.rows.find((x) => x.row.id === "z")!.hasKids).toBe(true);
    expect(r.rows.find((x) => x.row.id === "q")!.hasKids).toBe(false);
  });
});
