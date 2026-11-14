import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { usePageActs } from "@/components/projects/page/usePageActs";
import { AddPageDialog } from "@/components/projects/page/AddPageDialog";
import { MergeDialog } from "@/components/projects/page/MergeDialog";
import { ToolSection } from "@/components/projects/page/ToolSection";
import { BrowserPagesImport } from "@/components/projects/page/BrowserPagesImport";
import { DEFAULT_PAGES } from "@/features/projects/pages";
import { reduce } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { demoJiraView, jiraRowOf } from "@/features/projects/views";
import { createT, type MessageKey } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { projectPages } from "@/i18n/messages/projectPages";

const mocks = vi.hoisted(() => {
  const names = ["add", "edit", "move", "remove", "restore", "addTool", "moveTool", "editTool", "removeTool", "restoreTool", "merge", "unmerge"] as const;
  return {
    check: vi.fn(),
    page: Object.fromEntries(names.map((name) => [name, vi.fn(() => "created-id")])) as Record<typeof names[number], ReturnType<typeof vi.fn>>,
  };
});
vi.mock("@/components/projects/parts", () => ({ useRights: () => ({ check: mocks.check }) }));
vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => ({ act: { project: { page: mocks.page } } }) }));

const p = reduce(LOCAL_SEED, { events: [], day: 0 }).projects[0];
const page = DEFAULT_PAGES[0];
const jira = jiraRowOf(p, demoJiraView(0), 0, "en");
const tool = { id: "notes.doc", kind: "doc" as const, title: null, collapsed: false, rev: 0, content: JSON.stringify({ body: "Decision recorded" }) };
const noop = () => {};
const input = { title: "Notes", icon: "doc" as const, tools: [{ kind: "doc" as const, title: "Decisions", content: "{}" }], before: "steps" };
const change = { title: "Renamed", icon: "star" as const };
const toolChange = { title: "Decisions", collapsed: true, content: "{}", baseRev: 0 };
type Acts = ReturnType<typeof usePageActs>;
const cases = [
  { name: "add", type: "project.page.added", payload: { ...input, pageId: expect.any(String), tools: [{ ...input.tools[0], toolId: expect.any(String) }] }, args: [p.id, input], invoke: (a: Acts) => a.add(input) },
  { name: "edit", type: "project.page.edited", payload: { pageId: "notes", ...change }, args: [p.id, "notes", change], invoke: (a: Acts) => a.edit("notes", change) },
  { name: "move", type: "project.page.moved", payload: { pageId: "notes", before: null }, args: [p.id, "notes", null], invoke: (a: Acts) => a.move("notes", null) },
  { name: "remove", type: "project.page.removed", payload: { pageId: "notes" }, args: [p.id, "notes"], invoke: (a: Acts) => a.remove("notes") },
  { name: "restore", type: "project.page.restored", payload: { pageId: "notes" }, args: [p.id, "notes"], invoke: (a: Acts) => a.restore("notes") },
  { name: "addTool", type: "project.tool.added", payload: { pageId: "notes", toolId: expect.any(String), kind: "doc", before: null }, args: [p.id, "notes", "doc", null], invoke: (a: Acts) => a.addTool("notes", "doc", null) },
  { name: "moveTool", type: "project.tool.moved", payload: { toolId: "notes.doc", toPageId: "steps", before: "steps.list" }, args: [p.id, "notes.doc", "steps", "steps.list"], invoke: (a: Acts) => a.moveTool("notes.doc", "steps", "steps.list") },
  { name: "editTool", type: "project.tool.edited", payload: { toolId: "notes.doc", ...toolChange }, args: [p.id, "notes.doc", toolChange], invoke: (a: Acts) => a.editTool("notes.doc", toolChange) },
  { name: "removeTool", type: "project.tool.removed", payload: { toolId: "notes.doc" }, args: [p.id, "notes.doc"], invoke: (a: Acts) => a.removeTool("notes.doc") },
  { name: "restoreTool", type: "project.tool.restored", payload: { toolId: "notes.doc" }, args: [p.id, "notes.doc"], invoke: (a: Acts) => a.restoreTool("notes.doc") },
  { name: "merge", type: "project.page.merged", payload: { fromPageId: "notes", intoPageId: "steps", mergeId: expect.any(String) }, args: [p.id, "notes", "steps"], invoke: (a: Acts) => a.merge("notes", "steps") },
  { name: "unmerge", type: "project.page.unmerged", payload: { mergeId: "merge-1" }, args: [p.id, "merge-1"], invoke: (a: Acts) => a.unmerge("merge-1") },
] as const;

function acts() {
  let value: Acts | undefined;
  function Probe() { value = usePageActs(p); return null; }
  html(h(Probe));
  return value!;
}
const render = (children: React.ReactNode, locale: "en" | "de" = "en") => html(h(I18nProvider, { locale, children }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.check.mockReturnValue({ ok: true });
});

it.each(cases)("PGB scaffold: $name checks rights once before its act and resolves success", async ({ name, type, payload, args, invoke }) => {
  const promise = invoke(acts());
  expect(promise).toBeInstanceOf(Promise);
  await expect(promise).resolves.toEqual({ ok: true });
  expect(mocks.check).toHaveBeenCalledExactlyOnceWith(type, payload);
  expect(mocks.page[name]).toHaveBeenCalledExactlyOnceWith(...args);
  expect(mocks.check.mock.invocationCallOrder[0]).toBeLessThan(mocks.page[name].mock.invocationCallOrder[0]);
  for (const other of Object.keys(mocks.page) as (keyof typeof mocks.page)[]) {
    if (other !== name) expect(mocks.page[other]).not.toHaveBeenCalled();
  }
});

it.each(cases)("PGB scaffold: $name returns the refusal without calling any act", async ({ type, payload, invoke }) => {
  mocks.check.mockReturnValue({ ok: false, error: "This project is closed." });
  await expect(invoke(acts())).resolves.toEqual({ ok: false, error: "This project is closed." });
  expect(mocks.check).toHaveBeenCalledExactlyOnceWith(type, payload);
  for (const act of Object.values(mocks.page)) expect(act).not.toHaveBeenCalled();
});

it("PGB scaffold: the outcome stays pending while an act is running", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  mocks.page.edit.mockReturnValueOnce(pending);
  let settled = false;
  const result = acts().edit("notes", change).then((outcome) => { settled = true; return outcome; });
  await Promise.resolve();
  expect(settled).toBe(false);
  finish();
  await expect(result).resolves.toEqual({ ok: true });
});

it("PGB scaffold: creation callbacks receive the act layer's persisted ids only after permission", async () => {
  const a = acts();
  const created = vi.fn();
  await a.add(input, created);
  await a.addTool("notes", "doc", undefined, created);
  await a.merge("notes", "steps", created);
  expect(created.mock.calls).toEqual([["created-id"], ["created-id"], ["created-id"]]);
  mocks.check.mockReturnValue({ ok: false, error: "Refused" });
  created.mockClear();
  await a.add(input, created);
  await a.addTool("notes", "doc", undefined, created);
  await a.merge("notes", "steps", created);
  expect(created).not.toHaveBeenCalled();
});

it("PGB scaffold: omitted optional placement stays omitted in the rights payload", async () => {
  const a = acts();
  await a.addTool("notes", "doc");
  expect(mocks.check.mock.calls[0][1]).not.toHaveProperty("before");
  await a.moveTool("notes.doc", "steps");
  expect(mocks.check.mock.calls[1][1]).not.toHaveProperty("before");
});

it("PGB scaffold: all four stand-ins render with final props in both languages", () => {
  for (const locale of ["en", "de"] as const) {
    const t = createT(locale);
    const addProps = { p, open: true, onClose: noop, onCreated: noop, preselect: { kind: "doc" as const, toolId: tool.id } };
    const mergeProps = { p, fromPageId: "notes", intoPageId: "steps", open: true, onClose: noop, onMerged: noop };
    expect(render(h(AddPageDialog, addProps), locale)).toContain(t("projectPages.newPage"));
    expect(render(h(AddPageDialog, { ...addProps, open: false }), locale)).toBe("");
    expect(render(h(MergeDialog, mergeProps), locale)).toContain(t("projectPages.mergePages"));
    expect(render(h(MergeDialog, { ...mergeProps, open: false }), locale)).toBe("");
    const section = { p, page, tool, index: 0, count: 1, jira, editor: true, hints: [], onAddAt: noop };
    const markup = render(h(ToolSection, section), locale);
    expect(markup).toContain(`<h2>${t("projectPages.toolDoc")}</h2>`);
    expect(markup).toContain("Decision recorded");
    expect(render(h(ToolSection, { ...section, tool: { ...tool, title: "Our decisions" } }), locale)).toContain("<h2>Our decisions</h2>");
    expect(render(h(BrowserPagesImport, { p, editor: true }), locale)).toBe("");
    expect(render(h(BrowserPagesImport, { p, editor: false }), locale)).toBe("");
  }
});

it("PGB scaffold: bilingual copy has matching keys and interpolation parameters", () => {
  expect(Object.keys(projectPages.de).sort()).toEqual(Object.keys(projectPages.en).sort());
  for (const key of Object.keys(projectPages.en) as (keyof typeof projectPages.en)[]) {
    expect(projectPages.en[key].trim()).not.toBe("");
    expect(projectPages.de[key].trim()).not.toBe("");
    expect(projectPages.de[key].match(/\{\w+\}/g)?.sort() ?? []).toEqual(projectPages.en[key].match(/\{\w+\}/g)?.sort() ?? []);
  }
  for (const locale of ["en", "de"] as const) {
    const t = createT(locale);
    for (const key of ["toolsPicked", "toolsCount", "stepsCount", "datedStepsCount", "epicsCount", "itemsCount", "importBanner"]) {
      for (const count of [1, 2]) expect(t(`projectPages.${key}` as MessageKey, { count })).toContain(String(count));
    }
    expect(t("projectPages.mergeConfirm", { count: 2, page: "Plan" })).toContain("Plan");
  }
});
