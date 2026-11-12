// The project page's tabs (features/projects/tabs.ts): which tab a ?tab= value opens, and which open
// steps the Overview lists first.
import { describe, expect, it } from "vitest";
import { nextSteps, projectTabOf, tabQuery } from "@/features/projects/tabs";
import type { Step } from "@/features/projects/types";

const step = (id: string, column: Step["column"], movedDay: number, dueDay: number | null = null): Step => ({
  id, text: id, owner: null, dueDay, column, why: "", note: "", addedDay: 0, by: "L. Brandt", movedDay,
  startedDay: null, doneDay: null, external: null,
});

describe("projectTabOf", () => {
  it("opens a known tab and falls back to the Overview", () => {
    expect(projectTabOf("board")).toBe("board");
    expect(projectTabOf(["results", "team"])).toBe("results");
    expect(projectTabOf(undefined)).toBe("overview");
    expect(projectTabOf("agent")).toBe("agent"); // the page opens the Overview for a person who has no Agent tab (features/agent/view.ts)
    expect(projectTabOf("nope")).toBe("overview");
  });

  it("gives the Overview no query", () => {
    expect(tabQuery("overview")).toBe("");
    expect(tabQuery("files")).toBe("?tab=files");
    expect(tabQuery("agent")).toBe("?tab=agent");
  });
});

describe("nextSteps", () => {
  it("lists blocked, then doing, then to do, and leaves done out", () => {
    const steps = [step("t", "todo", 1), step("d", "done", 1), step("g", "doing", 3), step("b", "blocked", 5)];
    expect(nextSteps(steps).map((s) => s.id)).toEqual(["b", "g", "t"]);
  });

  it("puts the longest wait first, and a due to-do before one without a date", () => {
    const steps = [step("g2", "doing", 9), step("g1", "doing", 2), step("t1", "todo", 0), step("t2", "todo", 0, 20)];
    expect(nextSteps(steps).map((s) => s.id)).toEqual(["g1", "g2", "t2", "t1"]);
  });

  it("stops at the limit", () => {
    const steps = Array.from({ length: 6 }, (_, k) => step("t" + k, "todo", k));
    expect(nextSteps(steps, 4)).toHaveLength(4);
  });
});
