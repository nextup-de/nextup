import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import type { CaseEvent, EventPayload } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { SEED } from "@/features/demo/seed";
import { withSampleData } from "@/features/demo/sample-data";
import { loopRules } from "@/features/loop/rules";
import { DEFAULT_PAGES } from "@/features/projects/pages";
import { applyProjectEvent, newBook, seedProject } from "@/features/projects/reduce";
import type { ReducedProject } from "@/features/projects/types";

function setup() {
  const book = newBook();
  seedProject(book, { id: "p", title: "Pilot", sources: [], authors: [], lead: "Lead", openedDay: 0, openedBy: "Lead" });
  const p = book.byId.p;
  let n = 0;
  const send = (type: CaseEvent["type"], payload: EventPayload = {}, day = 0) => {
    applyProjectEvent(book, { id: `event-${n++}`, ts: 0, target: p.id, actor: "Lead", type, payload, day }, loopRules());
  };
  const page = (id: string) => p.pages!.find((x) => x.id === id)!;
  const tool = (id: string) => p.pages!.flatMap((x) => x.tools).find((x) => x.id === id)!;
  return { p, send, page, tool };
}

const notes: EventPayload = {
  pageId: "notes", title: "Notes", icon: "doc", before: "steps",
  tools: [{ toolId: "doc", kind: "doc", title: "Decisions", content: "Original text" }, { toolId: "list", kind: "list" }],
};
const model = (p: ReducedProject) => ({ pages: p.pages, removed: p.removed, merges: p.merges });

it("PGE pages reduce: initializes all defaults only on a page or tool event and isolates projects and defaults", () => {
  const { p, send, tool } = setup();
  expect(model(p)).toEqual({ pages: null, removed: [], merges: {} });
  send("project.commented", { text: "Hello" });
  expect(p.pages).toBeNull();
  send("project.tool.edited", { toolId: "steps.list", collapsed: true });
  expect(p.pages!.map((x) => x.id)).toEqual(DEFAULT_PAGES.map((x) => x.id));
  expect(tool("agent.agent").kind).toBe("agent");
  expect(tool("steps.list").collapsed).toBe(true);
  expect(DEFAULT_PAGES[1].tools[1].collapsed).toBe(false);
  const other = setup();
  other.send("project.page.edited", { pageId: "steps", title: "Work" });
  expect(other.tool("steps.list").collapsed).toBe(false);
});

it("PGE pages reduce: adds, edits and moves pages and tools before siblings or to the end", () => {
  const { p, send, page, tool } = setup();
  send("project.page.added", notes);
  expect(p.pages!.slice(0, 3).map((x) => x.id)).toEqual(["overview", "notes", "steps"]);
  expect(tool("doc")).toEqual({ id: "doc", kind: "doc", title: "Decisions", content: "Original text", collapsed: false, rev: 0 });
  send("project.page.edited", { pageId: "notes", title: "Decisions", icon: "star" });
  expect(page("notes")).toMatchObject({ title: "Decisions", icon: "star" });
  send("project.page.moved", { pageId: "notes", before: null });
  expect(p.pages!.at(-1)?.id).toBe("notes");
  send("project.page.moved", { pageId: "notes", before: "overview" });
  expect(p.pages![0].id).toBe("notes");
  send("project.tool.added", { pageId: "notes", toolId: "table", kind: "table", before: "doc" });
  expect(page("notes").tools.map((x) => x.id)).toEqual(["table", "doc", "list"]);
  expect(tool("table")).toMatchObject({ title: null, content: null, collapsed: false, rev: 0 });
  send("project.tool.moved", { toolId: "list", toPageId: "notes", before: "table" });
  expect(page("notes").tools.map((x) => x.id)).toEqual(["list", "table", "doc"]);
  send("project.tool.moved", { toolId: "doc", toPageId: "steps", before: "steps.list" });
  expect(page("steps").tools.map((x) => x.id)).toEqual(["steps.board", "doc", "steps.list"]);
  send("project.tool.moved", { toolId: "doc", toPageId: "steps", before: null });
  expect(page("steps").tools.at(-1)?.id).toBe("doc");
  send("project.tool.edited", { toolId: "doc", content: "First edit", baseRev: 0 });
  send("project.tool.edited", { toolId: "doc", content: "", baseRev: 1 });
  send("project.tool.edited", { toolId: "doc", title: "Minutes", collapsed: true });
  send("project.tool.edited", { toolId: "doc", collapsed: false });
  expect(tool("doc")).toMatchObject({ content: "", rev: 2, title: "Minutes", collapsed: false });
  send("project.page.added", { pageId: "last", title: "Last", icon: "box", tools: [] });
  expect(p.pages!.at(-1)?.id).toBe("last");
});

it("PGE pages reduce: restores removed pages with their tools and tools at their original places", () => {
  const { p, send, page, tool } = setup();
  send("project.page.added", notes);
  send("project.tool.edited", { toolId: "doc", content: "Saved", baseRev: 0, collapsed: true });
  const original = structuredClone(page("notes"));
  send("project.page.removed", { pageId: "notes" }, 2);
  expect(p.removed).toEqual([{ page: original, tool: null, pageId: "notes", before: "steps", day: 2 }]);
  expect(p.pages!.some((x) => x.id === "notes")).toBe(false);
  send("project.page.restored", { pageId: "notes" }, 3);
  expect(p.pages![1]).toEqual(original);
  expect(p.removed).toEqual([]);
  const doc = structuredClone(tool("doc"));
  send("project.tool.removed", { toolId: "doc" }, 4);
  expect(p.removed).toEqual([{ page: null, tool: doc, pageId: "notes", before: "list", day: 4 }]);
  send("project.tool.restored", { toolId: "doc" }, 5);
  expect(page("notes").tools).toEqual(original.tools);
  expect(p.removed).toEqual([]);
  send("project.tool.removed", { toolId: "doc" });
  send("project.tool.removed", { toolId: "list" });
  send("project.tool.restored", { toolId: "doc" });
  expect(page("notes").tools.map((x) => x.id)).toEqual(["doc"]);
  send("project.page.removed", { pageId: "notes" });
  send("project.page.removed", { pageId: "steps" });
  send("project.page.restored", { pageId: "notes" });
  expect(p.pages!.at(-1)?.id).toBe("notes");
});

it("PGE pages reduce: merges every tool with its content and rev and unmerges surviving tools in original order", () => {
  const { p, send, page, tool } = setup();
  send("project.page.added", notes);
  send("project.tool.edited", { toolId: "doc", content: "Saved", baseRev: 0, collapsed: true });
  const original = structuredClone(page("notes"));
  send("project.page.merged", { mergeId: "m", fromPageId: "notes", intoPageId: "steps" });
  expect(page("steps").tools.map((x) => x.kind)).toEqual(["board", "list", "doc", "list"]);
  expect(page("steps").tools.slice(2)).toEqual(original.tools);
  expect(p.pages!.some((x) => x.id === "notes")).toBe(false);
  expect(p.merges.m).toEqual({ from: { id: "notes", title: "Notes", icon: "doc", before: "steps" }, toolIds: ["doc", "list"] });
  send("project.tool.moved", { toolId: "doc", toPageId: "files" });
  send("project.page.unmerged", { mergeId: "m" });
  expect(p.pages![1]).toEqual(original);
  expect(page("steps").tools.map((x) => x.id)).toEqual(["steps.board", "steps.list"]);
  expect(page("files").tools.some((x) => x.id === "doc")).toBe(false);
  expect(p.merges).toEqual({});
  send("project.page.merged", { mergeId: "m2", fromPageId: "notes", intoPageId: "steps" });
  send("project.tool.removed", { toolId: "doc" });
  send("project.page.unmerged", { mergeId: "m2" });
  expect(page("notes").tools.map((x) => x.id)).toEqual(["list"]);
  expect(tool("doc")).toBeUndefined();
  expect(p.removed[0].tool).toEqual(original.tools[0]);
});

it("PGE pages reduce: protects overview and the last page and refuses an overflowing or self merge", () => {
  const { p, send, page } = setup();
  send("project.page.edited", { pageId: "steps", title: "Work" });
  const original = structuredClone(model(p));
  send("project.page.removed", { pageId: "overview" });
  send("project.page.merged", { mergeId: "m", fromPageId: "overview", intoPageId: "steps" });
  send("project.page.merged", { mergeId: "self", fromPageId: "steps", intoPageId: "steps" });
  expect(model(p)).toEqual(original);
  send("project.page.added", { pageId: "full", title: "Full", icon: "doc", tools: Array.from({ length: 23 }, (_, i) => ({ toolId: `doc-${i}`, kind: "doc" })) });
  const full = structuredClone(model(p));
  send("project.page.merged", { mergeId: "overflow", fromPageId: "full", intoPageId: "steps" });
  expect(model(p)).toEqual(full);
  for (const id of p.pages!.map((x) => x.id)) send("project.page.removed", { pageId: id });
  expect(p.pages!.map((x) => x.id)).toEqual(["overview"]);
  // A legacy model with a different final page also keeps that page.
  p.pages = [page("overview")!];
  p.pages[0].id = "last";
  send("project.page.removed", { pageId: "last" });
  expect(p.pages).toHaveLength(1);
});

it("PGE pages reduce: ignores unknown references, duplicate adds and repeated undo without losing data", () => {
  const { p, send } = setup();
  send("project.page.added", notes);
  const original = structuredClone(model(p));
  const events: [CaseEvent["type"], EventPayload][] = [
    ["project.page.edited", { pageId: "missing", title: "Gone" }],
    ["project.page.moved", { pageId: "missing", before: null }],
    ["project.page.removed", { pageId: "missing" }],
    ["project.page.restored", { pageId: "missing" }],
    ["project.tool.added", { pageId: "missing", toolId: "new", kind: "doc" }],
    ["project.tool.moved", { toolId: "doc", toPageId: "missing" }],
    ["project.tool.moved", { toolId: "missing", toPageId: "steps" }],
    ["project.tool.edited", { toolId: "missing", content: "Gone", baseRev: 0 }],
    ["project.tool.removed", { toolId: "missing" }],
    ["project.tool.restored", { toolId: "missing" }],
    ["project.page.merged", { mergeId: "m", fromPageId: "missing", intoPageId: "steps" }],
    ["project.page.merged", { mergeId: "m", fromPageId: "notes", intoPageId: "missing" }],
    ["project.page.unmerged", { mergeId: "missing" }],
    ["project.page.added", notes],
    ["project.tool.added", { pageId: "steps", toolId: "doc", kind: "doc" }],
  ];
  for (const [type, payload] of events) send(type, payload);
  expect(model(p)).toEqual(original);
  send("project.page.merged", { mergeId: "m", fromPageId: "notes", intoPageId: "steps" });
  send("project.page.unmerged", { mergeId: "m" });
  const restored = structuredClone(model(p));
  send("project.page.unmerged", { mergeId: "m" });
  expect(model(p)).toEqual(restored);
});

it("PGE pages reduce: expires removed items after 30 company days only on the next page or tool event", () => {
  const { p, send, tool } = setup();
  send("project.tool.removed", { toolId: "steps.board" }, 2);
  send("project.page.removed", { pageId: "files" }, 2);
  send("project.commented", { text: "Later" }, 33);
  expect(p.removed).toHaveLength(2);
  send("project.page.edited", { pageId: "steps", title: "Work" }, 32);
  expect(p.removed).toHaveLength(2);
  send("project.tool.restored", { toolId: "steps.board" }, 33);
  expect(p.removed).toEqual([]);
  expect(tool("steps.board")).toBeUndefined();
  send("project.page.restored", { pageId: "files" }, 33);
  expect(p.pages!.some((x) => x.id === "files")).toBe(false);
});

it("PGE pages reduce: replays the recorded pre-PGE demo sample unchanged with pages null", () => {
  const seed = withSampleData(SEED, { userId: "u_test", name: "Test Lead", handle: "test", role: "member" }, 0);
  const projects = reduce(seed, { events: [], day: 0 }).projects;
  expect(projects).toHaveLength(9);
  for (const p of projects) expect(model(p)).toEqual({ pages: null, removed: [], merges: {} });
  const legacy = projects.map((p) => Object.fromEntries(Object.entries(p).filter(([key]) => !["pages", "removed", "merges"].includes(key))));
  // Captured from this sample with the reducer before PGE-A1; covers every existing project field and its history.
  expect(createHash("sha256").update(JSON.stringify(legacy)).digest("hex")).toBe("7b6d013d117a15fc9c3a782461b29b1a77946f838c00d96d2a6177555616aa9e");
});
