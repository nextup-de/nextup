// MOV-D1: the clock of a project that keeps moving (D11, D12, D14, D17, D18, D20, D21, D26, D27, D29). Pure: state and today in, facts out.
// The project is the real reducer's (opened by a yes), then the values the MOV reducer will set are written on it, so these tests
// do not wait for MOV-A1.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR, DEMO_CLOCK, type ClockSpec } from "@/features/clock";
import { DUE_KINDS, dueNow, type Due, type DueKind, type SeatAbove } from "@/features/clock/due";
import { BLOCKED_DAYS_DEFAULT, hasProjectFact, projectDues, projectIdemKey, QUIET_DAYS, STALLED_DAYS, UPDATE_REMIND_DAYS, VACANT_DAYS } from "@/features/clock/kinds/project";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { checkInDayOf } from "@/features/projects/rhythm";
import type { ReducedProject, Step } from "@/features/projects/types";
import { clockDuePayload } from "@/server/scheduler/writers/shared";
import { writeProjectDue } from "@/server/scheduler/writers/project";

const WORKDAYS: ClockSpec = { mode: "workdays", calendar: DEFAULT_CALENDAR };
const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_lb", roleId: "role_lead", label: "L. Brandt", userId: "u_lb", sort: 1 },
  { id: "seat_hs", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 2 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner", deputySeatId: "seat_hs", deputyRoleId: "role_deputy" } : x));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, clock: WORKDAYS };
// The seat above the owner's desk is the boss's: not the desk's own seat, so a test can tell the two recipients apart.
const above: SeatAbove = (roleId) => (roleId === "role_owner" ? "seat_boss" : null);

let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "k" + n++, ts: 0, type, actor, actorUserId: actor === "system:clock" ? null : "u_lb", target, payload, day });
const raised = ev("case.raised", "J. Schmidt", "c_a", { kind: "idea", title: "Idea", routeId: "r1", assignee: "T. Vogel" });
const yes = ev("case.decided", "T. Vogel", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "P" });
const fact = (payload: EventPayload, id?: string): CaseEvent => ({ ...ev("clock.due", "system:clock", "p_one", payload), ...(id ? { id } : {}) });

const step = (id: string, patch: Partial<Step> = {}): Step =>
  ({ id, text: id, owner: null, ownerUserId: null, dueDay: null, column: "doing", why: "", note: "", addedDay: 1, by: "L. Brandt", movedDay: 1, startedDay: 1, doneDay: null, external: null, ...patch });

/** A started project of the real reducer (legacy: no draft), then the values a test needs set on it. Started on day 10, last active on day 20. */
function running(patch: Partial<ReducedProject> = {}, extra: CaseEvent[] = [], rules: Partial<State["rules"]> = {}): State {
  const s = reduce(SEED, { events: [raised, yes], day: 0 });
  s.rules = { ...s.rules, ...rules };
  const p = s.projects[0];
  Object.assign(p, { status: "running", startedDay: 10, lastActivityDay: 20, doneBy: 200, ...patch });
  p.history.push(...extra);
  return s;
}
const of = (s: State, today: number, ...kinds: DueKind[]): Due[] => dueNow(s, today, above).filter((d) => kinds.includes(d.kind));
const brief = (xs: Due[]) => xs.map(({ kind, dueDay, check, userId, stepId, toRoleHolderId }) => ({ kind, dueDay, ...(check === undefined ? {} : { check }), ...(stepId ? { stepId } : {}), ...(userId ? { userId } : {}), ...(toRoleHolderId ? { toRoleHolderId } : {}) }));
const MOV: DueKind[] = ["late", "blocked", "quiet", "stalled", "update", "vacant"];

describe("MOV clock", () => {
  it("a late step reminds its owner the working day after, then the lead 2 working days later, each once", () => {
    const s = running({ steps: [step("s1", { dueDay: 30, ownerUserId: "u_hs" })] });
    expect(of(s, 30, "late")).toEqual([]);
    expect(brief(of(s, 31, "late"))).toEqual([{ kind: "late", dueDay: 30, stepId: "s1", userId: "u_hs" }]);
    expect(brief(of(s, 33, "late"))).toEqual([
      { kind: "late", dueDay: 30, stepId: "s1", userId: "u_hs" },
      { kind: "late", dueDay: 30, check: 2, stepId: "s1", userId: "u_lb" },
    ]);
    const stored = running({ steps: [step("s1", { dueDay: 30, ownerUserId: "u_hs" })] }, [fact({ kind: "late", dueDay: 30, stepId: "s1", userId: "u_hs" }), fact({ kind: "late", dueDay: 30, check: 2, stepId: "s1", userId: "u_lb" })]);
    expect(of(stored, 40, "late")).toEqual([]);
    // the first fact does not hide the second one, and the second does not hide the first
    const onlyFirst = running({ steps: [step("s1", { dueDay: 30, ownerUserId: "u_hs" })] }, [fact({ kind: "late", dueDay: 30, stepId: "s1", userId: "u_hs" })]);
    expect(brief(of(onlyFirst, 40, "late"))).toEqual([{ kind: "late", dueDay: 30, check: 2, stepId: "s1", userId: "u_lb" }]);
    expect(of(s, 31, "late")[0].idemKey).toBe("clk:late:p_one:30:s1");
    expect(of(s, 33, "late")[1].idemKey).toBe("clk:late:p_one:30:2:s1");
  });

  it("a step without an owner reminds the lead only, and one the lead owns gets one fact", () => {
    const noOwner = running({ steps: [step("s1", { dueDay: 30 })] });
    expect(brief(of(noOwner, 40, "late"))).toEqual([{ kind: "late", dueDay: 30, stepId: "s1", userId: "u_lb" }]);
    const leadOwns = running({ steps: [step("s1", { dueDay: 30, ownerUserId: "u_lb" })] });
    expect(brief(of(leadOwns, 40, "late"))).toEqual([{ kind: "late", dueDay: 30, stepId: "s1", userId: "u_lb" }]);
  });

  it("a done step, a step without a due day and a new due day: nothing, nothing, a new pair", () => {
    expect(of(running({ steps: [step("s1", { dueDay: 30, column: "done" }), step("s2")] }), 50, "late")).toEqual([]);
    const moved = running({ steps: [step("s1", { dueDay: 45, ownerUserId: "u_hs" })] }, [fact({ kind: "late", dueDay: 30, stepId: "s1", userId: "u_hs" })]);
    expect(brief(of(moved, 46, "late"))).toEqual([{ kind: "late", dueDay: 45, stepId: "s1", userId: "u_hs" }]);
  });

  it("nothing before movSinceDay: a step due before it, a block, a quiet day, a check-in, a vacancy", () => {
    const s = running({
      steps: [step("s1", { dueDay: 30, ownerUserId: "u_hs" }), step("s2", { column: "blocked", movedDay: 28 })],
      leadVacatedDay: 25, leadUserId: null, lastActivityDay: 20, doneBy: 40,
    }, [], { movSinceDay: 60 });
    expect(of(s, 59, ...MOV)).toEqual([]);
    // a step due on the release day itself counts
    const on = running({ steps: [step("s1", { dueDay: 60, ownerUserId: "u_hs" })] }, [], { movSinceDay: 60 });
    expect(brief(of(on, 61, "late"))).toEqual([{ kind: "late", dueDay: 60, stepId: "s1", userId: "u_hs" }]);
  });

  it("a blocked step tells the lead after blocked_days, counted from the release day when the block is older, once per block", () => {
    const s = running({ steps: [step("s1", { column: "blocked", movedDay: 30, why: "waiting for parts" })] });
    expect(of(s, 30 + BLOCKED_DAYS_DEFAULT - 1, "blocked")).toEqual([]);
    expect(brief(of(s, 30 + BLOCKED_DAYS_DEFAULT, "blocked"))).toEqual([{ kind: "blocked", dueDay: 33, stepId: "s1", userId: "u_lb" }]);
    expect(of(running({ steps: [step("s1", { column: "blocked", movedDay: 30 })] }, [], { blockedDays: 5 }), 34, "blocked")).toEqual([]);
    expect(of(running({ steps: [step("s1", { column: "blocked", movedDay: 30 })] }, [], { blockedDays: 5 }), 35, "blocked")).toHaveLength(1);
    // blocked from before the release day: the count starts there
    const old = running({ steps: [step("s1", { column: "blocked", movedDay: 20 })] }, [], { movSinceDay: 50 });
    expect(of(old, 52, "blocked")).toEqual([]);
    expect(brief(of(old, 53, "blocked"))).toEqual([{ kind: "blocked", dueDay: 53, stepId: "s1", userId: "u_lb" }]);
    // stored: once
    const move = ev("project.step.moved", "L. Brandt", "p_one", { stepId: "s1", to: "blocked", why: "x" }, 30);
    const due = of(running({ steps: [step("s1", { column: "blocked", movedDay: 30 })] }, [move]), 40, "blocked")[0];
    expect(due.originEventId).toBe(move.id);
    const stored = running({ steps: [step("s1", { column: "blocked", movedDay: 30 })] }, [move, fact({ kind: "blocked", dueDay: 33, stepId: "s1", userId: "u_lb", originEventId: move.id })]);
    expect(of(stored, 40, "blocked")).toEqual([]);
  });

  it("a step blocked, unblocked and blocked again on one day is a new block with its own fact", () => {
    const first = ev("project.step.moved", "L. Brandt", "p_one", { stepId: "s1", to: "blocked", why: "a" }, 30);
    const back = ev("project.step.moved", "L. Brandt", "p_one", { stepId: "s1", to: "doing" }, 30);
    const again = ev("project.step.moved", "L. Brandt", "p_one", { stepId: "s1", to: "blocked", why: "b" }, 30);
    const s = running({ steps: [step("s1", { column: "blocked", movedDay: 30 })] }, [first, back, fact({ kind: "blocked", dueDay: 33, stepId: "s1", userId: "u_lb", originEventId: first.id }), again]);
    const due = of(s, 33, "blocked");
    expect(brief(due)).toEqual([{ kind: "blocked", dueDay: 33, stepId: "s1", userId: "u_lb" }]);
    expect(due[0].originEventId).toBe(again.id);
    expect(due[0].idemKey).toBe(`clk:blocked:p_one:33:s1:${again.id}`);
    expect(due[0].idemKey).not.toBe(projectIdemKey("blocked", "p_one", 33, undefined, "s1", first.id));
  });

  it("quiet comes to the lead 5 working days after the last activity, and past the done-by date, each once", () => {
    const s = running({ lastActivityDay: 20, doneBy: 200 });
    expect(of(s, 20 + QUIET_DAYS - 1, "quiet")).toEqual([]);
    expect(brief(of(s, 25, "quiet"))).toEqual([{ kind: "quiet", dueDay: 25, userId: "u_lb" }]);
    expect(of(s, 25, "quiet")[0].idemKey).toBe("clk:quiet:p_one:25");
    expect(of(running({ lastActivityDay: 20 }, [fact({ kind: "quiet", dueDay: 25, userId: "u_lb" })]), 60, "quiet")).toEqual([]);
    // past the done-by date, though the team is busy
    const busy = running({ lastActivityDay: 49, doneBy: 50 });
    expect(of(busy, 50, "quiet")).toEqual([]);
    expect(brief(of(busy, 51, "quiet"))).toEqual([{ kind: "quiet", dueDay: 51, userId: "u_lb" }]);
    // a done-by date before the release day is not judged
    expect(of(running({ lastActivityDay: 49, doneBy: 50 }, [], { movSinceDay: 55 }), 70, "quiet").every((d) => d.dueDay !== 51)).toBe(true);
  });

  it("quiet counts from the day a pause ended: the resume day on an early resume, the day after on a pause that ran out", () => {
    // paused until day 30; nobody resumed: the day after is the base
    const ran = running({ lastActivityDay: 15, pausedUntil: 30 });
    expect(of(ran, 30 + QUIET_DAYS, "quiet")).toEqual([]);
    expect(of(ran, 30, "quiet")).toEqual([]);
    expect(brief(of(ran, 31 + QUIET_DAYS, "quiet"))).toEqual([{ kind: "quiet", dueDay: 36, userId: "u_lb" }]);
    // resumed on day 22, a week before the pause would have run out: the resume is an activity, and the pause no longer holds
    const early = running({ lastActivityDay: 22, pausedUntil: null });
    expect(of(early, 26, "quiet")).toEqual([]);
    expect(brief(of(early, 27, "quiet"))).toEqual([{ kind: "quiet", dueDay: 27, userId: "u_lb" }]);
    // a pause and activity on the same day: the later of the two
    const same = running({ lastActivityDay: 31, pausedUntil: 30 });
    expect(brief(of(same, 36, "quiet"))).toEqual([{ kind: "quiet", dueDay: 36, userId: "u_lb" }]);
  });

  it("stalled goes to the sponsor 3 working days after the quiet fact, once", () => {
    const quiet = fact({ kind: "quiet", dueDay: 25, userId: "u_lb" });
    const s = running({ lastActivityDay: 20, sponsorUserId: "u_hs" }, [quiet]);
    expect(of(s, 25 + STALLED_DAYS - 1, "stalled")).toEqual([]);
    expect(brief(of(s, 28, "stalled"))).toEqual([{ kind: "stalled", dueDay: 28, userId: "u_hs" }]);
    expect(of(s, 28, "stalled")[0].idemKey).toBe("clk:stalled:p_one:28");
    expect(of(running({ lastActivityDay: 20, sponsorUserId: "u_hs" }, [quiet, fact({ kind: "stalled", dueDay: 28, userId: "u_hs" })]), 60, "stalled")).toEqual([]);
    // no quiet fact written yet: nothing to escalate
    expect(of(running({ lastActivityDay: 20, sponsorUserId: "u_hs" }), 28, "stalled")).toEqual([]);
  });

  it("a legacy project, or one whose sponsor is the lead, stalls to the route owner's seat; the deputy's when the lead holds the owner role", () => {
    const quiet = fact({ kind: "quiet", dueDay: 25, userId: "u_lb" });
    expect(brief(of(running({ lastActivityDay: 20 }, [quiet]), 28, "stalled"))).toEqual([{ kind: "stalled", dueDay: 28, toRoleHolderId: "seat_tv" }]);
    expect(brief(of(running({ lastActivityDay: 20, sponsorUserId: "u_lb" }, [quiet]), 28, "stalled"))).toEqual([{ kind: "stalled", dueDay: 28, toRoleHolderId: "seat_tv" }]);
    const ownerLeads = running({ lastActivityDay: 20, leadUserId: "u_tv" }, [fact({ kind: "quiet", dueDay: 25, userId: "u_tv" })]);
    expect(brief(of(ownerLeads, 28, "stalled"))).toEqual([{ kind: "stalled", dueDay: 28, toRoleHolderId: "seat_hs" }]);
  });

  it("nothing stalls when the lead acted after the quiet day, moved the done-by date, or a pause ended after it", () => {
    const quiet = fact({ kind: "quiet", dueDay: 25, userId: "u_lb" });
    expect(of(running({ lastActivityDay: 26, sponsorUserId: "u_hs" }, [quiet]), 28, "stalled")).toEqual([]);
    const moved = running({ lastActivityDay: 20, sponsorUserId: "u_hs", doneByMoves: [{ day: 26, doneBy: 220, why: "x", byUserId: "u_lb", byLead: true }] }, [quiet]);
    expect(of(moved, 28, "stalled")).toEqual([]);
    expect(of(running({ lastActivityDay: 20, sponsorUserId: "u_hs", pausedUntil: 27 }, [quiet]), 28, "stalled")).toEqual([]);
  });

  it("a paused project gets none of late, blocked, quiet and stalled, but its update still comes", () => {
    const quiet = fact({ kind: "quiet", dueDay: 25, userId: "u_lb" });
    const s = running({ steps: [step("s1", { dueDay: 30, ownerUserId: "u_hs" }), step("s2", { column: "blocked", movedDay: 30 })], sponsorUserId: "u_hs", pausedUntil: 60 }, [quiet]);
    expect(of(s, 50, "late", "blocked", "quiet", "stalled")).toEqual([]);
    const c = checkInDayOf(s.projects[0], 50, WORKDAYS)!;
    expect(brief(of(s, c + UPDATE_REMIND_DAYS, "update")).filter((d) => d.dueDay === c + UPDATE_REMIND_DAYS)).toEqual([{ kind: "update", dueDay: c + UPDATE_REMIND_DAYS, userId: "u_lb" }]);
    // the pause's last day is still paused; the day after, the facts are back
    expect(of(s, 60, "late")).toEqual([]);
    expect(of(running({ steps: [step("s1", { dueDay: 30, ownerUserId: "u_hs" })], pausedUntil: 60 }), 61, "late")).toHaveLength(2);
  });

  it("an update comes 2 working days after the check-in day, to the lead, once, and not for a week that has one", () => {
    const s = running({ startedDay: 20, lastActivityDay: 20 });
    const p = s.projects[0];
    const c = checkInDayOf(p, 20, WORKDAYS)!;
    expect(c).toBe(20);
    expect(of(s, c + UPDATE_REMIND_DAYS - 1, "update")).toEqual([]);
    const due = of(s, c + UPDATE_REMIND_DAYS, "update");
    expect(brief(due)).toEqual([{ kind: "update", dueDay: 22, userId: "u_lb" }]);
    expect(due[0].idemKey).toBe("clk:update:p_one:22");
    expect(of(running({ startedDay: 20, lastActivityDay: 20, latestUpdate: { text: "t", week: 20, day: 21, byUserId: "u_lb" } }), 22, "update")).toEqual([]);
    expect(of(running({ startedDay: 20, lastActivityDay: 20 }, [fact({ kind: "update", dueDay: 22, userId: "u_lb" })]), 22, "update")).toEqual([]);
    // a project nobody started has no check-in
    expect(of(running({ startedDay: null, status: "planning" }), 40, "update")).toEqual([]);
    // before the release day
    expect(of(running({ startedDay: 20, lastActivityDay: 20 }, [], { movSinceDay: 21 }), 22, "update")).toEqual([]);
  });

  it("a check-in near the end of the week still gets its reminder when the 2 days run into the next week", () => {
    const s = running({ startedDay: 20, lastActivityDay: 20, checkInWeekday: 5 });
    const p = s.projects[0];
    // a Friday check-in: 2 working days later is already the next week, whose own check-in day is another one
    const friday = [...Array(30).keys()].map((i) => 21 + i).find((d) => checkInDayOf(p, d, WORKDAYS) === d && checkInDayOf(p, d + UPDATE_REMIND_DAYS, WORKDAYS) !== d)!;
    expect(friday).toBeDefined();
    expect(brief(of(s, friday + UPDATE_REMIND_DAYS, "update")).map((d) => d.dueDay)).toContain(friday + UPDATE_REMIND_DAYS);
    const sent = running({ startedDay: 20, lastActivityDay: 20, checkInWeekday: 5, latestUpdate: { text: "t", week: friday, day: friday, byUserId: "u_lb" } });
    expect(of(sent, friday + UPDATE_REMIND_DAYS, "update").map((d) => d.dueDay)).not.toContain(friday + UPDATE_REMIND_DAYS);
  });

  it("a vacated lead: vacant after 5 working days to the desk with a sponsor and to the seat above it without one", () => {
    const vacated = ev("project.lead.vacated", "system:directory", "p_one", { userId: "u_lb" }, 30);
    const withSponsor = running({ leadUserId: null, leadVacatedDay: 30, sponsorUserId: "u_hs" }, [vacated]);
    expect(of(withSponsor, 30 + VACANT_DAYS - 1, "vacant")).toEqual([]);
    const due = of(withSponsor, 35, "vacant");
    expect(brief(due)).toEqual([{ kind: "vacant", dueDay: 35, toRoleHolderId: "seat_tv" }]);
    expect(due[0].originEventId).toBe(vacated.id);
    expect(due[0].idemKey).toBe(`clk:vacant:p_one:35:${vacated.id}`);
    const without = running({ leadUserId: null, leadVacatedDay: 30 }, [vacated]);
    expect(brief(of(without, 35, "vacant"))).toEqual([{ kind: "vacant", dueDay: 35, toRoleHolderId: "seat_boss" }]);
    // once
    const stored = running({ leadUserId: null, leadVacatedDay: 30, sponsorUserId: "u_hs" }, [vacated, fact({ kind: "vacant", dueDay: 35, toRoleHolderId: "seat_tv", originEventId: vacated.id })]);
    expect(of(stored, 60, "vacant")).toEqual([]);
    // a planning project and a draft have a vacancy too; a stopped one does not
    expect(of(running({ status: "planning", startedDay: null, leadUserId: null, leadVacatedDay: 30 }, [vacated]), 35, "vacant")).toHaveLength(1);
    expect(of(running({ status: "stopped", leadUserId: null, leadVacatedDay: 30 }, [vacated]), 35, "vacant")).toEqual([]);
    expect(of(running({ leadUserId: null, leadVacatedDay: 30 }, [vacated], { movSinceDay: 31 }), 40, "vacant")).toEqual([]);
  });

  it("a vacancy twice is two facts, one per vacated event, even on one day", () => {
    const one = ev("project.lead.vacated", "system:directory", "p_one", { userId: "u_lb" }, 30);
    const two = ev("project.lead.vacated", "system:directory", "p_one", { userId: "u_hs" }, 30);
    const s = running({ leadUserId: null, leadVacatedDay: 30 }, [one, fact({ kind: "vacant", dueDay: 35, toRoleHolderId: "seat_boss", originEventId: one.id }), two]);
    const due = of(s, 35, "vacant");
    expect(due).toHaveLength(1);
    expect(due[0].originEventId).toBe(two.id);
  });

  it("a vacancy with nobody to tell is still a fact, without a seat; a desk assigned later gets the routed one too", () => {
    const vacated = ev("project.lead.vacated", "system:directory", "p_one", { userId: "u_lb" }, 30);
    const orphan = running({ leadUserId: null, leadVacatedDay: 30, routeId: null }, [vacated]);
    const due = of(orphan, 35, "vacant");
    expect(due).toHaveLength(1);
    expect(due[0].toRoleHolderId).toBeNull();
    expect(due[0].idemKey).toBe(`clk:vacant:p_one:35:${vacated.id}:unrouted`);
    expect(writeProjectDue(due[0], { state: orphan, today: 35, companyId: "co" })).toBeNull();
    // stored without a seat: not again
    const stored = running({ leadUserId: null, leadVacatedDay: 30, routeId: null }, [vacated, fact({ kind: "vacant", dueDay: 35, toRoleHolderId: null, originEventId: vacated.id })]);
    expect(of(stored, 50, "vacant")).toEqual([]);
    // the project got its route: the routed fact follows
    const routed = running({ leadUserId: null, leadVacatedDay: 30, sponsorUserId: "u_hs" }, [vacated, fact({ kind: "vacant", dueDay: 35, toRoleHolderId: null, originEventId: vacated.id })]);
    expect(brief(of(routed, 50, "vacant"))).toEqual([{ kind: "vacant", dueDay: 35, toRoleHolderId: "seat_tv" }]);
  });

  it("while there is no lead only the owner's late reminder fires; nothing else goes to the lead", () => {
    const s = running({
      leadUserId: null, leadVacatedDay: 30, lastActivityDay: 20, startedDay: 10,
      steps: [step("s1", { dueDay: 31, ownerUserId: "u_hs" }), step("s2", { dueDay: 31 }), step("s3", { column: "blocked", movedDay: 31 })],
    }, [fact({ kind: "quiet", dueDay: 25, userId: "u_lb" })]);
    expect(brief(of(s, 60, "late"))).toEqual([{ kind: "late", dueDay: 31, stepId: "s1", userId: "u_hs" }]);
    expect(of(s, 60, "blocked", "quiet", "stalled", "update")).toEqual([]);
  });

  it("the demo clock fires none of it, and only a running project is looked at", () => {
    const s = running({ steps: [step("s1", { dueDay: 30, ownerUserId: "u_hs" })], lastActivityDay: 20 });
    s.clock = DEMO_CLOCK;
    expect(dueNow(s, 80, above)).toEqual([]);
    for (const status of ["planning", "measuring", "measured", "recognised", "stopped"] as const) {
      expect(of(running({ status, steps: [step("s1", { dueDay: 30, ownerUserId: "u_hs" })] }), 80, "late", "blocked", "quiet", "stalled", "update"), status).toEqual([]);
    }
  });

  it("hasProjectFact matches exactly the check, step and origin event it is given", () => {
    const history = [fact({ kind: "late", dueDay: 30, stepId: "s1" }), fact({ kind: "late", dueDay: 30, check: 2, stepId: "s1" }), fact({ kind: "blocked", dueDay: 33, stepId: "s1", originEventId: "e1" })];
    const p = { history };
    expect(hasProjectFact(p, "late", 30, undefined, "s1")).toBe(true);
    expect(hasProjectFact(p, "late", 30, 2, "s1")).toBe(true);
    expect(hasProjectFact(p, "late", 30, undefined, "s2")).toBe(false);
    expect(hasProjectFact(p, "late", 31, undefined, "s1")).toBe(false);
    expect(hasProjectFact(p, "blocked", 33, undefined, "s1", "e1")).toBe(true);
    expect(hasProjectFact(p, "blocked", 33, undefined, "s1", "e2")).toBe(false);
    expect(hasProjectFact(p, "blocked", 33, undefined, "s1")).toBe(false);
    expect(projectIdemKey("late", "p", 3)).toBe("clk:late:p:3");
    expect(projectIdemKey("late", "p", 3, 2, "s1", "e1")).toBe("clk:late:p:3:2:s1:e1");
  });
});

describe("MOV handover", () => {
  it("MOV handover: clock.due quiet and stalled are Due kinds the scheduler stores as plain facts, with their payload", () => {
    expect(DUE_KINDS).toEqual(expect.arrayContaining(["late", "blocked", "quiet", "stalled", "update", "vacant"]));
    const quiet = of(running({ lastActivityDay: 20 }), 25, "quiet")[0];
    expect(writeProjectDue(quiet, { state: running(), today: 25, companyId: "co" })).toBeNull();
    expect(clockDuePayload(quiet)).toEqual({ kind: "quiet", dueDay: 25, userId: "u_lb" });
    const stalled = of(running({ lastActivityDay: 20, sponsorUserId: "u_hs" }, [fact({ kind: "quiet", dueDay: 25, userId: "u_lb" })]), 28, "stalled")[0];
    expect(writeProjectDue(stalled, { state: running(), today: 28, companyId: "co" })).toBeNull();
    expect(clockDuePayload(stalled)).toEqual({ kind: "stalled", dueDay: 28, userId: "u_hs" });
    const late = of(running({ steps: [step("s1", { dueDay: 30, ownerUserId: "u_hs" })] }), 33, "late")[1];
    expect(clockDuePayload(late)).toEqual({ kind: "late", dueDay: 30, check: 2, stepId: "s1", userId: "u_lb" });
  });

  it("MOV handover: the order of the project facts in projectDues is start, measure, confirm, then late, blocked, quiet, stalled, update, vacant", () => {
    const s = running({
      steps: [step("s1", { dueDay: 30, ownerUserId: "u_hs" }), step("s2", { column: "blocked", movedDay: 30 })],
      sponsorUserId: "u_hs", lastActivityDay: 20, startedDay: 10,
    }, [fact({ kind: "quiet", dueDay: 25, userId: "u_lb" })]);
    const base = s.projects[0];
    const copy = (id: string, patch: Partial<ReducedProject>): ReducedProject => ({ ...base, id, history: [...base.history], steps: [], ...patch });
    // a planning project past its start day, a measuring one with a check due, a measured one waiting for a second person, then the running one,
    // then one with no lead
    s.projects.unshift(
      copy("p_start", { status: "planning", startedDay: null, dueDay: 12, draft: false, history: [] }),
      copy("p_measure", { status: "measuring", checks: [{ check: 1, dueDay: 15, measured: false }] as ReducedProject["checks"], history: [] }),
      copy("p_confirm", {
        status: "measured", history: [], measures: [{ check: 1, day: 5, confirmed: false, sourceKind: "typed", byUserId: "u_lb" }] as unknown as ReducedProject["measures"],
      }),
    );
    s.projects.push(copy("p_quiet", { status: "running", history: [], lastActivityDay: 60 }));
    s.projects.push(copy("p_vacant", { status: "running", leadUserId: null, leadVacatedDay: 30, history: [], lastActivityDay: 60 }));
    const kinds = projectDues(s, 70, above).map((d) => d.kind);
    const order = ["start", "measure", "confirm", "late", "blocked", "quiet", "stalled", "update", "vacant"];
    const seen = [...new Set(kinds)];
    expect(seen).toEqual(order.filter((k) => seen.includes(k as DueKind)));
    for (const k of order) expect(seen, k).toContain(k);
  });
});
