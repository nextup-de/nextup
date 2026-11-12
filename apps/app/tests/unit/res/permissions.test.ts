// RES-B1: who may append the events of "A result that closes properly" (plan RES, D13 to D16, D19 and the 12 Nov review). The
// states are a legacy project from a yes, reduced from events and then given the RES fields by hand, so a later change of the reducer
// (RES-A1) cannot move these cases.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import type { Measure, ReducedProject, Step } from "@/features/projects/types";

const SEATS: SeatRow[] = [
  { id: "s_lead", roleId: "role_member", label: "Lead", userId: "u_lead", sort: 1 },
  { id: "s_desk", roleId: "role_owner", label: "Desk", userId: "u_desk", sort: 2 },
  { id: "s_dep", roleId: "role_deputy", label: "Deputy", userId: "u_dep", sort: 3 },
];
const SEED: ReduceSeed = {
  cases: CASES, ideas: IDEAS, problems: PROBLEMS, promiseDays: PROMISE_DAYS, seats: SEATS,
  routes: ROUTES.map((r) => (r.id === "r1" ? { ...r, ownerRoleId: "role_owner", deputyRoleId: "role_deputy" } : r)),
};

let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "rs" + n++, ts: 0, type, actor, actorUserId, target, payload, day });
const raised = ev("case.raised", "Anonymous #4471", "u_js", "c_r", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" });
const yes = ev("case.decided", "T. Vogel", "u_dec", "c_r", { answer: "yes", projectId: "p_r", lead: "Lead", leadUserId: "u_lead", title: "Changeover cart" });
const baseline = ev("project.baseline", "Lead", "u_lead", "p_r", { metric: "m", unit: "min", value: 42, better: "down" });
const started = ev("project.started", "Lead", "u_lead", "p_r");

const step = (id: string, column: Step["column"], over: Partial<Step> = {}): Step =>
  ({ id, text: "Step " + id, owner: null, ownerUserId: null, dueDay: null, column, why: "", note: "", addedDay: 0, by: "x", byUserId: null, movedDay: 0, startedDay: null, doneDay: null, external: null, ...over }) as Step;
const measure = (over: Partial<Measure> = {}): Measure => ({
  check: 30, value: 30, source: "MES", note: "", day: 31, by: "Typist", byUserId: "u_typ", sourceKind: "typed", sourceInfo: { kind: "typed" }, impact: null,
  confirmed: false, confirmedByUserId: null, confirmedDay: null, verdict: "better", changePct: -28, eventId: "m1",
  sentBack: false, reentered: false, managerOnly: false, questions: [], previous: [], ...over,
}) as Measure;

/** A project in the given stage with `patch` on top: planning (a typed baseline), running (started, day 0) or measuring (done, a typed 30-day result). */
function world(patch: Partial<ReducedProject> = {}, stage: "planning" | "running" | "measuring" = "running", day = 40, seats: SeatRow[] = SEATS): State {
  const events = stage === "planning" ? [raised, yes, baseline] : stage === "running" ? [raised, yes, baseline, started] : [raised, yes, baseline, started, ev("project.done", "Lead", "u_lead", "p_r", {}, 1)];
  const state = reduce(SEED, { events, day });
  const p = state.projects.find((x) => x.id === "p_r");
  if (!p) throw new Error("no project");
  state.seats = seats;
  // The lead typed the baseline (revision b1), nobody confirmed it; a patch may replace all of it.
  if (p.baseline && !p.baseline.none) Object.assign(p.baseline, { byUserId: "u_lead", eventId: "b1", confirmed: null });
  Object.assign(p, { sponsorUserId: "u_sp", deciderUserId: "u_dec", memberUserIds: ["u_mem"], followerUserIds: ["u_fol"] }, patch);
  return state;
}

type Who = "lead" | "member" | "follower" | "sponsor" | "dep" | "desk" | "manager" | "typist" | "stranger";
const WHO: Record<Who, { userId: string; role: Actor["role"] }> = {
  lead: { userId: "u_lead", role: "leader" }, member: { userId: "u_mem", role: "member" }, follower: { userId: "u_fol", role: "member" },
  sponsor: { userId: "u_sp", role: "member" }, dep: { userId: "u_dep", role: "leader" }, desk: { userId: "u_desk", role: "leader" },
  manager: { userId: "u_mgr", role: "manager" }, typist: { userId: "u_typ", role: "member" }, stranger: { userId: "u_x", role: "member" },
};
const ask = (who: Who, type: string, payload: EventPayload, state: State) => {
  const { userId, role } = WHO[who];
  return mayAppend({ role, userId, me: meFor(userId, SEATS), name: who, handle: null }, { type, target: "p_r", payload }, state);
};
const yesFor = (who: Who, type: string, payload: EventPayload, state: State) => ask(who, type, payload, state).ok;
const errorOf = (who: Who, type: string, payload: EventPayload, state: State): string => {
  const v = ask(who, type, payload, state);
  return v.ok ? "" : v.error;
};

describe("RES rights", () => {
  describe("done with open steps", () => {
    const open = world({ steps: [step("s1", "todo"), step("s2", "doing"), step("s3", "done"), step("s4", "todo", { dropped: { why: "old", day: 3, byUserId: "u_lead" } })] });
    const all = [{ stepId: "s1", end: "done" as const }, { stepId: "s2", end: "dropped" as const, why: "No longer needed" }];

    it("every open step finished or dropped with a reason, each once, opens it for the lead (and a manager)", () => {
      expect(yesFor("lead", "project.done", { openSteps: all }, open)).toBe(true);
      expect(yesFor("manager", "project.done", { openSteps: all }, open)).toBe(true);
      for (const who of ["member", "sponsor", "follower", "dep", "stranger"] as const) expect(yesFor(who, "project.done", { openSteps: all }, open), who).toBe(false);
    });

    it("a missing, a duplicated and an unknown step are refused", () => {
      expect(errorOf("lead", "project.done", { openSteps: [all[0]] }, open)).toContain("Finish or drop each open step");
      expect(yesFor("lead", "project.done", {}, open)).toBe(false);
      expect(yesFor("lead", "project.done", { openSteps: [all[0], all[0], all[1]] }, open)).toBe(false);
      expect(yesFor("lead", "project.done", { openSteps: [...all, { stepId: "s9", end: "done" }] }, open)).toBe(false);
      expect(yesFor("lead", "project.done", { openSteps: [all[0], { stepId: "s9", end: "done" }] }, open)).toBe(false);
      // A step already done or dropped is not on the sheet.
      expect(yesFor("lead", "project.done", { openSteps: [...all, { stepId: "s3", end: "done" }] }, open)).toBe(false);
      expect(yesFor("lead", "project.done", { openSteps: [...all, { stepId: "s4", end: "done" }] }, open)).toBe(false);
    });

    it("a step that appeared after the form loaded makes the old payload stale", () => {
      const grown = world({ steps: [...open.projects[0].steps, step("s5", "todo")] });
      expect(errorOf("lead", "project.done", { openSteps: all }, grown)).toContain("Finish or drop each open step");
      expect(yesFor("lead", "project.done", { openSteps: [...all, { stepId: "s5", end: "done" }] }, grown)).toBe(true);
    });

    it("a dropped step needs a reason of 1 to 400 characters, and an end must be done or dropped", () => {
      const drop = (why?: string) => [all[0], { stepId: "s2", end: "dropped" as const, ...(why === undefined ? {} : { why }) }];
      expect(errorOf("lead", "project.done", { openSteps: drop() }, open)).toContain("why a step is dropped");
      expect(yesFor("lead", "project.done", { openSteps: drop("   ") }, open)).toBe(false);
      expect(yesFor("lead", "project.done", { openSteps: drop("x".repeat(401)) }, open)).toBe(false);
      expect(yesFor("lead", "project.done", { openSteps: drop("x".repeat(400)) }, open)).toBe(true);
      expect(yesFor("lead", "project.done", { openSteps: [{ stepId: "s1", end: "open" }, all[1]] } as EventPayload, open)).toBe(false);
    });

    it("a project without open steps may leave the list out, as every old log did; it may not name steps", () => {
      const none = world({ steps: [step("s3", "done")] });
      expect(yesFor("lead", "project.done", {}, none)).toBe(true);
      expect(yesFor("lead", "project.done", { openSteps: [] }, none)).toBe(true);
      expect(yesFor("lead", "project.done", { openSteps: [{ stepId: "s3", end: "done" }] }, none)).toBe(false);
      expect(yesFor("lead", "project.done", {}, world({ steps: [] }))).toBe(true);
    });

    it("still only a running project", () => {
      expect(yesFor("lead", "project.done", { openSteps: all }, world({ steps: open.projects[0].steps }, "planning"))).toBe(false);
    });
  });

  describe("a check entered again after a send-back", () => {
    const check = { check: 30, opensDay: 31, dueDay: 36, measured: false, late: false };
    const sent = (over: Partial<Measure> = {}) => world({ checks: [{ ...check, measured: true }], measures: [measure({ sentBack: true, questions: [{ day: 33, why: "Looks off", byUserId: "u_sp" }], ...over })] }, "measuring");
    const enter = { check: 30, value: 31 };

    it("the lead enters it once, and only the lead", () => {
      expect(yesFor("lead", "project.measured", enter, sent())).toBe(true);
      expect(yesFor("lead", "project.measured", { ...enter, measureEventId: "m1" }, sent())).toBe(true);
      for (const who of ["member", "sponsor", "typist", "dep", "stranger"] as const) expect(yesFor(who, "project.measured", enter, sent()), who).toBe(false);
    });

    it("a second re-entry is refused, and so is a revision that was already replaced", () => {
      const again = sent({ sentBack: false, reentered: true });
      expect(errorOf("lead", "project.measured", enter, again)).toContain("entered again once");
      expect(yesFor("lead", "project.measured", { ...enter, measureEventId: "m0" }, sent())).toBe(false);
    });

    it("a recorded check that was never sent back stays closed", () => {
      const closed = world({ checks: [{ ...check, measured: true }], measures: [measure()] }, "measuring");
      expect(errorOf("lead", "project.measured", enter, closed)).toContain("already");
    });
  });

  describe("sending a result back", () => {
    const check = { check: 30, opensDay: 31, dueDay: 36, measured: true, late: false };
    const typed = (over: Partial<Measure> = {}, patch: Partial<ReducedProject> = {}) => world({ checks: [check], measures: [measure(over)], ...patch }, "measuring");
    const why = { check: 30, why: "The number does not match the line report" };

    it("by whoever may confirm it, the sponsor, the route's deputy or a manager; never the lead or who typed it", () => {
      for (const who of ["sponsor", "dep", "manager"] as const) expect(yesFor(who, "project.measure.questioned", why, typed()), who).toBe(true);
      expect(errorOf("lead", "project.measure.questioned", why, typed())).toContain("who may confirm");
      expect(yesFor("typist", "project.measure.questioned", why, typed())).toBe(false);
      for (const who of ["member", "follower", "desk", "stranger"] as const) expect(yesFor(who, "project.measure.questioned", why, typed()), who).toBe(false);
    });

    it("the distinct-person rule is by user id: a typist who is now the sponsor still may not", () => {
      expect(yesFor("sponsor", "project.measure.questioned", why, typed({ byUserId: "u_sp" }))).toBe(false);
      expect(yesFor("manager", "project.measure.questioned", why, typed({ byUserId: "u_mgr" }))).toBe(false);
    });

    it("needs a typed, unconfirmed result of that check that is not already sent back", () => {
      for (const over of [{ confirmed: true }, { sourceKind: "system" as const }, { sourceKind: "import" as const }, { sentBack: true }]) {
        expect(errorOf("sponsor", "project.measure.questioned", why, typed(over)), JSON.stringify(over)).toContain("no unconfirmed typed result");
      }
      expect(yesFor("sponsor", "project.measure.questioned", { ...why, check: 90 }, typed())).toBe(false);
      expect(yesFor("sponsor", "project.measure.questioned", {}, typed())).toBe(false);
    });

    it("names the revision it saw: a replaced number is not questioned by an old view", () => {
      expect(yesFor("sponsor", "project.measure.questioned", { ...why, measureEventId: "m1" }, typed())).toBe(true);
      expect(yesFor("sponsor", "project.measure.questioned", { ...why, measureEventId: "m0" }, typed())).toBe(false);
    });

    it("needs a reason of 1 to 400 characters", () => {
      expect(errorOf("sponsor", "project.measure.questioned", { check: 30 }, typed())).toContain("what looks wrong");
      expect(yesFor("sponsor", "project.measure.questioned", { check: 30, why: " " }, typed())).toBe(false);
      expect(yesFor("sponsor", "project.measure.questioned", { check: 30, why: "x".repeat(401) }, typed())).toBe(false);
      expect(yesFor("sponsor", "project.measure.questioned", { check: 30, why: "x".repeat(400) }, typed())).toBe(true);
    });

    it("a second time after the re-entry is allowed, a third time and any questioning of a manager-only result are not", () => {
      const q = (k: number) => Array.from({ length: k }, (_, i) => ({ day: 33 + i, why: "Again", byUserId: "u_sp" }));
      expect(yesFor("sponsor", "project.measure.questioned", why, typed({ reentered: true, questions: q(1) }))).toBe(true);
      expect(errorOf("sponsor", "project.measure.questioned", why, typed({ reentered: true, questions: q(2) }))).toContain("questioned twice already");
      expect(errorOf("manager", "project.measure.questioned", why, typed({ reentered: true, managerOnly: true, questions: q(2) }))).toContain("only a manager can confirm");
    });
  });

  describe("confirming a result", () => {
    const check = { check: 30, opensDay: 31, dueDay: 36, measured: true, late: false };
    const typed = (over: Partial<Measure> = {}) => world({ checks: [check], measures: [measure(over)] }, "measuring");

    it("the sponsor may, like the deputy and a manager; the lead and the typist may not", () => {
      for (const who of ["sponsor", "dep", "manager"] as const) expect(yesFor(who, "project.measure.confirmed", { check: 30 }, typed()), who).toBe(true);
      for (const who of ["lead", "typist", "member", "stranger"] as const) expect(yesFor(who, "project.measure.confirmed", { check: 30 }, typed()), who).toBe(false);
    });

    it("a result questioned twice only a manager may confirm; a sent-back result nobody", () => {
      const only = typed({ managerOnly: true, reentered: true });
      expect(yesFor("manager", "project.measure.confirmed", { check: 30 }, only)).toBe(true);
      for (const who of ["sponsor", "dep"] as const) expect(yesFor(who, "project.measure.confirmed", { check: 30 }, only), who).toBe(false);
      expect(yesFor("manager", "project.measure.confirmed", { check: 30 }, typed({ sentBack: true }))).toBe(false);
    });

    it("a confirmation for a replaced revision confirms nothing", () => {
      expect(yesFor("sponsor", "project.measure.confirmed", { check: 30, measureEventId: "m1" }, typed())).toBe(true);
      expect(errorOf("sponsor", "project.measure.confirmed", { check: 30, measureEventId: "m0" }, typed())).toContain("no typed or uploaded measure");
    });
  });

  describe("confirming the baseline", () => {
    const planning = (patch: Partial<ReducedProject> = {}, seats?: SeatRow[]) => world(patch, "planning", 3, seats);
    const confirm = { baselineEventId: "b1" };

    it("the sponsor and the route's deputy may; the lead, the typist, a member and a stranger may not; a manager not while either exists", () => {
      for (const who of ["sponsor", "dep"] as const) expect(yesFor(who, "project.baseline.confirmed", confirm, planning()), who).toBe(true);
      for (const who of ["lead", "member", "follower", "desk", "stranger", "manager"] as const) expect(yesFor(who, "project.baseline.confirmed", confirm, planning()), who).toBe(false);
      expect(errorOf("lead", "project.baseline.confirmed", confirm, planning())).toContain("not the lead or who typed it");
    });

    it("the typist may not, by user id, also when the typist is now the sponsor or holds the deputy role", () => {
      const typedBy = (userId: string) => planning({ baseline: { ...planning().projects[0].baseline!, byUserId: userId } as ReducedProject["baseline"] });
      expect(yesFor("sponsor", "project.baseline.confirmed", confirm, typedBy("u_sp"))).toBe(false);
      expect(yesFor("dep", "project.baseline.confirmed", confirm, typedBy("u_dep"))).toBe(false);
      expect(yesFor("sponsor", "project.baseline.confirmed", confirm, typedBy("u_typ"))).toBe(true);
    });

    it("a manager confirms only when there is no accepted sponsor and the deputy role has nobody on it", () => {
      const noDeputy = SEATS.map((s) => (s.roleId === "role_deputy" ? { ...s, userId: null } : s));
      expect(yesFor("manager", "project.baseline.confirmed", confirm, planning({ sponsorUserId: null }, noDeputy))).toBe(true);
      expect(yesFor("manager", "project.baseline.confirmed", confirm, planning({ sponsorUserId: null }))).toBe(false); // a deputy sits there
      expect(yesFor("manager", "project.baseline.confirmed", confirm, planning({}, noDeputy))).toBe(false); // a sponsor exists
      // A sponsor who leads it counts as none.
      expect(yesFor("manager", "project.baseline.confirmed", confirm, planning({ sponsorUserId: "u_lead" }, noDeputy))).toBe(true);
      expect(yesFor("sponsor", "project.baseline.confirmed", confirm, planning({ sponsorUserId: null }, noDeputy))).toBe(false);
    });

    it("needs a number baseline that is not confirmed, in planning; and the revision the person saw", () => {
      const base = planning().projects[0].baseline!;
      expect(errorOf("sponsor", "project.baseline.confirmed", confirm, planning({ baseline: null }))).toContain("no baseline number waiting");
      expect(yesFor("sponsor", "project.baseline.confirmed", confirm, planning({ baseline: { none: true, why: "n/a", day: 0, by: "x" } }))).toBe(false);
      expect(yesFor("sponsor", "project.baseline.confirmed", confirm, planning({ baseline: { ...base, confirmed: { byUserId: "u_dep", day: 2 } } as ReducedProject["baseline"] }))).toBe(false);
      expect(yesFor("sponsor", "project.baseline.confirmed", confirm, world({}, "running", 3))).toBe(false);
      // The typist replaced the number (revision b2) after the sponsor opened the form (revision b1).
      const replaced = planning({ baseline: { ...base, eventId: "b2" } as ReducedProject["baseline"] });
      expect(yesFor("sponsor", "project.baseline.confirmed", confirm, replaced)).toBe(false);
      expect(yesFor("sponsor", "project.baseline.confirmed", { baselineEventId: "b2" }, replaced)).toBe(true);
      // An event stored before RES names no revision: it meant the one that stood.
      expect(yesFor("sponsor", "project.baseline.confirmed", {}, replaced)).toBe(true);
    });
  });

  describe("starting under a possible reward", () => {
    const planning = (confirmed: boolean) => {
      const s = world({}, "planning", 3);
      const b = s.projects[0].baseline;
      if (b && !b.none) b.confirmed = confirmed ? { byUserId: "u_sp", day: 2 } : null;
      return s;
    };

    it("needs a confirmed baseline number where a reward is possible", () => {
      expect(errorOf("lead", "project.started", {}, planning(false))).toContain("second person must confirm the baseline");
      expect(yesFor("lead", "project.started", {}, planning(true))).toBe(true);
    });

    it("needs nothing where no reward is possible, or for a baseline that is none", () => {
      const none = planning(false);
      none.rules = { ...none.rules, reward: { kind: "none", amount: null, sharePct: null, capEur: null } };
      expect(yesFor("lead", "project.started", {}, none)).toBe(true);
      const unmeasured = planning(false);
      unmeasured.rules = { ...unmeasured.rules, measure: false };
      expect(yesFor("lead", "project.started", {}, unmeasured)).toBe(true);
      const noNumber = world({ baseline: { none: true, why: "Safety, no metric", day: 0, by: "Lead" } }, "planning", 3);
      expect(yesFor("lead", "project.started", {}, noNumber)).toBe(true);
    });

    it("a project already started is never touched", () => {
      expect(yesFor("lead", "project.started", {}, world({}, "running", 3))).toBe(false); // refused as already started, as before
      expect(errorOf("lead", "project.started", {}, world({}, "running", 3))).not.toContain("second person");
    });
  });

  describe("asking the sponsor for help", () => {
    const run = world({ steps: [step("s1", "todo"), step("s2", "done"), step("s3", "todo", { dropped: { why: "x", day: 2, byUserId: null } })] });
    const help = { stepId: "s1", text: "I need a decision on the supplier" };

    it("the lead and a member, on a running project's open step", () => {
      for (const who of ["lead", "member"] as const) expect(yesFor(who, "project.help.asked", help, run), who).toBe(true);
    });

    it("a sponsor or follower who is not a member and a stranger may not", () => {
      for (const who of ["sponsor", "follower", "stranger", "typist"] as const) expect(errorOf(who, "project.help.asked", help, run), who).toContain("lead or a member");
      // A follower who is also a member is a member.
      expect(yesFor("follower", "project.help.asked", help, world({ steps: run.projects[0].steps, memberUserIds: ["u_fol"] }))).toBe(true);
    });

    it("not on a done, dropped or unknown step, and not without a text of 1 to 1000 characters", () => {
      for (const stepId of ["s2", "s3", "s9"]) expect(errorOf("member", "project.help.asked", { ...help, stepId }, run), stepId).toContain("not done or dropped");
      expect(errorOf("member", "project.help.asked", { stepId: "s1" }, run)).toContain("what you need");
      expect(yesFor("member", "project.help.asked", { stepId: "s1", text: "x".repeat(1001) }, run)).toBe(false);
      expect(yesFor("member", "project.help.asked", { stepId: "s1", text: "x".repeat(1000) }, run)).toBe(true);
    });

    it("only on a running project", () => {
      const planning = world({ steps: run.projects[0].steps }, "planning", 3);
      expect(errorOf("lead", "project.help.asked", help, planning)).toContain("running project only");
      expect(yesFor("lead", "project.help.asked", help, world({ steps: run.projects[0].steps }, "measuring"))).toBe(false);
    });
  });

  describe("the weekly update by the sponsor (AGT D15)", () => {
    it("the accepted sponsor may send it under the same rules; no flag in the payload grants a right", () => {
      const text = "On track";
      expect(yesFor("sponsor", "project.update", { text, week: 0 }, world({}, "running", 3))).toBe(true);
      expect(yesFor("sponsor", "project.update", { text: "", week: 0 }, world({}, "running", 3))).toBe(false);
      expect(yesFor("sponsor", "project.update", { text, week: 5 }, world({}, "running", 3))).toBe(false);
      expect(yesFor("stranger", "project.update", { text, week: 0, aiDrafted: true } as EventPayload, world({}, "running", 3))).toBe(false);
      expect(yesFor("follower", "project.update", { text, week: 0 }, world({}, "running", 3))).toBe(false);
    });
  });
});
