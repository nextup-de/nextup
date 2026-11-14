import { expect, it } from "vitest";
import type { CaseEvent, EventPayload } from "@/features/cases/events";
import { overviewFacts, parseOverviewRange } from "./overview-view";
import type { ReducedProject, Step } from "./types";

const step = (id: string, patch: Partial<Step> = {}): Step => ({
  id, text: id, owner: null, dueDay: null, column: "todo", why: "", note: "", addedDay: 0,
  movedDay: 0, by: "Lead", startedDay: null, doneDay: null, external: null,
  checklist: [], comments: [], waitingOn: null, ...patch,
});
const move = (stepId: string, day: number, to: string, extra: EventPayload = {}): CaseEvent => ({
  id: `${stepId}-${day}-${to}`, ts: day, day, type: "project.step.moved", actor: "Lead", target: "p", payload: { stepId, to, ...extra },
});
const project = (steps: Step[], history: CaseEvent[], patch: Partial<ReducedProject> = {}): ReducedProject =>
  ({ steps, history, status: "running", startedDay: -40, openedDay: -50, ...patch }) as ReducedProject;

const steps = [
  step("a", { column: "done", doneDay: -2, owner: "Ann", ownerUserId: "u1" }),
  step("b", { column: "done", doneDay: -10, owner: "Ann", ownerUserId: "u1" }),
  step("c", { column: "done", doneDay: -25 }),
  step("d", { column: "blocked", owner: "Bo", ownerUserId: "u2", dueDay: -4, waitingOn: { kind: "person", userId: "u3", name: null } }),
  step("e", { column: "doing", owner: "Ann", ownerUserId: "u1", dueDay: 3 }),
  step("f", { column: "todo", dueDay: 9 }),
  step("g", { column: "done", doneDay: -1, dropped: { why: "no", day: 0, byUserId: null } }),
];
const history = [move("d", -8, "blocked", { waitingOn: { kind: "person", userId: "u3" } }), move("x", -30, "blocked", { waitingOn: { kind: "outside", name: "Vendor" } }), move("x", -27, "doing")];
const p = project([...steps, step("x", { column: "doing" })], history);

it("HUB overview HUB-A1 tiles and the column bar follow the range", () => {
  const week = overviewFacts(p, { range: "7d", day: 0, viewerOnTeam: true });
  const month = overviewFacts(p, { range: "30d", day: 0, viewerOnTeam: true });
  expect(week.tiles.doneInRange).toBe(1);
  expect(month.tiles.doneInRange).toBe(3);
  expect(overviewFacts(p, { range: "14d", day: 0, viewerOnTeam: true }).tiles.doneInRange).toBe(2);
  expect(week.tiles).toMatchObject({ waiting: 1, late: 1, oldestLateDays: 4, nextDue: { stepId: "e", dueDay: 3 } });
  expect(week.columns).toEqual({ todo: 1, doing: 2, blocked: 1, done: 3 });
  expect(parseOverviewRange("nope")).toBe("7d");
  expect(parseOverviewRange("start")).toBe("start");
});

it("HUB overview HUB-A1 who has what counts open steps per owner and shows to the team only", () => {
  const f = overviewFacts(p, { range: "7d", day: 0, viewerOnTeam: true });
  expect(f.whoHasWhat.find((r) => r.userId === "u1")).toMatchObject({ doing: 1, total: 1 });
  expect(f.whoHasWhat.find((r) => r.userId === "u2")).toMatchObject({ blocked: 1, total: 1 });
  expect(overviewFacts(p, { range: "7d", day: 0, viewerOnTeam: false }).whoHasWhat).toEqual([]);
});

it("HUB overview HUB-A1 done per week buckets by range and the latest list stays inside it", () => {
  const month = overviewFacts(p, { range: "30d", day: 0, viewerOnTeam: true });
  expect(month.perWeek).toHaveLength(5);
  expect(month.perWeek.map((w) => w.done)).toEqual([0, 1, 0, 1, 1]);
  const week = overviewFacts(p, { range: "7d", day: 0, viewerOnTeam: true });
  expect(week.perWeek).toEqual([{ endDay: 0, done: 1 }]);
  expect(week.latest).toEqual([]);
  expect(month.latest.map((e) => e.id)).toEqual(["d--8-blocked", "x--27-doing"]);
  expect(overviewFacts(p, { range: "start", day: 0, viewerOnTeam: true }).latest).toHaveLength(3);
});

it("HUB overview HUB-A1 where the waiting goes counts blocked days in range, and is empty off the team", () => {
  const week = overviewFacts(p, { range: "7d", day: 0, viewerOnTeam: true });
  expect(week.waiting).toEqual([{ key: { kind: "person", userId: "u3", name: null }, days: 7 }]);
  const all = overviewFacts(p, { range: "start", day: 0, viewerOnTeam: true });
  expect(all.waiting).toEqual([
    { key: { kind: "person", userId: "u3", name: null }, days: 9 },
    { key: { kind: "outside", userId: null, name: "Vendor" }, days: 3 },
  ]);
  expect(overviewFacts(p, { range: "start", day: 0, viewerOnTeam: false }).waiting).toEqual([]);
});

it("HUB overview HUB-A1 a planning project shows its baseline", () => {
  expect(overviewFacts(project([], [], { status: "planning", startedDay: null }), { range: "7d", day: 0, viewerOnTeam: true }).showBaseline).toBe(true);
  expect(overviewFacts(p, { range: "7d", day: 0, viewerOnTeam: true }).showBaseline).toBe(false);
});
