import { expect, it } from "vitest";
import { canAddTool, DEFAULT_PAGES, fitsEvent, kicksJira, mergePlan, pagesOf, suggestPageName, tabToPage, TOOL_KINDS } from "@/features/projects/pages";
import type { MergeRecord, ProjectPage, RemovedItem, ToolInstance } from "@/features/projects/types";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";

const tool = (id: string, kind: ToolInstance["kind"]): ToolInstance => ({ id, kind, title: null, collapsed: false, content: null, rev: 0 });
const page = (id: string, tools: ToolInstance[]): ProjectPage => ({ id, title: id, icon: "doc", tools });

it("PGE pages model: keeps legacy defaults isolated and filters Agent wherever it was moved", () => {
  const defaults = pagesOf({ pages: null }, { agent: true });
  expect(defaults.map((p) => p.id)).toEqual(["overview", "steps", "plan", "results", "files", "requests", "team", "activity", "agent"]);
  expect(defaults.find((p) => p.id === "steps")?.tools.map((t) => t.id)).toEqual(["steps.board", "steps.list"]);
  const steps = defaults[1];
  steps.tools.push(tool("moved-agent", "agent"));
  steps.tools[0].content = "local draft";
  expect(DEFAULT_PAGES[1].tools[0].content).toBeNull();
  const visible = pagesOf({ pages: defaults }, { agent: false });
  expect(visible.some((p) => p.id === "agent")).toBe(false);
  expect(visible[1].tools.map((t) => t.kind)).toEqual(["board", "list"]);
  expect(pagesOf({ pages: [] }, { agent: true })).toEqual([]);
  const removed: RemovedItem = { page: steps, tool: null, pageId: steps.id, before: null, day: 5 };
  expect(pagesOf({ pages: [defaults[0]], ...{ removed: [removed] } }, { agent: true })).toHaveLength(1);
});

it("PGE pages model: allows repeated tools and enforces singleton, Agent and capacity limits", () => {
  const pages = pagesOf({ pages: null }, { agent: false });
  const steps = pages[1];
  expect(canAddTool(pages, steps, "list", { agent: false })).toBe(true);
  expect(canAddTool(pages, steps, "overview", { agent: true })).toBe(false);
  expect(canAddTool(pages, steps, "agent", { agent: false })).toBe(false);
  expect(canAddTool(pages, steps, "agent", { agent: true })).toBe(true);
  const full = page("full", Array.from({ length: 24 }, (_, i) => tool(String(i), "list")));
  expect(canAddTool([full], full, "list", { agent: true })).toBe(false);
});

it("PGE pages model: merges every instance in order with content and revision intact or refuses the whole merge", () => {
  const into = pagesOf({ pages: null }, { agent: true })[1];
  const from = page("notes", [{ ...tool("second-list", "list"), title: "Parts", collapsed: true, content: "[]", rev: 3 }, tool("notes.doc", "doc")]);
  const result = mergePlan(into, from);
  expect(result).toEqual({ moved: from.tools, refused: null });
  expect([...into.tools, ...result.moved].map((t) => t.kind)).toEqual(["board", "list", "list", "doc"]);
  expect(mergePlan(into, DEFAULT_PAGES[0])).toEqual({ moved: [], refused: "overview" });
  const full = page("full", Array.from({ length: 23 }, (_, i) => tool(String(i), "doc")));
  expect(mergePlan(full, from)).toEqual({ moved: [], refused: "tooMany" });
  const record: MergeRecord = { from: { ...from, before: "team" }, toolIds: result.moved.map((t) => t.id) };
  expect(record.toolIds).toEqual(["second-list", "notes.doc"]);
});

it("PGE pages model: measures serialized event length and keeps page changes out of Jira", () => {
  const overhead = JSON.stringify({ content: "" }).length;
  expect(fitsEvent({ content: "x".repeat(12_000 - overhead) })).toBe(true);
  expect(fitsEvent({ content: "x".repeat(12_001 - overhead) })).toBe(false);
  expect(kicksJira("project.tool.edited")).toBe(false);
  expect(kicksJira("project.page.merged")).toBe(false);
  expect(kicksJira("project.milestone.added")).toBe(false);
  expect(kicksJira("project.form.added")).toBe(false);
  expect(kicksJira("project.step.moved")).toBe(true);
  expect(kicksJira("project.request.stepped")).toBe(true);
  expect(kicksJira("case.raised")).toBe(false);
  expect(tabToPage("board")).toBe("steps");
  expect(tabToPage("missing")).toBeNull();
  expect(suggestPageName(["calendar", "timeline"])[0]).toBe("projectPages.nameSuggestPlan");
  for (const kind of TOOL_KINDS) {
    const key = suggestPageName([kind])[0].split(".")[1];
    expect(en.projectPages).toHaveProperty(key);
    expect(de.projectPages).toHaveProperty(key);
  }
});
