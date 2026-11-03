import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as metrics from "@/features/metrics";
import { deskStats } from "@/features/metrics/desk";
import { projectLedger } from "@/features/metrics/progress";
import type { ReducedCase } from "@/features/cases/reducer";
import type { ReducedProject } from "@/features/projects/types";

const project = (o: Partial<ReducedProject>): ReducedProject => ({
  id: "p", number: 1, seed: false, title: "t", sources: [], authors: [], routeId: null, lead: "l", members: [],
  leadUserId: null, memberUserIds: [], authorUserIds: [], openedDay: 0, openedBy: "b", startedDay: null, doneDay: null,
  doneNote: "", stopped: null, baseline: null, steps: [], links: [], sync: null, measures: [], checks: [], verdict: null,
  reward: null, claimed: null, status: "planning", closed: false, rewardDue: false, dueDay: null, overdue: false,
  escalated: null, history: [], ...o,
});
const answered = (raisedDay: number, decidedDay: number, roleId = "r1"): ReducedCase =>
  ({ assigneeRoleId: roleId, raisedDay, pausedDays: 0, decided: { answer: "yes", reason: "", note: "", by: "x", day: decidedDay } }) as unknown as ReducedCase;

describe("MET progress without people", () => {
  it("exports no contributors and ProgressView renders no per-person list", () => {
    expect("contributors" in metrics).toBe(false);
    const src = readFileSync("src/components/dashboard/shared/ProgressView.tsx", "utf8");
    expect(src).not.toContain("contributors(");
    expect(src).not.toContain("persona.who.handle");
  });

  it("counts the five after-the-yes numbers from four projects", () => {
    const list = [
      project({ id: "a" }), // not started
      project({ id: "b", openedDay: 0, startedDay: 4, escalated: { to: "d", toSeatId: null, toRoleId: null, from: "l", day: 3, live: true, what: "start" } }),
      project({ id: "c", openedDay: 0, startedDay: 2, doneDay: 10, measures: [{ day: 16 } as ReducedProject["measures"][number]],
        checks: [{ check: 30, opensDay: 40, dueDay: 45, measured: false, late: true }] }),
      project({ id: "d", openedDay: 0, startedDay: 6, doneDay: 12, verdict: "not measured" }),
    ];
    expect(projectLedger(list, 50)).toEqual({ startMedian: 4, notStarted: 1, measureMedian: 6, moved: 1, measuresOwed: 1, withoutNumber: 1 });
  });

  it("gives nulls below 5 holders or 5 answered cases, and the median and share with both", () => {
    const five = [answered(0, 1), answered(0, 2), answered(0, 3), answered(0, 4), answered(0, 9)];
    expect(deskStats(five, ["r1"], 4, 5)).toEqual({ median: null, withinPct: null });
    expect(deskStats(five.slice(0, 4), ["r1"], 5, 5)).toEqual({ median: null, withinPct: null });
    expect(deskStats([...five, answered(0, 1, "other")], ["r1"], 5, 5)).toEqual({ median: 3, withinPct: 80 });
  });
});
