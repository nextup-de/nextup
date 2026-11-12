// Decision Q6.15: a typed result gets a desk and a date for its confirmation. Who may confirm, the row on their
// desk, the request when it is typed, the clock's reminder, and the seat above after that.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR, type ClockSpec } from "@/features/clock";
import { dueNow } from "@/features/clock/due";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { loopMails } from "@/features/loop/notice";
import { followsTemplate, NOTIFY_GROUPS } from "@/features/notify/digest";
import { planNotices, type PlanPerson } from "@/features/notify/plan";
import { CONFIRM_DAYS, CONFIRM_ESCALATE_DAYS, confirmerIds, mayConfirm, unconfirmedOf } from "@/features/projects/confirm";
import { mayAppendProject } from "@/features/projects/permissions";
import { projectDeskFor, type IdViewer } from "@/features/projects/views";

const WORKDAYS: ClockSpec = { mode: "workdays", calendar: DEFAULT_CALENDAR };
const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 1 },
  { id: "seat_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 2 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner", deputySeatId: "seat_dep", deputyRoleId: "role_deputy" } : x));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, clock: WORKDAYS };

let n = 0;
const ev = (type: CaseEventType, target: string, payload: EventPayload = {}, day = 0, by: string | null = "u_lb"): CaseEvent =>
  ({ id: "q" + n++, ts: 0, type, actor: by === null ? "system:clock" : by === "u_lb" ? "L. Brandt" : by, actorUserId: by, target, payload, day });
const logAt = (day: number, ...events: CaseEvent[]): EventLog => ({ events, day });

/** The lead typed the 30-day result on this day; it is due for confirmation CONFIRM_DAYS later. */
const TYPED = 31;
const DUE = TYPED + CONFIRM_DAYS;
const UP = DUE + CONFIRM_ESCALATE_DAYS;
const MEASURED = ev("project.measured", "p_one", { check: 30, value: 30 }, TYPED);
const base = [
  ev("case.raised", "c_a", { kind: "problem", title: "Case", routeId: "r1", assignee: "T. Vogel" }),
  ev("case.decided", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "Shorter changeover" }, 0, "u_tv"),
  ev("project.baseline", "p_one", { metric: "m", unit: "min", value: 42, better: "down", source: "x" }),
  ev("project.started", "p_one"), ev("project.done", "p_one", {}, 1), MEASURED,
];
const reminded = ev("clock.due", "p_one", { kind: "confirm", dueDay: DUE, check: 30 }, DUE + 1, null);
const passedUp = ev("clock.due", "p_one", { kind: "confirm", dueDay: UP, check: 30, toRoleHolderId: "seat_head" }, UP + 1, null);
const confirmed = ev("project.measure.confirmed", "p_one", { check: 30 }, DUE, "u_hs");
const at = (day: number, ...more: CaseEvent[]) => reduce(SEED, logAt(day, ...base, ...more));
const confirmDues = (day: number, ...more: CaseEvent[]) => dueNow(at(day, ...more), day, () => "seat_head").filter((d) => d.kind === "confirm");

const viewer = (role: IdViewer["role"], userId: string): IdViewer => ({ role, userId, me: meFor(userId, seats) });
const who = (v: IdViewer) => ({ userId: v.userId, manager: v.role === "manager", me: v.me });

describe("a typed result waits for a second person", () => {
  it("until five working days after it was typed; a confirmed or a stopped one waits for nobody", () => {
    const [u] = unconfirmedOf(at(TYPED).projects[0]);
    expect(u).toMatchObject({ check: 30, dueDay: DUE, upSeatId: null });
    expect(unconfirmedOf(at(DUE, confirmed).projects[0])).toEqual([]);
    expect(unconfirmedOf(at(DUE, ev("project.stopped", "p_one", { why: "No budget" }, DUE)).projects[0])).toEqual([]);
  });

  it("a manager and the route's deputy may confirm; the lead, who typed it and everyone else may not", () => {
    const p = at(TYPED).projects[0];
    const [u] = unconfirmedOf(p);
    const may = (v: IdViewer) => mayConfirm(p, u, who(v), "role_deputy", seats);
    expect(may(viewer("manager", "u_mg"))).toBe(true);
    expect(may(viewer("leader", "u_hs"))).toBe(true);
    expect(may(viewer("leader", "u_tv"))).toBe(false);
    expect(may(viewer("leader", "u_head"))).toBe(false);
    expect(may(viewer("manager", "u_lb"))).toBe(false); // the lead, who also typed the number
    expect(confirmerIds(p, u, "role_deputy", seats, ["u_mg", "u_lb"], "desk")).toEqual(["u_hs", "u_mg"]);
  });
});

describe("the clock chases a result nobody confirmed", () => {
  it("nothing on its last day, one reminder the day after, and never twice", () => {
    expect(confirmDues(DUE)).toEqual([]);
    expect(confirmDues(DUE + 1)).toEqual([{ kind: "confirm", target: "p_one", dueDay: DUE, check: 30, idemKey: `clk:confirm:p_one:${DUE}:30` }]);
    expect(confirmDues(DUE + 1, reminded)).toEqual([]);
    expect(confirmDues(DUE + 1, confirmed)).toEqual([]);
  });

  it("three working days later the seat above the deputy's desk is asked, once", () => {
    expect(confirmDues(UP, reminded)).toEqual([]);
    expect(confirmDues(UP + 1, reminded)).toEqual([{ kind: "confirm", target: "p_one", dueDay: UP, check: 30, toRoleHolderId: "seat_head", idemKey: `clk:confirm:p_one:${UP}:30` }]);
    expect(confirmDues(UP + 1, reminded, passedUp)).toEqual([]);
    // Nobody above: no second fact, so it is asked as soon as someone is.
    expect(dueNow(at(UP + 1, reminded), UP + 1, () => null).filter((d) => d.kind === "confirm")).toEqual([]);
  });

  it("the seat above is looked for over the deputy's role, never on the lead's own desk", () => {
    const asked: [string, readonly string[]][] = [];
    const leadSits: SeatRow[] = [...seats, { id: "seat_lb", roleId: "role_lead", label: "L. Brandt", userId: "u_lb", sort: 3 }];
    const S = reduce({ ...SEED, seats: leadSits }, logAt(UP + 1, ...base, reminded));
    dueNow(S, UP + 1, (roleId, skip) => { asked.push([roleId, skip]); return null; });
    expect(asked).toContainEqual(["role_deputy", ["role_lead"]]);
  });

  it("from then on the holder of that seat may confirm, and it is on their desk", () => {
    const S = at(UP + 1, reminded, passedUp);
    const head = viewer("leader", "u_head");
    const [u] = unconfirmedOf(S.projects[0]);
    expect(u.upSeatId).toBe("seat_head");
    expect(mayConfirm(S.projects[0], u, who(head), "role_deputy", seats)).toBe(true);
    expect(confirmerIds(S.projects[0], u, "role_deputy", seats, ["u_mg"], "above")).toEqual(["u_head"]);
    const actor = { role: "leader" as const, name: "K. Head", handle: null, userId: "u_head", me: head.me };
    expect(mayAppendProject(actor, { type: "project.measure.confirmed", target: "p_one", payload: { check: 30 } }, S).ok).toBe(true);
    expect(mayAppendProject(actor, { type: "project.measure.confirmed", target: "p_one", payload: { check: 30 } }, at(DUE + 1, reminded)).ok).toBe(false);
    expect(projectDeskFor(S.projects, S.day, head, S).map((d) => [d.move, d.why, d.dueDay])).toEqual([["confirm", "confirmUp", DUE]]);
  });
});

describe("the row on the desk", () => {
  it("the deputy and a manager see 'confirm' with its date; the lead and the route's owner do not", () => {
    const S = at(TYPED);
    const rows = (v: IdViewer) => projectDeskFor(S.projects, S.day, v, S).filter((d) => d.move === "confirm").map((d) => [d.project.id, d.why, d.dueDay]);
    expect(rows(viewer("leader", "u_hs"))).toEqual([["p_one", "confirm", DUE]]);
    expect(rows(viewer("manager", "u_mg"))).toEqual([["p_one", "confirm", DUE]]);
    expect(rows(viewer("leader", "u_lb"))).toEqual([]);
    expect(rows(viewer("leader", "u_tv"))).toEqual([]);
    // Without the routes and seats (the demo) there is no such row.
    expect(projectDeskFor(S.projects, S.day, viewer("leader", "u_hs")).filter((d) => d.move === "confirm")).toEqual([]);
    expect(projectDeskFor(at(DUE, confirmed).projects, DUE, viewer("leader", "u_hs"), at(DUE, confirmed))).toEqual([]);
  });
});

describe("who is told", () => {
  const people: PlanPerson[] = [
    { id: "u_lb", email: "lb@x.test", locale: "en", name: "L. Brandt" },
    { id: "u_tv", email: "tv@x.test", locale: "en", name: "T. Vogel" },
    { id: "u_hs", email: "hs@x.test", locale: "en", name: "H. Sander" },
    { id: "u_head", email: "head@x.test", locale: "de", name: "K. Head" },
    { id: "u_mg", email: "mg@x.test", locale: "en", name: "M. Manager", manager: true },
  ];
  const ctx = (state: ReturnType<typeof at>) => ({
    companyId: "co1", state, people, prefs: [], company: { stage: "pilot", notifications: true, n8n: false }, subscriptions: [], baseUrl: "https://app.test/acme",
  });

  it("when the result is typed, who may confirm is asked to; the lead who typed it is not", () => {
    const named = people.map((p) => ({ id: p.id, name: p.name ?? "", email: p.email ?? "", manager: p.manager }));
    const out = loopMails({ ev: MEASURED, state: at(TYPED), people: named, baseUrl: "https://app.test/acme" });
    expect(out.map((m) => [m.to, m.subject])).toEqual([
      ["hs@x.test", "P-1 result to confirm: Shorter changeover"],
      ["mg@x.test", "P-1 result to confirm: Shorter changeover"],
    ]);
    expect(out[0].text).toContain("L. Brandt typed in the result of the 30-day check.");
    expect(out[0].text).toContain(`within ${CONFIRM_DAYS} working days`);
    expect(out[0].text).toContain("https://app.test/acme/projects/p_one");
  });

  it("the clock's reminder goes to the same people, the second one to the seat above only", () => {
    // The in-app copies (INB/D5) are covered in tests/unit/inb/channels.test.ts.
    const first = planNotices(reminded, ctx(at(DUE + 1, reminded))).filter((d) => d.channel !== "inapp");
    expect(first.map((d) => [d.recipientUserId, d.template, d.key, d.status])).toEqual([
      ["u_hs", "reminder.confirm", `rem:${reminded.id}:u_hs`, "pending"],
      ["u_mg", "reminder.confirm", `rem:${reminded.id}:u_mg`, "pending"],
    ]);
    expect(first[0].subject).toBe("Result to confirm: Shorter changeover");
    expect(first[0].text).toContain("still waits for a second person");
    const second = planNotices(passedUp, ctx(at(UP + 1, reminded, passedUp))).filter((d) => d.channel !== "inapp");
    expect(second.map((d) => [d.recipientUserId, d.template, d.locale])).toEqual([["u_head", "reminder.confirm", "de"]]);
    expect(second[0].text).toContain("Niemand hat das Ergebnis der Messung nach 30 Tagen");
    // Confirmed in the meantime: the reminder reaches nobody.
    expect(planNotices(reminded, ctx(at(DUE + 1, reminded, confirmed)))).toEqual([]);
  });

  it("the reminder is one of the reminders a person can switch, and follows an earlier choice for the measure reminder", () => {
    expect(NOTIFY_GROUPS.reminders).toContain("reminder.confirm");
    expect(followsTemplate("reminder.confirm")).toBe("reminder.measure");
  });
});
