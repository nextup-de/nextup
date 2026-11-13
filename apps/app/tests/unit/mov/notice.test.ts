// Plan MOV, MOV-E1: who hears of a project's hand-over, done, stop, close, pause and weekly update, and who a reminder of
// the clock's MOV facts goes to (D23). The states are the reducer's, with the MOV fields set by hand where MOV-A1's reducer
// does not write them yet (sponsor, followers, a vacated lead).
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { loopNotices, type NoticePerson } from "@/features/loop/notice";
import { planNotices, type PlanCtx, type PlanPerson, type PlanPref } from "@/features/notify/plan";
import type { ReducedProject, Step } from "@/features/projects/types";

const seats: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "Owner", userId: "u_own", sort: 0 },
  { id: "s_own2", roleId: "role_owner", label: "Owner Two", userId: "u_own2", sort: 1 },
  { id: "s_dep", roleId: "role_deputy", label: "Deputy", userId: "u_dep", sort: 2 },
];
const routes = LOCAL_SEED.routes.map((r) => (r.id === "r1" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_own", deputyRoleId: "role_deputy", deputySeatId: "s_dep" } : r));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats };

const NAMES: Record<string, string> = {
  u_lead: "Lena Lead", u_old: "Olga Old", u_new: "Nora New", u_m1: "Max Member", u_m2: "Mia Member", u_sp: "Sven Sponsor", u_f1: "Fay Follower",
  u_au: "Ria Raiser", u_own: "Owen Owner", u_own2: "Olive Owner", u_dep: "Dana Deputy", u_nomail: "Nina NoMail",
};
const people: PlanPerson[] = Object.entries(NAMES).map(([id, name]) => ({ id, name, locale: id === "u_m2" ? "de" : "en", email: id === "u_nomail" ? null : `${id}@x.test` }));
const noticePeople: NoticePerson[] = people.map((p) => ({ id: p.id, name: p.name ?? "", email: p.email }));

let n = 0;
const ev = (type: CaseEventType, by: string | null, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "m" + n++, ts: 0, type, actor: by === null ? "system:clock" : NAMES[by] ?? by, actorUserId: by, target, payload, day });
const P = (type: CaseEventType, by: string | null, payload: EventPayload = {}, day = 0) => ev(type, by, "p_one", payload, day);

const raised = ev("case.raised", "u_au", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "Owen Owner" });
const yes = ev("case.decided", "u_own", "c_a", { answer: "yes", projectId: "p_one", lead: "Lena Lead", leadUserId: "u_lead", title: "Shorter changeover" });

const step = (id: string, text: string, over: Partial<Step> = {}): Step => ({
  id, text, owner: null, dueDay: null, column: "todo", why: "", note: "", addedDay: 0, by: "x", movedDay: 0, startedDay: null, doneDay: null, external: null, ...over,
});

/** The state after `events`, with the project's MOV fields set by `setup`. */
function stateOf(events: CaseEvent[], setup: (p: ReducedProject) => void = () => {}, day = 3): State {
  const state = reduce(SEED, { events: [raised, yes, ...events], day });
  setup(state.projects[0]);
  return state;
}
/** A project with a lead, two members, a sponsor, a follower and the raiser; `draft` says whether it came from a draft (D26). */
const team = (draft: boolean) => (p: ReducedProject) => {
  p.leadUserId = "u_lead";
  p.memberUserIds = ["u_m1", "u_m2"];
  p.sponsorUserId = draft ? "u_sp" : null;
  p.followerUserIds = draft ? ["u_f1"] : [];
  p.authorUserIds = ["u_au"];
  p.draft = draft;
};

/** user id -> subject of the notice each person gets for the event. */
function told(last: CaseEvent, state: State): Record<string, string> {
  const out: Record<string, string> = {};
  for (const x of loopNotices({ ev: last, state, people: noticePeople, baseUrl: "https://app.test" })) out[x.userId] = x.subject;
  return out;
}
const who = (m: Record<string, string>) => Object.keys(m).sort();

describe("MOV notices", () => {
  it("a hand-over tells the new lead as before, and the team, the sponsor and the raiser who leads now, with the why, never the mover", () => {
    const handed = P("project.handed", "u_lead", { to: "Nora New", toUserId: "u_new", why: "Moving to the night shift" });
    // After the event: the old lead is on the team, the new lead leads.
    const state = stateOf([], (p) => { team(true)(p); p.leadUserId = "u_new"; p.memberUserIds = ["u_m1", "u_m2", "u_lead"]; });
    const out = told(handed, state);
    expect(who(out)).toEqual(["u_au", "u_m1", "u_m2", "u_new", "u_sp"]);
    expect(out.u_new).toBe("You lead P-1: Shorter changeover");
    expect(out.u_m1).toBe("Nora New now leads P-1: Shorter changeover");
    const mail = loopNotices({ ev: handed, state, people: noticePeople, baseUrl: "https://app.test" }, (p) => (p.id === "u_m2" ? "de" : "en"));
    expect(mail.find((x) => x.userId === "u_sp")!.text).toContain("Why: Moving to the night shift");
    expect(mail.find((x) => x.userId === "u_m2")!.subject).toBe("Nora New leitet jetzt P-1: Shorter changeover");
  });

  it("a new lead named while there was none tells the same people", () => {
    const changed = P("project.lead.changed", "u_sp", { to: "Nora New", toUserId: "u_new", why: "Agreed with the desk" });
    const state = stateOf([], (p) => { team(true)(p); p.leadUserId = "u_new"; });
    const out = told(changed, state);
    expect(who(out)).toEqual(["u_au", "u_m1", "u_m2", "u_new"]); // the sponsor named them: not told again
    expect(out.u_new).toBe("You lead P-1: Shorter changeover");
    expect(out.u_au).toBe("Nora New now leads P-1: Shorter changeover");
  });

  it("done tells the team and the sponsor, besides the raiser's step mail, one mail each and not the one who marked it", () => {
    const done = P("project.done", "u_lead", {}, 2);
    const state = stateOf([P("project.baseline", "u_lead", { metric: "Changeover", unit: "min", value: 42, better: "down", source: "stopwatch" }), P("project.started", "u_lead"), done], team(true));
    const out = told(done, state);
    expect(who(out)).toEqual(["u_au", "u_m1", "u_m2", "u_sp"]);
    expect(out.u_au).toBe("P-1 done: Shorter changeover");
    expect(out.u_sp).toBe("P-1 is done: Shorter changeover");
    expect(out.u_m1).toBe("P-1 is done: Shorter changeover");
  });

  it("a stop tells the sponsor too, with its why", () => {
    const stop = P("project.stopped", "u_lead", { why: "Supplier cancelled" });
    const state = stateOf([stop], team(true));
    const out = told(stop, state);
    expect(who(out)).toEqual(["u_au", "u_m1", "u_m2", "u_sp"]);
    const mail = loopNotices({ ev: stop, state, people: noticePeople, baseUrl: "https://app.test" });
    expect(mail.find((x) => x.userId === "u_sp")!.text).toContain("Supplier cancelled");
  });

  it("the close summary also goes to the sponsor and the followers", () => {
    const events = [P("project.baseline", "u_lead", { none: true, why: "Nothing to count" }), P("project.started", "u_lead")];
    const done = P("project.done", "u_lead", {}, 2);
    // Done with nothing to measure: the project closes with that event (the reducer's finish, set here by hand).
    const state = stateOf([...events, done], (p) => { team(true)(p); p.status = "measured"; p.closed = true; p.checks = []; p.measures = []; });
    const out = told(done, state);
    expect(who(out)).toEqual(["u_au", "u_f1", "u_m1", "u_m2", "u_sp"]);
    // One summary each, in place of the step mail.
    expect(new Set(Object.values(out))).toEqual(new Set(["P-1 closed: Shorter changeover"]));
  });

  it("a new done-by date tells the sponsor and the lead, never the mover, with the new date and the why", () => {
    const moved = P("project.doneby.moved", "u_sp", { doneBy: 9, why: "Parts arrive late" });
    const state = stateOf([], team(true), 3);
    const out = told(moved, state);
    expect(who(out)).toEqual(["u_lead"]);
    const byLead = P("project.doneby.moved", "u_lead", { doneBy: 9, why: "Parts arrive late" });
    expect(who(told(byLead, state))).toEqual(["u_sp"]);
    const text = loopNotices({ ev: byLead, state, people: noticePeople, baseUrl: "https://app.test" })[0].text;
    expect(text).toContain("to in 6 days");
    expect(text).toContain("Why: Parts arrive late");
  });

  it("a pause and a resume tell the sponsor, the pause with why and until when", () => {
    const state = stateOf([], team(true), 3);
    const paused = P("project.paused", "u_lead", { why: "Shutdown week", untilDay: 8 });
    expect(who(told(paused, state))).toEqual(["u_sp"]);
    const text = loopNotices({ ev: paused, state, people: noticePeople, baseUrl: "https://app.test" })[0].text;
    expect(text).toContain("Shutdown week");
    expect(text).toContain("It picks up again in 5 days.");
    const resumed = P("project.resumed", "u_lead");
    const out = told(resumed, state);
    expect(who(out)).toEqual(["u_sp"]);
    expect(out.u_sp).toBe("P-1 is running again: Shorter changeover");
  });

  it("an update reaches a draft's sponsor, followers and raiser, and a legacy project's team and raiser, never the writer", () => {
    const update = P("project.update", "u_lead", { text: "Cart ordered.\nFloor marked.", week: 3 });
    const draft = loopNotices({ ev: update, state: stateOf([], team(true)), people: noticePeople, baseUrl: "https://app.test" });
    expect(draft.map((x) => x.userId).sort()).toEqual(["u_au", "u_f1", "u_sp"]);
    expect(draft[0].text).toContain("  Cart ordered.\n  Floor marked.");
    expect(draft[0].subject).toBe("Weekly update for P-1: Shorter changeover");
    const legacy = loopNotices({ ev: update, state: stateOf([], team(false)), people: noticePeople, baseUrl: "https://app.test" });
    expect(legacy.map((x) => x.userId).sort()).toEqual(["u_au", "u_m1", "u_m2"]);
    // A manager writing it is not the lead: the lead is not told, the writer never is.
    const byManager = P("project.update", "u_sp", { text: "Ok", week: 3 });
    expect(loopNotices({ ev: byManager, state: stateOf([], team(true)), people: noticePeople, baseUrl: "https://app.test" }).map((x) => x.userId).sort()).toEqual(["u_au", "u_f1"]);
    expect(who(told(P("project.update", "u_lead", { text: "  ", week: 3 }), stateOf([], team(true))))).toEqual([]);
  });

  it("a vacated lead tells the sponsor and the team; without a sponsor the users of the desk's seat and the team", () => {
    const vacated = P("project.lead.vacated", null, { userId: "u_lead" });
    const gone = (draft: boolean) => (p: ReducedProject) => { team(draft)(p); p.leadUserId = null; p.memberUserIds = ["u_m1", "u_lead"]; };
    const withSponsor = told(vacated, stateOf([], gone(true)));
    expect(who(withSponsor)).toEqual(["u_m1", "u_sp"]);
    expect(withSponsor.u_sp).toBe("P-1 has no lead: Shorter changeover");
    const text = loopNotices({ ev: vacated, state: stateOf([], gone(true)), people: noticePeople, baseUrl: "https://app.test" })[0].text;
    expect(text).toContain("the sponsor names a new one");
    const noSponsor = loopNotices({ ev: vacated, state: stateOf([], gone(false)), people: noticePeople, baseUrl: "https://app.test" });
    expect(noSponsor.map((x) => x.userId).sort()).toEqual(["u_m1", "u_own", "u_own2"]);
    expect(noSponsor.find((x) => x.userId === "u_own")!.text).toContain("the desk that said yes names a new one");
  });

  it("a member who left with their steps unassigned tells the lead once, and a plain removal tells nobody", () => {
    const left = P("project.member", "u_lead", { name: "Max Member", userId: "u_m1", on: false, unassign: true });
    const state = stateOf([], team(true));
    const out = loopNotices({ ev: left, state, people: noticePeople, baseUrl: "https://app.test" }, () => "en");
    // The lead removed them: the lead is the actor and is not told; the directory's leaver path writes it as the system.
    expect(out).toEqual([]);
    const byDirectory = ev("project.member", null, "p_one", { name: "Max Member", userId: "u_m1", on: false, unassign: true });
    const told1 = loopNotices({ ev: byDirectory, state, people: noticePeople, baseUrl: "https://app.test" });
    expect(told1.map((x) => x.userId)).toEqual(["u_lead"]);
    expect(told1[0].subject).toBe("Max Member left P-1: Shorter changeover");
    expect(told1[0].text).toContain("Max Member left; their open steps have no owner now.");
    expect(who(told(ev("project.member", null, "p_one", { name: "Max Member", userId: "u_m1", on: false }), state))).toEqual([]);
  });

  it("how we work tells nobody", () => {
    expect(who(told(P("project.howwework", "u_lead", { checkInWeekday: 3 }), stateOf([], team(true))))).toEqual([]);
  });
});

// ── the reminders ────────────────────────────────────────────────────────────────────────────────────────────
const ON = { stage: "pilot", notifications: true, n8n: true };
function ctx(state: State, over: Partial<PlanCtx> = {}): PlanCtx {
  return { companyId: "co1", state, people, prefs: [], company: ON, subscriptions: [], baseUrl: "https://app.test/acme", ...over };
}
const due = (payload: EventPayload) => ev("clock.due", null, "p_one", payload);
const rows = (e: CaseEvent, state: State, over: Partial<PlanCtx> = {}) => planNotices(e, ctx(state, over)).filter((d) => d.channel !== "inapp");
const ids = (d: { recipientUserId: string | null }[]) => d.map((x) => x.recipientUserId).sort();

describe("MOV reminders", () => {
  const withSteps = (p: ReducedProject) => {
    team(true)(p);
    p.doneBy = 20;
    p.steps = [step("s1", "Order the cart", { owner: "Max Member", ownerUserId: "u_m1", dueDay: 2 }), step("s2", "Mark the floor", { column: "blocked", why: "Paint is wet", movedDay: 1 }), step("s3", "Old", { column: "done", dueDay: 1 })];
  };
  const state = () => stateOf([], withSteps);

  it("a late reminder goes to the fact's user and the users of its seat, and names the step", () => {
    const toOwner = rows(due({ kind: "late", dueDay: 3, stepId: "s1", userId: "u_m1" }), state());
    expect(ids(toOwner)).toEqual(["u_m1"]);
    expect(toOwner[0].template).toBe("reminder.late");
    expect(toOwner[0].subject).toBe("Overdue: Order the cart");
    expect(toOwner[0].text).toContain("Order the cart on Shorter changeover was due day 2.");
    const up = rows(due({ kind: "late", dueDay: 5, check: 2, stepId: "s1", userId: "u_lead", toRoleHolderId: "s_own" }), state());
    expect(ids(up)).toEqual(["u_lead", "u_own", "u_own2"]);
    // A step that is done by now is not chased.
    expect(rows(due({ kind: "late", dueDay: 3, stepId: "s3", userId: "u_lead" }), state())).toEqual([]);
  });

  it("a blocked reminder goes to the lead and carries the step's reason", () => {
    const d = rows(due({ kind: "blocked", dueDay: 4, stepId: "s2", userId: "u_lead" }), state());
    expect(ids(d)).toEqual(["u_lead"]);
    expect(d[0].subject).toBe("Still blocked: Mark the floor");
    expect(d[0].text).toContain("Mark the floor on Shorter changeover has been blocked since day 1: Paint is wet");
    // Out of Blocked meanwhile: nothing to say.
    expect(rows(due({ kind: "blocked", dueDay: 4, stepId: "s1", userId: "u_lead" }), state())).toEqual([]);
  });

  it("quiet, update and vacant go to the fact's user and the users of its seat, in the person's language", () => {
    const quiet = rows(due({ kind: "quiet", dueDay: 6, userId: "u_lead" }), state());
    expect(ids(quiet)).toEqual(["u_lead"]);
    expect(quiet[0].text).toContain("has not moved for a week: move a step, send the update or pause it.");
    expect(ids(rows(due({ kind: "update", dueDay: 6, userId: "u_lead" }), state()))).toEqual(["u_lead"]);
    expect(rows(due({ kind: "update", dueDay: 6, userId: "u_lead" }), state())[0].text).toContain("The weekly update for Shorter changeover is due");
    const vacant = rows(due({ kind: "vacant", dueDay: 8, toRoleHolderId: "s_dep" }), state());
    expect(ids(vacant)).toEqual(["u_dep"]);
    expect(vacant[0].text).toContain("still has no lead: name one.");
    const de = rows(due({ kind: "stalled", dueDay: 9, userId: "u_m2" }), state());
    expect(de[0].text).toContain("ist ins Stocken geraten");
  });

  it("stalled goes to the sponsor or the seat; late start and measure facts also reach the seat they were escalated to", () => {
    const stalled = rows(due({ kind: "stalled", dueDay: 9, userId: "u_sp" }), state());
    expect(ids(stalled)).toEqual(["u_sp"]);
    expect(stalled[0].text).toContain("has stalled: agree a new done-by date, hand the lead on or stop it.");
    expect(ids(rows(due({ kind: "stalled", dueDay: 9, toRoleHolderId: "s_own" }), state()))).toEqual(["u_own", "u_own2"]);
    expect(ids(rows(due({ kind: "start", dueDay: 5, toRoleHolderId: "s_own" }), state()))).toEqual(["u_lead", "u_own", "u_own2"]);
    expect(ids(rows(due({ kind: "measure", dueDay: 5, check: 30, toRoleHolderId: "s_dep" }), state()))).toEqual(["u_dep", "u_lead"]);
    expect(ids(rows(due({ kind: "start", dueDay: 5 }), state()))).toEqual(["u_lead"]);
  });

  it("an opt-out of reminder.stalled and reminder.vacant is ignored, one of reminder.quiet and reminder.late is honoured", () => {
    const off = (template: string): PlanPref[] => ["u_lead", "u_own"].map((userId) => ({ userId, template, on: false }));
    const status = (kind: NonNullable<EventPayload["kind"]>, template: string, payload: EventPayload) => rows(due({ kind, dueDay: 6, ...payload }), state(), { prefs: off(template) }).map((d) => d.status);
    expect(status("stalled", "reminder.stalled", { userId: "u_lead" })).toEqual(["pending"]);
    expect(status("vacant", "reminder.vacant", { userId: "u_lead" })).toEqual(["pending"]);
    expect(status("quiet", "reminder.quiet", { userId: "u_lead" })).toEqual(["skipped"]);
    expect(status("late", "reminder.late", { userId: "u_lead", stepId: "s1" })).toEqual(["skipped"]);
    // The older switch covers the new kinds until the person chooses again.
    expect(status("quiet", "reminder.start", { userId: "u_lead" })).toEqual(["skipped"]);
    expect(status("stalled", "reminder.start", { userId: "u_lead" })).toEqual(["pending"]);
  });
});
