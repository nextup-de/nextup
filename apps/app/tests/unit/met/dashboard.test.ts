import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tileViews } from "@/features/metrics/dashboard";
import type { Baseline, DashboardData, Tile, TileId } from "@/features/metrics/types";
import { createT } from "@/i18n";

const t = createT("en");
const IDS: TileId[] = ["firstReasonedAnswer", "onTime", "ideaToDecision", "pastPromise", "escalated", "overruled"];
const tile = (id: TileId, over: Partial<Tile> = {}): Tile => ({ id, value: 3, of: null, baseline: 3, months: [1, 2, 3, 4, 5, 6], hidden: false, ...over });
const baseline: Baseline = { fromDay: 1, toDay: 30, fromDate: null, toDate: null, imported: {} };

function data(over: Partial<DashboardData> = {}, tiles: Tile[] = IDS.map((id) => tile(id))): DashboardData {
  return {
    period: { from: 31, to: 60 }, fromDate: null, toDate: null, baseline, caseCount: 12, tiles, trend: [], stages: [],
    answers: { yes: 0, yesProject: 0, question: 0, handed: 0, no: 0 }, units: [], roles: [], scopeHidden: false, aiOff: false, demoClock: false, ...over,
  };
}
const view = (d: DashboardData, id: TileId) => tileViews(d, t).find((v) => v.id === id)!;

describe("MET dashboard view", () => {
  it("marks a tile worse than its baseline as worse and a better one as better", () => {
    const d = data({}, [
      tile("firstReasonedAnswer", { value: 4, baseline: 2 }), // slower: worse
      tile("onTime", { value: 84, baseline: 61 }), // more on time: better
      tile("ideaToDecision", { value: 2, baseline: 9 }), // faster: better
      tile("pastPromise", { value: 7, of: 58, baseline: 3 }),
      tile("escalated"),
      tile("overruled", { value: 8, of: 112, baseline: 8 }),
    ]);
    expect(view(d, "firstReasonedAnswer")).toMatchObject({ tone: "worse", delta: "+2 days" });
    expect(view(d, "onTime")).toMatchObject({ tone: "better", delta: "+23 pts" });
    expect(view(d, "ideaToDecision").tone).toBe("better");
    expect(view(d, "pastPromise")).toMatchObject({ tone: "worse", sub: "of 58 open" });
    expect(view(d, "escalated")).toMatchObject({ tone: null, delta: null });
    expect(tileViews(d, t).map((v) => v.tone as string | null)).not.toContain("green");
  });

  it("formats the value of each tile", () => {
    const d = data({}, IDS.map((id) => tile(id, { value: id === "onTime" ? 84 : 2.5, of: id === "overruled" ? 112 : 58 })));
    expect(view(d, "firstReasonedAnswer").value).toBe("2.5 working days");
    expect(view(d, "onTime").value).toBe("84%");
    expect(view(d, "overruled").value).toBe("3 of 112");
    expect(view(data({ demoClock: true }, IDS.map((id) => tile(id))), "ideaToDecision").value).toBe("3 days");
  });

  it("reads a hidden tile as too few to show, with no number", () => {
    const d = data({ scopeHidden: true }, IDS.map((id) => tile(id, { value: null, of: null, baseline: null, months: [], hidden: true })));
    for (const v of tileViews(d, t)) expect(v).toMatchObject({ hidden: true, value: "", delta: null, split: null });
  });

  it("says there is no baseline without one, and labels imported values", () => {
    const none = data({ baseline: null }, IDS.map((id) => tile(id, { baseline: null })));
    expect(view(none, "onTime").baselineLine).toBe("No baseline yet. Set one");
    const imp: Baseline = { ...baseline, imported: { withinPromisePct: { value: 61, source: "old-tool.csv", sha256: "abcdef0123456789", importedBy: "u1", importedAt: "2026-10-01T10:00:00Z" } } };
    const d = data({ baseline: imp }, IDS.map((id) => tile(id, { baseline: 61, value: 70 })));
    expect(view(d, "onTime").baselineLine).toBe("baseline 61% · imported");
    expect(view(d, "onTime").provenance).toContain("old-tool.csv");
    expect(view(d, "firstReasonedAnswer").baselineLine).toContain("counted from the log");
  });

  it("carries the AI-off line and 'by keywords' on the overruled tile when the AI is off", () => {
    const off = data({ aiOff: true });
    expect(view(off, "overruled")).toMatchObject({ sub: "by keywords", aiOffLine: "Routed by keywords - the AI is off for this company." });
    expect(view(off, "onTime").aiOffLine).toBeNull();
    expect(view(data(), "overruled").aiOffLine).toBeNull();
  });

  it("splits by unit, hides small units, and leaves overruled unsplit", () => {
    const row = (id: string, hidden: boolean, v: number | null) => ({
      kind: "unit" as const, id, label: id, depth: 0, cases: v, firstReasonedAnswer: v, onTimePct: v, pastPromise: v, escalated: v, hidden,
    });
    const d = data({ units: [row("a", false, 4), row("b", true, null)] });
    const split = view(d, "firstReasonedAnswer").split!;
    expect(split.map((r) => r.value)).toEqual(["4 working days", null]);
    expect(view(d, "overruled").split).toBeNull();
  });

  it("has deleted dashboardPreview.ts and nothing imports it", () => {
    expect(existsSync("src/components/dashboard/shared/dashboardPreview.ts")).toBe(false);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk("src");
    expect(files.filter((f) => readFileSync(f, "utf8").includes("dashboardPreview"))).toEqual([]);
  });
});
