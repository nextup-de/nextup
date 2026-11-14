import { expect, it } from "vitest";
import { barOf, datesEdit, dragEdit, timelineRows } from "./timeline-view";
import type { Step } from "./types";

const step = (id: string, patch: Partial<Step> = {}): Step => ({
  id, text: id, owner: null, dueDay: null, column: "todo", why: "", note: "", addedDay: 0,
  movedDay: 0, by: "Lead", startedDay: null, doneDay: null, external: null,
  checklist: [], comments: [], waitingOn: null, ...patch,
});
const p = {
  milestones: [{ id: "m1", title: "Pilot", startDay: null, dueDay: 20, note: "", shipped: false, shippedDay: null }, { id: "m2", title: "Empty", startDay: null, dueDay: 30, note: "", shipped: false, shippedDay: null }],
  steps: [
    step("a", { milestoneId: "m1", ownerUserId: "u1", column: "done", doneDay: 8, startDay: 2, dueDay: 8 }),
    step("b", { milestoneId: "m1", ownerUserId: "u2", column: "doing", startedDay: 5, dueDay: 9 }),
    step("c", { ownerUserId: "u1", column: "blocked", addedDay: 6, waitingOn: { kind: "person", userId: "u2", name: null } }),
    step("d", { column: "blocked", addedDay: 7 }),
    step("e", { column: "todo", addedDay: 3, dueDay: 4 }),
    step("x", { dropped: { why: "no", day: 1, byUserId: null } }),
  ],
};

it("PLN timeline bars start and end by D6: start day, else first Doing, else added; due, else start + 1", () => {
  expect(barOf(step("s", { startDay: 4, startedDay: 2, addedDay: 1, dueDay: 9 }))).toEqual({ start: 4, end: 9 });
  expect(barOf(step("s", { startedDay: 2, addedDay: 1, dueDay: 9 }))).toEqual({ start: 2, end: 9 });
  expect(barOf(step("s", { addedDay: 3 }))).toEqual({ start: 3, end: 4 });
  expect(barOf(step("s", { addedDay: 3, dueDay: 2 }))).toEqual({ start: 3, end: 4 });
});

it("PLN timeline groups by milestone, person, status or none, with progress and without dropped steps", () => {
  const view = (groupBy: "milestone" | "person" | "status" | "none") => timelineRows(p, { groupBy, scale: "weeks", day: 10 }).groups;
  expect(view("milestone").map((g) => [g.title, g.done, g.total])).toEqual([["Pilot", 1, 2], [null, 0, 3]]);
  expect(view("person").map((g) => [g.userId, g.total])).toEqual([["u1", 2], ["u2", 1], [null, 2]]);
  expect(view("status").map((g) => [g.column, g.total])).toEqual([["todo", 1], ["doing", 1], ["blocked", 2], ["done", 1]]);
  expect(view("none")).toHaveLength(1);
  expect(view("none")[0].total).toBe(5);
});

it("PLN timeline colours bars as drawn: done, doing, waiting, blocked and late", () => {
  const tones = Object.fromEntries(timelineRows(p, { groupBy: "none", scale: "weeks", day: 8 }).groups[0].rows.map((r) => [r.stepId, r.tone]));
  expect(tones).toEqual({ a: "done", b: "doing", c: "waiting", d: "blocked", e: "late" });
});

it("PLN timeline scales to weeks, months or quarters, in working days when the project uses them", () => {
  const cols = (scale: "weeks" | "months" | "quarters", workdays = false) => timelineRows(p, { groupBy: "none", scale, day: 10, workdays }).columns;
  expect(cols("weeks").every((c) => c.end - c.start === 7)).toBe(true);
  expect(cols("months")[0].end - cols("months")[0].start).toBe(30);
  expect(cols("quarters")).toHaveLength(1);
  expect(cols("weeks", true)[0].end - cols("weeks", true)[0].start).toBe(5);
  const v = timelineRows(p, { groupBy: "none", scale: "weeks", day: 10 });
  expect(v.from).toBeLessThanOrEqual(2);
  expect(v.to).toBeGreaterThan(10);
  expect(timelineRows({ steps: [], milestones: [] }, { groupBy: "none", scale: "weeks", day: 3 }).empty).toBe(true);
});

it("PLN timeline a move, a stretch or a Dates… edit is one project.step.edited change with its undo", () => {
  const s = step("s", { startDay: 4, dueDay: 9 });
  expect(dragEdit(s, { part: "move", days: 2 })).toEqual({ edit: { startDay: 6, dueDay: 11 }, undo: { startDay: 4, dueDay: 9 } });
  expect(dragEdit(s, { part: "start", days: -3 })).toEqual({ edit: { startDay: 1 }, undo: { startDay: 4 } });
  expect(dragEdit(s, { part: "start", days: 99 })).toEqual({ edit: { startDay: 8 }, undo: { startDay: 4 } });
  expect(dragEdit(s, { part: "end", days: 3 })).toEqual({ edit: { dueDay: 12 }, undo: { dueDay: 9 } });
  expect(dragEdit(s, { part: "end", days: -99 })).toEqual({ edit: { dueDay: 5 }, undo: { dueDay: 9 } });
  expect(dragEdit(s, { part: "move", days: 0 })).toBeNull();
  // A step with no planned start gets one from its drawn start; undo puts it back to none.
  expect(dragEdit(step("t", { addedDay: 3 }), { part: "move", days: 1 })).toEqual({ edit: { startDay: 4, dueDay: 5 }, undo: { startDay: null, dueDay: null } });
  expect(datesEdit(s, { start: 5, due: 12 })).toEqual({ edit: { startDay: 5, dueDay: 12 }, undo: { startDay: 4, dueDay: 9 } });
  expect(datesEdit(s, { start: 10, due: 9 })).toBeNull();
  expect(datesEdit(s, { start: 4, due: 9 })).toBeNull();
});
