// Plan MOV, MOV-U1: what the project page shows of a project that keeps moving, and who may do what about it. The rights are
// the server's own (mayAppendProject); here they are read through moveView for the lead, the sponsor, a member and a manager.
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import type { Actor } from "@/features/cases/permissions";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { moveView } from "@/features/projects/move-view";
import type { ReducedProject, Step } from "@/features/projects/types";

const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes: LOCAL_SEED.routes, promiseDays: PROMISE_DAYS };
let n = 0;
const ev = (type: CaseEventType, day: number, payload: EventPayload): CaseEvent =>
  ({ id: "v" + n++, ts: 0, type, actor: "L. Lead", actorUserId: "u_lead", target: "p_one", payload, day });
const raised: CaseEvent = { id: "r0", ts: 0, type: "case.raised", actor: "R. Raiser", actorUserId: "u_au", target: "c_a", payload: { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" }, day: 0 };
const yes: CaseEvent = { id: "y0", ts: 0, type: "case.decided", actor: "T. Vogel", actorUserId: "u_tv", target: "c_a", payload: { answer: "yes", projectId: "p_one", lead: "L. Lead", leadUserId: "u_lead", title: "Shorter changeover" }, day: 0 };

const step = (id: string, text: string): Step => ({
  id, text, owner: null, dueDay: null, column: "todo", why: "", note: "", addedDay: 0, by: "x", movedDay: 0, startedDay: null, doneDay: null, external: null,
});

const WHO: Record<string, Actor> = {
  lead: { role: "leader", userId: "u_lead", name: "L. Lead", handle: null },
  sponsor: { role: "leader", userId: "u_sp", name: "S. Sponsor", handle: null },
  member: { role: "member", userId: "u_m1", name: "M. Member", handle: null },
  manager: { role: "manager", userId: "u_boss", name: "B. Boss", handle: null },
};

/** A running project, started on day 1, as the demo clock (a check-in every five days) sees it on `day`. */
function running(day: number, setup: (p: ReducedProject) => void = () => {}): { p: ReducedProject; state: State } {
  const history = [raised, yes, ev("project.step.added", 2, { stepId: "a", text: "Order the cart" }), ev("project.step.added", 3, { stepId: "b", text: "Mark the floor" })];
  const state = reduce(SEED, { events: history, day });
  const p = state.projects[0];
  p.status = "running";
  p.startedDay = 1;
  p.doneBy = 31;
  p.leadUserId = "u_lead";
  p.memberUserIds = ["u_m1"];
  p.steps = [step("a", "Order the cart"), step("b", "Mark the floor")];
  setup(p);
  return { p, state };
}
const draftProject = (p: ReducedProject) => { p.draft = true; p.sponsorUserId = "u_sp"; };
const view = (who: keyof typeof WHO, day: number, setup?: (p: ReducedProject) => void) => {
  const { p, state } = running(day, setup);
  return moveView(p, state, WHO[who], day, "en");
};

describe("MOV move view", () => {
  it("gives the done-by date and whether it is late", () => {
    expect(view("lead", 3).doneBy).toBe(31);
    expect(view("lead", 31).doneByLate).toBe(false);
    expect(view("lead", 32).doneByLate).toBe(true);
    // Not on a project that is not running.
    expect(view("lead", 40, (p) => { p.status = "measuring"; }).doneByLate).toBe(false);
  });

  it("lets the lead move the done-by date once, the sponsor and a manager always, a member never", () => {
    expect(view("lead", 3, draftProject).canMoveDoneBy).toBe(true);
    expect(view("sponsor", 3, draftProject).canMoveDoneBy).toBe(true);
    expect(view("manager", 3, draftProject).canMoveDoneBy).toBe(true);
    expect(view("member", 3, draftProject).canMoveDoneBy).toBe(false);
    const once = (p: ReducedProject) => { draftProject(p); p.doneByMoves = [{ day: 2, doneBy: 31, why: "Parts", byUserId: "u_lead", byLead: true }]; };
    expect(view("lead", 3, once).canMoveDoneBy).toBe(false);
    expect(view("sponsor", 3, once).canMoveDoneBy).toBe(true);
    expect(view("manager", 3, once).canMoveDoneBy).toBe(true);
  });

  it("a legacy project has no sponsor: the lead and managers have the rights, nobody else", () => {
    expect(view("lead", 3).canMoveDoneBy).toBe(true);
    expect(view("manager", 3).canMoveDoneBy).toBe(true);
    expect(view("sponsor", 3).canMoveDoneBy).toBe(false);
    expect(view("member", 3).canMoveDoneBy).toBe(false);
  });

  it("lets the lead and a manager pause a running project, and the lead, the sponsor and a manager resume it", () => {
    expect(view("lead", 3, draftProject)).toMatchObject({ paused: null, canPause: true, canResume: false });
    expect(view("manager", 3, draftProject)).toMatchObject({ canPause: true, canResume: false });
    expect(view("sponsor", 3, draftProject)).toMatchObject({ canPause: false, canResume: false });
    expect(view("member", 3, draftProject)).toMatchObject({ canPause: false, canResume: false });
    const paused = (p: ReducedProject) => { draftProject(p); p.pausedUntil = 8; p.pauseWhy = "Shutdown week"; };
    expect(view("lead", 3, paused)).toMatchObject({ paused: { until: 8, why: "Shutdown week" }, canPause: false, canResume: true });
    expect(view("sponsor", 3, paused)).toMatchObject({ paused: { until: 8 }, canPause: false, canResume: true });
    expect(view("member", 3, paused)).toMatchObject({ canResume: false });
    // The pause ends by itself: after its last day the project is not paused.
    expect(view("lead", 9, paused)).toMatchObject({ paused: null, canResume: false });
  });

  it("shows No lead when the lead left, and lets the sponsor or a manager name a new one; a legacy project only a manager", () => {
    const vacated = (p: ReducedProject) => { draftProject(p); p.leadUserId = null; p.leadVacatedDay = 2; };
    expect(view("lead", 3)).toMatchObject({ noLead: false, canNameLead: false });
    expect(view("sponsor", 3, vacated)).toMatchObject({ noLead: true, canNameLead: true });
    expect(view("manager", 3, vacated)).toMatchObject({ noLead: true, canNameLead: true });
    expect(view("member", 3, vacated)).toMatchObject({ noLead: true, canNameLead: false });
    const legacy = (p: ReducedProject) => { p.leadUserId = null; p.leadVacatedDay = 2; };
    expect(view("sponsor", 3, legacy).canNameLead).toBe(false);
    expect(view("manager", 3, legacy).canNameLead).toBe(true);
  });

  it("gives the check-in weekday, and lets only the lead and managers set it", () => {
    expect(view("lead", 3).checkInWeekday).toBe(2); // the weekday of the start on the demo clock: day 1 is a Tuesday
    expect(view("lead", 3, (p) => { p.checkInWeekday = 4; }).checkInWeekday).toBe(4);
    expect(view("lead", 3).canSetHow).toBe(true);
    expect(view("manager", 3).canSetHow).toBe(true);
    expect(view("sponsor", 3, draftProject).canSetHow).toBe(false);
    expect(view("member", 3).canSetHow).toBe(false);
  });

  it("offers the lead the weekly update while it is due, with the draft from the board, and not once it is sent", () => {
    // Started on day 1, a check-in every five days: day 1, 6, 11 ... On day 7 the week of day 6 is due.
    const due = view("lead", 7, (p) => { draftProject(p); p.history = [...p.history, ev("project.step.added", 5, { stepId: "late", text: "x" })]; });
    expect(due.update?.week).toBe(6);
    expect(due.update?.draft).toContain("This week on P-");
    // The draft starts after the previous check-in (day 1): what happened on days 2 to 7.
    expect(due.update?.draft).toContain("Added: Order the cart; Mark the floor");
    const sent = (p: ReducedProject) => { p.latestUpdate = { text: "All well", week: 6, day: 7, byUserId: "u_lead" }; };
    expect(view("lead", 7, sent).update).toBeNull();
    // An update for the earlier week does not stop this week's from being due.
    expect(view("lead", 7, (p) => { p.latestUpdate = { text: "Earlier", week: 1, day: 2, byUserId: "u_lead" }; }).update?.week).toBe(6);
    // The lead, managers and the accepted sponsor send it (the server's rule, AGT D15); nobody else, and nothing before the start or on a project that is not running.
    expect(view("manager", 7).update?.week).toBe(6);
    expect(view("sponsor", 7, draftProject).update?.week).toBe(6);
    expect(view("member", 7).update).toBeNull();
    expect(view("lead", 7, (p) => { p.status = "measuring"; }).update).toBeNull();
    expect(view("lead", 7, (p) => { p.startedDay = null; }).update).toBeNull();
  });

  it("builds the draft in the viewer's language", () => {
    const { p, state } = running(7);
    const de = moveView(p, state, WHO.lead, 7, "de");
    expect(de.update?.draft).toContain("Diese Woche bei P-");
  });
});
