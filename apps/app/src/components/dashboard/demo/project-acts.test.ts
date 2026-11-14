/* eslint-disable nextup/no-inline-strings -- Test fixtures represent team-authored page and tool titles. */
import { expect, it, vi } from "vitest";
import type { ActDeps } from "./act-deps";
import { projectActs } from "./project-acts";

it("page acts append each D9 event once and return the minted ids", () => {
  const emit = vi.fn<ActDeps["emit"]>().mockResolvedValue({ ok: true });
  const act = projectActs({ emit } as unknown as ActDeps).page;
  const id = act.add("p", { title: "Notes", icon: "doc", tools: [{ kind: "doc", title: "Minutes", content: "Saved" }], before: "steps" });
  const tool = act.addTool("p", id, "table", null);
  const merge = act.merge("p", id, "steps");
  act.edit("p", id, { title: "Decisions", icon: "star" });
  act.move("p", id, null);
  act.remove("p", id);
  act.restore("p", id);
  act.moveTool("p", tool, "files", "files.links");
  act.editTool("p", tool, { content: "New", baseRev: 2, collapsed: true });
  act.removeTool("p", tool);
  act.restoreTool("p", tool);
  act.unmerge("p", merge);
  expect(new Set([id, tool, merge]).size).toBe(3);
  expect(emit.mock.calls).toEqual([
    ["project.page.added", "p", { pageId: id, title: "Notes", icon: "doc", tools: [{ toolId: expect.any(String), kind: "doc", title: "Minutes", content: "Saved" }], before: "steps" }],
    ["project.tool.added", "p", { pageId: id, toolId: tool, kind: "table", before: null }],
    ["project.page.merged", "p", { mergeId: merge, fromPageId: id, intoPageId: "steps" }],
    ["project.page.edited", "p", { pageId: id, title: "Decisions", icon: "star" }],
    ["project.page.moved", "p", { pageId: id, before: null }],
    ["project.page.removed", "p", { pageId: id }],
    ["project.page.restored", "p", { pageId: id }],
    ["project.tool.moved", "p", { toolId: tool, toPageId: "files", before: "files.links" }],
    ["project.tool.edited", "p", { toolId: tool, content: "New", baseRev: 2, collapsed: true }],
    ["project.tool.removed", "p", { toolId: tool }],
    ["project.tool.restored", "p", { toolId: tool }],
    ["project.page.unmerged", "p", { mergeId: merge }],
  ]);
});
