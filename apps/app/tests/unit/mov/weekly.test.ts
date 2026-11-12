// Plan MOV, MOV-R1: the offline draft of the weekly update, built from the week's board events, and the check-in
// day its window opens after. No model, no network: the whole thing is a pure function of the project's history.
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { DEMO_CLOCK, type CalendarSpec, type ClockSpec } from "@/features/clock";
import { workdayOf } from "@/features/clock/calendar";
import { checkInDayOf } from "@/features/projects/rhythm";
import type { ReducedProject, Step } from "@/features/projects/types";
import { previousCheckIn, weeklyDraft } from "@/features/projects/weekly";

let n = 0;
const ev = (type: CaseEventType, day: number, payload: EventPayload): CaseEvent =>
  ({ id: "e" + n++, ts: 0, type, actor: "L. Brandt", actorUserId: "u_lb", target: "p_one", payload, day });
const added = (stepId: string, day: number, more: EventPayload = {}) => ev("project.step.added", day, { stepId, text: stepId, ...more });
const moved = (stepId: string, to: string, day: number, why?: string) => ev("project.step.moved", day, { stepId, to, ...(why ? { why } : {}) });

const step = (id: string, text: string): Step => ({
  id, text, owner: null, dueDay: null, column: "todo", why: "", note: "", addedDay: 0, by: "L. Brandt", movedDay: 0,
  startedDay: null, doneDay: null, external: null,
});
const board = (history: CaseEvent[], steps: Step[]) => ({ number: 7, title: "Changeover cart", history, steps });

describe("MOV weekly draft", () => {
  // Window (10, 15]: days 11..15.
  const steps = [step("a", "Order the cart"), step("b", "Mark the floor"), step("c", "Train the shift"), step("d", "Fix the lock"), step("old", "Old step"), step("late", "Late step")];
  const history = [
    added("old", 3), moved("old", "doing", 5), moved("old", "done", 9), // before the window
    added("a", 11), added("b", 12, { to: "doing" }),
    moved("b", "doing", 12), // already in Doing: a reorder, not a move on
    added("c", 12), moved("c", "doing", 13), moved("c", "done", 14),
    added("d", 13), moved("d", "doing", 13), moved("d", "blocked", 15, "Waiting for the supplier"),
    added("late", 16), moved("a", "doing", 16), // after the window
    moved("c", "done", 15), // a second move to done: still once
  ];
  const p = board(history, steps);

  it("lists the steps added, moved on, done and blocked inside the window, in English", () => {
    expect(weeklyDraft(p, 10, 15, "en")).toBe([
      "This week on P-7: Changeover cart",
      "Added: Order the cart; Mark the floor; Train the shift; Fix the lock",
      "Moved on: Train the shift; Fix the lock",
      "Done: Train the shift",
      "Blocked: Fix the lock (Waiting for the supplier)",
    ].join("\n"));
  });

  it("writes the same in German", () => {
    expect(weeklyDraft(p, 10, 15, "de")).toBe([
      "Diese Woche bei P-7: Changeover cart",
      "Neu: Order the cart; Mark the floor; Train the shift; Fix the lock",
      "Weitergekommen: Train the shift; Fix the lock",
      "Erledigt: Train the shift",
      "Blockiert: Fix the lock (Waiting for the supplier)",
    ].join("\n"));
  });

  it("uses the step's current text and leaves a removed step out", () => {
    const renamed = board(history, steps.map((s) => (s.id === "a" ? { ...s, text: "Order the new cart" } : s)).filter((s) => s.id !== "b"));
    const text = weeklyDraft(renamed, 10, 15, "en");
    expect(text).toContain("Added: Order the new cart; Train the shift");
    expect(text).not.toContain("Mark the floor");
  });

  it("puts an event on the window's last day in this week and not in the next, and one on its first day in the last", () => {
    const edge = board([added("a", 10), added("b", 15), added("c", 20)], steps);
    expect(weeklyDraft(edge, 10, 15, "en")).toContain("Added: Mark the floor");
    expect(weeklyDraft(edge, 10, 15, "en")).not.toContain("Order the cart");
    expect(weeklyDraft(edge, 5, 10, "en")).toContain("Added: Order the cart");
    expect(weeklyDraft(edge, 15, 20, "en")).toContain("Added: Train the shift");
    expect(weeklyDraft(edge, 15, 20, "en")).not.toContain("Mark the floor");
  });

  it("says so when nothing moved, in both languages", () => {
    expect(weeklyDraft(p, 20, 25, "en")).toBe("This week on P-7: Changeover cart\nNothing moved on the board this week.");
    expect(weeklyDraft(p, 20, 25, "de")).toBe("Diese Woche bei P-7: Changeover cart\nAuf dem Board hat sich diese Woche nichts bewegt.");
  });
});

// June 2026: Monday the 22nd to Friday the 26th is a week with no public holiday in DE.
const CAL: CalendarSpec = { region: "DE", workdays: [1, 2, 3, 4, 5], extraHolidays: [], extraWorkdays: [] };
const clockOf = (over: Partial<CalendarSpec> = {}): ClockSpec => ({ mode: "workdays", calendar: { ...CAL, ...over } });
const wd = (iso: string, clock: ClockSpec): number => {
  if (clock.mode !== "workdays") throw new Error("workdays clock expected");
  return workdayOf(new Date(`${iso}T12:00:00Z`), clock.calendar);
};
const proj = (startedDay: number | null, checkInWeekday: number | null, week?: number) => ({
  startedDay, checkInWeekday, latestUpdate: week === undefined ? null : { text: "x", week, day: week, byUserId: "u_lb" },
}) satisfies Pick<ReducedProject, "startedDay" | "checkInWeekday" | "latestUpdate">;

describe("MOV weekly draft: the check-in day it starts after", () => {
  it("is the previous scheduled check-in when no update was sent, and the start in the first week", () => {
    const c = clockOf();
    const started = wd("2026-06-08", c); // a Monday
    const p = proj(started, 3);
    expect(previousCheckIn(p, wd("2026-06-24", c), c)).toBe(wd("2026-06-17", c));
    // The first check-in has nothing before it: the window opens at the start day, never earlier.
    expect(previousCheckIn(p, wd("2026-06-10", c), c)).toBe(started);
  });

  it("is the week of the latest sent update when that is a scheduled check-in before this one", () => {
    const c = clockOf();
    const p = proj(wd("2026-06-08", c), 3, wd("2026-06-10", c));
    // Weeks without an update are covered: the draft runs from the last update.
    expect(previousCheckIn(p, wd("2026-06-24", c), c)).toBe(wd("2026-06-10", c));
  });

  it("ignores an update for this week or later, and one that is no scheduled check-in day", () => {
    const c = clockOf();
    const started = wd("2026-06-08", c);
    const thisWeek = wd("2026-06-24", c);
    expect(previousCheckIn(proj(started, 3, thisWeek), thisWeek, c)).toBe(wd("2026-06-17", c));
    expect(previousCheckIn(proj(started, 3, wd("2026-06-30", c)), thisWeek, c)).toBe(wd("2026-06-17", c));
    // A Thursday that was never a check-in day (the rhythm is Wednesday): not a boundary.
    expect(previousCheckIn(proj(started, 3, wd("2026-06-18", c)), thisWeek, c)).toBe(wd("2026-06-17", c));
    // An update from before the start is no boundary either.
    expect(previousCheckIn(proj(started, 3, started - 4), thisWeek, c)).toBe(wd("2026-06-17", c));
  });

  it("follows a shortened holiday week: the check-in moves to the next working day and the window still tiles", () => {
    const c = clockOf({ extraHolidays: ["2026-06-17"] }); // the Wednesday of the week before is a holiday
    const p = proj(wd("2026-06-08", c), 3);
    const prev = previousCheckIn(p, wd("2026-06-24", c), c);
    expect(prev).toBe(wd("2026-06-18", c));
    expect(checkInDayOf(p, prev, c)).toBe(prev);
    // Events on the 18th end that week's draft; they do not open this one.
    const week = board([ev("project.step.added", prev, { stepId: "a", text: "a" }), ev("project.step.added", prev + 1, { stepId: "b", text: "b" })], [step("a", "Held"), step("b", "Next")]);
    const draft = weeklyDraft(week, prev, wd("2026-06-24", c), "en");
    expect(draft).toContain("Added: Next");
    expect(draft).not.toContain("Held");
  });

  it("skips a week that is closed in full instead of reaching into another one", () => {
    const c = clockOf({ extraHolidays: ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19"] });
    const p = proj(wd("2026-06-08", c), 3);
    expect(previousCheckIn(p, wd("2026-06-24", c), c)).toBe(wd("2026-06-10", c));
  });

  it("follows an edited rhythm: an update from the old weekday is not a boundary, the new weekday's check-in is", () => {
    const c = clockOf();
    const started = wd("2026-06-08", c);
    const oldWed = wd("2026-06-17", c);
    // The lead moved the check-in from Wednesday to Friday; the update was sent for the old Wednesday.
    expect(checkInDayOf({ startedDay: started, checkInWeekday: 5 }, oldWed, c)).toBe(wd("2026-06-19", c));
    const p = proj(started, 5, oldWed);
    expect(previousCheckIn(p, wd("2026-06-26", c), c)).toBe(wd("2026-06-19", c));
  });

  it("walks the demo clock in fives from the start", () => {
    expect(previousCheckIn(proj(3, null), 13, DEMO_CLOCK)).toBe(8);
    expect(previousCheckIn(proj(3, null), 8, DEMO_CLOCK)).toBe(3);
    expect(previousCheckIn(proj(3, null, 8), 18, DEMO_CLOCK)).toBe(8);
    expect(previousCheckIn(proj(3, null, 6), 13, DEMO_CLOCK)).toBe(8); // 6 was never a check-in day
  });
});
