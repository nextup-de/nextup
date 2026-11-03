import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR, DEMO_CLOCK, type ClockSpec } from "@/features/clock";
import { dueNow } from "@/features/clock/due";
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
const baseline = () => ev("project.baseline", "L. Brandt", "p_one", { metric: "m", unit: "min", value: 42, better: "down", source: "x" });
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

  it("a project past its start date escalates only with a start fact", () => {
    const base = [raise("c_a"), yes("c_a")];
    const without = reduce(WD, logAt(late, ...base)).projects[0];
    expect(without.overdue).toBe(true);
    expect(without.escalated).toBeNull();
    const S = reduce(WD, logAt(late, ...base, fact("p_one", { kind: "start", dueDay: PROMISE_DAYS, toRoleHolderId: "seat_tv" })));
    expect(S.projects[0].escalated).toEqual({ to: "T. Vogel", toSeatId: "seat_tv", toRoleId: "role_owner", from: "L. Brandt", day: PROMISE_DAYS + 1, live: true, what: "start" });
    expect(S.ledger.projectsEscalated).toBe(1);
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

describe("CLK dueNow", () => {
  const late = PROMISE_DAYS + 2;

  it("an overdue case yields one deadline Due to the deputy's seat; none once the fact is in", () => {
    const S = reduce(WD, logAt(late, raise("c_a")));
    expect(dueNow(S, late)).toEqual([{ kind: "deadline", target: "c_a", dueDay: PROMISE_DAYS, toRoleHolderId: "seat_dep", idemKey: `clk:deadline:c_a:${PROMISE_DAYS}` }]);
    const done = reduce(WD, logAt(late, raise("c_a"), fact("c_a", { kind: "deadline", dueDay: PROMISE_DAYS, toRoleHolderId: "seat_dep" })));
    // LOOP-H1: with the fact in and the rule on (default), the hand-over is what is left.
    expect(dueNow(done, late).map((d) => d.kind)).toEqual(["handover"]);
  });

  it("nothing for a case not yet due, nothing in demo mode", () => {
    expect(dueNow(reduce(WD, logAt(1, raise("c_a"))), 1)).toEqual([]);
    expect(dueNow(reduce({ ...BASE, clock: DEMO_CLOCK }, logAt(late, raise("c_a"))), late)).toEqual([]);
  });

  it("a discussion past its check-in day yields a checkin Due, once", () => {
    const disc = ev("case.discussion", "T. Vogel", "c_a", { invited: [], missing: "x" }, 0);
    const S = reduce(WD, logAt(20, raise("c_a"), disc));
    const c = find(S.cases, "c_a");
    expect(dueNow(S, 20)).toEqual([{ kind: "checkin", target: "c_a", dueDay: c.dueDay, idemKey: `clk:checkin:c_a:${c.dueDay}` }]);
    const S2 = reduce(WD, logAt(20, raise("c_a"), disc, fact("c_a", { kind: "checkin", dueDay: c.dueDay })));
    expect(dueNow(S2, 20)).toEqual([]);
  });

  it("a project past its start day yields a start Due", () => {
    const S = reduce(WD, logAt(late, raise("c_a"), yes("c_a")));
    const due = dueNow(S, late).filter((d) => d.target === "p_one");
    expect(due).toEqual([{ kind: "start", target: "p_one", dueDay: PROMISE_DAYS, toRoleHolderId: "seat_tv", idemKey: `clk:start:p_one:${PROMISE_DAYS}` }]);
  });

  it("a late 30-day check yields a measure Due with check", () => {
    const evs = [raise("c_a"), yes("c_a"), baseline(), ev("project.started", "L. Brandt", "p_one", {}), ev("project.done", "L. Brandt", "p_one", {}, 1)];
    const day = 1 + 30 + PROMISE_DAYS + 1;
    const S = reduce(WD, logAt(day, ...evs));
    const m = dueNow(S, day).filter((d) => d.kind === "measure");
    expect(m).toEqual([{ kind: "measure", target: "p_one", dueDay: 1 + 30 + PROMISE_DAYS, check: 30, toRoleHolderId: "seat_tv", idemKey: `clk:measure:p_one:${1 + 30 + PROMISE_DAYS}:30` }]);
    const S2 = reduce(WD, logAt(day, ...evs, fact("p_one", { kind: "measure", dueDay: 1 + 30 + PROMISE_DAYS, check: 30, toRoleHolderId: "seat_tv" })));
    expect(dueNow(S2, day).filter((d) => d.kind === "measure")).toEqual([]);
    expect(S2.projects[0].escalated?.what).toBe("measure");
  });
});
