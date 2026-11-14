import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { reduce } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { I18nProvider } from "@/i18n/client";
import { DEFAULT_PAGES } from "@/features/projects/pages";
import { tabQuery } from "@/features/projects/tabs";
import type { ProjectPage } from "@/features/projects/types";
import { ProjectView } from "@/components/projects/ProjectView";

const mocks = vi.hoisted(() => ({ ctx: {} as Record<string, unknown>, query: "", panel: false, browserReads: vi.fn() }));
vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => mocks.ctx }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock("@/components/projects/agent/useAgentTab", () => ({ useAgentTab: () => ({ view: null, failed: false }) }));
vi.mock("@/components/projects/page/PageView", () => ({ PageView: ({ page }: { page: ProjectPage }) => h("div", { "data-page": page.id }, page.title) }));
vi.mock("@/components/projects/draft/useProjectHints", () => ({ useProjectHints: () => ({ stepHints: [], baseHint: null }) }));
vi.mock("@/components/projects/projectPagesPreview", () => ({ ideaPagesId: (id: string) => "case:" + id, useProjectPages: () => { mocks.browserReads(); return [{ pages: [{ id: "browser", title: "Browser notes" }] }]; } }));
vi.mock("@/components/projects/CustomPageView", () => ({ CustomPageView: () => h("div", null, "Browser notes body") }));
vi.mock("@/components/projects/parts", async (load) => ({ ...await load<typeof import("@/components/projects/parts")>(), useRights: () => ({ addStep: true, check: () => ({ ok: true }) }), useSend: () => vi.fn() }));
vi.mock("@/features/projects/result-view", () => ({ resultView: () => ({ panel: mocks.panel ? {} : null, done: null, stop: null }) }));
vi.mock("@/features/projects/views", async (load) => ({ ...await load<typeof import("@/features/projects/views")>(), visibleProjectsFor: (s: ReturnType<typeof reduce>) => s.projects }));
vi.mock("@/components/projects/move/DoneByLine", () => ({ DoneByLine: () => null }));
vi.mock("@/components/projects/move/PausePanel", () => ({ PausePanel: () => null }));
vi.mock("@/components/projects/move/NoLeadBanner", () => ({ NoLeadBanner: () => null }));
vi.mock("@/components/projects/move/WeeklyUpdate", () => ({ WeeklyUpdate: () => null }));
vi.mock("@/components/projects/move/HowWeWork", () => ({ HowWeWork: () => null }));
vi.mock("@/components/projects/agent/PlanDraftLink", () => ({ PlanDraftLink: () => null }));
vi.mock("@/components/projects/draft/DraftView", () => ({ DraftView: () => h("div", null, "Draft setup") }));
vi.mock("@/components/projects/result/RaiserPanel", () => ({ RaiserPanel: () => h("div", null, "Raiser progress") }));
vi.mock("@/components/projects/ProjectSummary", () => ({ ProjectSummary: () => h("div", null, "Overview body") }));
vi.mock("@/components/projects/ProjectNext", () => ({ NextPanel: () => null }));
vi.mock("@/components/projects/ProjectBoard", () => ({ ProjectBoard: () => h("div", null, "Board body") }));
vi.mock("@/components/projects/ProjectTeam", () => ({ TeamPanel: () => h("div", null, "Team body"), ActivityPanel: () => h("div", null, "Activity body"), ToolsPanel: () => h("div", null, "Tools body") }));
vi.mock("@/components/projects/ProjectMeasure", () => ({ BaselinePanel: () => h("div", null, "Baseline body"), MeasurePanel: () => h("div", null, "Measure body"), RewardPanel: () => h("div", null, "Reward body") }));
vi.mock("@/components/projects/ProjectOrigin", () => ({ OriginPanel: () => h("div", null, "Origin body"), FilesPanel: () => h("div", null, "Files body") }));

const state = reduce(LOCAL_SEED, { events: [], day: 0 });
const p = { ...state.projects[0], draft: null };
const render = (tab: "overview" | "board" | "team" | "results" | "activity" | "files" | "agent" = "overview", id = p.id) => html(h(I18nProvider, { locale: "en", children: h(ProjectView, { projectId: id, jira: null, tab }) }));

beforeEach(() => {
  mocks.query = "";
  mocks.panel = false;
  mocks.browserReads.mockClear();
  mocks.ctx = { S: { ...state, projects: [p] }, ready: true, demo: true, flag: () => true, href: (path: string) => "/demo" + path, f: String, actorUserId: null, me: [], tenant: { slug: "demo" } };
});

it("PGB page shell: flag on removes tabs, resolves the page and never reads browser-only pages", () => {
  mocks.query = "page=plan";
  const out = render("board");
  expect(out).toContain('data-page="plan"');
  expect(out).toContain(p.title);
  expect(out).not.toContain('aria-label="Project sections"');
  expect(mocks.browserReads).not.toHaveBeenCalled();
  mocks.query = "page=agent";
  expect(render()).toContain('data-page="overview"');
  mocks.ctx.S = { ...state, projects: [{ ...p, pages: [
    { id: "plan", title: "Plan first", icon: "calendar", tools: DEFAULT_PAGES[2].tools },
    { id: "overview", title: "Overview second", icon: "home", tools: DEFAULT_PAGES[0].tools },
  ] }] };
  mocks.query = "";
  expect(render()).toContain('data-page="plan"');
  mocks.ctx.S = { ...state, projects: [p] };
  mocks.query = "tab=board";
  expect(render("board")).toContain('data-page="steps"');
});

// The demo has no runtime flag switch (DemoProvider reads tenant.flags); this is the task's component-test fallback.
it("PGB legacy tabs: flag off preserves overview, board, team, results, activity and files", () => {
  mocks.ctx.flag = (key: string) => key !== "projectPages";
  for (const [tab, contents] of [
    ["overview", ["Overview body", "Team body"]], ["board", ["Board body"]], ["team", ["Team body"]],
    ["results", ["Baseline body", "Reward body"]], ["activity", ["Activity body"]], ["files", ["Origin body", "Tools body", "Files body"]],
  ] as const) {
    const out = render(tab);
    expect(out).toContain('aria-label="Project sections"');
    const current = out.match(/<a\b[^>]*aria-current="page"[^>]*>/)?.[0];
    expect(current).toContain(`href="/demo/projects/${p.id}${tabQuery(tab)}"`);
    expect(out).toContain(p.title);
    for (const content of contents) expect(out).toContain(content);
    expect(out).not.toContain("data-page=");
  }
  mocks.query = "page=browser";
  expect(render()).toContain("Browser notes body");
});

it("PGB page shell: keeps loading, flag, missing project, draft and raiser guards", () => {
  mocks.ctx.ready = false;
  expect(render()).not.toContain("data-page=");
  mocks.ctx.ready = true;
  mocks.ctx.flag = () => false;
  expect(render()).not.toContain("data-page=");
  mocks.ctx.flag = () => true;
  expect(render("overview", "missing")).not.toContain("data-page=");
  mocks.ctx.S = { ...state, projects: [{ ...p, status: "planning", draft: { template: null } }] };
  expect(render()).toContain("Draft setup");
  mocks.ctx.S = { ...state, projects: [p] };
  mocks.panel = true;
  const out = render();
  expect(out).toContain("Raiser progress");
  expect(out).not.toContain("data-page=");
  expect(out).not.toContain('aria-label="Project sections"');
});
