import { describe, expect, it } from "vitest";
import { DEMO_GOALS } from "@/features/demo/structure";
import { SEED } from "@/features/demo/seed";
import { rowsFromSeed } from "@/features/knowledge";
import { checkGoalChange, type GoalInput } from "@/features/org-edit/goals";

let n = 0;
const k = rowsFromSeed(SEED, DEMO_GOALS, () => "id" + ++n);
const good: GoalInput = { title: "Cut waste", kpi: "Scrap rate", target: "-10%", period: "2026", orgUnitId: k.units[0].id, keywords: ["waste", "scrap"] };
const add = (g: Partial<GoalInput>) => checkGoalChange(k, { kind: "addGoal", goal: { ...good, ...g } });

describe("ADM goal rules", () => {
  it("refuses an empty or too long title", () => {
    expect(add({ title: "   " })).toBe("settingsGoals.errTitle");
    expect(add({ title: "x".repeat(121) })).toBe("settingsGoals.errTitle");
    expect(add({ title: "x".repeat(120) })).toBeNull();
  });

  it("refuses too many or badly sized keywords", () => {
    expect(add({ keywords: Array.from({ length: 31 }, (_, i) => "k" + i) })).toBe("settingsGoals.errKeywords");
    expect(add({ keywords: ["ok", " "] })).toBe("settingsGoals.errKeywords");
    expect(add({ keywords: ["x".repeat(41)] })).toBe("settingsGoals.errKeywords");
    expect(add({ keywords: [] })).toBeNull();
  });

  it("refuses a unit of another company", () => {
    expect(add({ orgUnitId: "unit-of-another-company" })).toBe("settingsGoals.errUnit");
  });

  it("refuses changing or removing a goal that is not there", () => {
    expect(checkGoalChange(k, { kind: "updateGoal", id: "nope", goal: good })).toBe("settingsGoals.errNotFound");
    expect(checkGoalChange(k, { kind: "removeGoal", id: "nope" })).toBe("settingsGoals.errNotFound");
  });

  it("accepts a good goal, company-wide or in a unit", () => {
    expect(add({})).toBeNull();
    expect(add({ orgUnitId: null })).toBeNull();
    expect(checkGoalChange(k, { kind: "updateGoal", id: k.goals[0].id, goal: good })).toBeNull();
    expect(checkGoalChange(k, { kind: "removeGoal", id: k.goals[0].id })).toBeNull();
  });
});
