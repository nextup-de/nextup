// AGT-A1: what the daily run looks at (D12, D16, D17): projects, rides, wanted kinds, expiries, kept suggestions, and the request. Workdays mode.
import { describe, expect, it } from "vitest";
import { AgentRequest } from "@/features/agent/contract";
import { agentRequestOf } from "@/features/agent/request";
import { agentStateOf } from "@/features/agent/reduce";
import { expiries, keepSuggestions, projectsToRun, ridesFor, sinceDayOf, wantedKinds, type Ride } from "@/features/agent/select";
import type { AgentReply } from "@/features/agent/contract";
import type { AgentProject, AgentState, AgentSuggestion, AgentSuggestionKind } from "@/features/agent/types";
import { DEMO_CLOCK } from "@/features/clock";
import type { CaseEvent } from "@/features/cases/events";
import { checkInDayOf } from "@/features/projects/rhythm";
import { ev, logOf, project, SEATS, startedLog, stateOf, WORKDAYS } from "./fixture";

const ON = ev("agent.switched", "L. Brandt", "p_one", { on: true }, 11);
const fact = (kind: string, day: number, payload: Record<string, unknown> = {}) => ev("clock.due", "system:clock", "p_one", { kind: kind as never, dueDay: day - 1, userId: "u_lb", ...payload }, day);
const world = (events: CaseEvent[], today: number) => {
  const all = [...startedLog(), ...events];
  const s = stateOf(all, today);
  const log = logOf(all, today);
  return { s, log, p: project(s), agent: agentStateOf(log, s) };
};
const ap = (patch: Partial<AgentProject> = {}, suggestions: AgentSuggestion[] = []): AgentProject => ({ projectId: "p_one", on: true, preset: false, suggestions, lastRun: null, ...patch });
const sg = (patch: Partial<AgentSuggestion>): AgentSuggestion => ({
  id: "g" + Math.random().toString(36).slice(2, 8), projectId: "p_one", kind: "unblock", day: 20, textId: "t", ridesOn: null, stepId: null, week: null, refs: [], status: "open",
  answeredDay: null, answeredByUserId: null, edited: false, why: null, subjectKey: null, inputMark: null, followUpId: null, ...patch,
});

describe("AGT select", () => {
  describe("projectsToRun", () => {
    it("picks a running project with the agent on that changed since the previous run, and not before the first run's day", () => {
      const w = world([ON, ev("project.commented", "L. Brandt", "p_one", { text: "hi" }, 21)], 25);
      expect(projectsToRun(w.s, { ...w.agent, lastRunDay: 20 }, w.log, 25, WORKDAYS).map((p) => p.id)).toEqual(["p_one"]);
      expect(projectsToRun(w.s, { ...w.agent, lastRunDay: 21 }, w.log, 25, WORKDAYS)).toEqual([]);
      expect(projectsToRun(w.s, { ...w.agent, lastRunDay: null }, w.log, 25, WORKDAYS)).toHaveLength(1); // never run: every project with the agent on
    });

    it("a clock fact or a step that fell due is a change too", () => {
      const f = world([ON, fact("quiet", 22)], 25);
      expect(projectsToRun(f.s, { ...f.agent, lastRunDay: 20 }, f.log, 25, WORKDAYS)).toHaveLength(1);
      const due = world([ON, ev("project.step.added", "L. Brandt", "p_one", { stepId: "s1", text: "Order", dueDay: 21 }, 12)], 25);
      expect(projectsToRun(due.s, { ...due.agent, lastRunDay: 20 }, due.log, 25, WORKDAYS)).toHaveLength(1); // fell due on 21, after the run on 20
      expect(projectsToRun(due.s, { ...due.agent, lastRunDay: 22 }, due.log, 25, WORKDAYS)).toEqual([]); // it fell due before that run saw it
    });

    it("a project's own last finished turn is the day it is compared with, so a turn that failed is tried again", () => {
      const w = world([ON, ev("project.commented", "L. Brandt", "p_one", { text: "hi" }, 18)], 25);
      expect(projectsToRun(w.s, { ...w.agent, lastRunDay: 20 }, w.log, 25, WORKDAYS)).toEqual([]);
      const failed: AgentState = { ...w.agent, lastRunDay: 20, projects: { p_one: { ...w.agent.projects.p_one, lastRun: { runDay: 15, inputMark: "m", outcome: "none" } } } };
      expect(projectsToRun(w.s, failed, w.log, 25, WORKDAYS)).toHaveLength(1);
    });

    it("skips a project with the agent off, a paused one, one not running, and everything in demo mode", () => {
      const changed = [ev("project.commented", "L. Brandt", "p_one", { text: "hi" }, 21)];
      const off = world(changed, 25);
      expect(projectsToRun(off.s, { ...off.agent, lastRunDay: 20 }, off.log, 25, WORKDAYS)).toEqual([]);
      const paused = world([ON, ev("project.paused", "L. Brandt", "p_one", { why: "holiday", untilDay: 27 }, 21)], 25);
      expect(paused.p.pausedUntil).toBe(27);
      expect(projectsToRun(paused.s, { ...paused.agent, lastRunDay: 20 }, paused.log, 25, WORKDAYS)).toEqual([]);
      expect(projectsToRun(paused.s, { ...paused.agent, lastRunDay: 20 }, paused.log, 28, WORKDAYS)).toHaveLength(1); // the pause ran out
      const done = world([ON, ev("project.done", "L. Brandt", "p_one", {}, 21)], 25);
      expect(projectsToRun(done.s, { ...done.agent, lastRunDay: 20 }, done.log, 25, WORKDAYS)).toEqual([]);
      const stopped = world([ON, ev("project.stopped", "L. Brandt", "p_one", { why: "x" }, 21)], 25);
      expect(projectsToRun(stopped.s, { ...stopped.agent, lastRunDay: 20 }, stopped.log, 25, WORKDAYS)).toEqual([]);
      const on = world([ON, ...changed], 25);
      expect(projectsToRun(on.s, { ...on.agent, lastRunDay: 20 }, on.log, 25, DEMO_CLOCK)).toEqual([]);
    });
  });

  describe("ridesFor", () => {
    it("the clock facts of quiet, stalled, late and blocked written after the day, in log order, and no other", () => {
      const all = [
        fact("quiet", 18), fact("late", 22, { stepId: "s1" }), fact("start", 22), fact("update", 23), fact("blocked", 24, { stepId: "s2" }), fact("stalled", 25),
        ev("clock.due", "system:clock", "p_other", { kind: "quiet", dueDay: 24 }, 24),
      ];
      const rides = ridesFor("p_one", logOf([...startedLog(), ...all]), 20);
      expect(rides.map((r) => [r.kind, r.stepId, r.day])).toEqual([["late", "s1", 22], ["blocked", "s2", 24], ["stalled", null, 25]]);
      expect(rides.map((r) => r.id)).toEqual([all[1].id, all[4].id, all[5].id]);
      expect(rides[0].index).toBeLessThan(rides[1].index);
      expect(ridesFor("p_one", logOf([...startedLog(), ...all]), 24).map((r) => r.kind)).toEqual(["stalled"]);
    });

    it("before the first run the day looked back to is the working day before today", () => {
      expect(sinceDayOf({ lastRunDay: null }, 30)).toBe(29);
      expect(sinceDayOf({ lastRunDay: 25 }, 30)).toBe(25);
    });
  });

  describe("wantedKinds", () => {
    const rideOf = (w: ReturnType<typeof world>, since = 0) => ridesFor("p_one", w.log, since);
    const steps = [ev("project.step.added", "L. Brandt", "p_one", { stepId: "s1", text: "Order the cart" }, 11), ev("project.step.added", "L. Brandt", "p_one", { stepId: "s2", text: "Train" }, 11)];

    it("an Unblock rides on a new quiet, stalled, late or blocked fact, and only on one", () => {
      const none = world([ON, ...steps, fact("start", 22), fact("update", 22)], 25);
      expect(wantedKinds(none.p, none.agent.projects.p_one, rideOf(none), 25, WORKDAYS, none.log)).not.toContain("unblock");
      for (const kind of ["quiet", "stalled", "late", "blocked"]) {
        const w = world([ON, ...steps, fact(kind, 22, kind === "late" || kind === "blocked" ? { stepId: "s1" } : {})], 25);
        expect(wantedKinds(w.p, w.agent.projects.p_one, rideOf(w), 25, WORKDAYS, w.log), kind).toContain("unblock");
      }
      // a fact for a step that is done rides on nothing
      const done = world([ON, ...steps, ev("project.step.moved", "L. Brandt", "p_one", { stepId: "s1", to: "done" }, 20), fact("late", 22, { stepId: "s1" })], 25);
      expect(wantedKinds(done.p, done.agent.projects.p_one, rideOf(done), 25, WORKDAYS, done.log)).not.toContain("unblock");
    });

    it("no Unblock while one is open for the step, nor for 10 working days after one was dismissed; another step is not affected", () => {
      const w = world([ON, ...steps, fact("late", 22, { stepId: "s1" })], 25);
      const rides = rideOf(w);
      const kinds = (suggestions: AgentSuggestion[], today = 25) => wantedKinds(w.p, ap({}, suggestions), rides, today, WORKDAYS, w.log);
      expect(kinds([sg({ stepId: "s1", status: "open" })])).not.toContain("unblock");
      expect(kinds([sg({ stepId: "s2", status: "open" })])).toContain("unblock");
      expect(kinds([sg({ stepId: "s1", status: "dismissed", answeredDay: 16 })], 25)).not.toContain("unblock"); // 9 days ago
      expect(kinds([sg({ stepId: "s1", status: "dismissed", answeredDay: 15 })], 25)).toContain("unblock"); // 10 days ago
      expect(kinds([sg({ stepId: "s1", status: "expired", answeredDay: 24 })], 25)).toContain("unblock"); // an expiry is not a refusal
    });

    it("an accepted nudge is the step's reminder: no new Unblock until the clock writes a newer fact for the step", () => {
      const first = fact("blocked", 22, { stepId: "s1" });
      const w = world([ON, ...steps, first], 25);
      const accepted = sg({ stepId: "s1", status: "accepted", answeredDay: 23, ridesOn: first.id });
      expect(wantedKinds(w.p, ap({}, [accepted]), ridesFor("p_one", w.log, 0), 25, WORKDAYS, w.log)).not.toContain("unblock");
      // a newer fact in the log: the escalation of that step
      const newer = fact("late", 24, { stepId: "s1" });
      const w2 = world([ON, ...steps, first, newer], 25);
      expect(wantedKinds(w2.p, ap({}, [accepted]), ridesFor("p_one", w2.log, 0), 25, WORKDAYS, w2.log)).toContain("unblock");
      // the order of the log decides, not the day: a fact with the same day written after the nudge's is newer
      const sameDay = fact("late", 22, { stepId: "s1" });
      const w3 = world([ON, ...steps, first, sameDay], 25);
      expect(wantedKinds(w3.p, ap({}, [accepted]), ridesFor("p_one", w3.log, 0), 25, WORKDAYS, w3.log)).toContain("unblock");
    });

    it("a Report is wanted from the week's check-in day while that week has no update and no Report for it", () => {
      const w = world([ON], 30);
      const c = checkInDayOf(w.p, 30, WORKDAYS)!;
      expect(c).not.toBeNull();
      const kinds = (agentP: AgentProject, today: number, p = w.p) => wantedKinds(p, agentP, [], today, WORKDAYS, w.log);
      expect(kinds(ap(), c)).toContain("report");
      expect(kinds(ap(), c + 1)).toContain("report");
      if (c > 1) expect(wantedKinds(w.p, ap(), [], c - 1, WORKDAYS, w.log)).not.toContain("report"); // before the check-in day
      expect(kinds(ap({}, [sg({ kind: "report", week: c, status: "dismissed", answeredDay: c })]), c + 1)).not.toContain("report");
      expect(kinds(ap({}, [sg({ kind: "report", week: c, status: "open" })]), c)).not.toContain("report");
      expect(kinds(ap({}, [sg({ kind: "report", week: c - 5, status: "open" })]), c)).toContain("report"); // last week's Report is not this week's
      const sent = { ...w.p, latestUpdate: { text: "t", week: c, day: c, byUserId: "u_lb" } };
      expect(kinds(ap(), c, sent)).not.toContain("report");
    });

    it("a Plan is wanted when none is open and none was dismissed in the last 10 working days", () => {
      const w = world([ON], 25);
      const kinds = (suggestions: AgentSuggestion[]) => wantedKinds(w.p, ap({}, suggestions), [], 25, WORKDAYS, w.log);
      expect(kinds([])).toContain("plan");
      expect(kinds([sg({ kind: "plan", status: "open" })])).not.toContain("plan");
      expect(kinds([sg({ kind: "plan", status: "dismissed", answeredDay: 16 })])).not.toContain("plan");
      expect(kinds([sg({ kind: "plan", status: "dismissed", answeredDay: 15 })])).toContain("plan");
      expect(kinds([sg({ kind: "unblock", status: "open" })])).toContain("plan"); // another kind
    });
  });

  it("expiries are the open suggestions made 5 or more working days ago", () => {
    const agent: AgentState = {
      projects: { p_one: ap({}, [sg({ id: "old", day: 20 }), sg({ id: "new", day: 21 }), sg({ id: "done", day: 10, status: "accepted", answeredDay: 12 }), sg({ id: "gone", day: 10, status: "expired", answeredDay: 15 })]) },
      plans: {}, lastRunDay: null,
    };
    expect(expiries(agent, 25).map((s) => s.id)).toEqual(["old"]);
    expect(expiries(agent, 26).map((s) => s.id)).toEqual(["old", "new"]);
    expect(expiries(agent, 24)).toEqual([]);
  });

  describe("keepSuggestions", () => {
    const w = world([ev("project.step.added", "L. Brandt", "p_one", { stepId: "s1", text: "Order the cart" }, 11), ev("project.step.moved", "L. Brandt", "p_one", { stepId: "s2", to: "done" }, 11)], 25);
    const rides: Ride[] = [{ id: "f1", kind: "blocked", stepId: "s1", dueDay: 22, day: 22, index: 5 }, { id: "f2", kind: "quiet", stepId: null, dueDay: null, day: 23, index: 6 }];
    const s = (patch: Partial<AgentReply["suggestions"][number]>): AgentReply["suggestions"][number] =>
      ({ kind: "unblock", step_id: "s1", fact_id: "f1", title: "t", why: "w", draft: "Could you look at it?", step: null, ...patch });
    const keep = (suggestions: AgentReply["suggestions"], wanted: AgentSuggestionKind[] = ["unblock", "report", "plan"]) => keepSuggestions({ suggestions }, wanted, w.p, rides);

    it("keeps at most one per kind, in the model's order", () => {
      const out = keep([s({}), s({ title: "second" }), s({ kind: "report", step_id: null, fact_id: null }), s({ kind: "plan", step_id: null, fact_id: null, step: { title: "Add a step", role: "lead", due_in_days: 3 } })]);
      expect(out.map((x) => [x.kind, x.title])).toEqual([["unblock", "t"], ["report", "t"], ["plan", "t"]]);
    });

    it("an Unblock needs an open step of the project and a ride id of the request; the ride's own step when it has one", () => {
      expect(keep([s({})])).toHaveLength(1);
      expect(keep([s({ step_id: "s2" })])).toEqual([]); // done
      expect(keep([s({ step_id: "nope" })])).toEqual([]);
      expect(keep([s({ step_id: null })])).toEqual([]);
      expect(keep([s({ fact_id: "nope" })])).toEqual([]);
      expect(keep([s({ fact_id: null })])).toEqual([]);
      expect(keep([s({ fact_id: "f2" })])).toHaveLength(1); // a quiet fact names no step: the model's open step
      expect(keep([s({ step_id: "s2", fact_id: "f2" })])).toEqual([]);
      expect(keep([s({ draft: "  " })])).toEqual([]);
    });

    it("a Report needs its draft, a Plan the step it proposes, and a kind that was not wanted is dropped", () => {
      expect(keep([s({ kind: "report", draft: "" })])).toEqual([]);
      expect(keep([s({ kind: "report" })])).toHaveLength(1);
      expect(keep([s({ kind: "plan", step: null })])).toEqual([]);
      expect(keep([s({ kind: "plan", step: { title: "  ", role: "", due_in_days: 2 } })])).toEqual([]);
      expect(keep([s({})], ["report", "plan"])).toEqual([]);
    });
  });

  describe("the request", () => {
    const people = ["T. Vogel", "L. Brandt", "H. Sander", "C. Ilg", "J. Schmidt"];
    const w = world([
      ON, ev("project.step.added", "L. Brandt", "p_one", { stepId: "s1", text: "Order the cart", ownerUserId: "u_ci", owner: "C. Ilg", dueDay: 20 }, 11),
      ev("project.step.added", "L. Brandt", "p_one", { stepId: "s2", text: "Train the shift", owner: "H. Sander" }, 11),
      ev("project.step.moved", "L. Brandt", "p_one", { stepId: "s1", to: "blocked", why: "waiting for a quote" }, 15),
      ev("project.update", "L. Brandt", "p_one", { text: "All on track, says L. Brandt", week: 10 }, 16),
      fact("blocked", 22, { stepId: "s1" }),
    ], 25);
    const rides = ridesFor("p_one", w.log, 20);
    const roleOf = (st: { ownerUserId?: string | null }) => SEATS.find((x) => x.userId === st.ownerUserId)?.roleId ?? null;
    const req = agentRequestOf(w.p, rides, ["unblock", "report"], 25, "en", roleOf, "Acme", 25);

    it("carries the steps with a role label for the owner or 'no owner', the facts, the update's week and the done-by date", () => {
      const byId = (id: string) => req.project.steps.find((x) => x.id === id);
      expect([byId("s1")?.column, byId("s1")?.due_day, byId("s1")?.owner, byId("s1")?.blocked_why]).toEqual(["blocked", 20, "role_prod", "waiting for a quote"]);
      expect([byId("s2")?.column, byId("s2")?.due_day, byId("s2")?.owner, byId("s2")?.blocked_why]).toEqual(["todo", null, "no owner", null]);
      expect(req.project.steps).toHaveLength(2);
      expect(req.project.facts).toEqual([{ id: rides[0].id, kind: "blocked", step_id: "s1", day: 21 }]);
      expect(req.project).toMatchObject({ id: "p_one", latest_update: { week: 10, day: 16 }, last_activity_day: w.p.lastActivityDay, done_by: w.p.doneBy, paused_until: null, check_in_day: 25 });
      expect(req).toMatchObject({ company: "Acme", locale: "en", today: 25, kinds: ["unblock", "report"] });
    });

    it("is a valid /v1/agent request and holds no display name, no user id and no raw event of the seed's people", () => {
      expect(AgentRequest.safeParse(req).success).toBe(true);
      const text = JSON.stringify(req);
      for (const name of people) expect(text, name).not.toContain(name);
      for (const id of ["u_tv", "u_lb", "u_hs", "u_ci", "u_js"]) expect(text, id).not.toContain(id);
      expect(text).not.toContain("clock.due");
      expect(text).not.toContain("All on track"); // the update's words are not in the request
    });

    it("sends a pause only while it lasts, and the open steps first", () => {
      const [first, second] = w.p.steps;
      const paused = agentRequestOf({ ...w.p, pausedUntil: 30, steps: [{ ...first, column: "done" }, second] }, [], ["plan"], 25, "de", roleOf);
      expect(paused.project.paused_until).toBe(30);
      expect(paused.project.steps.map((x) => x.id)).toEqual([second.id, first.id]); // the open one first
      expect(paused.locale).toBe("de");
      expect(agentRequestOf({ ...w.p, pausedUntil: 20 }, [], [], 25, "en", roleOf).project.paused_until).toBeNull();
    });
  });
});
