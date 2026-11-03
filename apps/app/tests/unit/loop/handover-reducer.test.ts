import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR, DEMO_CLOCK, type ClockSpec } from "@/features/clock";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
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
const BASE: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats };
const WD: ReduceSeed = { ...BASE, clock: WORKDAYS };

let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "h" + n++, ts: 0, type, actor, actorUserId: actor === "system:clock" ? null : "u_lb", target, payload, day });
const logAt = (day: number, ...events: CaseEvent[]): EventLog => ({ events, day });
const raise = (id: string) => ev("case.raised", "L. Brandt", id, { kind: "problem", title: "Case " + id, routeId: "r1", assignee: "T. Vogel" });
const fact = (target: string) => ev("clock.due", "system:clock", target, { kind: "deadline", dueDay: PROMISE_DAYS, toRoleHolderId: "seat_dep" });
const handed = (target: string, why: string) => ev("case.handed", "system:clock", target, { to: "H. Sander", toRoleHolderId: "seat_dep", why });
const late = PROMISE_DAYS + 2;

describe("LOOP deadline hand-over ends the escalation", () => {
  it("a fact alone escalates to the deputy while the owner holds the case", () => {
    const c = reduce(WD, logAt(late, raise("c_a"), fact("c_a"))).cases.find((x) => x.id === "c_a")!;
    expect(c.escalated).toMatchObject({ toSeatId: "seat_dep", toRoleId: "role_deputy" });
    expect(c.assigneeSeatId).toBe("seat_tv");
  });

  it("a deadline hand-over after the fact moves the case to the deputy and ends the escalation", () => {
    const c = reduce(WD, logAt(late, raise("c_a"), fact("c_a"), handed("c_a", "deadline"))).cases.find((x) => x.id === "c_a")!;
    expect(c.assigneeSeatId).toBe("seat_dep");
    expect(c.assigneeRoleId).toBe("role_deputy");
    expect(c.escalated).toBeNull();
  });

  it("a hand-over with another reason leaves the escalation as before", () => {
    const c = reduce(WD, logAt(late, raise("c_a"), fact("c_a"), handed("c_a", "away"))).cases.find((x) => x.id === "c_a")!;
    expect(c.escalated).toMatchObject({ toSeatId: "seat_dep" });
  });

  it("a newer fact after the hand-over escalates again", () => {
    const c = reduce(WD, logAt(late, raise("c_a"), fact("c_a"), handed("c_a", "deadline"), fact("c_a"))).cases.find((x) => x.id === "c_a")!;
    expect(c.escalated).toMatchObject({ toSeatId: "seat_dep" });
  });

  it("demo mode gives today's result", () => {
    const events = [raise("c_a"), fact("c_a"), handed("c_a", "deadline")];
    const withHand = reduce({ ...BASE, clock: DEMO_CLOCK }, logAt(late, ...events));
    const without = reduce({ ...BASE, clock: DEMO_CLOCK }, logAt(late, raise("c_a"), handed("c_a", "deadline")));
    expect(withHand.cases.find((x) => x.id === "c_a")!.escalated).toEqual(without.cases.find((x) => x.id === "c_a")!.escalated);
  });
});
