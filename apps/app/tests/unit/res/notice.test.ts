// RES-E1 (B2): who hears of a confirmation, a claim, a questioning, a help ask and a confirmed baseline, and who the reward reminder
// reaches (D17, D18). The loop notices are asked directly and through the composed planner; states are the reducer's with the RES fields set by hand.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { loopNotices, type NoticePerson } from "@/features/loop/notice";
import { planNotices, type PlanCtx, type PlanPerson, type PlanPref } from "@/features/notify/plan";
import type { Measure, ReducedProject } from "@/features/projects/types";

const seats: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "Owner", userId: "u_own", sort: 0 },
  { id: "s_dep", roleId: "role_deputy", label: "Deputy", userId: "u_dep", sort: 1 },
  { id: "s_dep2", roleId: "role_deputy", label: "Deputy Two", userId: "u_dep2", sort: 2 },
];
const routes = LOCAL_SEED.routes.map((r) => (r.id === "r1" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_own", deputyRoleId: "role_deputy", deputySeatId: "s_dep" } : r));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats };

const NAMES: Record<string, string> = {
  u_lead: "Lena Lead", u_au: "Ria Raiser", u_sp: "Sven Sponsor", u_m1: "Max Manager", u_m2: "Mia Manager", u_own: "Owen Owner", u_dep: "Dana Deputy", u_dep2: "Dora Deputy", u_member: "Mo Member",
};
const MANAGERS = ["u_m1", "u_m2"];
const people: PlanPerson[] = Object.entries(NAMES).map(([id, name]) => ({ id, name, locale: "en", email: `${id}@x.test`, manager: MANAGERS.includes(id) }));
const noticePeople: NoticePerson[] = people.map((p) => ({ id: p.id, name: p.name ?? "", email: p.email, manager: p.manager }));

let n = 0;
const ev = (type: CaseEventType, by: string | null, payload: EventPayload = {}, day = 3): CaseEvent =>
  ({ id: "x" + n++, ts: 0, type, actor: by === null ? "system:clock" : NAMES[by] ?? by, actorUserId: by, target: "p_one", payload, day });
const raised = { ...ev("case.raised", "u_au", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "Owen Owner" }), target: "c_a" };
const yes = { ...ev("case.decided", "u_own", { answer: "yes", projectId: "p_one", lead: "Lena Lead", leadUserId: "u_lead", title: "Shorter changeover" }), target: "c_a" };

function stateOf(events: CaseEvent[], setup: (p: ReducedProject) => void = () => {}): State {
  const state = reduce(SEED, { events: [raised, yes, ...events], day: 3 });
  const p = state.projects[0];
  p.leadUserId = "u_lead";
  p.memberUserIds = [];
  p.authorUserIds = ["u_au"];
  setup(p);
  return state;
}
const told = (last: CaseEvent, state: State): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const x of loopNotices({ ev: last, state, people: noticePeople, baseUrl: "https://app.test" })) out[x.userId] = x.subject;
  return out;
};
const textOf = (last: CaseEvent, state: State, who: string): string => loopNotices({ ev: last, state, people: noticePeople, baseUrl: "https://app.test" }).find((x) => x.userId === who)!.text;
const who = (m: Record<string, string>) => Object.keys(m).sort();

const measure = (patch: Partial<Measure> = {}): Measure => ({
  check: 30, value: 8, source: "typed", note: "", day: 5, by: "Lena Lead", byUserId: "u_lead", sourceKind: "typed",
  sourceInfo: { kind: "typed" } as Measure["sourceInfo"], impact: null, confirmed: true, confirmedByUserId: "u_sp", confirmedDay: 6, verdict: "better", changePct: -20,
  sentBack: false, reentered: false, managerOnly: false, questions: [], previous: [], ...patch,
});

describe("RES notices", () => {
  it("a confirmation tells the lead and the raiser, and not the one who confirmed", () => {
    const confirm = ev("project.measure.confirmed", "u_sp", { check: 30 });
    const state = stateOf([confirm], (p) => { p.measures = [measure()]; });
    const out = told(confirm, state);
    expect(who(out)).toEqual(["u_au", "u_lead"]);
    expect(out.u_lead).toMatch(/result confirmed/);
    expect(textOf(confirm, state, "u_lead")).toContain("confirmed the result of P-" + state.projects[0].number + ", which was measured after 30 days: better.");
    // A lead who confirmed cannot be told of their own event; the raiser still is.
    const byLead = ev("project.measure.confirmed", "u_lead", { check: 30 });
    expect(who(told(byLead, stateOf([byLead], (p) => { p.measures = [measure()]; })))).toEqual(["u_au"]);
  });

  it("a claim tells every active manager, never names the claimer, and not the claimer", () => {
    const claim = ev("project.claimed", "u_au", {});
    const state = stateOf([claim]);
    const out = told(claim, state);
    expect(who(out)).toEqual(MANAGERS);
    expect(out.u_m1).toBe("Reward claimed on P-" + state.projects[0].number + ": Shorter changeover");
    const text = textOf(claim, state, "u_m1");
    expect(text).toContain(`The reward on P-${state.projects[0].number} was claimed.`);
    expect(text).not.toContain("Ria");
    expect(text).not.toContain("Raiser");
    // A manager who claims (as the raiser) is not told of their own claim.
    const own = ev("project.claimed", "u_m1", {});
    expect(who(told(own, stateOf([own])))).toEqual(["u_m2"]);
  });

  it("a first questioning tells the lead with the why; a second tells the managers too", () => {
    const first = ev("project.measure.questioned", "u_sp", { check: 30, why: "The stopwatch was not reset" });
    const s1 = stateOf([first], (p) => { p.measures = [measure({ confirmed: false, sentBack: true, questions: [{ day: 3, why: "The stopwatch was not reset", byUserId: "u_sp" }] })]; });
    expect(who(told(first, s1))).toEqual(["u_lead"]);
    expect(textOf(first, s1, "u_lead")).toContain("was sent back: enter it again.");
    expect(textOf(first, s1, "u_lead")).toContain("Why: The stopwatch was not reset");
    const second = ev("project.measure.questioned", "u_sp", { check: 30, why: "Still looks wrong" });
    const s2 = stateOf([second], (p) => { p.measures = [measure({ confirmed: false, sentBack: true, managerOnly: true })]; });
    expect(who(told(second, s2))).toEqual(["u_lead", ...MANAGERS].sort());
    expect(textOf(second, s2, "u_m1")).toContain("only a manager can confirm it now");
    // A manager who sent it back is not told of it.
    const byManager = ev("project.measure.questioned", "u_m1", { check: 30, why: "No" });
    expect(who(told(byManager, stateOf([byManager], (p) => { p.measures = [measure({ managerOnly: true })]; })))).toEqual(["u_lead", "u_m2"]);
  });

  it("a help ask tells the sponsor, else the users of the asked role's seats, never the one who asked", () => {
    const ask = ev("project.help.asked", "u_lead", { stepId: "s1", text: "We need the budget signed off." });
    const step = { id: "s1", text: "Order the cart", owner: null, dueDay: null, column: "doing", why: "", note: "", addedDay: 1, by: "x", movedDay: 1, startedDay: 1, doneDay: null, external: null } as ReducedProject["steps"][number];
    const toSponsor = stateOf([ask], (p) => { p.steps = [step]; p.helpAsks = [{ id: ask.id, stepId: "s1", text: "We need the budget signed off.", day: 3, byUserId: "u_lead", toUserId: "u_sp", toRoleId: null, answeredDay: null }]; });
    const out = told(ask, toSponsor);
    expect(who(out)).toEqual(["u_sp"]);
    expect(textOf(ask, toSponsor, "u_sp")).toContain("Lena Lead asks for help on \"Order the cart\"");
    expect(textOf(ask, toSponsor, "u_sp")).toContain("We need the budget signed off.");
    const toDesk = stateOf([ask], (p) => { p.steps = [step]; p.helpAsks = [{ id: ask.id, stepId: "s1", text: "x", day: 3, byUserId: "u_lead", toUserId: null, toRoleId: "role_deputy", answeredDay: null }]; });
    expect(who(told(ask, toDesk))).toEqual(["u_dep", "u_dep2"]);
    // The asker holding the asked role is not told of their own ask.
    const own = ev("project.help.asked", "u_dep", { stepId: "s1", text: "x" });
    const ownState = stateOf([own], (p) => { p.steps = [step]; p.helpAsks = [{ id: own.id, stepId: "s1", text: "x", day: 3, byUserId: "u_dep", toUserId: null, toRoleId: "role_deputy", answeredDay: null }]; });
    expect(who(told(own, ownState))).toEqual(["u_dep2"]);
  });

  it("a confirmed baseline tells the lead, not the one who confirmed it", () => {
    const ok = ev("project.baseline.confirmed", "u_sp", {});
    const out = told(ok, stateOf([ok]));
    expect(who(out)).toEqual(["u_lead"]);
    expect(textOf(ok, stateOf([ok]), "u_lead")).toContain("you can start the project");
  });
});

// ── the reward reminder through the composed planner ────────────────────────────────────────────────────────────
const ON = { stage: "pilot", notifications: true, n8n: true };
const episode = ev("project.measure.confirmed", "u_sp", { check: 30 }, 20);
const rewardState = (patch: Partial<ReducedProject> = {}) => stateOf([ev("project.measured", "u_lead", { check: 30, value: 8 }, 18), episode], (p) => { Object.assign(p, { status: "measured", rewardDue: true, rewardDueDay: 20, ...patch }); });
const reminder = (payload: EventPayload) => ev("clock.due", null, { kind: "reward", dueDay: 30, ...payload }, 30);
const rows = (e: CaseEvent, state: State, over: Partial<PlanCtx> = {}) =>
  planNotices(e, { companyId: "co1", state, people, prefs: [], company: ON, subscriptions: [], baseUrl: "https://app.test/acme", ...over }).filter((d) => d.channel !== "inapp");
const ids = (d: { recipientUserId: string | null }[]) => d.map((x) => x.recipientUserId).sort();

describe("RES reminders", () => {
  it("the reward reminder goes to every manager, with the date it fell due", () => {
    const d = rows(reminder({ originEventId: episode.id }), rewardState());
    expect(ids(d)).toEqual(MANAGERS);
    expect(d[0].template).toBe("reminder.reward");
    expect(d[0].subject).toBe("A reward is still due: Shorter changeover");
    expect(d[0].text).toContain("has been due since");
  });

  it("an episode that ended mails nobody: paid, sent back, replaced or stopped", () => {
    const f = reminder({ originEventId: episode.id });
    expect(rows(f, rewardState({ rewardDue: false, rewardDueDay: null }))).toEqual([]);
    expect(rows(f, rewardState({ status: "stopped" }))).toEqual([]);
    expect(rows(f, rewardState({ status: "recognised", rewardDue: false }))).toEqual([]);
    // A replacement result is another episode: the old fact is not mailed, a fact of the new one is.
    const again = ev("project.measure.confirmed", "u_sp", { check: 30 }, 40);
    const replaced = stateOf([ev("project.measured", "u_lead", { check: 30, value: 8 }, 18), episode, again], (p) => { Object.assign(p, { status: "measured", rewardDue: true, rewardDueDay: 40 }); });
    expect(rows(f, replaced)).toEqual([]);
    expect(ids(rows(reminder({ dueDay: 50, originEventId: again.id }), replaced))).toEqual(MANAGERS);
  });

  it("the reward reminder may be switched off, like the confirm reminder it follows", () => {
    const off = (template: string): PlanPref[] => MANAGERS.map((userId) => ({ userId, template, on: false }));
    const f = reminder({ originEventId: episode.id });
    expect(rows(f, rewardState(), { prefs: off("reminder.reward") }).map((d) => d.status)).toEqual(["skipped", "skipped"]);
    expect(rows(f, rewardState(), { prefs: off("reminder.confirm") }).map((d) => d.status)).toEqual(["skipped", "skipped"]);
    expect(rows(f, rewardState()).map((d) => d.status)).toEqual(["pending", "pending"]);
  });

  it("the loop notices of RES go through the planner to the same people", () => {
    const claim = ev("project.claimed", "u_au", {});
    expect(ids(rows(claim, stateOf([claim])))).toEqual(MANAGERS);
    const confirm = ev("project.measure.confirmed", "u_sp", { check: 30 });
    expect(ids(rows(confirm, stateOf([confirm], (p) => { p.measures = [measure()]; })))).toEqual(["u_au", "u_lead"]);
  });
});
