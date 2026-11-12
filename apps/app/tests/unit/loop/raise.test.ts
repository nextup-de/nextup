import { describe, expect, it } from "vitest";
import type { Desk } from "@/features/ideas/desks";
import { RAISE_ACTIONS, raiseTarget } from "@/features/ideas/raise-actions";
import { exportParts, type ExportIdea } from "@/features/ideas/export";
import { NO_EXTRAS, readExtras } from "@/components/ideas/raisePreview";

const desk: Desk = {
  roleId: "role-fin", routeId: "r-budget", title: "Finance lead", dept: "Finance", type: "Budget",
  holders: ["Finance 1"], vacant: false, deputies: [], answer: null, proposedBy: "keywords", reasons: [], recommended: true,
};

describe("LOOP raise to a desk", () => {
  it("the raise actions are file, affected and who sees it only", () => {
    expect([...RAISE_ACTIONS]).toEqual(["file", "affected", "vis"]);
    for (const gone of ["receiver", "colleague", "meeting"]) expect(RAISE_ACTIONS as readonly string[]).not.toContain(gone);
  });
  it("a raise to a desk carries that desk's route, without a desk none", () => {
    expect(raiseTarget(desk)).toEqual({ routeId: "r-budget" });
    expect(raiseTarget(null)).toEqual({ routeId: null });
  });
  it("the export of an idea has no colleagues or meeting", () => {
    const idea: ExportIdea = { kind: "idea", title: "T", summary: "S", context: "", affected: ["Packing"], prompts: [], author: "A" };
    const labels = exportParts(idea).rows.map((r) => r[0]);
    expect(labels).toEqual(["Affects"]);
    expect(Object.keys(idea)).not.toContain("coll");
    expect(Object.keys(idea)).not.toContain("meet");
  });
  it("kept state with the old receiver, colleague and meeting fields still reads", () => {
    const old = { recv: ["T. Vogel"], coll: ["A. Novak"], meet: { dur: "15 min", when: "this week" }, vis: "private" as const, visTo: [] };
    const read = readExtras(old as never);
    expect(read).toEqual({ ...NO_EXTRAS, vis: "private" });
    expect(Object.keys(read).sort()).toEqual(Object.keys(NO_EXTRAS).sort());
    expect(readExtras(undefined)).toEqual(NO_EXTRAS);
  });
});
