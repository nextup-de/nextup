import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { planNotices, type PlanCtx, type PlanPerson } from "@/features/notify/plan";

const seats: SeatRow[] = [
  { id: "s_own1", roleId: "role_owner", label: "Owner One", userId: "u_o1", sort: 0 },
  { id: "s_own2", roleId: "role_owner", label: "Owner Two", userId: "u_o2", sort: 1 },
  { id: "s_dep", roleId: "role_deputy", label: "Deputy", userId: "u_dep", sort: 2 },
  { id: "s_dep2", roleId: "role_deputy", label: "Deputy Two", userId: "u_dep2", sort: 3 },
  { id: "s_raiser", roleId: "role_member", label: "Raiser", userId: "u_raiser", sort: 4 },
  { id: "s_head", roleId: "role_head", label: "Head", userId: "u_head", sort: 5 },
];
const routes = LOCAL_SEED.routes.map((r) =>
  r.id === "r2" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_own1", deputyRoleId: "role_deputy", deputySeatId: "s_dep" } : r,
);
const seed: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats };

const people: PlanPerson[] = [
  { id: "u_o1", email: "o1@x.test", locale: "en", name: "Owner One" },
  { id: "u_o2", email: "o2@x.test", locale: "de", name: "Owner Two" },
  { id: "u_dep", email: "dep@x.test", locale: "en", name: "Deputy" },
  { id: "u_dep2", email: null, locale: "en", name: "No Mail" },
  { id: "u_raiser", email: "raiser@x.test", locale: "en", name: "Raiser" },
  { id: "u_lead", email: "lead@x.test", locale: "en", name: "Lead" },
  { id: "u_head", email: "head@x.test", locale: "en", name: "Head" },
];

let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string | null, payload: EventPayload = {}): CaseEvent =>
  ({ id: "e" + n++, ts: 0, day: 0, type, actor, actorUserId, target, payload });
const raise = (id = "c_a") =>
  ev("case.raised", "Raiser", "u_raiser", id, { kind: "problem", title: "Printer broken", routeId: "r2", assignee: "Owner One", assigneeRoleHolderId: "s_own1" });
const due = (target: string, payload: EventPayload) => ev("clock.due", "system:clock", null, target, payload);
const open = (id = "c_a") => ev("case.decided", "Owner One", "u_o1", id, { answer: "yes", projectId: "p_one", lead: "Lead", leadUserId: "u_lead", title: "P" });

const ON = { stage: "pilot", notifications: true, n8n: true };
function ctx(events: CaseEvent[], over: Partial<PlanCtx> = {}): PlanCtx {
  return { companyId: "co1", state: reduce(seed, { events, day: 1 }), people, prefs: [], company: ON, subscriptions: [], baseUrl: "https://app.test/acme", ...over };
}
// The in-app copy of each notice (INB/D5) is tested in tests/unit/inb/channels.test.ts; here only the outside rows count.
const plan = (events: CaseEvent[], over: Partial<PlanCtx> = {}) => planNotices(events[events.length - 1], ctx(events, over)).filter((d) => d.channel !== "inapp");
const users = (d: { recipientUserId: string | null }[]) => d.map((x) => x.recipientUserId).sort();

describe("NTF planner", () => {
  it("a start reminder goes to the project's lead, with a stable key", () => {
    const f = due("p_one", { kind: "start", dueDay: 5 });
    const d = plan([raise(), open(), f]);
    expect(users(d)).toEqual(["u_lead"]);
    expect(d.map((x) => [x.template, x.recipientUserId, x.key])).toEqual([["reminder.start", "u_lead", `rem:${f.id}:u_lead`]]);
  });
});
