import { expect, it } from "vitest";
import { addToolOptions, toolMenuItems } from "./page-view";
import { TOOL_KINDS } from "./pages";
import type { ProjectPage, ToolInstance, ToolKind } from "./types";

const tool = (id: string, kind: ToolKind, collapsed = false): ToolInstance => ({ id, kind, title: null, collapsed, content: null, rev: 0 });
const page = (tools: ToolInstance[]): ProjectPage => ({ id: "pg", title: "Page", icon: "board", tools });
const ids = (items: { id: string }[]) => items.map((i) => i.id);

const three = page([tool("a", "board"), tool("b", "doc"), tool("c", "list")]);

it("PGB tool menu: Move up only below the first tool and Move down only above the last", () => {
  const opts = { editor: true, jiraSyncing: false };
  expect(ids(toolMenuItems(three, three.tools[0], opts))).toEqual(["collapse", "moveDown", "rename", "moveToPage", "remove"]);
  expect(ids(toolMenuItems(three, three.tools[1], opts))).toEqual(["collapse", "moveUp", "moveDown", "rename", "moveToPage", "remove"]);
  expect(ids(toolMenuItems(three, three.tools[2], opts))).toEqual(["collapse", "moveUp", "rename", "moveToPage", "remove"]);
  expect(ids(toolMenuItems(page([tool("a", "doc", true)]), tool("a", "doc", true), opts))).toEqual(["expand", "rename", "moveToPage", "remove"]);
});

it("PGB tool menu: Open in Jira only for a Jira tool on a syncing project", () => {
  expect(ids(toolMenuItems(three, three.tools[0], { editor: true, jiraSyncing: true }))).toContain("openJira");
  expect(ids(toolMenuItems(three, three.tools[1], { editor: true, jiraSyncing: true }))).not.toContain("openJira");
  expect(ids(toolMenuItems(three, three.tools[0], { editor: true, jiraSyncing: false }))).not.toContain("openJira");
});

it("PGB tool menu: a viewer is offered no changing item", () => {
  const viewer = toolMenuItems(three, three.tools[0], { editor: false, jiraSyncing: true });
  expect(ids(viewer)).toEqual(["openJira"]);
  expect(viewer.some((i) => i.changing)).toBe(false);
  expect(toolMenuItems(three, three.tools[1], { editor: false, jiraSyncing: true })).toEqual([]);
});

it("PGB add tool: lists every kind with its tag when the company has Jira, no tags without", () => {
  const withJira = addToolOptions([three], three, { query: "", jiraOn: true, agent: true });
  expect(withJira.map((o) => o.kind)).toEqual([...TOOL_KINDS]);
  expect(withJira.filter((o) => o.tag === "jira").map((o) => o.kind)).toEqual(["board", "list", "calendar", "timeline", "milestones"]);
  expect(withJira.filter((o) => o.tag === "nextup")).toHaveLength(TOOL_KINDS.length - 5);
  expect(addToolOptions([three], three, { query: "", jiraOn: false, agent: true }).every((o) => o.tag === null)).toBe(true);
});

it("PGB add tool: filters by search and offers a second doc", () => {
  const label = (k: ToolKind) => (k === "table" ? "Spreadsheet" : k);
  expect(addToolOptions([three], three, { query: " sheet", jiraOn: false, agent: true, label }).map((o) => o.kind)).toEqual(["table"]);
  expect(addToolOptions([three], three, { query: "DOC", jiraOn: false, agent: true }).map((o) => o.kind)).toEqual(["doc"]);
  expect(addToolOptions([three], three, { query: "doc", jiraOn: false, agent: true })[0]).toEqual({ kind: "doc", tag: null, taken: false });
});

it("PGB add tool: greys overview and agent when the project has them and hides agent from who may not see it", () => {
  const has = page([tool("o", "overview"), tool("g", "agent")]);
  const taken = addToolOptions([has], has, { query: "", jiraOn: false, agent: true }).filter((o) => o.taken).map((o) => o.kind);
  expect(taken).toEqual(["overview", "agent"]);
  expect(addToolOptions([three], three, { query: "", jiraOn: false, agent: true }).some((o) => o.taken)).toBe(false);
  const hidden = addToolOptions([has], has, { query: "", jiraOn: false, agent: false });
  expect(hidden.some((o) => o.kind === "agent")).toBe(false);
});

it("PGB tool menu: drop and step targets name the tool to go before", async () => {
  const { dropBefore, stepBefore } = await import("./page-view");
  expect(dropBefore(three, "a", "c", false)).toBeNull();
  expect(dropBefore(three, "c", "a", true)).toBe("a");
  expect(dropBefore(three, "a", "b", false)).toBe("c");
  expect(dropBefore(three, "b", "a", false)).toBeUndefined();
  expect(dropBefore(three, "a", "a", true)).toBeUndefined();
  expect(stepBefore(three, "b", "up")).toBe("a");
  expect(stepBefore(three, "a", "down")).toBe("c");
  expect(stepBefore(three, "b", "down")).toBeNull();
  expect(stepBefore(three, "a", "up")).toBeUndefined();
});
