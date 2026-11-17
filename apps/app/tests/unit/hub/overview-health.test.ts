// The Overview's one status line (Kevin, 17 Nov 2026): on track, needs attention or behind, from the board and the done-by day.
import { expect, it } from "vitest";
import { overviewHealth } from "@/features/projects/overview-view";

const facts = (columns: Partial<Record<"todo" | "doing" | "blocked" | "done", number>>, tiles: { stuck?: number; late?: number } = {}) => ({
  columns: { todo: 0, doing: 0, blocked: 0, done: 0, ...columns },
  tiles: { doneInRange: 0, waiting: 0, late: tiles.late ?? 0, oldestLateDays: null, nextDue: null, stuck: tiles.stuck ?? 0, longestStuck: null },
});
const running = { status: "running" as const, doneBy: 30, steps: [] };

it("HEALTH: on track while nothing is blocked, stuck or late, with the days left", () => {
  expect(overviewHealth(running, facts({ todo: 2, doing: 1, done: 1 }), 20)).toEqual({ tone: "ok", daysLeft: 10 });
});

it("HEALTH: a blocked, stuck or late step needs attention", () => {
  expect(overviewHealth(running, facts({ blocked: 1 }), 20)?.tone).toBe("attention");
  expect(overviewHealth(running, facts({ doing: 1 }, { stuck: 1 }), 20)?.tone).toBe("attention");
  expect(overviewHealth(running, facts({ todo: 1 }, { late: 1 }), 20)?.tone).toBe("attention");
});

it("HEALTH: past the done-by day with open steps is behind, whatever the board says", () => {
  expect(overviewHealth(running, facts({ todo: 1 }), 33)).toEqual({ tone: "late", daysLeft: -3 });
});

it("HEALTH: says nothing before the start, after it, or with every step done", () => {
  expect(overviewHealth({ ...running, status: "planning" }, facts({ todo: 3 }), 20)).toBeNull();
  expect(overviewHealth({ ...running, status: "measuring" }, facts({ done: 3 }), 20)).toBeNull();
  expect(overviewHealth(running, facts({ done: 3 }), 20)).toBeNull();
});
