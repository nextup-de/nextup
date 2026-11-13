import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR, DEMO_CLOCK, type ClockSpec } from "@/features/clock";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { meFor, type SeatRow } from "@/features/auth/identity";
import { deskOf } from "@/features/cases/selectors";
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
  ({ id: "k" + n++, ts: 0, type, actor, actorUserId: actor === "system:clock" ? null : "u_lb", target, payload, day });
const logAt = (day: number, ...events: CaseEvent[]): EventLog => ({ events, day });
const raise = (id: string, day = 0) => ev("case.raised", "L. Brandt", id, { kind: "problem", title: "Case " + id, routeId: "r1", assignee: "T. Vogel" }, day);
const fact = (target: string, payload: EventPayload, day = 0) => ev("clock.due", "system:clock", target, payload, day);
const yes = (caseId: string) => ev("case.decided", "T. Vogel", caseId, { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "P" });
const find = <T extends { id: string }>(xs: T[], id: string) => xs.find((x) => x.id === id)!;

describe("CLK reducer on due facts", () => {
  const late = PROMISE_DAYS + 2;

  it("an overdue case is overdue but not escalated without a fact", () => {
    const c = find(reduce(WD, logAt(late, raise("c_a"))).cases, "c_a");
    expect(c.overdue).toBe(true);
    expect(c.escalated).toBeNull();
  });

  it("a deadline fact escalates to the seat's role; the deputy and the owner both have it", () => {
    const S = reduce(WD, logAt(late, raise("c_a"), fact("c_a", { kind: "deadline", dueDay: PROMISE_DAYS, toRoleHolderId: "seat_dep" })));
    const c = find(S.cases, "c_a");
    expect(c.escalated).toEqual({ to: "H. Sander", from: "T. Vogel", day: PROMISE_DAYS + 1, live: true, toSeatId: "seat_dep", toRoleId: "role_deputy" });
    expect(c.history.some((e) => e.type === "clock.due")).toBe(true);
    expect(S.ledger.escalated).toBe(1);
    expect(deskOf(S, meFor("u_hs", seats)).some((x) => x.id === "c_a")).toBe(true);
    expect(deskOf(S, meFor("u_tv", seats)).some((x) => x.id === "c_a")).toBe(true);
  });

  it("a decided case is not escalated", () => {
    const S = reduce(WD, logAt(late, raise("c_a"), fact("c_a", { kind: "deadline", dueDay: PROMISE_DAYS, toRoleHolderId: "seat_dep" }), ev("case.decided", "T. Vogel", "c_a", { answer: "no" }, late)));
    expect(find(S.cases, "c_a").escalated).toBeNull();
  });
  it("the same seed in demo mode escalates exactly as today", () => {
    const events = [raise("c_a"), raise("c_b"), yes("c_b")];
    const log = logAt(late, ...events, fact("c_a", { kind: "deadline", dueDay: 0, toRoleHolderId: "seat_tv" }));
    const asIs = reduce(BASE, logAt(late, ...events));
    const demo = reduce({ ...BASE, clock: DEMO_CLOCK }, log);
    expect(find(demo.cases, "c_a").escalated).toEqual(find(asIs.cases, "c_a").escalated);
    expect(find(demo.cases, "c_a").escalated?.to).toBeTruthy();
    expect(demo.projects[0].escalated).toEqual(asIs.projects[0].escalated);
    expect(demo.ledger).toEqual(asIs.ledger);
    const local = { cases: LOCAL_SEED.cases, ideas: LOCAL_SEED.ideas, problems: PROBLEMS, routes: LOCAL_SEED.routes, promiseDays: PROMISE_DAYS, seats: LOCAL_SEED.seats };
    expect(reduce({ ...local, clock: DEMO_CLOCK }, logAt(3)).ledger).toEqual(reduce(local, logAt(3)).ledger);
  });
});
