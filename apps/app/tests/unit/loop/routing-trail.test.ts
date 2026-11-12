import { describe, expect, it } from "vitest";
import type { Me } from "@/features/auth/identity";
import type { CaseEvent } from "@/features/cases/events";
import type { ReducedCase } from "@/features/cases/reducer";
import { routingTrail, seesRouting } from "@/features/cases/routing-trail";

const ev = (type: CaseEvent["type"], day: number, payload: CaseEvent["payload"] = {}, actorUserId: string | null = null): CaseEvent =>
  ({ id: `${type}-${day}`, ts: 0, day, type, actor: "x", target: "c1", payload, actorUserId });

function mk(history: CaseEvent[], over: Partial<ReducedCase> = {}): ReducedCase {
  return {
    id: "c1", seed: false, kind: "problem", title: "t", body: "", from: "A", fromDept: "", fromUserId: "u-raiser",
    assigneeSeatId: "seat-1", assigneeRoleId: "role-desk", routeId: "r1", assignee: "Desk", raisedDay: 0,
    reason: "", upside: "", linkedIdea: null, status: "open", read: null, decided: null, withdrawn: null, question: null, handed: [],
    building: null, shipped: null, override: null, discussion: null, versions: [], decisions: [], passes: 0, notNowInRow: 0, appeal: null, reopens: [], cycleStartDay: 0, dueFloor: null, reopenSeq: null, decidedSeq: null, pausedDays: 0, pausedSince: null,
    history, route: null, age: 0, clock: 0, open: true, archived: false, overdue: false, dueDay: 5, escalated: null,
    ...over,
  };
}

const proposal = (routeId: string | null, source: "llm" | "keywords" = "llm") => ({ routeId, confidence: 80, source, version: "v1" });

describe("LOOP routing trail", () => {
  it("a proposal sent as proposed is one row", () => {
    const c = mk([ev("case.raised", 0, { routeId: "r1", proposal: proposal("r1") })]);
    expect(routingTrail(c)).toEqual([{ kind: "proposed-sent", routeId: "r1", source: "llm" }]);
  });

  it("raised elsewhere gives proposed and sent by the raiser", () => {
    const c = mk([ev("case.raised", 0, { routeId: "r2", proposal: proposal("r1", "keywords") })]);
    expect(routingTrail(c)).toEqual([
      { kind: "proposed", routeId: "r1", source: "keywords" },
      { kind: "sent", routeId: "r2", chosenBy: "raiser" },
    ]);
  });

  it("two overrides give two moved rows in order, without the actor", () => {
    const c = mk([
      ev("case.raised", 0, { routeId: "r1", proposal: proposal("r1") }),
      ev("case.override", 1, { proposed: "r1", chosen: "r2" }, "u-mover"),
      ev("case.override", 3, { proposed: "r2", chosen: "r3" }, "u-mover"),
    ]);
    const rows = routingTrail(c);
    expect(rows).toEqual([
      { kind: "proposed-sent", routeId: "r1", source: "llm" },
      { kind: "moved", routeId: "r2", day: 1 },
      { kind: "moved", routeId: "r3", day: 3 },
    ]);
    expect(JSON.stringify(rows)).not.toContain("u-mover");
  });

  it("no proposal gives one sent row", () => {
    const c = mk([ev("case.raised", 0, { routeId: "r1" })]);
    expect(routingTrail(c)).toEqual([{ kind: "sent", routeId: "r1", chosenBy: "raiser" }]);
  });

  it("seesRouting lets the raiser, the desk, the escalation role and managers see it", () => {
    const escalated = { to: "Dep", from: "Desk", day: 6, live: true, toSeatId: "seat-d", toRoleId: "role-dep" };
    const c = mk([], { escalated });
    const me = (userId: string | null, roleIds: string[]): Me => ({ userId, seatIds: [], roleIds });
    expect(seesRouting(c, me("u-raiser", []), "member")).toBe(true);
    expect(seesRouting(c, me("u-x", ["role-desk"]), "member")).toBe(true);
    expect(seesRouting(c, me("u-y", ["role-dep"]), "member")).toBe(true);
    expect(seesRouting(c, me("u-z", []), "manager")).toBe(true);
    expect(seesRouting(c, me("u-other", ["role-else"]), "member")).toBe(false);
  });
});
