// MOV-B1: who may append the events of "A project that keeps moving" (plan MOV, D13, D14, D18-D22). The states are a legacy
// project from a yes, reduced from events, then given the MOV and SET fields by hand, so a later change of the reducer cannot
// move these cases.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { isSponsor } from "@/features/projects/permissions";
import type { ProjectEscalation, ReducedProject } from "@/features/projects/types";

const SEATS: SeatRow[] = [
  { id: "s_lead", roleId: "role_member", label: "Lead", userId: "u_lead", sort: 1 },
  { id: "s_desk", roleId: "role_owner", label: "Desk", userId: "u_desk", sort: 2 },
  { id: "s_dep", roleId: "role_deputy", label: "Deputy", userId: "u_dep", sort: 3 },
  { id: "s_up", roleId: "role_up", label: "Above", userId: "u_up", sort: 4 },
];
const SEED: ReduceSeed = {
  cases: CASES, ideas: IDEAS, problems: PROBLEMS, promiseDays: PROMISE_DAYS, seats: SEATS,
  routes: ROUTES.map((r) => (r.id === "r1" ? { ...r, ownerRoleId: "role_owner", deputyRoleId: "role_deputy" } : r)),
};

let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "mv" + n++, ts: 0, type, actor, actorUserId, target, payload, day });
const raised = ev("case.raised", "Anonymous #4471", "u_js", "c_m", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" });
const yes = ev("case.decided", "T. Vogel", "u_dec", "c_m", { answer: "yes", projectId: "p_m", lead: "Lead", leadUserId: "u_lead", title: "Changeover cart" });
const baseline = ev("project.baseline", "Lead", "u_lead", "p_m", { metric: "m", unit: "min", value: 42, better: "down" });
const started = ev("project.started", "Lead", "u_lead", "p_m");

/** The project at `day`, started on day 0 (so the demo check-in days are 0, 5, 10 ...), with `patch` on top. */
function world(patch: Partial<ReducedProject> = {}, day = 7, from: "started" | "planning" = "started"): State {
  const state = reduce(SEED, { events: from === "started" ? [raised, yes, baseline, started] : [raised, yes], day });
  const p = state.projects.find((x) => x.id === "p_m");
  if (!p) throw new Error("no project");
  Object.assign(p, { sponsorUserId: "u_sp", deciderUserId: "u_dec", memberUserIds: ["u_mem"] }, patch);
  return state;
}

type Who = "lead" | "sponsor" | "desk" | "dep" | "up" | "decider" | "manager" | "member" | "stranger";
const WHO: Record<Who, { userId: string; role: Actor["role"] }> = {
  lead: { userId: "u_lead", role: "leader" }, sponsor: { userId: "u_sp", role: "member" }, desk: { userId: "u_desk", role: "leader" },
  dep: { userId: "u_dep", role: "leader" }, up: { userId: "u_up", role: "leader" }, decider: { userId: "u_dec", role: "leader" },
  manager: { userId: "u_mgr", role: "manager" }, member: { userId: "u_mem", role: "member" }, stranger: { userId: "u_x", role: "member" },
};
const ask = (who: Who, type: string, payload: EventPayload, state: State) => {
  const { userId, role } = WHO[who];
  return mayAppend({ role, userId, me: meFor(userId, SEATS), name: who, handle: null }, { type, target: "p_m", payload }, state);
};
const yesFor = (who: Who, type: string, payload: EventPayload, state: State) => ask(who, type, payload, state).ok;
const errorOf = (who: Who, type: string, payload: EventPayload, state: State): string => {
  const v = ask(who, type, payload, state);
  return v.ok ? "" : v.error;
};
const stalled = (live = true): ProjectEscalation => ({ to: "Above", toSeatId: "s_up", toRoleId: "role_up", from: "Desk", day: 6, live, what: "stalled", toUserId: null });
const WHY = "The supplier moved the delivery";

describe("MOV rights", () => {
  describe("done-by date", () => {
    const move = { doneBy: 20, why: WHY };
    it("the lead moves it once, the sponsor, the stalled seat's holder and a manager whenever", () => {
      expect(yesFor("lead", "project.doneby.moved", move, world())).toBe(true);
      const afterLead = world({ doneByMoves: [{ day: 3, doneBy: 15, why: WHY, byUserId: "u_lead", byLead: true }] });
      expect(errorOf("lead", "project.doneby.moved", move, afterLead)).toContain("already moved the done-by date once");
      expect(yesFor("sponsor", "project.doneby.moved", move, afterLead)).toBe(true);
      expect(yesFor("manager", "project.doneby.moved", move, afterLead)).toBe(true);
      const up = world({ escalated: stalled(), sponsorUserId: null, doneByMoves: afterLead.projects[0].doneByMoves });
      expect(yesFor("up", "project.doneby.moved", move, up)).toBe(true);
    });

    it("a move by the sponsor does not use up the lead's one move", () => {
      const bySponsor = world({ doneByMoves: [{ day: 3, doneBy: 15, why: WHY, byUserId: "u_sp", byLead: false }] });
      expect(yesFor("lead", "project.doneby.moved", move, bySponsor)).toBe(true);
    });

    it("a member, the desk and a stranger may not; neither may the holder of a seat whose escalation is over", () => {
      const s = world();
      for (const who of ["member", "stranger", "desk", "decider", "up"] as const) expect(yesFor(who, "project.doneby.moved", move, s), who).toBe(false);
      expect(yesFor("up", "project.doneby.moved", move, world({ escalated: stalled(false) }))).toBe(false);
      expect(yesFor("up", "project.doneby.moved", move, world({ escalated: { ...stalled(), what: "start" } }))).toBe(false);
    });

    it("only a running project, a whole day after today and a reason of 1 to 400 characters", () => {
      expect(yesFor("sponsor", "project.doneby.moved", move, world({}, 7, "planning"))).toBe(false);
      expect(yesFor("sponsor", "project.doneby.moved", move, world({ status: "stopped" }))).toBe(false);
      for (const doneBy of [7, 3, 20.5, "20", null]) expect(yesFor("sponsor", "project.doneby.moved", { doneBy: doneBy as never, why: WHY }, world()), String(doneBy)).toBe(false);
      expect(yesFor("sponsor", "project.doneby.moved", { doneBy: 8, why: WHY }, world())).toBe(true);
      expect(yesFor("sponsor", "project.doneby.moved", { doneBy: 20, why: "  " }, world())).toBe(false);
      expect(yesFor("sponsor", "project.doneby.moved", { doneBy: 20, why: "x".repeat(401) }, world())).toBe(false);
      expect(yesFor("sponsor", "project.doneby.moved", { doneBy: 20, why: "x".repeat(400) }, world())).toBe(true);
    });

    it("a sponsor who is also the lead has no more rights than the lead (D26)", () => {
      const s = world({ sponsorUserId: "u_lead", doneByMoves: [{ day: 3, doneBy: 15, why: WHY, byUserId: "u_lead", byLead: true }] });
      expect(yesFor("lead", "project.doneby.moved", move, s)).toBe(false);
    });

    it("a legacy project (no sponsor) lets the lead and a manager move it", () => {
      const legacy = world({ sponsorUserId: null });
      expect(yesFor("lead", "project.doneby.moved", move, legacy)).toBe(true);
      expect(yesFor("manager", "project.doneby.moved", move, legacy)).toBe(true);
      expect(yesFor("stranger", "project.doneby.moved", move, legacy)).toBe(false);
    });
  });

  describe("hand on and stop", () => {
    it("the sponsor, the lead, a manager and the stalled seat's holder may; a member, the desk and a stranger may not", () => {
      const s = world({ escalated: stalled() });
      for (const who of ["lead", "sponsor", "manager", "up"] as const) {
        expect(yesFor(who, "project.handed", { to: "New", toUserId: "u_new", why: WHY }, s), who).toBe(true);
        expect(yesFor(who, "project.stopped", { why: WHY }, s), who).toBe(true);
      }
      for (const who of ["member", "stranger", "desk", "decider"] as const) {
        expect(yesFor(who, "project.handed", { to: "New", toUserId: "u_new" }, s), who).toBe(false);
        expect(yesFor(who, "project.stopped", { why: WHY }, s), who).toBe(false);
      }
    });

    it("the stalled seat's rights end with the escalation, and a closed project cannot be handed on or stopped", () => {
      expect(yesFor("up", "project.stopped", { why: WHY }, world())).toBe(false);
      expect(yesFor("up", "project.stopped", { why: WHY }, world({ escalated: stalled(false) }))).toBe(false);
      expect(yesFor("sponsor", "project.handed", { toUserId: "u_new" }, world({ status: "stopped" }))).toBe(false);
      expect(yesFor("sponsor", "project.stopped", { why: WHY }, world({ status: "stopped" }))).toBe(false);
      expect(yesFor("sponsor", "project.stopped", { why: " " }, world())).toBe(false);
    });

    it("a legacy project keeps today's rules: the lead and a manager, nobody else", () => {
      const legacy = world({ sponsorUserId: null });
      expect(yesFor("lead", "project.stopped", { why: WHY }, legacy)).toBe(true);
      expect(yesFor("manager", "project.handed", { toUserId: "u_new" }, legacy)).toBe(true);
      for (const who of ["member", "stranger", "desk"] as const) expect(yesFor(who, "project.stopped", { why: WHY }, legacy), who).toBe(false);
    });
  });

  describe("pause", () => {
    const pause = { why: WHY, untilDay: 12 };
    it("the lead and a manager pause a running project for at most 20 working days", () => {
      expect(yesFor("lead", "project.paused", pause, world())).toBe(true);
      expect(yesFor("manager", "project.paused", pause, world())).toBe(true);
      expect(yesFor("lead", "project.paused", { why: WHY, untilDay: 27 }, world())).toBe(true);
      expect(yesFor("lead", "project.paused", { why: WHY, untilDay: 28 }, world())).toBe(false);
      expect(errorOf("lead", "project.paused", { why: WHY, untilDay: 28 }, world())).toContain("20 working days");
      expect(yesFor("lead", "project.paused", { why: WHY, untilDay: 7 }, world())).toBe(false);
      expect(yesFor("lead", "project.paused", { why: WHY, untilDay: 9.5 }, world())).toBe(false);
    });

    it("a pause of 21 days is refused", () => {
      expect(yesFor("lead", "project.paused", { why: WHY, untilDay: 7 + 21 }, world())).toBe(false);
      expect(yesFor("manager", "project.paused", { why: WHY, untilDay: 7 + 21 }, world())).toBe(false);
    });

    it("needs a reason, a running project that is not paused already, and the lead", () => {
      expect(yesFor("lead", "project.paused", { untilDay: 12 }, world())).toBe(false);
      expect(yesFor("lead", "project.paused", pause, world({}, 7, "planning"))).toBe(false);
      expect(yesFor("lead", "project.paused", pause, world({ pausedUntil: 9, pauseWhy: WHY }))).toBe(false);
      expect(yesFor("lead", "project.paused", pause, world({ pausedUntil: 6, pauseWhy: WHY }))).toBe(true);
      for (const who of ["sponsor", "member", "stranger", "desk"] as const) expect(yesFor(who, "project.paused", pause, world()), who).toBe(false);
    });

    it("the lead, the sponsor and a manager resume, only while paused", () => {
      const paused = world({ pausedUntil: 12, pauseWhy: WHY });
      for (const who of ["lead", "sponsor", "manager"] as const) {
        expect(yesFor(who, "project.resumed", {}, paused), who).toBe(true);
        expect(yesFor(who, "project.resumed", {}, world()), who).toBe(false);
      }
      for (const who of ["member", "stranger", "desk"] as const) expect(yesFor(who, "project.resumed", {}, paused), who).toBe(false);
      // The last day of a pause is still paused; the day after it, nothing is left to resume.
      expect(yesFor("sponsor", "project.resumed", {}, world({ pausedUntil: 7 }))).toBe(true);
      expect(yesFor("sponsor", "project.resumed", {}, world({ pausedUntil: 6 }))).toBe(false);
    });
  });

  describe("how we work", () => {
    it("the lead and a manager set a weekday from 1 to 5 and a note of at most 400 characters", () => {
      for (const who of ["lead", "manager"] as const) expect(yesFor(who, "project.howwework", { checkInWeekday: 3, note: "Stand-up at 9" }, world()), who).toBe(true);
      expect(yesFor("lead", "project.howwework", { checkInWeekday: 3, note: "Stand-up at 9" }, world({}, 7, "planning"))).toBe(true);
      expect(yesFor("lead", "project.howwework", { checkInWeekday: 5 }, world())).toBe(true);
      for (const day of [0, 6, 7, 2.5, "3", null]) expect(yesFor("lead", "project.howwework", { checkInWeekday: day as never }, world()), String(day)).toBe(false);
      expect(yesFor("lead", "project.howwework", { checkInWeekday: 3, note: "x".repeat(401) }, world())).toBe(false);
      expect(yesFor("lead", "project.howwework", { checkInWeekday: 3, note: "x".repeat(400) }, world())).toBe(true);
      expect(yesFor("lead", "project.howwework", { checkInWeekday: 3, note: 5 as never }, world())).toBe(false);
    });

    it("not a member, the sponsor or a stranger, and not on a closed project", () => {
      for (const who of ["member", "sponsor", "stranger", "desk"] as const) expect(yesFor(who, "project.howwework", { checkInWeekday: 3 }, world()), who).toBe(false);
      expect(yesFor("lead", "project.howwework", { checkInWeekday: 3 }, world({ status: "stopped" }))).toBe(false);
    });
  });

  describe("weekly update", () => {
    const text = "Two steps done, one blocked on the supplier";
    it("the lead and a manager send the update for the check-in day that is due", () => {
      // Started on day 0: check-in days are 0, 5, 10 ... Today is day 7, so day 5 is due.
      for (const who of ["lead", "manager"] as const) expect(yesFor(who, "project.update", { text, week: 5 }, world()), who).toBe(true);
      expect(yesFor("lead", "project.update", { text, week: 10 }, world({}, 10))).toBe(true);
      expect(yesFor("lead", "project.update", { text, week: 0 }, world({}, 3))).toBe(true);
    });

    it("refuses an old week, a future week, a week before the kickoff and one that is no whole check-in day", () => {
      for (const week of [0, 4, 6, 7, 10, -5, 5.5, "5", null]) expect(yesFor("lead", "project.update", { text, week: week as never }, world()), String(week)).toBe(false);
      expect(errorOf("lead", "project.update", { text, week: 0 }, world())).toContain("current weekly check-in");
      expect(yesFor("lead", "project.update", { text }, world())).toBe(false);
      // A project started on day 4 has its first check-in on day 4: week 0 and week -1 do not belong to it.
      const late = world({ startedDay: 4 }, 6);
      expect(yesFor("lead", "project.update", { text, week: 4 }, late)).toBe(true);
      expect(yesFor("lead", "project.update", { text, week: 0 }, late)).toBe(false);
      expect(yesFor("lead", "project.update", { text, week: -1 }, late)).toBe(false);
    });

    it("sending it again for the same week is a revision of that update and stays allowed", () => {
      const sent = world({ latestUpdate: { text: "First version", week: 5, day: 6, byUserId: "u_lead" } });
      expect(yesFor("lead", "project.update", { text, week: 5 }, sent)).toBe(true);
      // The previous week is no longer the one that is due.
      expect(yesFor("lead", "project.update", { text, week: 0 }, sent)).toBe(false);
    });

    it("before the start, on a project that is not started, and with a text outside 1 to 4000 characters, it is refused", () => {
      expect(yesFor("lead", "project.update", { text, week: 0 }, world({}, 7, "planning"))).toBe(false);
      expect(yesFor("lead", "project.update", { text, week: 5 }, world({ status: "stopped" }))).toBe(false);
      expect(yesFor("lead", "project.update", { text: "", week: 5 }, world())).toBe(false);
      expect(yesFor("lead", "project.update", { text: "x".repeat(4001), week: 5 }, world())).toBe(false);
      expect(yesFor("lead", "project.update", { text: "x".repeat(4000), week: 5 }, world())).toBe(true);
    });

    it("not the sponsor, a member or a stranger", () => {
      for (const who of ["sponsor", "member", "stranger", "desk"] as const) expect(yesFor(who, "project.update", { text, week: 5 }, world()), who).toBe(false);
    });
  });

  describe("a new lead", () => {
    const named = { to: "New Lead", toUserId: "u_new", why: "Takes over from the leaver" };
    const vacant = (patch: Partial<ReducedProject> = {}) => world({ leadUserId: null, lead: "", leadVacatedDay: 5, ...patch });

    it("is named by the sponsor, a holder of the route's owner or deputy role, the decider or a manager", () => {
      for (const who of ["sponsor", "desk", "dep", "decider", "manager"] as const) expect(yesFor(who, "project.lead.changed", named, vacant()), who).toBe(true);
    });

    it("is refused for a member, a stranger and the seat above the desk", () => {
      for (const who of ["member", "stranger", "up"] as const) expect(yesFor(who, "project.lead.changed", named, vacant()), who).toBe(false);
    });

    it("is refused while a lead exists, also when the project once lost one", () => {
      expect(yesFor("sponsor", "project.lead.changed", named, world())).toBe(false);
      expect(errorOf("manager", "project.lead.changed", named, world())).toContain("still has a lead");
      expect(yesFor("manager", "project.lead.changed", named, vacant({ leadVacatedDay: null }))).toBe(false);
    });

    it("needs the person named and a project that is not closed", () => {
      expect(yesFor("sponsor", "project.lead.changed", { to: "New Lead" }, vacant())).toBe(false);
      expect(yesFor("sponsor", "project.lead.changed", { to: "New Lead", toUserId: "" }, vacant())).toBe(false);
      expect(yesFor("sponsor", "project.lead.changed", named, vacant({ status: "stopped" }))).toBe(false);
    });

    it("a project with no sponsor is named by the desk, the decider or a manager", () => {
      const s = vacant({ sponsorUserId: null });
      for (const who of ["desk", "dep", "decider", "manager"] as const) expect(yesFor(who, "project.lead.changed", named, s), who).toBe(true);
      expect(yesFor("sponsor", "project.lead.changed", named, s)).toBe(false);
    });

    it("the sponsor may hand a project without a lead on, as the lead may", () => {
      expect(yesFor("sponsor", "project.handed", { toUserId: "u_new" }, vacant())).toBe(true);
    });
  });

  it("project.lead.vacated is refused from every client", () => {
    const s = world();
    for (const who of Object.keys(WHO) as Who[]) expect(yesFor(who, "project.lead.vacated", { userId: "u_lead" }, s), who).toBe(false);
    expect(errorOf("manager", "project.lead.vacated", { userId: "u_lead" }, s)).toContain("Only the system writes");
  });

  it("a member who is taken off the team with unassign needs the same right as today: the lead or a manager", () => {
    const off = { userId: "u_mem", on: false, unassign: true };
    expect(yesFor("lead", "project.member", off, world())).toBe(true);
    expect(yesFor("manager", "project.member", off, world())).toBe(true);
    for (const who of ["member", "sponsor", "stranger"] as const) expect(yesFor(who, "project.member", off, world()), who).toBe(false);
  });

  it("a step goes to Blocked only with a reason of 1 to 400 characters (F5)", () => {
    const s = world({ steps: [{ id: "t1", text: "Order the part", column: "doing", owner: null, ownerUserId: null, byUserId: "u_lead" } as unknown as ReducedProject["steps"][number]] });
    expect(yesFor("lead", "project.step.moved", { stepId: "t1", to: "blocked" }, s)).toBe(false);
    expect(yesFor("lead", "project.step.moved", { stepId: "t1", to: "blocked", why: "  " }, s)).toBe(false);
    expect(errorOf("lead", "project.step.moved", { stepId: "t1", to: "blocked", why: 5 as never }, s)).toContain("why the step is blocked");
    expect(yesFor("lead", "project.step.moved", { stepId: "t1", to: "blocked", why: "x".repeat(401) }, s)).toBe(false);
    expect(yesFor("lead", "project.step.moved", { stepId: "t1", to: "blocked", why: "Waiting for the supplier" }, s)).toBe(true);
    // Every other move stays as it was.
    expect(yesFor("lead", "project.step.moved", { stepId: "t1", to: "done" }, s)).toBe(true);
  });

  it("a member of the team has no right on any MOV event", () => {
    const s = world({ leadUserId: null, lead: "", leadVacatedDay: 5 });
    const running = world();
    const cases: [string, EventPayload, State][] = [
      ["project.doneby.moved", { doneBy: 20, why: WHY }, running],
      ["project.paused", { why: WHY, untilDay: 12 }, running],
      ["project.resumed", {}, world({ pausedUntil: 12 })],
      ["project.howwework", { checkInWeekday: 3 }, running],
      ["project.update", { text: "Update", week: 5 }, running],
      ["project.lead.changed", { to: "N", toUserId: "u_new" }, s],
      ["project.lead.vacated", { userId: "u_lead" }, running],
      ["project.handed", { toUserId: "u_new" }, running],
      ["project.stopped", { why: WHY }, running],
    ];
    for (const [type, payload, state] of cases) expect(yesFor("member", type, payload, state), type).toBe(false);
  });
});

describe("MOV handover", () => {
  it("MOV handover: isSponsor is true only for the accepted sponsor of the project", () => {
    expect(isSponsor({ sponsorUserId: "u_sp" }, "u_sp")).toBe(true);
    expect(isSponsor({ sponsorUserId: "u_sp" }, "u_other")).toBe(false);
    expect(isSponsor({ sponsorUserId: "u_sp" }, null)).toBe(false);
    // No accepted sponsor: nobody is one, not even a missing user.
    expect(isSponsor({ sponsorUserId: null }, null)).toBe(false);
    expect(isSponsor({ sponsorUserId: null }, "u_sp")).toBe(false);
  });

  it("the sponsor of a project may hand the lead on and stop it; a stranger may not", () => {
    const s = world();
    expect(isSponsor(s.projects[0], "u_sp")).toBe(true);
    expect(yesFor("sponsor", "project.handed", { toUserId: "u_new" }, s)).toBe(true);
    expect(yesFor("sponsor", "project.stopped", { why: WHY }, s)).toBe(true);
    expect(yesFor("stranger", "project.handed", { toUserId: "u_new" }, s)).toBe(false);
  });
});
