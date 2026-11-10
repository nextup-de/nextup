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
    expect(users(d)).toEqual(["u_dep", "u_dep2", "u_o1", "u_o2"]);
    expect(d.map((x) => x.key).sort()).toEqual([`rem:${f.id}:u_dep`, `rem:${f.id}:u_dep2`, `rem:${f.id}:u_o1`, `rem:${f.id}:u_o2`]);
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
    expect(d.length).toBe(4);
    // Switched off wins over "no mail address": nothing would have left anyway.
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

  it("an escalation goes to the seat above, the desk that had the case and the raiser, each with their own text", () => {
    const f = due("c_a", { kind: "escalation", dueDay: 3, toRoleHolderId: "s_head" });
    const d = plan([raise(), f], { dateOfDay: () => "2026-11-04" });
    expect(d.every((x) => x.template === "reminder.escalation" && x.status === "pending")).toBe(true);
    expect(users(d)).toEqual(["u_head", "u_o1", "u_o2", "u_raiser"]);
    expect(d.map((x) => x.key).sort()).toEqual([`rem:${f.id}:u_head`, `rem:${f.id}:u_o1`, `rem:${f.id}:u_o2`, `rem:${f.id}:u_raiser`]);
    const of = (id: string) => d.find((x) => x.recipientUserId === id)!;
    expect(of("u_head").subject).toBe("Escalated to you: Printer broken");
    expect(of("u_head").text).toContain("should have been answered by 4 Nov 2026");
    expect(of("u_o1").text).toContain("It has been handed to Head:");
    expect(of("u_o2").subject).toBe("Eskaliert: Printer broken");
    expect(of("u_o2").text).toContain("4. Nov. 2026");
    expect(of("u_raiser").subject).toBe("Still no answer: Printer broken");
    expect(of("u_raiser").text).toContain("It is now with Head, one level up:");
    expect(of("u_raiser").link).toBe("https://app.test/acme/cases/c_a");
    // Nobody but the raiser reads who raised it.
    for (const id of ["u_head", "u_o1", "u_o2"]) expect(of(id).subject + of(id).text).not.toContain("Raiser");
  });

  it("an escalation with nobody above still tells the desk and the raiser, and the case stays", () => {
    const f = due("c_a", { kind: "escalation", dueDay: 3, toRoleHolderId: null });
    const d = plan([raise(), f]);
    expect(users(d)).toEqual(["u_o1", "u_o2", "u_raiser"]);
    const of = (id: string) => d.find((x) => x.recipientUserId === id)!;
    expect(of("u_o1").text).toContain("it stays with you");
    expect(of("u_raiser").text).toContain("It is with Owner One, who has been reminded:");
    expect(of("u_raiser").text).toContain("day 3");
  });

  it("a raiser who is also on the desk gets the desk's text once, and reminders follow the company switch", () => {
    const own = ev("case.raised", "Owner One", "u_o1", "c_a", { title: "T", routeId: "r2", assignee: "Owner One", assigneeRoleHolderId: "s_own1" });
    const f = due("c_a", { kind: "escalation", dueDay: 3, toRoleHolderId: "s_head" });
    const d = plan([own, f]);
    expect(users(d)).toEqual(["u_head", "u_o1", "u_o2"]);
    expect(d.find((x) => x.recipientUserId === "u_o1")!.subject).toBe("Escalated: T");
    const off = plan([raise(), f], { company: { ...ON, notifications: false } });
    expect(off.length).toBe(4);
    expect(off.every((x) => x.status === "skipped" && x.lastError === "switched off")).toBe(true);
  });

  it("a user without an email gets a failed mail row the admin sees, never a pending one", () => {
    const f = due("c_a", { kind: "deadline", dueDay: 3, toRoleHolderId: "s_dep" });
    const d = plan([raise(), f]).filter((x) => x.recipientUserId === "u_dep2");
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ channel: "mail", address: null, status: "failed", lastError: "no mail address for No Mail", key: `rem:${f.id}:u_dep2` });
    // In a sandbox it is skipped like every other row.
    expect(plan([raise(), f], { company: { ...ON, stage: "sandbox" } }).find((x) => x.recipientUserId === "u_dep2")).toMatchObject({ status: "skipped", lastError: "sandbox" });
  });

  it("a route owner without an email: the raise's pairing key goes to the first holder who can be reached", () => {
    const r = raise();
    const noMail = people.map((p) => (p.id === "u_o1" ? { ...p, email: null } : p));
    const d = plan([r], { people: noMail });
    expect(d.map((x) => [x.recipientUserId, x.key, x.status])).toEqual([
      ["u_o1", `notify:${r.id}:u_o1`, "failed"],
      ["u_o2", `notify:${r.id}`, "pending"],
    ]);
  });

  it("a question goes to the raiser, its answer to every holder of the desk, a pass to the new desk and the raiser", () => {
    const loop = (events: CaseEvent[]) => plan(events).filter((x) => x.template.startsWith("loop.")).map((x) => [x.template, x.recipientUserId]);
    const asked = ev("case.asked", "Owner One", "u_o1", "c_a", { text: "Which printer?" });
    expect(loop([raise(), asked])).toEqual([["loop.case.asked", "u_raiser"]]);
    const answered = ev("case.answered", "Raiser", "u_raiser", "c_a", { text: "The one in hall 2" });
    expect(loop([raise(), asked, answered])).toEqual([["loop.case.answered", "u_o1"], ["loop.case.answered", "u_o2"]]);
    // The deputy without an address gets no loop mail; the one with an address and the raiser do.
    const passed = ev("case.handed", "Owner One", "u_o1", "c_a", { to: "Deputy", toRoleHolderId: "s_dep", why: "Their machine" });
    expect(loop([raise(), passed])).toEqual([["loop.case.handed", "u_dep"], ["loop.case.handed", "u_raiser"]]);
    // Off a desk nobody sits at, the clock's hand-over has no reminder: the new desk and the raiser get a loop row.
    const vacant = ev("case.handed", "system:clock", null, "c_a", { to: "Deputy", toRoleHolderId: "s_dep", why: "vacant" });
    expect(loop([raise(), vacant])).toEqual([["loop.case.handed", "u_dep"], ["loop.case.handed", "u_raiser"]]);
    // The clock's hand-over is told by its reminder, not twice.
    const late = ev("case.handed", "system:clock", null, "c_a", { to: "Deputy", toRoleHolderId: "s_dep", why: "deadline" });
    expect(loop([raise(), late])).toEqual([]);
  });

  it("an opt-out made before the new notices existed still covers them, until the person chooses again", () => {
    const asked = ev("case.asked", "Owner One", "u_o1", "c_a", { text: "Which printer?" });
    const status = (prefs: PlanCtx["prefs"]) => plan([raise(), asked], { prefs }).filter((x) => x.template === "loop.case.asked").map((x) => [x.status, x.lastError]);
    expect(status([{ userId: "u_raiser", template: "loop.case.decided", on: false }])).toEqual([["skipped", "opted out"]]);
    expect(status([{ userId: "u_raiser", template: "loop.case.decided", on: false }, { userId: "u_raiser", template: "loop.case.asked", on: true }])).toEqual([["pending", null]]);
    expect(status([{ userId: "u_raiser", template: "reminder.checkin", on: false }])).toEqual([["pending", null]]);
  });

  it("the reminder for an unanswered question goes to the raiser; the return tells the desk and the raiser", () => {
    const asked = ev("case.asked", "Owner One", "u_o1", "c_a", { text: "Which printer?" });
    const f = due("c_a", { kind: "question", dueDay: 3 });
    const d = plan([raise(), asked, f]);
    expect(d.map((x) => [x.template, x.recipientUserId, x.key])).toEqual([["reminder.question", "u_raiser", `rem:${f.id}:u_raiser`]]);
    expect(d[0].subject).toBe("Still waiting for your answer: Printer broken");
    expect(d[0].text).toContain("in 2 working days");
    const back = ev("case.unanswered", "system:clock", null, "c_a", {});
    const rows = plan([raise(), asked, back]).filter((x) => x.template === "loop.case.unanswered");
    expect(rows.map((x) => [x.recipientUserId, x.subject])).toEqual([
      ["u_o1", "No answer from the raiser: Printer broken"], ["u_o2", "Keine Antwort auf Ihre Frage: Printer broken"],
      ["u_raiser", "Your idea goes on without your answer: Printer broken"],
    ]);
  });

  it("the reminder for a raise without a route goes to its desk and names the promised answer date", () => {
    const r = ev("case.raised", "Raiser", "u_raiser", "c_n", { kind: "idea", title: "No desk", routeId: null, assignee: "Head", assigneeRoleHolderId: "s_head" });
    const f = due("c_n", { kind: "triage", dueDay: 1 });
    const d = plan([r, f]);
    expect(d.map((x) => [x.template, x.recipientUserId])).toEqual([["reminder.triage", "u_head"]]);
    expect(d[0].subject).toBe("No desk owns this yet: No desk");
    expect(d[0].text).toContain("Pass it to the desk it belongs to");
  });

  it("a no gives the raiser a loop row", () => {
    const no = ev("case.decided", "Owner One", "u_o1", "c_a", { answer: "no", reason: "not now" });
    const d = plan([raise(), no]).filter((x) => x.template.startsWith("loop."));
    expect(d.map((x) => [x.template, x.recipientUserId, x.status])).toEqual([["loop.case.decided", "u_raiser", "pending"]]);
    expect(d[0].subject).toBe("Your idea was declined: Printer broken");
  });

  it("a loop event gives its recipients a loop row keyed by event and user, never the actor", () => {
    const events = [raise(), open()];
    const loop = plan(events).filter((x) => x.template.startsWith("loop."));
    expect(loop.map((x) => [x.template, x.recipientUserId])).toEqual([["loop.case.decided", "u_raiser"], ["loop.case.decided", "u_lead"]]);
    expect(loop[0].key).toBe(`loop:${events[1].id}:u_raiser`);
  });
});
