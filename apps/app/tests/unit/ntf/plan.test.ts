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
const plan = (events: CaseEvent[], over: Partial<PlanCtx> = {}) => planNotices(events[events.length - 1], ctx(events, over));
const users = (d: { recipientUserId: string | null }[]) => d.map((x) => x.recipientUserId).sort();

describe("NTF planner", () => {
  it("a raise gives one raised row per holder, the first with the pairing key; the raiser gets none", () => {
    const r = raise();
    const d = plan([r]);
    expect(d.map((x) => x.template)).toEqual(["raised", "raised"]);
    expect(users(d)).toEqual(["u_o1", "u_o2"]);
    expect(d.map((x) => x.key)).toEqual([`notify:${r.id}`, `notify:${r.id}:u_o2`]);
    expect(d.every((x) => x.status === "pending" && x.lastError === null && x.channel === "mail")).toBe(true);
    expect(d[1].locale).toBe("de");
  });

  it("the raiser never gets a mail about their own raise, even holding the seat", () => {
    const r = ev("case.raised", "Owner One", "u_o1", "c_a", { title: "T", routeId: "r2", assignee: "x", assigneeRoleHolderId: "s_own1" });
    const d = plan([r]);
    expect(users(d)).toEqual(["u_o2"]);
    expect(d[0].key).toBe(`notify:${r.id}`);
  });

  it("a clock.due deadline goes to the deputy seat's users and the current seat's users, with a stable key", () => {
    const f = due("c_a", { kind: "deadline", dueDay: 3, toRoleHolderId: "s_dep" });
    const events = [raise(), f];
    const d = plan(events);
    expect(d.every((x) => x.template === "reminder.deadline")).toBe(true);
    expect(users(d)).toEqual(["u_dep", "u_o1", "u_o2"]);
    expect(d.map((x) => x.key).sort()).toEqual([`rem:${f.id}:u_dep`, `rem:${f.id}:u_o1`, `rem:${f.id}:u_o2`]);
    expect(plan(events).map((x) => x.key)).toEqual(d.map((x) => x.key));
  });

  it("checkin goes to the case seat's users; start and measure to the project lead", () => {
    const base = [raise(), open()];
    const ci = due("c_a", { kind: "checkin", dueDay: 4 });
    expect(users(plan([...base, ci]))).toEqual(["u_o1", "u_o2"]);
    for (const [kind, extra] of [["start", {}], ["measure", { check: 30 }]] as const) {
      const f = due("p_one", { kind, dueDay: 5, ...extra });
      const d = plan([...base, f]);
      expect(d.map((x) => [x.template, x.recipientUserId, x.key])).toEqual([[`reminder.${kind}`, "u_lead", `rem:${f.id}:u_lead`]]);
    }
  });

  it("stage sandbox writes every draft as skipped 'sandbox'", () => {
    const events = [raise(), due("c_a", { kind: "deadline", dueDay: 3, toRoleHolderId: "s_dep" })];
    const subscriptions = [{ id: "sub1", events: ["case.raised"], on: true }];
    const sandbox = { ...ON, stage: "sandbox" };
    const all = [...planNotices(events[0], ctx(events, { company: sandbox, subscriptions })), ...planNotices(events[1], ctx(events, { company: sandbox }))];
    expect(all.length).toBeGreaterThan(3);
    expect(all.every((x) => x.status === "skipped" && x.lastError === "sandbox")).toBe(true);
  });

  it("with notifications false the reminders are skipped and the raise is not", () => {
    const company = { ...ON, notifications: false };
    const r = raise();
    expect(plan([r], { company }).every((x) => x.status === "pending")).toBe(true);
    const d = plan([r, due("c_a", { kind: "deadline", dueDay: 3, toRoleHolderId: "s_dep" })], { company });
    expect(d.length).toBe(3);
    expect(d.every((x) => x.status === "skipped" && x.lastError === "switched off")).toBe(true);
  });

  it("a webhook row per subscription that lists the type, skipped when n8n is off", () => {
    const r = raise();
    const subscriptions = [
      { id: "s1", events: ["case.raised"], on: true },
      { id: "s2", events: ["case.handed"], on: true },
      { id: "s3", events: ["case.raised"], on: false },
    ];
    const hooks = (c: PlanCtx) => planNotices(r, c).filter((x) => x.channel === "webhook");
    const d = hooks(ctx([r], { subscriptions }));
    expect(d.map((x) => [x.key, x.address, x.status])).toEqual([[`wh:${r.id}:s1`, "s1", "pending"]]);
    expect(d[0].data).toMatchObject({ event: { type: "case.raised" } });
    expect(hooks(ctx([r], { subscriptions, company: { ...ON, n8n: false } }))[0]).toMatchObject({ status: "skipped", lastError: "switched off" });
  });

  it("an opt-out for * or a template skips only that user; digest is off until turned on", () => {
    const r = raise();
    const d = plan([r], { prefs: [{ userId: "u_o2", template: "*", on: false }] });
    expect(d.map((x) => [x.recipientUserId, x.status, x.lastError])).toEqual([["u_o1", "pending", null], ["u_o2", "skipped", "opted out"]]);
    const f = due("c_a", { kind: "checkin", dueDay: 4 });
    const d2 = plan([r, f], { prefs: [{ userId: "u_o1", template: "reminder.checkin", on: false }] });
    expect(d2.map((x) => [x.recipientUserId, x.status])).toEqual([["u_o1", "skipped"], ["u_o2", "pending"]]);
    // A digest preference touches nothing else.
    expect(plan([r], { prefs: [{ userId: "u_o1", template: "digest", on: false }] }).map((x) => x.status)).toEqual(["pending", "pending"]);
  });

  it("a user without an email gets no mail row", () => {
    const f = due("c_a", { kind: "deadline", dueDay: 3, toRoleHolderId: "s_dep" });
    expect(users(plan([raise(), f]))).not.toContain("u_dep2");
  });

  it("a loop event gives its recipients a loop row keyed by event and user, never the actor", () => {
    const events = [raise(), open()];
    const loop = plan(events).filter((x) => x.template.startsWith("loop."));
    expect(loop.map((x) => [x.template, x.recipientUserId])).toEqual([["loop.case.decided", "u_raiser"], ["loop.case.decided", "u_lead"]]);
    expect(loop[0].key).toBe(`loop:${events[1].id}:u_raiser`);
  });
});
