// RES D31: a step dropped on the Done sheet counts in no x/y total, no percentage and no list of open work.
import { describe, expect, it } from "vitest";
import type { Step } from "@/features/projects/types";
import { boardStats } from "@/features/projects/views";

const step = (id: string, column: Step["column"], over: Partial<Step> = {}): Step =>
  ({ id, text: id, owner: null, ownerUserId: null, dueDay: null, column, why: "", note: "", addedDay: 1, by: "x", byUserId: null, movedDay: 1, startedDay: null, doneDay: null, external: null, dropped: null, ...over }) as Step;

describe("RES step counts", () => {
  it("leaves a dropped step out of the total, the percentage, the open work and the late and unowned counts", () => {
    const dropped = step("b", "todo", { dueDay: 2, dropped: { why: "no budget", day: 5, byUserId: "u" } });
    const st = boardStats({ steps: [step("a", "done", { doneDay: 4, startedDay: 2 }), dropped] }, 10);
    expect(st.total).toBe(1);
    expect(st.by).toEqual({ todo: 0, doing: 0, blocked: 0, done: 1 });
    expect(st.pct).toBe(100);
    expect(st.late).toBe(0);
    expect(st.unowned).toBe(0);
  });

  it("counts every step of a board where nothing was dropped, as before", () => {
    const st = boardStats({ steps: [step("a", "done"), step("b", "todo", { dueDay: 2 })] }, 10);
    expect(st).toMatchObject({ total: 2, pct: 50, late: 1, unowned: 1 });
  });
});
