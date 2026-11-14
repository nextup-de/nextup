import { expect, it, vi } from "vitest";
import { projectActs } from "@/components/dashboard/demo/project-acts";
import type { ActDeps } from "@/components/dashboard/demo/act-deps";
import type { AppendOutcome } from "@/server/actions/events";
import { canCreate, canNext, preselect, toPageAdded, wizard } from "./page-wizard";

it("PGB wizard: numbers picks in selection order and renumbers after unpick and drop", () => {
  let state = preselect();
  expect(canNext(state)).toBe(false);
  expect(wizard(state, { type: "next" }).step).toBe(1);
  state = wizard(state, { type: "pick", kind: "timeline" });
  state = wizard(state, { type: "pick", kind: "calendar" });
  state = wizard(state, { type: "pick", kind: "board" });
  expect(state.picks.map((p, i) => [p.kind, i + 1])).toEqual([["timeline", 1], ["calendar", 2], ["board", 3]]);
  state = wizard(state, { type: "unpick", kind: "calendar" });
  expect(state.picks.map((p, i) => [p.kind, i + 1])).toEqual([["timeline", 1], ["board", 2]]);
  state = wizard(state, { type: "drop", kind: "timeline" });
  expect(state.picks).toEqual([{ kind: "board" }]);
  expect(wizard(state, { type: "pick", kind: "board" }).picks).toEqual(state.picks);
  expect(canNext(state)).toBe(true);
  expect(wizard(state, { type: "next" }).step).toBe(2);
  expect(wizard(state, { type: "clear" }).picks).toEqual([]);
});

it("PGB wizard: preselect starts picked and Create requires a trimmed name of 1–60 characters", () => {
  let state = wizard(preselect({ kind: "doc" }), { type: "next" });
  expect(state.picks).toEqual([{ kind: "doc" }]);
  expect(canCreate(state)).toBe(false);
  for (const [name, valid] of [[" ", false], ["x", true], ["x".repeat(60), true], ["x".repeat(61), false]] as const) {
    state = wizard(state, { type: "name", name }); expect(canCreate(state)).toBe(valid);
  }
  expect(wizard(state, { type: "back" }).step).toBe(1);
  expect(() => toPageAdded(state, { pageId: "page-1", toolIds: ["tool-1"] })).toThrow();
});

it("PGB wizard: icon follows the first tool through reorder and drop until explicitly chosen", () => {
  let state = preselect({ kind: "calendar" });
  state = wizard(state, { type: "pick", kind: "timeline" });
  expect(state.icon).toBe("calendar");
  state = wizard(state, { type: "reorder", from: 1, to: 0 });
  expect(state.icon).toBe("timeline");
  state = wizard(state, { type: "drop", kind: "timeline" });
  expect(state.icon).toBe("calendar");
  state = wizard(state, { type: "icon", icon: "star" });
  state = wizard(state, { type: "pick", kind: "board" });
  state = wizard(state, { type: "reorder", from: 1, to: 0 });
  expect(state.icon).toBe("star");
  expect(wizard(state, { type: "reorder", from: -1, to: 0 })).toBe(state);
});

it("PGB wizard: event contains new tools in chosen order and excludes an existing preselected tool", () => {
  let state = preselect({ kind: "calendar", toolId: "existing-calendar" });
  state = wizard(state, { type: "pick", kind: "timeline" });
  state = wizard(state, { type: "pick", kind: "board" });
  state = wizard(state, { type: "reorder", from: 2, to: 0 });
  state = wizard(state, { type: "name", name: " Plan " });
  expect(toPageAdded(state, { pageId: "page-1", toolIds: ["board-1", "timeline-1"] })).toEqual({
    pageId: "page-1", title: "Plan", icon: "board", tools: [{ toolId: "board-1", kind: "board" }, { toolId: "timeline-1", kind: "timeline" }],
  });
  expect(state.picks[1].toolId).toBe("existing-calendar");
  expect(() => toPageAdded(state, { pageId: "page-1", toolIds: [] })).toThrow();
});

it("PGB wizard: clearing and repicking a preselected tool retains its identity", () => {
  let state = preselect({ kind: "overview", toolId: "existing-overview" });
  state = wizard(state, { type: "clear" });
  state = wizard(state, { type: "pick", kind: "overview" });
  state = wizard(state, { type: "name", name: "Overview" });
  expect(toPageAdded(state, { pageId: "page-2", toolIds: [] }).tools).toEqual([]);
  expect(state.picks[0].toolId).toBe("existing-overview");
});


it("PGB wizard: persistence finishes before the existing tool is moved, with no duplicate tool addition", async () => {
  let finish!: (result: AppendOutcome) => void;
  const emit = vi.fn().mockImplementationOnce(() => new Promise<AppendOutcome>((resolve) => { finish = resolve; })).mockResolvedValue({ ok: true });
  const acts = projectActs({ emit } as unknown as ActDeps).page;
  let state = preselect({ kind: "calendar", toolId: "existing-calendar" });
  state = wizard(state, { type: "pick", kind: "timeline" });
  state = wizard(state, { type: "name", name: "Plan" });
  const payload = toPageAdded(state, { pageId: "probe", toolIds: ["probe-tool"] });
  const pending = acts.create("project-1", { title: payload.title!, icon: state.icon, tools: payload.tools! });
  expect(emit).toHaveBeenCalledTimes(1);
  expect(emit.mock.calls[0][2].tools).toEqual([{ kind: "timeline", toolId: expect.any(String) }]);
  let settled = false;
  void pending.then(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);
  finish({ ok: true });
  const created = await pending;
  expect(created.ok).toBe(true);
  await acts.moveTool("project-1", "existing-calendar", created.pageId!, created.tools![0].toolId);
  expect(emit.mock.calls[1]).toEqual(["project.tool.moved", "project-1", { toolId: "existing-calendar", toPageId: created.pageId, before: created.tools![0].toolId }]);
});

it("PGB wizard: a refused server append returns no created page id", async () => {
  const emit = vi.fn().mockResolvedValue({ ok: false, error: "Refused" });
  const acts = projectActs({ emit } as unknown as ActDeps).page;
  await expect(acts.create("project-1", { title: "Plan", icon: "calendar", tools: [] })).resolves.toEqual({ ok: false, error: "Refused" });
  expect(emit).toHaveBeenCalledTimes(1);
});
