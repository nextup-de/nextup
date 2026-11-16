import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { LoggedProjectPages, PageGlyph, ProjectsSidebar } from "@/components/projects/ProjectsSidebar";
import { READY_PAGES, PAGE_ICON_KEYS } from "@/features/projects/pages";
import { reduce } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { I18nProvider } from "@/i18n/client";

const mocks = vi.hoisted(() => ({ params: new URLSearchParams(), enabled: true, editor: true, agent: false, ctx: {} as Record<string, unknown> }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => mocks.ctx }));
vi.mock("@/components/projects/parts", () => ({ useRights: () => ({ addStep: mocks.editor }), idViewerOf: () => ({}) }));
vi.mock("@/components/projects/agent/useAgentTab", () => ({ useAgentTab: () => ({ view: mocks.agent ? {} : null }) }));
vi.mock("@/components/projects/page/usePageActs", () => ({ usePageActs: () => ({}) }));
// The project's head in the sidebar (open sidebar, laptop): its ⋯ Manage, the done-by date and the viewer's move.
vi.mock("@/components/projects/sidebarState", () => ({ useHeadInSidebar: () => false }));
vi.mock("@/components/projects/head/ProjectMenu", () => ({ ProjectMenu: () => null, useManage: () => ({ sheet: null, open: vi.fn(), close: vi.fn() }) }));
vi.mock("@/components/projects/head/useMyMove", () => ({ useMyMove: () => null }));
vi.mock("@/components/projects/move/useMoveView", () => ({ useMoveView: () => ({ doneBy: null }) }));

const state = reduce(LOCAL_SEED, { events: [], day: 0 });
const project = { ...state.projects[0], pages: READY_PAGES, removed: [] };
const render = (node: React.ReactNode, locale: "en" | "de" = "en") => renderToStaticMarkup(h(I18nProvider, { locale, children: node }));
const layer = (p = project, editor = true, agent = false, locale: "en" | "de" = "en") => render(h(LoggedProjectPages, { p, editor, agent, onBack: vi.fn() }), locale);

beforeEach(() => {
  mocks.params = new URLSearchParams(); mocks.enabled = true; mocks.editor = true; mocks.agent = false;
  mocks.ctx = { S: { ...state, projects: [project] }, D: { cases: [], ideas: [] }, seed: LOCAL_SEED, me: { userId: project.leadUserId }, actorUserId: project.leadUserId, role: "manager", demo: true, serverMode: false, tenant: { slug: "test" }, log: { events: [], day: 0 }, href: (url: string) => url, flag: () => mocks.enabled };
});

it("Project sidebar renders event pages in their order, translates defaults and preserves team-written titles", () => {
  const p = { ...project, pages: [READY_PAGES[2], { ...READY_PAGES[1], title: "Supplier notes" }, READY_PAGES[0]] };
  const html = layer(p);
  expect(html.indexOf('data-page-id="plan"')).toBeLessThan(html.indexOf('data-page-id="steps"'));
  expect(html).toContain("Supplier notes");
  expect(html).toContain('href="/projects/' + p.id + '?page=plan"');
  expect(html).toMatch(/<a(?=[^>]*\?page=plan")(?=[^>]*aria-current="page")[^>]*>/);
  expect(layer(p, false, false, "de")).toContain("Übersicht");
  expect(layer(p, false, false, "de")).toContain("Supplier notes");
});

it("Project sidebar highlights page ids and legacy tabs and falls back for unknown pages", () => {
  mocks.params = new URLSearchParams("page=plan");
  expect(layer()).toMatch(/<a(?=[^>]*\?page=plan")(?=[^>]*aria-current="page")[^>]*>/);
  mocks.params = new URLSearchParams("tab=board");
  expect(layer()).toMatch(/<a(?=[^>]*\?page=steps")(?=[^>]*aria-current="page")[^>]*>/);
  mocks.params = new URLSearchParams("page=missing&tab=board");
  expect(layer()).toMatch(/<a(?=[^>]*\?page=overview")(?=[^>]*aria-current="page")[^>]*>/);
});

it("Project sidebar filters Agent tools wherever moved and hides changing controls for readers", () => {
  const html = layer(project, false);
  expect(html).not.toContain('data-page-id="agent"');
  expect(html).not.toContain("Actions for");
  expect(html).not.toContain("Add page");
  expect(html).not.toContain("data-editor");
  expect(layer(project, true, true)).toContain('data-page-id="agent"');
  expect(layer()).toContain('aria-label="Actions for Overview"');
});

it("Project sidebar switches only flagged project layers to the event-backed pages", () => {
  const node = h(ProjectsSidebar, { area: null, projectId: project.id, caseId: null, onHide: vi.fn() });
  expect(render(node)).toContain('aria-label="Project pages"');
  mocks.enabled = false;
  const old = render(node);
  expect(old).not.toContain('aria-label="Project pages"');
  expect(old).toContain("?tab=board");
  expect(old).not.toContain('data-page-id="plan"');
});

it("Project sidebar draws every allowed page icon as a distinct 16px line glyph", () => {
  const icons = PAGE_ICON_KEYS.map((icon) => render(h(PageGlyph, { icon })));
  expect(new Set(icons).size).toBe(PAGE_ICON_KEYS.length);
  for (const icon of icons) { expect(icon).toContain('width="16" height="16"'); expect(icon).toContain('stroke="currentColor"'); }
});
