import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR, DEMO_CLOCK, type ClockSpec } from "@/features/clock";
import { dueNow } from "@/features/clock/due";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import type { SeatRow } from "@/features/auth/identity";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";

const WORKDAYS: ClockSpec = { mode: "workdays", calendar: DEFAULT_CALENDAR };
const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 1 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner", deputySeatId: "seat_dep", deputyRoleId: "role_deputy" } : x));
const WD: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, clock: WORKDAYS };
const OFF: ReduceSeed = { ...WD, loop: { deadlineHandover: false } };

let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "h" + n++, ts: 0, type, actor, actorUserId: actor === "system:clock" ? null : "u_lb", target, payload, day });
const raise = () => ev("case.raised", "L. Brandt", "c_a", { kind: "problem", title: "Case", routeId: "r1", assignee: "T. Vogel" });
const fact = (to: string | null) => ev("clock.due", "system:clock", "c_a", { kind: "deadline", dueDay: PROMISE_DAYS, toRoleHolderId: to });
const handed = () => ev("case.handed", "system:clock", "c_a", { to: "H. Sander", toRoleHolderId: "seat_dep", why: "deadline" });
const late = PROMISE_DAYS + 2;
const dues = (seed: ReduceSeed, ...events: CaseEvent[]) => dueNow(reduce(seed, { events, day: late }), late);

describe("LOOP deadline hand-over", () => {
  it("rule on, a deadline fact in the history: one handover Due to the fact's seat", () => {
    expect(dues(WD, raise(), fact("seat_dep"))).toEqual([
      { kind: "handover", target: "c_a", dueDay: PROMISE_DAYS, toRoleHolderId: "seat_dep", idemKey: "clk:handover:c_a" },
    ]);
  });

  it("before the fact is in, only the deadline fact is due", () => {
    expect(dues(WD, raise()).map((d) => d.kind)).toEqual(["deadline"]);
  });

  it("none once a deadline hand-over is in the history", () => {
    expect(dues(WD, raise(), fact("seat_dep"), handed())).toEqual([]);
  });

  it("none with the rule off", () => {
    expect(dues(OFF, raise(), fact("seat_dep"))).toEqual([]);
  });

  it("none in demo mode", () => {
    expect(dues({ ...WD, clock: DEMO_CLOCK }, raise(), fact("seat_dep"))).toEqual([]);
  });

  it("none for a fact without a seat", () => {
    expect(dues(WD, raise(), fact(null))).toEqual([]);
  });

  it("none for a case in a discussion", () => {
    const disc = ev("case.discussion", "T. Vogel", "c_a", { invited: [], missing: "x" });
    expect(dues(WD, raise(), disc, fact("seat_dep")).filter((d) => d.kind === "handover")).toEqual([]);
  });
});
