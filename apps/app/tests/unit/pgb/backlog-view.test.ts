import { expect, it } from "vitest";
import { reduce } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { backlogOf } from "@/features/projects/backlog-view";

const state = reduce(LOCAL_SEED, { events: [], day: 0 });
const p = state.projects.find((x) => x.steps.length > 2) ?? state.projects[0];

it("PGB backlog: open steps only, the counts cover every live step", () => {
  const view = backlogOf(p, { day: state.day, me: null });
  expect(view.open.every((s) => s.column !== "done" && !s.dropped)).toBe(true);
  const live = p.steps.filter((s) => !s.dropped);
  expect(view.done + view.doing + view.todo).toBe(live.length);
  expect(view.open).toHaveLength(view.doing + view.todo);
});

it("PGB backlog: a late step comes before one that is on time", () => {
  const late = { ...p.steps[0], id: "late", column: "todo" as const, dueDay: state.day - 3, dropped: null };
  const fine = { ...p.steps[0], id: "fine", column: "todo" as const, dueDay: state.day + 3, dropped: null };
  const view = backlogOf({ ...p, steps: [fine, late] }, { day: state.day, me: null });
  expect(view.open.map((s) => s.id)).toEqual(["late", "fine"]);
});
