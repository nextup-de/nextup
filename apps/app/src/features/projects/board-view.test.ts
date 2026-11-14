import { expect, it } from "vitest";
import { boardLanes, dropOutcome } from "./board-view";
import type { Step } from "./types";

const step = (id: string, patch: Partial<Step> = {}): Step => ({
  id, text: id, owner: "Same label", ownerUserId: "a", dueDay: null, column: "todo", why: "", note: "",
  addedDay: 0, movedDay: 0, by: "Lead", startedDay: null, doneDay: null, external: null,
  checklist: [], comments: [], waitingOn: null, ...patch,
});

it("STP board: status grouping preserves priorities and column counts without mutating steps", () => {
  const steps = [step("one"), step("two", { column: "doing" }), step("three"), step("four", { column: "done" })];
  const before = structuredClone(steps);
  const lanes = boardLanes(steps, { groupBy: "status" });
  expect(lanes).toHaveLength(1);
  expect(lanes[0].count).toBe(4);
  expect(lanes[0].columns.todo.map((s) => s.id)).toEqual(["one", "three"]);
  expect(lanes[0].columns.doing).toHaveLength(1);
  expect(lanes[0].columns.blocked).toHaveLength(0);
  expect(lanes[0].columns.done).toHaveLength(1);
  expect(steps).toEqual(before);
});

it("STP board: person lanes use ids even with identical names, with No owner last", () => {
  const lanes = boardLanes([step("one"), step("two", { ownerUserId: null }), step("three", { ownerUserId: "b", column: "blocked" }), step("four", { column: "done" })], { groupBy: "person" });
  expect(lanes.map((l) => l.ownerUserId)).toEqual(["a", "b", null]);
  expect(lanes.map((l) => l.count)).toEqual([2, 1, 1]);
  expect(lanes[0].columns.todo).toHaveLength(1);
  expect(lanes[0].columns.done).toHaveLength(1);
  expect(lanes[1].columns.blocked[0].id).toBe("three");
  expect(lanes[2].columns.todo[0].id).toBe("two");
});

it("STP board: dropped cards remain visible but count in no total", () => {
  const lanes = boardLanes([step("dropped", { dropped: { why: "No longer needed", day: 2, byUserId: "a" } })], { groupBy: "person" });
  expect(lanes[0].count).toBe(0);
  expect(lanes[0].columns.todo).toHaveLength(1);
});

it("STP board: crossing lanes reassigns including clearing the owner; status drops keep it", () => {
  expect(dropOutcome(step("one"), { column: "doing", ownerUserId: "b" })).toBe("reassign");
  expect(dropOutcome(step("one"), { column: "todo", ownerUserId: null })).toBe("reassign");
  expect(dropOutcome(step("one"), { column: "doing" })).toBe("move");
  expect(dropOutcome(step("one"), { column: "todo", ownerUserId: "a" })).toBe("move");
});

it("STP board: Blocked asks before either moving or reassigning; blocked reordering keeps its reason", () => {
  expect(dropOutcome(step("one"), { column: "blocked" })).toBe("ask-blocked");
  expect(dropOutcome(step("one"), { column: "blocked", ownerUserId: "b" })).toBe("ask-blocked");
  expect(dropOutcome(step("one", { column: "blocked", why: "Waiting for supplier" }), { column: "blocked" })).toBe("move");
});

it("STP board: denied drops and unfinished checklists refuse; finished checklists can move to Done", () => {
  expect(dropOutcome(step("one"), { column: "blocked", allowed: false })).toBe("refused");
  expect(dropOutcome(step("one", { checklist: [{ id: "c", text: "Test", done: false }] }), { column: "done" })).toBe("refused");
  expect(dropOutcome(step("one", { checklist: [{ id: "c", text: "Test", done: true }] }), { column: "done" })).toBe("move");
});
