import { describe, expect, it } from "vitest";
import { EVENT_BUDGET } from "./pages";
import { importPlan, importedPageId, mergeRows } from "./page-undo";
import type { CustomPage } from "./sidebar";
import type { ProjectPage, ToolInstance, ToolKind } from "./types";

const tool = (id: string, kind: ToolKind, title: string | null = null): ToolInstance => ({ id, kind, title, collapsed: false, content: null, rev: 0 });
const page = (id: string, tools: ToolInstance[]): ProjectPage => ({ id, title: id, icon: "doc", tools });
const custom = (over: Partial<CustomPage> & Pick<CustomPage, "id" | "kind">): CustomPage => ({ title: "T " + over.id, icon: "doc", body: "", items: [], rows: [], url: "", ...over });

describe("PGB undo and import", () => {
  it("lists the target's tools, then every moved tool, a repeated kind as a second one", () => {
    const rows = mergeRows(page("steps", [tool("a", "board"), tool("b", "list")]), page("notes", [tool("c", "doc", "Minutes"), tool("d", "board")]));
    expect(rows).toEqual([
      { kind: "board", title: "", mark: "on" }, { kind: "list", title: "", mark: "on" },
      { kind: "doc", title: "Minutes", mark: "from" }, { kind: "board", title: "", mark: "second" },
    ]);
  });

  it("maps each browser page to one page.added with a fixed id, title and content", () => {
    const plan = importPlan("p1", [
      custom({ id: "b1", kind: "page", body: "Hello" }),
      custom({ id: "b2", kind: "checklist", items: [{ id: "i", text: "x", done: true }] }),
      custom({ id: "b3", kind: "table", rows: [["a", "b"]] }),
      custom({ id: "b4", kind: "link", url: "https://example.com" }),
    ], []);
    expect(plan.map((s) => s.browserId)).toEqual(["b1", "b2", "b3", "b4"]);
    expect(plan.every((s) => s.events.length === 1 && s.events[0].type === "project.page.added" && !s.tooLong)).toBe(true);
    expect(plan[0].events[0].payload).toMatchObject({ pageId: importedPageId("p1", "b1"), title: "T b1", icon: "doc", tools: [{ kind: "doc", title: "T b1", content: JSON.stringify({ body: "Hello" }) }] });
    expect(plan.map((s) => (s.events[0].payload.tools as { kind: string }[])[0].kind)).toEqual(["doc", "checklist", "table", "links"]);
  });

  it("skips pages already brought over and never plans a delete", () => {
    const plan = importPlan("p1", [custom({ id: "b1", kind: "page" }), custom({ id: "b2", kind: "page" })], ["b1"]);
    expect(plan.map((s) => s.browserId)).toEqual(["b2"]);
    expect(JSON.stringify(plan)).not.toMatch(/removed|deleted/);
  });

  it("splits a too long content into a tool.edited, and marks one that fits no event", () => {
    const long = "x".repeat(EVENT_BUDGET - 120);
    const [split, never] = importPlan("p1", [custom({ id: "b1", kind: "page", body: long }), custom({ id: "b2", kind: "page", body: "y".repeat(EVENT_BUDGET + 10) })], []);
    expect(split.tooLong).toBe(false);
    expect(split.events.map((e) => e.type)).toEqual(["project.page.added", "project.tool.edited"]);
    expect(JSON.stringify(split.events[0].payload)).not.toContain("xxxx");
    expect(split.events[1].payload).toMatchObject({ baseRev: 0 });
    expect(never).toMatchObject({ browserId: "b2", events: [], tooLong: true });
  });
});
