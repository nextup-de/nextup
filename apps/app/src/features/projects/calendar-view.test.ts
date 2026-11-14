import { describe, expect, it } from "vitest";
import { calendarWeeks, dropOnDay, quickAdd, shiftPeriod, unscheduled, type CalendarOptions } from "./calendar-view";
import type { Step } from "./types";

// Day 10 is Monday 2026-11-09; every calendar day counts, so a day number is a plain offset.
const BASE = Date.parse("2026-11-09T12:00:00Z") - 10 * 86_400_000;
const dateOf = (day: number) => new Date(BASE + day * 86_400_000).toISOString().slice(0, 10);
const dayOf = (date: string) => Math.round((Date.parse(`${date}T12:00:00Z`) - BASE) / 86_400_000);
const weekdayOnly = (date: string) => { const w = new Date(`${date}T12:00:00Z`).getUTCDay(); return w === 0 || w === 6 ? null : dayOf(date); };
const base: CalendarOptions = { month: "2026-11-09", scale: "month", day: 10, workdays: false, dateOf, dayOf };
const step = (id: string, patch: Partial<Step> = {}): Step => ({ id, text: id, owner: null, ownerUserId: null, dueDay: null, column: "todo", why: "", note: "", addedDay: 0, movedDay: 0, by: "Lead", startedDay: null, doneDay: null, external: null, checklist: [], comments: [], waitingOn: null, ...patch });
const ids = () => "s_new" as const;

describe("PLN calendar", () => {
  it("PLN calendar: a month puts each step on its due day, Monday first, late and done marked", () => {
    const steps = [step("a", { dueDay: 10, external: { system: "jira", key: "KAN-1" } }), step("late", { dueDay: 8 }), step("fin", { dueDay: 8, column: "done" }), step("none"), step("gone", { dueDay: 10, dropped: { why: "x", day: 9, byUserId: null } })];
    const weeks = calendarWeeks({ steps }, base);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0].date).toBe("2026-10-26");
    expect(weeks.at(-1)!.at(-1)!.date).toBe("2026-12-06");
    const cell = (date: string) => weeks.flat().find((c) => c.date === date)!;
    expect(cell("2026-11-09")).toMatchObject({ day: 10, today: true, inPeriod: true, chips: [{ stepId: "a", key: "KAN-1", late: false, done: false }] });
    expect(cell("2026-11-07").chips).toEqual([
      expect.objectContaining({ stepId: "late", late: true, done: false }),
      expect.objectContaining({ stepId: "fin", late: false, done: true }),
    ]);
    expect(cell("2026-10-27").inPeriod).toBe(false);
    expect(weeks.flat().flatMap((c) => c.chips.map((x) => x.stepId))).not.toContain("gone");
  });

  it("PLN calendar: a week shows seven days, or five working days where the project uses them", () => {
    const steps = [step("a", { dueDay: 12 })];
    const week = calendarWeeks({ steps }, { ...base, scale: "week" });
    expect(week).toHaveLength(1);
    expect(week[0].map((c) => c.date)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
    const work = calendarWeeks({ steps }, { ...base, scale: "week", workdays: true, dayOf: weekdayOnly });
    expect(work[0].map((c) => c.date)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
    expect(work[0][2].chips.map((c) => c.stepId)).toEqual(["a"]);
    expect(calendarWeeks({ steps: [] }, { ...base, workdays: true, dayOf: weekdayOnly }).every((w) => w.length === 5)).toBe(true);
    expect(shiftPeriod("2026-11-09", "week", 1)).toBe("2026-11-16");
    expect(shiftPeriod("2026-11-09", "month", -1)).toBe("2026-10-01");
    expect(shiftPeriod("2026-12-15", "month", 1)).toBe("2027-01-01");
  });

  it("PLN calendar: the drawer lists open steps without a due day", () => {
    const steps = [step("a"), step("dated", { dueDay: 3 }), step("fin", { column: "done" }), step("gone", { dropped: { why: "x", day: 1, byUserId: null } }), step("b")];
    expect(unscheduled({ steps }).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("PLN calendar: a drop and Move to day… send one step.edited with the due day, or nothing", () => {
    expect(dropOnDay(step("a", { dueDay: 3 }), 12)).toEqual({ type: "project.step.edited", payload: { stepId: "a", dueDay: 12 } });
    expect(dropOnDay(step("a"), 12)).toEqual({ type: "project.step.edited", payload: { stepId: "a", dueDay: 12 } });
    expect(dropOnDay(step("a", { dueDay: 12 }), 12)).toBeNull();
    expect(dropOnDay(step("a"), null)).toBeNull();
    expect(dropOnDay(step("a", { dropped: { why: "x", day: 1, byUserId: null } }), 12)).toBeNull();
  });

  it("PLN calendar: a quick add sends one step.added due that day", () => {
    expect(quickAdd(14, "  Call the depot ", ids, { column: "doing", owner: "Ana", ownerUserId: "u1" })).toEqual({
      type: "project.step.added", payload: { stepId: "s_new", text: "Call the depot", owner: "Ana", ownerUserId: "u1", dueDay: 14, to: "doing" },
    });
    expect(quickAdd(14, "Plain", ids)?.payload).toEqual({ stepId: "s_new", text: "Plain", dueDay: 14 });
    expect(quickAdd(14, "   ", ids)).toBeNull();
    expect(quickAdd(null, "No day", ids)).toBeNull();
  });
});
