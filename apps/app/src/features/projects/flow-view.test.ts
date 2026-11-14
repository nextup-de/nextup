import { expect, it } from "vitest";
import type { CaseEvent, EventPayload } from "@/features/cases/events";
import { timePerColumn } from "./flow-view";
import type { Step } from "./types";

const step = (id: string, patch: Partial<Step> = {}): Step => ({
  id, text: id, owner: null, dueDay: null, column: "done", why: "", note: "", addedDay: 0,
  movedDay: 10, by: "Lead", startedDay: 2, doneDay: 10, external: null,
  checklist: [], comments: [], waitingOn: null, ...patch,
});
const event = (stepId: string, day: number, to: string, type: CaseEvent["type"] = "project.step.moved", extra: EventPayload = {}): CaseEvent => ({
  id: `${stepId}-${day}-${to}`, ts: day, day, type, actor: "Lead", target: "p", payload: { stepId, to, ...extra },
});

it("HUB flow: medians come from moves in all three columns and exclude dropped steps", () => {
  const p = {
    steps: [step("a"), step("b"), step("dropped", { dropped: { why: "Not needed", day: 10, byUserId: null } })],
    history: [event("a", 2, "doing"), event("a", 6, "blocked"), event("a", 9, "done"),
      event("b", 4, "doing"), event("b", 10, "blocked"), event("b", 15, "done"),
      event("dropped", 100, "doing"), event("dropped", 200, "blocked"), event("dropped", 300, "done")],
  };
  const before = structuredClone(p);
  expect(timePerColumn(p)).toEqual([
    { column: "todo", medianDays: 3, count: 2 },
    { column: "doing", medianDays: 5, count: 2 },
    { column: "blocked", medianDays: 4, count: 2 },
  ]);
  expect(p).toEqual(before);
});

it("HUB flow: repeated visits count, reorders do not reset time, and unfinished stays have no end", () => {
  const rows = timePerColumn({ steps: [step("a", { column: "blocked", doneDay: null })], history: [
    event("a", 2, "doing"), event("a", 3, "doing"), event("a", 6, "blocked"),
    event("a", 7, "doing"), event("a", 9, "blocked"),
  ] });
  expect(rows).toEqual([
    { column: "todo", medianDays: 2, count: 1 },
    { column: "doing", medianDays: 3, count: 2 },
    { column: "blocked", medianDays: 1, count: 1 },
  ]);
});

it("HUB flow: direct creation in Doing and seeded negative days keep the original column and day", () => {
  const rows = timePerColumn({ steps: [step("a", { addedDay: -5 })], history: [
    event("a", -5, "doing", "project.step.added"), event("a", -2, "blocked"), event("a", 0, "done"),
  ] });
  expect(rows).toEqual([
    { column: "todo", medianDays: null, count: 0 },
    { column: "doing", medianDays: 3, count: 1 },
    { column: "blocked", medianDays: 2, count: 1 },
  ]);
});

it("HUB flow: missing history is empty; same-day moves are measured as zero; unknown and removed steps are ignored", () => {
  expect(timePerColumn({ steps: [step("a")], history: [] }).every((r) => r.medianDays === null)).toBe(true);
  expect(timePerColumn({ steps: [step("a")], history: [event("a", 0, "doing"), event("a", 4, "invalid"), event("removed", 30, "doing"), event("a", 5, "done")] })).toEqual([
    { column: "todo", medianDays: 0, count: 1 }, { column: "doing", medianDays: 5, count: 1 }, { column: "blocked", medianDays: null, count: 0 },
  ]);
});
