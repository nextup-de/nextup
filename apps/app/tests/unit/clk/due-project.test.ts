import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR, type ClockSpec } from "@/features/clock";
import { dueNow } from "@/features/clock/due";
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
  ({ id: "k" + n++, ts: 0, type, actor, actorUserId: actor === "system:clock" ? null : "u_lb", target, payload, day });
const logAt = (day: number, ...events: CaseEvent[]): EventLog => ({ events, day });
const raise = (id: string, day = 0) => ev("case.raised", "L. Brandt", id, { kind: "problem", title: "Case " + id, routeId: "r1", assignee: "T. Vogel" }, day);
const fact = (target: string, payload: EventPayload, day = 0) => ev("clock.due", "system:clock", target, payload, day);
const yes = (caseId: string) => ev("case.decided", "T. Vogel", caseId, { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "P" });
const baseline = () => ev("project.baseline", "L. Brandt", "p_one", { metric: "m", unit: "min", value: 42, better: "down", source: "x" });

describe("CLK reducer on due facts", () => {
  const late = PROMISE_DAYS + 2;

  it("a project past its start date escalates only with a start fact", () => {
    const base = [raise("c_a"), yes("c_a")];
    const without = reduce(WD, logAt(late, ...base)).projects[0];
    expect(without.overdue).toBe(true);
    expect(without.escalated).toBeNull();
    const S = reduce(WD, logAt(late, ...base, fact("p_one", { kind: "start", dueDay: PROMISE_DAYS, toRoleHolderId: "seat_tv" })));
    expect(S.projects[0].escalated).toEqual({ to: "T. Vogel", toSeatId: "seat_tv", toRoleId: "role_owner", from: "L. Brandt", day: PROMISE_DAYS + 1, live: true, what: "start" });
    expect(S.ledger.projectsEscalated).toBe(1);
  });
});

describe("CLK dueNow", () => {
  const late = PROMISE_DAYS + 2;

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
