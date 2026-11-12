// MOV-G1: the scaffold of "A project that keeps moving". No behaviour: the names, the empty values and the check-in rhythm
// every later MOV task builds on.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { APP_EVENT_TYPES, needsProjectsFlag } from "@/features/cases/persist";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { workdayOf } from "@/features/clock/calendar";
import { DEMO_CLOCK, type CalendarSpec, type ClockSpec } from "@/features/clock";
import type { Due } from "@/features/clock/due";
import { BLOCKED_DAYS_DEFAULT, DONE_BY_DEFAULT_DAYS, LATE_LEAD_DAYS, PAUSE_MAX_DAYS, QUIET_DAYS, STALLED_DAYS, UPDATE_REMIND_DAYS, VACANT_DAYS } from "@/features/clock/kinds/project";
import { LOCAL_SEED } from "@/features/demo";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { inboxItems, type InboxInput } from "@/features/inbox";
import { projectMoveItems } from "@/features/inbox/sources/project-move";
import { DUTY_TEMPLATES, isDuty } from "@/features/notify/channels";
import { followsTemplate, NOTIFY_GROUPS } from "@/features/notify/digest";
import { LOOP_TYPES } from "@/features/notify/plan";
import { checkInDayOf, checkInWeekdayOf, previousCheckInDayOf, weekdayOfDay } from "@/features/projects/rhythm";
import type { DoneByMove, ProjectEscalation } from "@/features/projects/types";
import { createT } from "@/i18n";
import { LOOP_MAIL_TYPES } from "@/server/loop-notice";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: LOCAL_SEED.routes, promiseDays: PROMISE_DAYS, seats: LOCAL_SEED.seats };
let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string | null, payload: EventPayload = {}): CaseEvent =>
  ({ id: "m" + n++, ts: 0, type, actor, actorUserId, target, payload, day: 0 });

const NEW_EVENTS = ["project.doneby.moved", "project.paused", "project.resumed", "project.howwework", "project.update", "project.lead.vacated", "project.lead.changed"] as const;
const REMINDERS = ["reminder.late", "reminder.blocked", "reminder.quiet", "reminder.stalled", "reminder.update", "reminder.vacant"] as const;

describe("MOV scaffold", () => {
  it("the seven new events are app events behind the projects flag, and loop events that follow loop.project.member", () => {
    for (const t of NEW_EVENTS) {
      expect(APP_EVENT_TYPES as readonly string[], t).toContain(t);
      expect(needsProjectsFlag(t, {}), t).toBe(true);
      const template = `loop.${t}`;
      expect(NOTIFY_GROUPS.loop, template).toContain(template);
      expect(followsTemplate(template), template).toBe("loop.project.member");
      expect(LOOP_TYPES.has(t), t).toBe(true);
      expect(LOOP_MAIL_TYPES.has(t), t).toBe(true);
    }
  });

  it("the six reminder kinds follow reminder.start, and stalled and vacant are duty notices", () => {
    for (const t of REMINDERS) expect(followsTemplate(t), t).toBe("reminder.start");
    expect(isDuty("reminder.stalled")).toBe(true);
    expect(isDuty("reminder.vacant")).toBe(true);
    expect(DUTY_TEMPLATES).toContain("reminder.stalled");
    for (const t of ["reminder.late", "reminder.blocked", "reminder.quiet", "reminder.update"]) expect(isDuty(t), t).toBe(false);
  });

  it("a project from a legacy yes has the empty MOV values", () => {
    const raised = ev("case.raised", "Anonymous #4471", "u_js", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" });
    const yes = ev("case.decided", "T. Vogel", "u_tv", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "Shorter changeover" });
    const [p] = reduce(SEED, { events: [raised, yes], day: 0 }).projects;
    expect(p).toMatchObject({
      doneBy: null, doneByMoves: [], pausedUntil: null, pauseWhy: "", lastActivityDay: null, checkInWeekday: null, howWeWorkNote: "", leadVacatedDay: null, latestUpdate: null,
    });
  });

  it("the constants and the new types type-check as fixtures", () => {
    expect([LATE_LEAD_DAYS, QUIET_DAYS, STALLED_DAYS, UPDATE_REMIND_DAYS, VACANT_DAYS, PAUSE_MAX_DAYS, DONE_BY_DEFAULT_DAYS, BLOCKED_DAYS_DEFAULT]).toEqual([2, 5, 3, 2, 5, 20, 30, 3]);
    const move: DoneByMove = { day: 4, doneBy: 40, why: "Waiting for the part", byUserId: "u_lb", byLead: true };
    const stalled: ProjectEscalation = { to: "Sponsor", toSeatId: null, toRoleId: null, from: "L. Brandt", day: 9, live: true, what: "stalled", toUserId: "u_hs" };
    const payloads: EventPayload[] = [
      { doneBy: move.doneBy, why: move.why }, { why: "Holiday", untilDay: 20 }, { checkInWeekday: 3, note: "Short call" }, { text: "Update", week: 12 },
      { userId: "u_lb" }, { to: "H. Sander", toUserId: "u_hs" }, { userId: "u_lb", on: false, unassign: true },
    ];
    expect([move.byLead, stalled.what, payloads]).toHaveLength(3);
  });

  it("a clock.due fact with stepId and originEventId survives a serialize/parse round trip", () => {
    const due: Due = { kind: "blocked", target: "p_one", dueDay: 12, stepId: "s1", originEventId: "m7", userId: "u_lb", idemKey: "clk:blocked:p_one:12:s1" };
    const fact: CaseEvent = ev("clock.due", "system:clock", null, due.target, { kind: due.kind, dueDay: due.dueDay, stepId: due.stepId, originEventId: due.originEventId, userId: due.userId });
    const back = JSON.parse(JSON.stringify(fact)) as CaseEvent;
    expect(back.payload).toEqual({ kind: "blocked", dueDay: 12, stepId: "s1", originEventId: "m7", userId: "u_lb" });
    // The identity names the occurrence: the same step in another block is another origin.
    expect({ ...back.payload, originEventId: "m9" }.originEventId).not.toBe(back.payload.originEventId);
  });

  it("projectMoveItems lists nothing yet, so inboxItems has no stalled, vacant or update item", () => {
    const seats: SeatRow[] = [{ id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 }];
    const state = { day: 2, ideas: [], problems: [], projects: [], seats, routes: [], cases: [] } as unknown as State;
    const input: InboxInput = { state, me: meFor("u_tv", seats), seats, today: 2, demo: false, flags: { projects: true, discussion: true } };
    expect(projectMoveItems(input)).toEqual([]);
    expect(inboxItems(input).filter((i) => ["stalled", "vacant", "update"].includes(i.kind))).toEqual([]);
  });

  it("the projectMove keys are in both languages", () => {
    const en = createT("en");
    const de = createT("de");
    for (const key of ["noLead", "noOwner", "weeklyNothing", "permSponsorOrLead", "permSystemOnly"] as const) {
      expect(en(`projectMove.${key}`), key).not.toBe("");
      expect(de(`projectMove.${key}`), key).not.toBe("");
    }
    expect(en("projectMove.itemStalled", { label: "P-1" })).toBe("P-1 has had no progress: move it on");
  });
});

// June 2026: Monday the 22nd to Friday the 26th is a week with no public holiday in DE.
const CAL: CalendarSpec = { region: "DE", workdays: [1, 2, 3, 4, 5], extraHolidays: [], extraWorkdays: [] };
const clockOf = (over: Partial<CalendarSpec> = {}): ClockSpec => ({ mode: "workdays", calendar: { ...CAL, ...over } });
/** The working-day number of an ISO date in the given clock. */
const wd = (iso: string, clock: ClockSpec): number => {
  if (clock.mode !== "workdays") throw new Error("workdays clock expected");
  return workdayOf(new Date(`${iso}T12:00:00Z`), clock.calendar);
};

describe("MOV scaffold: the check-in rhythm", () => {
  it("weekdayOfDay reads the calendar, and the demo clock cycles Monday to Friday", () => {
    const c = clockOf();
    expect(weekdayOfDay(wd("2026-06-24", c), c)).toBe(3);
    expect(weekdayOfDay(wd("2026-06-26", c), c)).toBe(5);
    expect([0, 1, 4, 5, 6, -1].map((d) => weekdayOfDay(d, DEMO_CLOCK))).toEqual([1, 2, 5, 1, 2, 5]);
  });

  it("checkInWeekdayOf is the set weekday, else the weekday of the start, null before it", () => {
    const c = clockOf();
    const started = wd("2026-06-17", c); // a Wednesday
    expect(checkInWeekdayOf({ checkInWeekday: 2, startedDay: started }, c)).toBe(2);
    expect(checkInWeekdayOf({ checkInWeekday: null, startedDay: started }, c)).toBe(3);
    expect(checkInWeekdayOf({ checkInWeekday: null, startedDay: null }, c)).toBeNull();
    expect(checkInWeekdayOf({ checkInWeekday: 4, startedDay: null }, c)).toBe(4);
  });

  it("checkInDayOf gives the weekday of the week that contains the day", () => {
    const c = clockOf();
    const p = { checkInWeekday: 3, startedDay: wd("2026-06-08", c) };
    const wed = wd("2026-06-24", c);
    for (const d of ["2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26"]) expect(checkInDayOf(p, wd(d, c), c), d).toBe(wed);
    expect(checkInDayOf(p, wd("2026-06-29", c), c)).toBe(wd("2026-07-01", c));
  });

  it("the next working day of the week holds the check-in when the weekday is a holiday", () => {
    const c = clockOf({ extraHolidays: ["2026-06-24"] });
    const p = { checkInWeekday: 3, startedDay: wd("2026-06-08", c) };
    expect(checkInDayOf(p, wd("2026-06-22", c), c)).toBe(wd("2026-06-25", c));
    expect(checkInDayOf(p, wd("2026-06-26", c), c)).toBe(wd("2026-06-25", c));
  });

  it("a Friday holiday falls back to the last working day before it in that week", () => {
    const c = clockOf({ extraHolidays: ["2026-06-26"] });
    const p = { checkInWeekday: 5, startedDay: wd("2026-06-08", c) };
    expect(checkInDayOf(p, wd("2026-06-22", c), c)).toBe(wd("2026-06-25", c));
  });

  it("a calendar that is not Monday to Friday keeps the check-in inside its own week", () => {
    const c = clockOf({ workdays: [2, 3, 4, 5, 6] });
    const p = { checkInWeekday: 1, startedDay: wd("2026-06-09", c) };
    // Monday is closed: the next working day of that week is Tuesday.
    expect(checkInDayOf(p, wd("2026-06-24", c), c)).toBe(wd("2026-06-23", c));
    // The default weekday of a start on a Saturday is Saturday.
    const sat = { checkInWeekday: null, startedDay: wd("2026-06-13", c) };
    expect(checkInDayOf(sat, wd("2026-06-24", c), c)).toBe(wd("2026-06-27", c));
  });

  it("there is no check-in before the start, nor in the start week when its day came before the start", () => {
    const c = clockOf();
    const started = wd("2026-06-25", c); // a Thursday
    expect(checkInDayOf({ checkInWeekday: 3, startedDay: null }, wd("2026-06-24", c), c)).toBeNull();
    expect(checkInDayOf({ checkInWeekday: 3, startedDay: started }, started - 1, c)).toBeNull();
    expect(checkInDayOf({ checkInWeekday: 3, startedDay: started }, started, c)).toBeNull();
    expect(checkInDayOf({ checkInWeekday: 3, startedDay: started }, wd("2026-06-29", c), c)).toBe(wd("2026-07-01", c));
  });

  it("the demo clock repeats every five days from the start", () => {
    const p = { checkInWeekday: null, startedDay: 3 };
    expect([2, 3, 7, 8, 12, 13, 14].map((d) => checkInDayOf(p, d, DEMO_CLOCK))).toEqual([null, 3, 3, 8, 8, 13, 13]);
    expect(checkInDayOf({ checkInWeekday: null, startedDay: null }, 5, DEMO_CLOCK)).toBeNull();
    expect(previousCheckInDayOf(p, 13, DEMO_CLOCK)).toBe(8);
    expect(previousCheckInDayOf(p, 8, DEMO_CLOCK)).toBe(3);
    expect(previousCheckInDayOf(p, 3, DEMO_CLOCK)).toBeNull();
  });

  it("previousCheckInDayOf skips a closed week and never goes before the start", () => {
    const closed = ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19"];
    const c = clockOf({ extraHolidays: closed });
    const p = { checkInWeekday: 3, startedDay: wd("2026-06-08", c) };
    const wed = (iso: string) => wd(iso, c);
    expect(previousCheckInDayOf(p, wed("2026-06-24"), c)).toBe(wed("2026-06-10"));
    expect(previousCheckInDayOf(p, wed("2026-06-10"), c)).toBeNull();
    const late = { checkInWeekday: 3, startedDay: wed("2026-06-11") };
    expect(previousCheckInDayOf(late, wed("2026-06-24"), c)).toBeNull();
    expect(previousCheckInDayOf({ checkInWeekday: 3, startedDay: null }, wed("2026-06-24"), c)).toBeNull();
  });
});
