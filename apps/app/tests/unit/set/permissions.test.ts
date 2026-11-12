// SET-B1: who may answer, invite, edit and start a draft, and what a yes may carry. Rights are checked at append
// time (mayAppend), never in the reducer, so the drafts here are built directly from the SET-G1 types.
import { describe, expect, it } from "vitest";
import { CLOCK_ACTOR } from "@/features/clock/actor";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import type { State } from "@/features/cases/reducer";
import type { Invite, ReducedProject } from "@/features/projects/types";

const LEAD = "u_lead";
const DECIDER = "u_decider";
const SPONSOR = "u_sponsor";
const MEMBER = "u_member";
const RAISER = "u_raiser";
const OUTSIDER = "u_out";
const SEAT_HOLDER = "u_seat";
const OTHER_HOLDER = "u_other_seat";
const FORMER_HOLDER = "u_former_seat";

const person = (userId: string, role: Actor["role"] = "member"): Actor => ({ role, name: userId, handle: null, userId });
const clock: Actor = { role: "member", name: CLOCK_ACTOR, handle: null };
const manager = person("u_mgr", "manager");

const invite = (over: Partial<Invite> = {}): Invite => ({ id: "inv1", userId: "u_guest", role: "member", state: "pending", day: 1, reason: "", ...over });

const project = (over: Partial<ReducedProject> = {}): ReducedProject => ({
  id: "p1", number: 1, seed: false, title: "Shorter changeover", sources: ["c1"], authors: [], routeId: null,
  lead: "Lead", members: [], leadUserId: LEAD, memberUserIds: [MEMBER], authorUserIds: [RAISER],
  openedDay: 0, openedBy: "Decider", startedDay: null, doneDay: null, doneNote: "", stopped: null, baseline: null,
  steps: [], links: [], sync: null, measures: [], checks: [], verdict: null, reward: null, claimed: null,
  status: "planning", closed: false, rewardDue: false, dueDay: 5, overdue: false, escalated: null, history: [],
  draft: true, leadState: "taken", leadAskedDay: 0, template: null, invites: [], sponsorUserId: null, followerUserIds: [],
  goal: null, startDay: null, approvalsPendingSince: null, raiserNote: "", deciderUserId: DECIDER,
  doneBy: null, doneByMoves: [], pausedUntil: null, pauseWhy: "", lastActivityDay: null, checkInWeekday: null, howWeWorkNote: "", leadVacatedDay: null, latestUpdate: null, rewardDueDay: null, helpAsks: [],
  ...over,
});

const SEATS = [
  { id: "s_up", roleId: "r_up", label: "Head of ops", userId: SEAT_HOLDER, sort: 1 },
  { id: "s_other", roleId: "r_other", label: "Head of sales", userId: OTHER_HOLDER, sort: 2 },
  { id: "s_former", roleId: "r_former", label: "Former head", userId: FORMER_HOLDER, sort: 3 },
];
const state = (...projects: ReducedProject[]): State => ({ projects, seats: SEATS, cases: [], ideas: [], day: 10 }) as unknown as State;
const ask = (actor: Actor, type: string, payload: Record<string, unknown>, ...projects: ReducedProject[]) =>
  mayAppend(actor, { type, target: "p1", payload }, state(...(projects.length ? projects : [project()])));
const ok = { ok: true };
const refused = (v: { ok: boolean }) => expect(v.ok).toBe(false);

const escalation = (toSeatId: string, live = true) => ({ to: "Head", toSeatId, toRoleId: null, from: "Lead", day: 6, live, what: "draft" as const });

describe("SET rights", () => {
  describe("the lead question", () => {
    const pending = project({ leadState: "pending" });
    it("only the asked lead takes or declines it", () => {
      expect(ask(person(LEAD), "project.lead.answered", { take: true }, pending)).toEqual(ok);
      expect(ask(person(LEAD), "project.lead.answered", { take: false, reason: "No time" }, pending)).toEqual(ok);
      refused(ask(person(LEAD), "project.lead.answered", { take: false }, pending));
      refused(ask(person(DECIDER), "project.lead.answered", { take: true }, pending));
      refused(ask(manager, "project.lead.answered", { take: true }, pending));
      refused(ask(person(LEAD), "project.lead.answered", {}, pending));
    });
    it("is closed once the lead has answered", () => {
      refused(ask(person(LEAD), "project.lead.answered", { take: true }, project({ leadState: "taken" })));
    });
    it("lapsed comes only from the clock, and only as a decline", () => {
      expect(ask(clock, "project.lead.answered", { take: false, lapsed: true }, pending)).toEqual(ok);
      refused(ask(clock, "project.lead.answered", { take: true, lapsed: true }, pending));
      refused(ask(person(LEAD), "project.lead.answered", { take: false, lapsed: true }, pending));
      refused(ask(manager, "project.lead.answered", { take: false, lapsed: true }, pending));
    });
    it("a legacy project has no such question", () => {
      refused(ask(person(LEAD), "project.lead.answered", { take: true }, project({ draft: false, leadState: "taken" })));
    });
  });

  describe("invitations", () => {
    it("only the lead and managers invite, with one of the four roles, never the lead themself", () => {
      for (const role of ["sponsor", "member", "contributor", "follower"]) expect(ask(person(LEAD), "project.invited", { userId: "u_guest", role })).toEqual(ok);
      expect(ask(manager, "project.invited", { userId: "u_guest", role: "member" })).toEqual(ok);
      refused(ask(person(MEMBER), "project.invited", { userId: "u_guest", role: "member" }));
      refused(ask(person(DECIDER), "project.invited", { userId: "u_guest", role: "member" }));
      refused(ask(person(SPONSOR), "project.invited", { userId: "u_guest", role: "member" }));
      refused(ask(person(LEAD), "project.invited", { userId: "u_guest", role: "boss" }));
      refused(ask(person(LEAD), "project.invited", { userId: "u_guest" }));
      refused(ask(person(LEAD), "project.invited", { userId: LEAD, role: "member" }));
      refused(ask(person(LEAD), "project.invited", { role: "member" }));
    });
    it("stays possible after the start, not once stopped or recognised", () => {
      const running = project({ status: "running", startedDay: 3 });
      expect(ask(person(LEAD), "project.invited", { userId: "u_guest", role: "sponsor" }, running)).toEqual(ok);
      expect(ask(person(LEAD), "project.invited", { userId: "u_guest", role: "sponsor" }, project({ status: "measuring", startedDay: 3 }))).toEqual(ok);
      refused(ask(person(LEAD), "project.invited", { userId: "u_guest", role: "sponsor" }, project({ status: "stopped" })));
      refused(ask(person(LEAD), "project.invited", { userId: "u_guest", role: "sponsor" }, project({ status: "recognised" })));
    });
    it("only the invited person answers the named, pending invitation", () => {
      const p = project({ invites: [invite()] });
      expect(ask(person("u_guest"), "project.invite.answered", { inviteId: "inv1", userId: "u_guest", take: true }, p)).toEqual(ok);
      expect(ask(person("u_guest"), "project.invite.answered", { inviteId: "inv1", take: false }, p)).toEqual(ok);
      refused(ask(person(LEAD), "project.invite.answered", { inviteId: "inv1", userId: "u_guest", take: true }, p));
      refused(ask(manager, "project.invite.answered", { inviteId: "inv1", userId: "u_guest", take: true }, p));
      refused(ask(person(OUTSIDER), "project.invite.answered", { inviteId: "inv1", userId: "u_guest", take: true }, p));
      // naming another person's id does not help
      refused(ask(person(OUTSIDER), "project.invite.answered", { inviteId: "inv1", userId: OUTSIDER, take: true }, p));
      refused(ask(person("u_guest"), "project.invite.answered", { inviteId: "nope", take: true }, p));
      refused(ask(person("u_guest"), "project.invite.answered", { take: true }, p));
      refused(ask(person("u_guest"), "project.invite.answered", { inviteId: "inv1" }, p));
    });
    it("refuses an invitation that is already answered", () => {
      for (const state of ["accepted", "declined", "lapsed"] as const) {
        refused(ask(person("u_guest"), "project.invite.answered", { inviteId: "inv1", take: true }, project({ invites: [invite({ state })] })));
        refused(ask(clock, "project.invite.answered", { inviteId: "inv1", take: false, lapsed: true }, project({ invites: [invite({ state })] })));
      }
    });
    it("answers one invitation, not another of the same person", () => {
      const p = project({ invites: [invite({ id: "inv1", state: "declined" }), invite({ id: "inv2" })] });
      refused(ask(person("u_guest"), "project.invite.answered", { inviteId: "inv1", take: true }, p));
      expect(ask(person("u_guest"), "project.invite.answered", { inviteId: "inv2", take: true }, p)).toEqual(ok);
    });
    it("answers after the start too, lapsed only from the clock", () => {
      const running = project({ status: "running", startedDay: 3, invites: [invite()] });
      expect(ask(person("u_guest"), "project.invite.answered", { inviteId: "inv1", take: true }, running)).toEqual(ok);
      expect(ask(clock, "project.invite.answered", { inviteId: "inv1", userId: "u_guest", take: false, lapsed: true }, running)).toEqual(ok);
      refused(ask(person("u_guest"), "project.invite.answered", { inviteId: "inv1", take: false, lapsed: true }, running));
      refused(ask(person("u_guest"), "project.invite.answered", { inviteId: "inv1", take: true }, project({ status: "stopped", invites: [invite()] })));
    });
    it("a legacy project has no invitations", () => {
      const legacy = project({ draft: false, invites: [invite()] });
      refused(ask(person(LEAD), "project.invited", { userId: "u_guest", role: "member" }, legacy));
      refused(ask(person("u_guest"), "project.invite.answered", { inviteId: "inv1", take: true }, legacy));
    });
  });

  describe("the template", () => {
    it("the lead, a manager or the decider (while the lead is pending) set it; others do not", () => {
      const pl = { key: "quick-win", version: 1 };
      expect(ask(person(LEAD), "project.template", pl)).toEqual(ok);
      expect(ask(manager, "project.template", pl)).toEqual(ok);
      expect(ask(person(DECIDER), "project.template", pl, project({ leadState: "pending" }))).toEqual(ok);
      refused(ask(person(DECIDER), "project.template", pl));
      refused(ask(person(MEMBER), "project.template", pl));
      refused(ask(person(SPONSOR), "project.template", pl));
    });
    it("the key and the exact version must exist", () => {
      expect(ask(person(LEAD), "project.template", { key: "8d", version: 1, title: "Own title" })).toEqual(ok);
      refused(ask(person(LEAD), "project.template", { key: "nope", version: 1 }));
      refused(ask(person(LEAD), "project.template", { key: "quick-win", version: 99 }));
      refused(ask(person(LEAD), "project.template", { key: "quick-win" }));
      refused(ask(person(LEAD), "project.template", { key: "toString", version: 1 }));
    });
    it("is refused after project.started, and on a legacy project", () => {
      const pl = { key: "quick-win", version: 1 };
      refused(ask(person(LEAD), "project.template", pl, project({ status: "running", startedDay: 3 })));
      refused(ask(manager, "project.template", pl, project({ status: "running", startedDay: 3 })));
      refused(ask(person(LEAD), "project.template", pl, project({ draft: false })));
    });
  });

  describe("the goal", () => {
    const goal = { goal: "Halve the changeover", doneWhen: "Under 20 minutes" };
    it("the lead, a manager and the sponsor set it; a member does not", () => {
      expect(ask(person(LEAD), "project.goal", goal)).toEqual(ok);
      expect(ask(manager, "project.goal", goal)).toEqual(ok);
      expect(ask(person(SPONSOR), "project.goal", goal, project({ sponsorUserId: SPONSOR }))).toEqual(ok);
      refused(ask(person(SPONSOR), "project.goal", goal));
      refused(ask(person(MEMBER), "project.goal", goal));
      refused(ask(person(OUTSIDER), "project.goal", goal));
    });
    it("the decider sets it until the lead has taken it", () => {
      expect(ask(person(DECIDER), "project.goal", goal, project({ leadState: "pending" }))).toEqual(ok);
      refused(ask(person(DECIDER), "project.goal", goal, project({ leadState: "taken" })));
    });
    it("goal and done-when are 3 to 400 characters, the date a working day after today, the brief up to 1200", () => {
      refused(ask(person(LEAD), "project.goal", { ...goal, goal: "ab" }));
      refused(ask(person(LEAD), "project.goal", { ...goal, goal: "  a " }));
      refused(ask(person(LEAD), "project.goal", { ...goal, doneWhen: "x".repeat(401) }));
      refused(ask(person(LEAD), "project.goal", { goal: goal.goal }));
      expect(ask(person(LEAD), "project.goal", { goal: "abc", doneWhen: "x".repeat(400) })).toEqual(ok);
      expect(ask(person(LEAD), "project.goal", { ...goal, doneBy: 11 })).toEqual(ok);
      refused(ask(person(LEAD), "project.goal", { ...goal, doneBy: 10 }));
      refused(ask(person(LEAD), "project.goal", { ...goal, doneBy: 11.5 }));
      expect(ask(person(LEAD), "project.goal", { ...goal, brief: "b".repeat(1200) })).toEqual(ok);
      refused(ask(person(LEAD), "project.goal", { ...goal, brief: "b".repeat(1201) }));
    });
    it("a legacy project has no goal", () => {
      refused(ask(person(LEAD), "project.goal", goal, project({ draft: false })));
    });
  });

  describe("comments on a draft", () => {
    it("the raiser comments in planning even when not on the team", () => {
      expect(ask(person(RAISER), "project.commented", { text: "Have you asked night shift?" })).toEqual(ok);
      expect(ask(person(LEAD), "project.commented", { text: "Yes" })).toEqual(ok);
      expect(ask(person(MEMBER), "project.commented", { text: "Yes" })).toEqual(ok);
      refused(ask(person(OUTSIDER), "project.commented", { text: "Hi" }));
      refused(ask(person(RAISER), "project.commented", { text: " " }));
    });
    it("a legacy project keeps its rule: anyone with text", () => {
      expect(ask(person(OUTSIDER), "project.commented", { text: "Hi" }, project({ draft: false }))).toEqual(ok);
    });
  });

  describe("project.started", () => {
    const baseline = { none: true as const, why: "Nothing to measure", day: 1, by: "Lead" };
    const goal = { goal: "Halve it", doneWhen: "Under 20", doneBy: null, brief: "" };
    it("is refused until the lead has taken it and goal and baseline are set", () => {
      refused(ask(person(LEAD), "project.started", {}, project({ leadState: "pending", goal, baseline })));
      refused(ask(person(LEAD), "project.started", {}, project({ goal: null, baseline })));
      refused(ask(person(LEAD), "project.started", {}, project({ goal, baseline: null })));
      expect(ask(person(LEAD), "project.started", {}, project({ goal, baseline }))).toEqual(ok);
      expect(ask(manager, "project.started", {}, project({ goal, baseline }))).toEqual(ok);
    });
    it("the decider cannot start for a pending lead, nor ever", () => {
      refused(ask(person(DECIDER), "project.started", {}, project({ leadState: "pending", goal, baseline })));
      refused(ask(person(DECIDER), "project.started", {}, project({ leadState: "taken", goal, baseline })));
    });
    it("a legacy project needs the baseline only", () => {
      expect(ask(person(LEAD), "project.started", {}, project({ draft: false, baseline }))).toEqual(ok);
      refused(ask(person(LEAD), "project.started", {}, project({ draft: false, baseline: null })));
    });
  });

  describe("set-up edits before the lead takes it", () => {
    const pending = project({ leadState: "pending" });
    it("the decider may set the baseline and the steps; others on no team may not", () => {
      expect(ask(person(DECIDER), "project.baseline", { none: true, why: "Not measurable" }, pending)).toEqual(ok);
      expect(ask(person(DECIDER), "project.step.added", { stepId: "s1", text: "Walk the line" }, pending)).toEqual(ok);
      refused(ask(person(OUTSIDER), "project.baseline", { none: true, why: "x" }, pending));
      refused(ask(person(OUTSIDER), "project.step.added", { stepId: "s1", text: "Walk" }, pending));
      refused(ask(person(DECIDER), "project.baseline", { none: true, why: "x" }, project({ leadState: "taken" })));
    });
    it("steps on a draft: the lead, managers and accepted members", () => {
      expect(ask(person(LEAD), "project.step.added", { stepId: "s1", text: "A" })).toEqual(ok);
      expect(ask(manager, "project.step.added", { stepId: "s1", text: "A" })).toEqual(ok);
      expect(ask(person(MEMBER), "project.step.added", { stepId: "s1", text: "A" })).toEqual(ok);
      refused(ask(person(SPONSOR), "project.step.added", { stepId: "s1", text: "A" }));
      refused(ask(person(OUTSIDER), "project.step.added", { stepId: "s1", text: "A" }));
    });
  });

  describe("a late draft and the seat above", () => {
    const late = project({ escalated: escalation("s_up") });
    it("the seat holder it went to moves the start, a manager may too, others may not", () => {
      expect(ask(person(SEAT_HOLDER), "project.start.moved", { dueDay: 15, why: "Waiting for the line" }, late)).toEqual(ok);
      expect(ask(manager, "project.start.moved", { dueDay: 15, why: "x" }, late)).toEqual(ok);
      refused(ask(person(OTHER_HOLDER), "project.start.moved", { dueDay: 15, why: "x" }, late));
      refused(ask(person(LEAD), "project.start.moved", { dueDay: 15, why: "x" }, late));
      refused(ask(person(SEAT_HOLDER), "project.start.moved", { dueDay: 10, why: "x" }, late));
      refused(ask(person(SEAT_HOLDER), "project.start.moved", { dueDay: 15 }, late));
      refused(ask(person(SEAT_HOLDER), "project.start.moved", { dueDay: 15, why: "x" }, project()));
    });
    it("a non-manager seat holder can keep, hand on and stop; an unrelated holder cannot", () => {
      expect(ask(person(SEAT_HOLDER), "project.start.moved", { dueDay: 12, why: "More time" }, late)).toEqual(ok);
      expect(ask(person(SEAT_HOLDER), "project.handed", { toUserId: "u_new" }, late)).toEqual(ok);
      expect(ask(person(SEAT_HOLDER), "project.stopped", { why: "No longer needed" }, late)).toEqual(ok);
      refused(ask(person(SEAT_HOLDER), "project.stopped", {}, late));
      refused(ask(person(SEAT_HOLDER), "project.handed", {}, late));
      for (const type of ["project.start.moved", "project.handed", "project.stopped"]) {
        refused(ask(person(OTHER_HOLDER), type, { dueDay: 12, why: "x", toUserId: "u_new" }, late));
      }
    });
    it("the former holder is refused after the escalation ends or moves on", () => {
      const ended = project({ escalated: escalation("s_up", false) });
      const moved = project({ escalated: escalation("s_other") });
      for (const p of [ended, moved, project()]) {
        refused(ask(person(SEAT_HOLDER), "project.handed", { toUserId: "u_new" }, p));
        refused(ask(person(SEAT_HOLDER), "project.stopped", { why: "x" }, p));
        refused(ask(person(SEAT_HOLDER), "project.start.moved", { dueDay: 12, why: "x" }, p));
      }
      expect(ask(person(OTHER_HOLDER), "project.stopped", { why: "x" }, moved)).toEqual(ok);
    });
    it("the escalation gives no right on a running project, a legacy project or a start escalation", () => {
      refused(ask(person(SEAT_HOLDER), "project.stopped", { why: "x" }, project({ status: "running", startedDay: 3, escalated: escalation("s_up") })));
      refused(ask(person(SEAT_HOLDER), "project.stopped", { why: "x" }, project({ draft: false, escalated: escalation("s_up") })));
      refused(ask(person(SEAT_HOLDER), "project.stopped", { why: "x" }, project({ escalated: { ...escalation("s_up"), what: "start" } })));
    });
    it("lead rights are unchanged: the lead hands on and stops, a member does not", () => {
      expect(ask(person(LEAD), "project.handed", { toUserId: "u_new" })).toEqual(ok);
      expect(ask(person(LEAD), "project.stopped", { why: "x" })).toEqual(ok);
      refused(ask(person(MEMBER), "project.stopped", { why: "x" }));
    });
  });
});

describe("SET yes payload", () => {
  const kase = { id: "c1", decided: false, status: "open" } as const;
  const decide = (payload: Record<string, unknown>, actor: Actor = manager, projects: ReducedProject[] = []) =>
    mayAppend(actor, { type: "case.decided", target: "c1", payload: { answer: "yes", ...payload } }, { ...state(...projects), cases: [kase] } as unknown as State);
  const yes = { projectId: "p_new", lead: "L. Brandt", leadUserId: "u_lb" };

  it("accepts a yes with draft true and a raiserNote up to 300 characters", () => {
    expect(decide({ ...yes, draft: true, raiserNote: "Thanks, we start next week." })).toEqual(ok);
    expect(decide({ ...yes, draft: true, raiserNote: "n".repeat(300) })).toEqual(ok);
    expect(decide({ ...yes, draft: true })).toEqual(ok);
  });
  it("refuses a note over 300 characters or of the wrong type, and a draft flag that is not a boolean", () => {
    refused(decide({ ...yes, draft: true, raiserNote: "n".repeat(301) }));
    refused(decide({ ...yes, draft: true, raiserNote: 5 }));
    refused(decide({ ...yes, draft: "yes" }));
  });
  it("a draft yes needs its project", () => {
    refused(decide({ draft: true }));
  });
  it("refuses a draft yes that joins a project the decider neither leads nor is on", () => {
    const open = project({ id: "p_open", draft: false });
    const join = { projectId: "p_open", lead: "L. Brandt", draft: true };
    // Only a manager or the desk holder decides at all; the join rule then asks about the project's lead and team.
    refused(decide(join, person(OUTSIDER, "manager"), [open]));
    refused(decide(join, manager, [open]));
    expect(decide(join, person(LEAD, "manager"), [open])).toEqual(ok);
    expect(decide(join, person(MEMBER, "manager"), [open])).toEqual(ok);
    refused(decide(join, person(LEAD, "manager"), [project({ id: "p_open", status: "stopped" })]));
  });
  it("a yes without draft keeps today's rules", () => {
    const open = project({ id: "p_open", draft: false });
    expect(decide({ projectId: "p_open", lead: "L. Brandt" }, person(OUTSIDER, "manager"), [open])).toEqual(ok);
    expect(decide(yes)).toEqual(ok);
    expect(decide({ projectId: "p_new" })).toMatchObject({ ok: false });
    expect(decide({ answer: "no", projectId: "p_new", lead: "x" } as never)).toMatchObject({ ok: false });
  });
});
