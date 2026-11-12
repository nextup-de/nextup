// RES-A1: a log written before plan RES. A legacy project that was measured, confirmed and rewarded, a project still measuring, and a draft with a
// sponsor, a member, steps and a baseline: every event type the project reducer knew then, none of RES's.
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import type { ReduceSeed } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";

const UID: Record<string, string> = { "T. Vogel": "u_tv", "L. Brandt": "u_lb", "H. Sander": "u_hs", "B. Hartmann": "u_bh", "C. Ilg": "u_ci", "Anonymous #4471": "u_js" };
export const SEATS: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_hs", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 1 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner", deputySeatId: "seat_hs", deputyRoleId: "role_deputy" } : x));
export const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats: SEATS, loop: { measureDays: [30] } };

let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "y" + n++, ts: 0, type, actor, actorUserId: UID[actor] ?? null, target, payload, day });
const raise = (id: string, title: string) => ev("case.raised", "Anonymous #4471", id, { kind: "idea", title, body: "text", routeId: "r1", assignee: "T. Vogel" });
const yes = (caseId: string, projectId: string, extra: EventPayload = {}) =>
  ev("case.decided", "T. Vogel", caseId, { answer: "yes", projectId, lead: "L. Brandt", leadUserId: "u_lb", title: "Project " + projectId, ...extra });
const one = (type: CaseEventType, payload: EventPayload = {}, day = 0, actor = "L. Brandt") => ev(type, actor, "p_one", payload, day);
const two = (type: CaseEventType, payload: EventPayload = {}, day = 0, actor = "L. Brandt") => ev(type, actor, "p_two", payload, day);
const three = (type: CaseEventType, payload: EventPayload = {}, day = 0, actor = "L. Brandt") => ev(type, actor, "p_three", payload, day);

export const LOG: CaseEvent[] = [
  // p_one: measured, confirmed by a manager and rewarded.
  raise("c_a", "Shorter changeover"), yes("c_a", "p_one"),
  one("project.member", { userId: "u_hs", name: "H. Sander" }),
  one("project.baseline", { metric: "Changeover", unit: "min", value: 42, better: "down", source: "MES" }), one("project.started", {}, 1),
  one("project.step.added", { stepId: "s1", text: "Pre-stage the tools", dueDay: 3 }, 1), one("project.step.added", { stepId: "s2", text: "Train the shift" }, 1),
  one("project.step.moved", { stepId: "s1", to: "done" }, 2), one("project.step.edited", { stepId: "s2", ownerUserId: "u_hs", owner: "H. Sander" }, 2),
  one("project.linked", { system: "jira", key: "OPS-1", url: "https://example.test/OPS-1" }, 2), one("project.commented", { text: "Going well" }, 2),
  one("project.done", { note: "Live on line 3" }, 3),
  one("project.measured", { check: 30, value: 30, source: "MES weekly", note: "first month" }, 33),
  one("project.measure.confirmed", { check: 30 }, 34, "B. Hartmann"), one("project.rewarded", { rule: "gift", amount: 50 }, 35, "B. Hartmann"), one("project.claimed", {}, 36, "Anonymous #4471"),
  // p_two: done, measuring, a result typed and not confirmed.
  raise("c_b", "Quote in a day"), yes("c_b", "p_two"),
  two("project.baseline", { metric: "Quote time", unit: "h", value: 48, better: "down" }, 1), two("project.started", {}, 1), two("project.done", {}, 4),
  two("project.measured", { check: 30, value: 40 }, 34),
  // p_three: a draft with a sponsor, a goal, a member, a step, a baseline; stopped later.
  raise("c_c", "Third idea"), yes("c_c", "p_three", { draft: true }),
  three("project.lead.answered", { take: true }, 1), three("project.invited", { userId: "u_hs", role: "sponsor" }, 1),
  ev("project.invite.answered", "H. Sander", "p_three", { userId: "u_hs", take: true }, 1),
  three("project.goal", { goal: "Faster quotes", doneWhen: "Median under 24 hours", doneBy: 55 }, 2), three("project.member", { userId: "u_ci", name: "C. Ilg" }, 2),
  three("project.step.added", { stepId: "t1", text: "Map the flow" }, 2), three("project.baseline", { none: true, why: "nothing to measure yet" }, 2),
  three("project.started", {}, 3), three("project.stopped", { why: "Priorities changed" }, 6),
];
