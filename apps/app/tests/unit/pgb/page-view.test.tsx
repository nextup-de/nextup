import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { reduce } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { READY_PAGES, pagesOf } from "@/features/projects/pages";
import { demoJiraView, jiraRowOf } from "@/features/projects/views";
import { I18nProvider } from "@/i18n/client";
import { PageView, type PageViewProps } from "@/components/projects/page/PageView";
import { AddToolMenu } from "@/components/projects/page/AddToolMenu";
import type { ToolSectionProps } from "@/components/projects/page/ToolSection";

const mocks = vi.hoisted(() => ({ editor: true, sections: vi.fn(), imported: vi.fn() }));
vi.mock("@/components/projects/parts", () => ({ useRights: () => ({ addStep: mocks.editor }) }));
vi.mock("@/components/projects/draft/useProjectHints", () => ({ useProjectHints: () => ({ stepHints: [] }) }));
vi.mock("@/components/projects/page/usePageActs", () => ({ usePageActs: () => ({ addTool: vi.fn() }) }));
vi.mock("@/components/projects/page/ToolSection", () => ({ ToolSection: (props: ToolSectionProps) => { mocks.sections(props); return h("section", { "data-tool": props.tool.id }, props.tool.title ?? props.tool.kind); } }));
vi.mock("@/components/projects/page/BrowserPagesImport", () => ({ BrowserPagesImport: (props: unknown) => { mocks.imported(props); return null; } }));
const p = reduce(LOCAL_SEED, { events: [], day: 0 }).projects[0];
const jira = jiraRowOf(p, demoJiraView(0), 0, "en");
const props: PageViewProps = { p, jira, page: READY_PAGES[1], agent: false };
const render = (value = props) => html(h(I18nProvider, { locale: "en", children: h(PageView, value) }));
beforeEach(() => { mocks.editor = true; vi.clearAllMocks(); });

it("PGB stacked page: renders tools in order, their names, insertion points and import with final props", () => {
  const out = render();
  expect(out).toContain(">Steps</h1>");
  expect(out).toContain("2 tools · Board, List");
  expect(out.indexOf('data-tool="steps.board"')).toBeLessThan(out.indexOf('data-tool="steps.list"'));
  expect(out.match(/Add a tool here/g)).toHaveLength(2);
  expect(out).toContain("Add a tool to this page");
  expect(out).toContain("Add step");
  const sections = mocks.sections.mock.calls.map(([value]) => value as ToolSectionProps);
  expect(sections.map((s) => [s.index, s.count, s.editor])).toEqual([[0, 2, true], [1, 2, true]]);
  expect(sections[0].onAddAt).toBe(sections[1].onAddAt);
  expect(mocks.imported).toHaveBeenCalledWith({ p, editor: true });
});

it("PGB stacked page: viewers get the same tool stack without changing controls", () => {
  mocks.editor = false;
  const out = render();
  expect(out).toContain('data-tool="steps.board"');
  expect(out).not.toContain("Add a tool");
  expect(out).not.toContain("Add tool");
  expect(out).not.toContain("Add step");
  expect(mocks.sections.mock.calls.every(([value]) => !value.editor)).toBe(true);
  expect(mocks.imported).toHaveBeenCalledWith({ p, editor: false });
});

it("PGB stacked page: Jira summary requires every tool to be a Jira tool on a syncing project", () => {
  const syncing = { ...p, sync: { system: "jira" as const, on: true, day: 0, by: "lead" } };
  expect(render({ ...props, p: syncing })).toContain("All synced with Jira");
  expect(render({ ...props, p: { ...syncing, sync: { ...syncing.sync, on: false } } })).not.toContain("All synced with Jira");
  expect(render({ ...props, p: syncing, page: { ...props.page, tools: [...props.page.tools, READY_PAGES[2].tools[2]] } })).not.toContain("All synced with Jira");
  expect(render({ ...props, p: syncing, page: { ...props.page, tools: [] } })).not.toContain("All synced with Jira");
});

it("PGB stacked page: saved default titles translate and custom titles remain literal", () => {
  const saved = { ...p, pages: pagesOf(p, { agent: false }) };
  expect(render({ ...props, p: saved })).toContain(">Steps</h1>");
  const out = render({ ...props, p: saved, page: { ...props.page, title: "Parts review", tools: [{ ...props.page.tools[0], title: "Our board" }] } });
  expect(out).toContain(">Parts review</h1>");
  expect(out).toContain("1 tool · Our board");
});

it("PGB add points: shared picker hides Agent, disables a singleton and allows another doc", () => {
  const out = html(h(I18nProvider, { locale: "en", children: h(AddToolMenu, { ...props, index: 1, onClose: () => {} }) }));
  expect(out).not.toMatch(/>Agent</);
  expect(out).toContain("Already in this project");
  expect(out).toMatch(/data-taken="true" disabled=""><span[^>]*>[^<]*<\/span><span[^>]*>Idea/); // every project has its Idea
  expect(out).toMatch(/<button(?![^>]*disabled)[^>]*><span[^>]*>[^<]*<\/span><span[^>]*>Doc/);
});
