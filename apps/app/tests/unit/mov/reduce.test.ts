// MOV-A1: the project reducer keeps done-by, pause, how we work, the weekly update, a missing lead and the last activity,
// escalates a stalled project and closes a project without a baseline number (plan MOV, D12, D14, D19 to D22, D24).
// Everything is derived from the log: no test reads "today" to get a day.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR, type ClockSpec } from "@/features/clock";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { closingEvent } from "@/features/projects/close";
import { pauseEndedDay } from "@/features/projects/reduce";
import type { ReducedProject } from "@/features/projects/types";

const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 1 },
  { id: "seat_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 2 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner", deputySeatId: "seat_dep", deputyRoleId: "role_deputy" } : x));
const WORKDAYS: ClockSpec = { mode: "workdays", calendar: DEFAULT_CALENDAR };
const seed = (clock?: ClockSpec): ReduceSeed => ({ cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, ...(clock ? { clock } : {}) });

const NAME: Record<string, string> = { u_tv: "T. Vogel", u_lb: "L. Brandt", u_hs: "H. Sander", u_ci: "C. Ilg", u_mr: "M. Roth", u_head: "K. Head", u_new: "N. Neu" };
let n = 0;
/** An event by `by` (default the lead L. Brandt) on project p_one. */
const ev = (type: CaseEventType, target: string | null, payload: EventPayload = {}, day = 0, by: string | null = "u_lb"): CaseEvent =>
  ({ id: "r" + n++, ts: 0, type, actor: by === null ? "system:clock" : NAME[by] ?? by, actorUserId: by, target, payload, day });
const P = (type: CaseEventType, payload: EventPayload = {}, day = 0, by: string | null = "u_lb") => ev(type, "p_one", payload, day, by);

const raised = ev("case.raised", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" }, 0, "u_ci");
/** A legacy yes (no draft): L. Brandt leads. */
const yes = ev("case.decided", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "Changeover" }, 0, "u_tv");
const baseline = P("project.baseline", { metric: "Changeover", unit: "min", value: 42, better: "down", source: "MES" }, 0);
const started = (day = 1) => P("project.started", {}, day);
/** Accepted, baselined and started on day 1. */
const running = (day = 1) => [yes, baseline, started(day)];
const reduced = (events: CaseEvent[], day: number, s: ReduceSeed = seed()): ReducedProject => reduce(s, { events: [raised, ...events], day }).projects[0];
const step = (stepId: string, day: number, owner?: string) => P("project.step.added", { stepId, text: "Step " + stepId, ...(owner ? { owner: NAME[owner], ownerUserId: owner } : {}) }, day);
const stalled = (dueDay: number, day = dueDay, payload: EventPayload = { userId: "u_hs" }) => P("clock.due", { kind: "stalled", dueDay, ...payload }, day, null);

describe("MOV reduce", () => {
  it("doneBy is null before the start, startedDay + 30 after it, legacy projects included", () => {
    expect(reduced([yes, baseline], 3).doneBy).toBeNull();
    expect(reduced(running(1), 3).doneBy).toBe(31);
    expect(reduced(running(7), 60).doneBy).toBe(37);
  });

  it("doneBy is the goal's date when the draft set one, and project.doneby.moved replaces it with byLead", () => {
    const draft = ev("case.decided", "c_a", { answer: "yes", projectId: "p_one", lead: "T. Vogel", leadUserId: "u_tv", title: "Draft", draft: true }, 0, "u_tv");
    const goal = P("project.goal", { goal: "Faster", doneWhen: "Under 30 minutes", doneBy: 50 }, 0, "u_tv");
    const p = reduced([draft, goal, baseline, started(2)], 4);
    expect(p).toMatchObject({ doneBy: 50, doneByMoves: [] });
    const lead = P("project.doneby.moved", { doneBy: 60, why: " supplier late " }, 3, "u_tv");
    const sponsor = P("project.doneby.moved", { doneBy: 70, why: "scope grew" }, 4, "u_hs");
    const moved = reduced([draft, goal, baseline, started(2), lead, sponsor], 5);
    expect(moved.doneBy).toBe(70);
    expect(moved.doneByMoves).toEqual([
      { day: 3, doneBy: 60, why: "supplier late", byUserId: "u_tv", byLead: true },
      { day: 4, doneBy: 70, why: "scope grew", byUserId: "u_hs", byLead: false },
    ]);
  });

  it("doneby.moved needs a whole day on a running, live project", () => {
    for (const bad of [{ doneBy: 12.5, why: "x" }, {}]) expect(reduced([...running(), P("project.doneby.moved", bad, 2)], 3).doneByMoves).toEqual([]);
    expect(reduced([yes, baseline, P("project.doneby.moved", { doneBy: 40, why: "x" }, 1)], 2).doneByMoves).toEqual([]);
    expect(reduced([...running(), P("project.done", {}, 2), P("project.doneby.moved", { doneBy: 40, why: "x" }, 3)], 4).doneByMoves).toEqual([]);
    expect(reduced([...running(), P("project.stopped", { why: "no" }, 2), P("project.doneby.moved", { doneBy: 40, why: "x" }, 3)], 4).doneByMoves).toEqual([]);
  });

  it("a pause, an early resume, and a pause that ended by itself", () => {
    const pause = P("project.paused", { why: " holiday ", untilDay: 20 }, 5);
    expect(reduced([...running(), pause], 6)).toMatchObject({ pausedUntil: 20, pauseWhy: "holiday" });
    // Past its untilDay it ends by itself: the field stays, paused means day <= pausedUntil.
    expect(reduced([...running(), pause], 40)).toMatchObject({ pausedUntil: 20, pauseWhy: "holiday" });
    const resumed = P("project.resumed", {}, 8, "u_hs");
    expect(reduced([...running(), pause, resumed], 9)).toMatchObject({ pausedUntil: null, pauseWhy: "" });
    // A planning project is not paused.
    expect(reduced([yes, baseline, P("project.paused", { why: "x", untilDay: 9 }, 1)], 2).pausedUntil).toBeNull();
  });

  it("how we work: a weekday from 1 to 5 and a note; another weekday changes nothing; allowed on a draft", () => {
    expect(reduced([...running(), P("project.howwework", { checkInWeekday: 3, note: " Short call " }, 2)], 3)).toMatchObject({ checkInWeekday: 3, howWeWorkNote: "Short call" });
    const set = P("project.howwework", { checkInWeekday: 2 }, 2);
    expect(reduced([...running(), set, P("project.howwework", { checkInWeekday: 6, note: "no" }, 3)], 4)).toMatchObject({ checkInWeekday: 2, howWeWorkNote: "" });
    const draft = ev("case.decided", "c_a", { answer: "yes", projectId: "p_one", lead: "T. Vogel", leadUserId: "u_tv", title: "Draft", draft: true }, 0, "u_tv");
    expect(reduced([draft, P("project.howwework", { checkInWeekday: 5 }, 1, "u_tv")], 2)).toMatchObject({ status: "planning", checkInWeekday: 5 });
  });

  it("two updates give the latest; an update before the start is ignored", () => {
    const first = P("project.update", { text: "Week one", week: 5 }, 5);
    const second = P("project.update", { text: " Week two ", week: 10 }, 10);
    expect(reduced([...running(), first, second], 11).latestUpdate).toEqual({ text: "Week two", week: 10, day: 10, byUserId: "u_lb" });
    expect(reduced([yes, baseline, first], 6).latestUpdate).toBeNull();
  });

  it("a vacated lead leaves No lead, the label, the day and the leaver's open steps without an owner", () => {
    const log = [...running(), step("s1", 2, "u_lb"), step("s2", 2, "u_lb"), step("s3", 2, "u_ci"), P("project.step.moved", { stepId: "s2", to: "done" }, 3)];
    const vacated = P("project.lead.vacated", { userId: "u_lb" }, 6, "system:directory");
    const p = reduced([...log, vacated], 7);
    expect(p).toMatchObject({ leadUserId: null, leadVacatedDay: 6, lead: "L. Brandt" });
    const owners = Object.fromEntries(p.steps.map((s) => [s.id, [s.owner, s.ownerUserId]]));
    expect(owners).toEqual({ s1: [null, null], s2: ["L. Brandt", "u_lb"], s3: ["C. Ilg", "u_ci"] });
    // Somebody who does not lead it leaves nothing behind.
    expect(reduced([...log, P("project.lead.vacated", { userId: "u_ci" }, 6, "system:directory")], 7)).toMatchObject({ leadUserId: "u_lb", leadVacatedDay: null });
  });

  it("lead.changed names a new lead only while there is none, takes them off the team and clears the vacancy", () => {
    const vacated = P("project.lead.vacated", { userId: "u_lb" }, 6, "system:directory");
    const team = P("project.member", { userId: "u_new", name: "N. Neu", on: true }, 2);
    const changed = P("project.lead.changed", { to: "N. Neu", toUserId: "u_new", why: "left" }, 8, "u_hs");
    expect(reduced([...running(), team, vacated], 7)).toMatchObject({ memberUserIds: ["u_new"] });
    const p = reduced([...running(), team, vacated, changed], 9);
    expect(p).toMatchObject({ lead: "N. Neu", leadUserId: "u_new", leadVacatedDay: null, memberUserIds: [], members: [] });
    // With a lead in place it is ignored (and stays in the history).
    const refused = reduced([...running(), P("project.lead.changed", { to: "N. Neu", toUserId: "u_new" }, 3, "u_hs")], 4);
    expect(refused).toMatchObject({ lead: "L. Brandt", leadUserId: "u_lb", leadVacatedDay: null });
    expect(refused.history.some((e) => e.type === "project.lead.changed")).toBe(true);
  });

  describe("a member off", () => {
    const draft = ev("case.decided", "c_a", { answer: "yes", projectId: "p_one", lead: "T. Vogel", leadUserId: "u_tv", title: "Draft", draft: true }, 0, "u_tv");
    const setup = [
      draft,
      P("project.invited", { userId: "u_hs", role: "sponsor" }, 1, "u_tv"),
    ];
    const answered = (sponsorInviteId: string) => P("project.invite.answered", { inviteId: sponsorInviteId, userId: "u_hs", take: true }, 1, "u_hs");
    const log = (): CaseEvent[] => [
      ...setup, answered(setup[1].id),
      P("project.invited", { userId: "u_ci", role: "follower" }, 1, "u_tv"),
      P("project.member", { userId: "u_hs", name: "H. Sander", on: true }, 1, "u_tv"),
      P("project.member", { userId: "u_mr", name: "M. Roth", on: true }, 1, "u_tv"),
      step("s1", 2, "u_hs"), step("s2", 2, "u_hs"), step("s3", 2, "u_mr"), P("project.step.moved", { stepId: "s2", to: "done" }, 3),
    ];
    const owners = (p: ReducedProject) => Object.fromEntries(p.steps.map((s) => [s.id, s.ownerUserId]));

    it("with unassign frees the user's open steps and drops them as sponsor and follower", () => {
      const before = reduced(log(), 4);
      expect(before).toMatchObject({ sponsorUserId: "u_hs", followerUserIds: ["u_ci"], memberUserIds: ["u_hs", "u_mr"] });
      const p = reduced([...log(), P("project.member", { userId: "u_hs", name: "H. Sander", on: false, unassign: true }, 4, "system:directory")], 5);
      expect(p).toMatchObject({ sponsorUserId: null, memberUserIds: ["u_mr"], followerUserIds: ["u_ci"] });
      expect(owners(p)).toEqual({ s1: null, s2: "u_hs", s3: "u_mr" });
      const f = reduced([...log(), P("project.member", { userId: "u_ci", on: false, unassign: true }, 4, "system:directory")], 5);
      expect(f.followerUserIds).toEqual([]);
    });

    it("without unassign it changes the team and nothing else, as before", () => {
      const p = reduced([...log(), P("project.member", { userId: "u_hs", name: "H. Sander", on: false }, 4, "u_tv")], 5);
      expect(p).toMatchObject({ sponsorUserId: "u_hs", followerUserIds: ["u_ci"], memberUserIds: ["u_mr"] });
      expect(owners(p)).toEqual({ s1: "u_hs", s2: "u_hs", s3: "u_mr" });
    });
  });

  it("lastActivityDay is the latest of the start and the days the project moved", () => {
    expect(reduced([yes, baseline], 3).lastActivityDay).toBeNull();
    expect(reduced(running(2), 9).lastActivityDay).toBe(2);
    const log = [...running(2), step("s1", 4), P("project.step.moved", { stepId: "s1", to: "doing" }, 6), P("project.step.edited", { stepId: "s1", text: "Renamed" }, 8)];
    expect(reduced(log, 40).lastActivityDay).toBe(8);
    // Updates, a resume, a hand-over and a new lead count; comments, how we work and a done-by move do not.
    expect(reduced([...log, P("project.commented", { text: "hi" }, 9), P("project.howwework", { checkInWeekday: 2 }, 10), P("project.doneby.moved", { doneBy: 90, why: "x" }, 11)], 40).lastActivityDay).toBe(8);
    expect(reduced([...log, P("project.update", { text: "ok", week: 9 }, 12)], 40).lastActivityDay).toBe(12);
    expect(reduced([...log, P("project.paused", { why: "x", untilDay: 14 }, 10), P("project.resumed", {}, 13)], 40).lastActivityDay).toBe(13);
    expect(reduced([...log, P("project.handed", { to: "H. Sander", toUserId: "u_hs" }, 14, "u_tv")], 40).lastActivityDay).toBe(14);
  });

  describe("a stalled fact", () => {
    const s = seed(WORKDAYS);
    const base = [...running(), step("s1", 2)];

    it("shows the project escalated with what stalled and the person it went to", () => {
      const p = reduced([...base, stalled(14, 15)], 15, s);
      expect(p.escalated).toEqual({ to: "", toSeatId: null, toRoleId: null, toUserId: "u_hs", from: "L. Brandt", day: 14, live: true, what: "stalled" });
      // A fact for a seat names its holder; the same fact replayed on a later day is the same escalation.
      const seat = reduced([...base, stalled(14, 15, { toRoleHolderId: "seat_tv" })], 15, s).escalated;
      expect(seat).toMatchObject({ to: "T. Vogel", toSeatId: "seat_tv", toRoleId: "role_owner", toUserId: null, what: "stalled" });
      for (const day of [15, 30, 200]) expect(reduced([...base, stalled(14, 15)], day, s).escalated).toEqual(p.escalated);
    });

    it("needs the workdays clock and a running project", () => {
      expect(reduced([...base, stalled(14, 15)], 15).escalated).toBeNull();
      expect(reduced([...base, stalled(14, 15), P("project.done", {}, 16)], 17, s).escalated).toBeNull();
      expect(reduced([...base, stalled(14, 15), P("project.stopped", { why: "no" }, 16)], 17, s).escalated).toBeNull();
    });

    it("is gone after activity, a new done-by date, a pause or a new lead, and comes back with the next fact", () => {
      const fact = stalled(14, 15);
      const enders = [
        P("project.step.moved", { stepId: "s1", to: "doing" }, 16),
        P("project.step.added", { stepId: "s9", text: "More" }, 16),
        P("project.update", { text: "Still here", week: 15 }, 16),
        P("project.doneby.moved", { doneBy: 90, why: "later" }, 16, "u_hs"),
        P("project.paused", { why: "holiday", untilDay: 25 }, 16),
        P("project.handed", { to: "H. Sander", toUserId: "u_hs" }, 16, "u_tv"),
      ];
      for (const e of enders) {
        expect(reduced([...base, fact, e], 17, s).escalated, e.type).toBeNull();
        expect(reduced([...base, fact, e, stalled(30, 31)], 31, s).escalated, e.type).toMatchObject({ what: "stalled", day: 30 });
      }
      // Notes and how we work are no movement.
      expect(reduced([...base, fact, P("project.commented", { text: "hm" }, 16), P("project.howwework", { checkInWeekday: 4 }, 16)], 17, s).escalated).toMatchObject({ what: "stalled" });
    });

    it("follows the order of the log on the same day: activity then fact stands, fact then activity clears it", () => {
      const move = P("project.step.moved", { stepId: "s1", to: "doing" }, 15);
      expect(reduced([...base, move, stalled(14, 15)], 15, s).escalated).toMatchObject({ what: "stalled" });
      expect(reduced([...base, stalled(14, 15), move], 15, s).escalated).toBeNull();
    });

    it("an early resume ends the pause and counts as activity, so a standing fact is gone and a later one stands", () => {
      const pause = P("project.paused", { why: "holiday", untilDay: 25 }, 16);
      const resume = P("project.resumed", {}, 18, "u_hs");
      expect(reduced([...base, stalled(14, 15), pause, resume], 19, s)).toMatchObject({ pausedUntil: null, escalated: null, lastActivityDay: 18 });
      expect(reduced([...base, stalled(14, 15), pause, resume, stalled(24, 25)], 25, s).escalated).toMatchObject({ what: "stalled", day: 24 });
    });
  });

  it("pauseEndedDay reads the end of the latest pause off the history: its untilDay, or the early resume", () => {
    const events = (...e: CaseEvent[]) => reduced([...running(), ...e], 100).history;
    expect(pauseEndedDay(events())).toBeNull();
    expect(pauseEndedDay(events(P("project.paused", { why: "x", untilDay: 20 }, 5)))).toBe(20);
    expect(pauseEndedDay(events(P("project.paused", { why: "x", untilDay: 20 }, 5), P("project.resumed", {}, 8)))).toBe(8);
    // A pause that ended by itself keeps its end when a later pause is recorded, and a late resume does not move it.
    expect(pauseEndedDay(events(P("project.paused", { why: "x", untilDay: 20 }, 5), P("project.resumed", {}, 30)))).toBe(20);
    const second = P("project.paused", { why: "y", untilDay: 45 }, 40);
    expect(pauseEndedDay(events(P("project.paused", { why: "x", untilDay: 20 }, 5), second))).toBe(45);
    expect(pauseEndedDay(events(P("project.paused", { why: "x", untilDay: 20 }, 5), second, P("project.resumed", {}, 41)))).toBe(41);
  });

  it("a project done without a baseline number closes, also under a reward rule, and the done event closes it", () => {
    const log = [yes, P("project.baseline", { none: true, why: "Safety, no metric" }, 0), started(1), P("project.done", {}, 3)];
    const withReward: ReduceSeed = { ...seed(), loop: { reward: { kind: "thanks", amount: null, sharePct: null, capEur: null } } };
    const S = reduce(withReward, { events: [raised, ...log], day: 3 });
    const p = S.projects[0];
    expect(p).toMatchObject({ status: "measured", verdict: "not measured", checks: [], rewardDue: false, closed: true });
    expect(closingEvent(p, S.rules)?.type).toBe("project.done");
  });
});

describe("MOV handover", () => {
  it("MOV handover: ReducedProject.doneBy is the goal's date or the start plus 30, then the latest move", () => {
    expect(reduced(running(4), 5).doneBy).toBe(34);
    expect(reduced([...running(4), P("project.doneby.moved", { doneBy: 44, why: "later" }, 6)], 7).doneBy).toBe(44);
  });

  it("MOV handover: ReducedProject.lastActivityDay is the day the project last moved", () => {
    expect(reduced([...running(4), step("s1", 9)], 20).lastActivityDay).toBe(9);
  });

  it("MOV handover: project.update is ReducedProject.latestUpdate with its text, week, day and writer", () => {
    expect(reduced([...running(), P("project.update", { text: "On track", week: 6 }, 6)], 7).latestUpdate).toEqual({ text: "On track", week: 6, day: 6, byUserId: "u_lb" });
  });

  it("MOV handover: project.paused sets pausedUntil and pauseWhy, and project.resumed clears them", () => {
    const paused = reduced([...running(), P("project.paused", { why: "Plant shutdown", untilDay: 12 }, 4)], 5);
    expect([paused.pausedUntil, paused.pauseWhy]).toEqual([12, "Plant shutdown"]);
    const resumed = reduced([...running(), P("project.paused", { why: "Plant shutdown", untilDay: 12 }, 4), P("project.resumed", {}, 6)], 7);
    expect([resumed.pausedUntil, resumed.pauseWhy]).toEqual([null, ""]);
  });
});
