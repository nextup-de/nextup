import { describe, expect, it } from "vitest";
import type { CaseEvent, EventPayload } from "@/features/cases/events";
import { overrideRate } from "@/features/routing/override";

let n = 0;
const ev = (type: CaseEvent["type"], target: string, payload: EventPayload, day = 0): CaseEvent =>
  ({ id: "e" + n++, ts: n, day, type, actor: "x", target, payload });
const proposal = (routeId: string | null) => ({ routeId, confidence: 70, source: "keywords" as const, version: "keywords-v1" });
const raised = (id: string, routeId: string, proposed: string | null, day = 0) =>
  ev("case.raised", id, { routeId, ...(proposed === null ? {} : { proposal: proposal(proposed) }) }, day);

describe("AIP override rate", () => {
  it("counts proposals, a different route and a later override", () => {
    const events = [
      raised("c1", "r1", "r1"),
      raised("c2", "r3", "r2"), // raised on another route than proposed
      raised("c3", "r2", "r2"),
      ev("case.override", "c3", { proposed: "r2", chosen: "r4" }), // overridden later
    ];
    expect(overrideRate(events)).toEqual({ proposed: 3, overridden: 2, rate: 2 / 3 });
  });

  it("does not count a raise without a proposal", () => {
    expect(overrideRate([raised("c1", "r1", null), raised("c2", "r1", "r1")])).toEqual({ proposed: 1, overridden: 0, rate: 0 });
  });

  it("gives a null rate when nothing was raised", () => {
    expect(overrideRate([])).toEqual({ proposed: 0, overridden: 0, rate: null });
    expect(overrideRate([raised("c1", "r1", null)]).rate).toBeNull();
  });

  it("filters by the from / to day window", () => {
    const events = [raised("c1", "r1", "r1", -5), raised("c2", "r2", "r1", 1), raised("c3", "r1", "r1", 9)];
    expect(overrideRate(events, 0, 5)).toEqual({ proposed: 1, overridden: 1, rate: 1 });
    expect(overrideRate(events, 0)).toMatchObject({ proposed: 2 });
    expect(overrideRate(events, undefined, 1)).toMatchObject({ proposed: 2 });
  });
});
