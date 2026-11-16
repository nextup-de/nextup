// A step is stuck when it sits in Doing or Blocked for two weeks without moving (Kevin, 16 Nov 2026). It is a state
// of the board, so the Overview's range does not change it.
import { expect, it } from "vitest";
import { reduce } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { isStuck, overviewFacts, STUCK_DAYS } from "@/features/projects/overview-view";
import type { ReducedProject } from "@/features/projects/types";
import { step } from "../res/project-fixture";

const DAY = 60;
const project = (steps: ReducedProject["steps"]): ReducedProject => ({ ...reduce(LOCAL_SEED, { events: [], day: DAY }).projects[0], steps, status: "running" });
const facts = (steps: ReducedProject["steps"], range: "7d" | "30d" | "start" = "7d") => overviewFacts(project(steps), { range, day: DAY, viewerOnTeam: true }).tiles;

it("STUCK starts at two weeks: 13 days is not stuck, 14 is", () => {
  expect(STUCK_DAYS).toBe(14);
  expect(isStuck(step("a", { movedDay: DAY - 13 }), DAY)).toBe(false);
  expect(isStuck(step("a", { movedDay: DAY - 14 }), DAY)).toBe(true);
});

it("STUCK counts Doing and Blocked only; To do, Done and dropped never", () => {
  const old = DAY - 30;
  const t = facts([
    step("doing", { column: "doing", movedDay: old }),
    step("blocked", { column: "blocked", movedDay: old - 5 }),
    step("todo", { column: "todo", movedDay: old }),
    step("done", { column: "done", movedDay: old, doneDay: old }),
    step("dropped", { column: "doing", movedDay: old, dropped: { why: "", day: old, byUserId: null } }),
  ]);
  expect(t.stuck).toBe(2);
  expect(t.longestStuck).toEqual({ stepId: "blocked", text: "blocked", column: "blocked", days: 35 });
});

it("STUCK does not move with the range", () => {
  const steps = [step("a", { movedDay: DAY - 20 })];
  expect(facts(steps, "7d").stuck).toBe(1);
  expect(facts(steps, "30d").stuck).toBe(1);
  expect(facts(steps, "start").stuck).toBe(1);
});

it("STUCK is empty when nothing has sat two weeks", () => {
  const t = facts([step("a", { movedDay: DAY - 3 })]);
  expect(t.stuck).toBe(0);
  expect(t.longestStuck).toBeNull();
});
