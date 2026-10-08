// The manager Overview's counts (features/metrics/overview.ts), on the static demo's seed at day 0.
import { describe, expect, it } from "vitest";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { STATIC_DEMO_SEED as SEED } from "@/features/demo/static-demo";
import { decisionsWaiting, demoData } from "@/features/metrics";
import { decisionRows, deliveredCount, desks, euroK, stallSplit, unownedProblems, upsideTotal } from "@/features/metrics/overview";

const S = reduce(SEED, emptyLog());

describe("desks", () => {
  const list = desks(S.cases, SEED.people);

  it("puts a case past the promise on the deputy's desk, late desks first", () => {
    expect(list[0]).toMatchObject({ name: "Markus Roth", role: "Engineering lead", open: 2, late: 2, movedIn: 2 });
  });

  it("counts open and paused cases, and leaves decided and shipped ones out", () => {
    const vogel = list.find((d) => d.name === "Thomas Vogel");
    expect(vogel).toMatchObject({ open: 5, paused: 1, late: 0 });
    const held = list.reduce((a, d) => a + d.open + d.paused, 0);
    expect(held).toBe(S.cases.filter((c) => c.open || c.status === "asked").length);
    expect(list.some((d) => d.name === "Lars Brandt" || d.name === "Daniel Fischer")).toBe(false);
  });
});

describe("stallSplit", () => {
  it("adds up the routing reasons against the total", () => {
    const s = stallSplit(SEED.stall);
    expect(s).toMatchObject({ total: 60, routing: 40 });
    expect(s?.parts.map((p) => p.routing)).toEqual([true, true, false, false]);
    expect(s?.parts.map((p) => p.pct)).toEqual([38, 28, 20, 13]);
  });
  it("is null with no waiting recorded", () => {
    expect(stallSplit([])).toBeNull();
  });
});

describe("unownedProblems", () => {
  it("keeps problems with nobody on them, most people first", () => {
    expect(unownedProblems(S.problems).map((p) => p.people)).toEqual([64, 20]);
  });
});

describe("decisions", () => {
  const rows = decisionRows(decisionsWaiting(demoData(SEED, S, true)), SEED.initiatives, SEED.promiseDays);

  it("attaches the team waiting to start and the days left on the promise", () => {
    const spend = rows.find((r) => r.idea.id === "i1");
    expect(spend?.team?.people).toBe(3);
    expect(spend?.due).toBe(5 - 19);
    expect(rows.find((r) => r.idea.id === "i2")?.team?.people).toBe(0);
  });

  it("sums the euro upside and formats it", () => {
    expect(upsideTotal(rows.map((r) => r.idea))).toBe(450);
    expect(upsideTotal([{ upside: "not modelled" }])).toBe(0);
    expect(euroK(450)).toBe("€450k");
    expect(euroK(1250)).toBe("€1.25M");
  });
});

describe("deliveredCount", () => {
  it("counts outcomes that met or beat the promise", () => {
    expect(deliveredCount(SEED.outcomes)).toBe(3);
  });
});
