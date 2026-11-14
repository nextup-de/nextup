import { createElement as h, Suspense } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { DemoProvider } from "@/components/dashboard/DemoProvider";
import { I18nProvider } from "@/i18n/client";
import { LOCAL_SEED } from "@/features/demo";
import { reduce } from "@/features/cases/reducer";
import { TOOL_KINDS, DEFAULT_PAGES } from "@/features/projects/pages";
import { demoJiraView, jiraRowOf } from "@/features/projects/views";
import type { ToolKind } from "@/features/projects/types";
import type { ToolProps } from "@/components/projects/tools/types";
import { TOOL_REGISTRY } from "@/components/projects/tools/registry";
import { AgentTool } from "@/components/projects/tools/AgentTool";
import { StepPanel } from "@/components/projects/steps/StepPanel";
import { CreateStepDialog } from "@/components/projects/steps/CreateStepDialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/demo/projects",
  useSearchParams: () => new URLSearchParams(),
}));

const state = reduce(LOCAL_SEED, { events: [], day: 0 });
const p = state.projects[0];
const jira = jiraRowOf(p, demoJiraView(0), 0, "en");
const page = DEFAULT_PAGES[0];
const propsFor = (kind: ToolKind, content: unknown = null): ToolProps => ({
  p, page, jira, editor: true, hints: [],
  tool: { id: `test.${kind}`, kind, title: null, content: content === null ? null : JSON.stringify(content), collapsed: false, rev: 0 },
});
const render = (child: React.ReactNode) => html(h(I18nProvider, { locale: "en", children:
  h(DemoProvider, { tenant: { slug: "demo", prefix: "/demo", name: "Demo", demoDataDefault: true }, seed: LOCAL_SEED, children: child }),
}));

it("PGE registry: provides exactly one entry per tool kind", () => {
  expect(Object.keys(TOOL_REGISTRY).sort()).toEqual([...TOOL_KINDS].sort());
});

it("PGE registry: renders every stand-in with final props and the demo provider", () => {
  expect(p).toBeDefined();
  for (const kind of TOOL_KINDS) {
    expect(() => render(h(Suspense, { children: h(TOOL_REGISTRY[kind], propsFor(kind)) }))).not.toThrow();
  }
  // The demo has no Agent tab; the loaded component must respect the same rule.
  expect(render(h(AgentTool, propsFor("agent")))).not.toContain('data-testid="agent-tab"');
  expect(() => render(h(StepPanel, { p, stepId: p.steps[0].id, jira, onClose: () => {}, draftComment: "Draft" }))).not.toThrow();
  expect(() => render(h(CreateStepDialog, { p, open: true, onClose: () => {}, preset: { column: "todo", dueDay: null, title: "First step", note: "Details" } }))).not.toThrow();
  expect(render(h(CreateStepDialog, { p, open: false, onClose: () => {} }))).toBe("");
});

it("PGE registry: loads AgentTool through next/dynamic", () => {
  const source = readFileSync("src/components/projects/tools/registry.tsx", "utf8");
  expect(source).toContain('from "next/dynamic"');
  expect(source).toMatch(/dynamic\(\(\) => import\("\.\/AgentTool"\)/);
  expect(source).not.toMatch(/import\s+\{\s*AgentTool\s*\}\s+from/);
});

it("PGE registry: reads saved content without exposing editing controls", () => {
  const doc = render(h(TOOL_REGISTRY.doc, propsFor("doc", { body: "Decision recorded" })));
  expect(doc).toContain("Decision recorded");
  expect(doc).not.toContain("textarea");
  const checklist = render(h(TOOL_REGISTRY.checklist, propsFor("checklist", { items: [{ id: "one", text: "Ready", done: true }] })));
  expect(checklist).toContain("Ready");
  expect(checklist).toContain('disabled=""');
  expect(checklist).toContain('checked=""');
  const table = render(h(TOOL_REGISTRY.table, propsFor("table", { rows: [["Name", "Value"], ["Target", "10"]] })));
  expect(table).toContain('role="table"');
  expect(table).toContain("Target");
  expect(table).not.toContain("<input");
  const links = render(h(TOOL_REGISTRY.links, propsFor("links", { links: [{ url: "https://example.com", title: "Reference" }, { url: "javascript:alert(1)", title: "Unsafe" }] })));
  expect(links).toContain('href="https://example.com"');
  expect(links).toContain("Reference");
  expect(links).not.toContain('href="javascript:');
});

it("PGE registry: empty or malformed content renders an empty line", () => {
  for (const kind of ["doc", "checklist", "table", "links"] as const) {
    const empty = render(h(TOOL_REGISTRY[kind], propsFor(kind)));
    expect(empty).toContain("<p");
    expect(empty).not.toContain("<input");
    expect(render(h(TOOL_REGISTRY[kind], { ...propsFor(kind), tool: { ...propsFor(kind).tool, content: "{" } }))).toBe(empty);
  }
});
