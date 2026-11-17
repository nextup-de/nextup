// A project's Idea page is its origin, read only (DESIGN_RULES §8): the idea card is the head of the page. It says the title
// and who raised it, and its top row carries what a project's head carries: the done-by date, the viewer's move, Manage and ⓘ.
// There is no project head or move banner above it (Sam, 17 Nov 2026), and no Start button on it: that one is in the Overview's
// move card, and a button that does nothing yet is not drawn (§9). One fact once (§9): the title is said once, in the card.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverviewIdea, type OverviewIdeaProps } from "@/components/dashboard/team/OverviewIdea";
import { ProjectView } from "@/components/projects/ProjectView";
import type { Me } from "@/features/auth/identity";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { SEED } from "@/features/demo/seed";
import { briefForCase } from "@/features/ideas/brief";
import { DEFAULT_PAGES } from "@/features/projects/pages";
import { I18nProvider } from "@/i18n/client";

const mocks = vi.hoisted(() => ({ ctx: {} as Record<string, unknown>, query: "", card: [] as Record<string, unknown>[] }));
vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => mocks.ctx }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(mocks.query), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/demo/projects" }));
vi.mock("@/components/projects/agent/useAgentTab", () => ({ useAgentTab: () => ({ view: null, failed: false }) }));
vi.mock("@/components/projects/page/PageView", () => ({ PageView: () => h("div", null, "PAGE-VIEW") }));
vi.mock("@/components/projects/parts", async (load) => ({ ...await load<typeof import("@/components/projects/parts")>(), useRights: () => ({ lead: true, addStep: true, check: () => ({ ok: true }) }), useSend: () => vi.fn() }));
vi.mock("@/features/projects/views", async (load) => ({ ...await load<typeof import("@/features/projects/views")>(), visibleProjectsFor: (s: ReturnType<typeof reduce>) => s.projects }));
vi.mock("@/components/projects/move/DoneByLine", () => ({ DoneByLine: () => h("p", { "data-testid": "done-by-line" }, "Done by") }));
vi.mock("@/components/projects/move/PausePanel", () => ({ PausePanel: () => null }));
vi.mock("@/components/projects/move/NoLeadBanner", () => ({ NoLeadBanner: () => null }));
vi.mock("@/components/projects/head/ProjectMenu", () => ({ ProjectMenu: () => h("span", null, "MANAGE"), ProjectSheet: () => null }));
vi.mock("@/components/projects/agent/PlanDraftLink", () => ({ PlanDraftLink: () => null }));
// The idea card, as the Idea page draws it: what it is handed is all it can show.
vi.mock("@/components/dashboard/team/DashboardView", () => ({
  DashboardView: (props: Record<string, unknown>) => { mocks.card.push(props); return h("div", { "data-idea-card": "" }, "IDEA-CARD", props.headAction as React.ReactNode); },
}));

const state = reduce(LOCAL_SEED, { events: [], day: 0 });
const LEAD = "u-lead";
const me: Me = { userId: LEAD, seatIds: [], roleIds: [] };
// A new project: the pages Overview, Idea (id "overview", its old name) and Files. Planned without a baseline, so the
// lead's move is to take it.
const p = { ...state.projects[0], draft: null, pages: DEFAULT_PAGES, status: "planning" as const, baseline: null, leadUserId: LEAD };
const render = (node: React.ReactNode) => renderToStaticMarkup(h(I18nProvider, { locale: "en", children: node }));
const page = () => render(h(ProjectView, { projectId: p.id, jira: null, tab: "overview" }));

beforeEach(() => {
  mocks.query = "page=overview";
  mocks.card = [];
  mocks.ctx = { S: { ...state, projects: [p] }, ready: true, demo: true, flag: () => true, href: (to: string) => "/demo" + to, f: String, actorUserId: LEAD, me, tenant: { slug: "demo" } };
});

describe("a project's Idea page", () => {
  it("has no project head above the idea card: no title, no done-by line, no Manage", () => {
    const out = page();
    const above = out.slice(0, out.indexOf("data-idea-card"));
    expect(above).not.toContain('data-testid="page-header"');
    expect(above).not.toContain(p.title);
    expect(above).not.toContain('data-testid="done-by-line"');
    expect(above).not.toContain("MANAGE");
  });

  it("carries the done-by date, Manage and the lead's Your move in the card, the move leading to the Overview where its button is", () => {
    const out = page();
    const card = out.slice(out.indexOf("data-idea-card"));
    expect(card).toContain('data-testid="done-by-line"');
    expect(card).toContain("MANAGE");
    expect(card).toContain("Your move");
    expect(card).toContain(`/demo/projects/${p.id}?page=project-overview`);
    expect(out.slice(0, out.indexOf("data-idea-card"))).not.toContain("Your move");
  });

  it("draws no Start button: the lead of a planned project starts it on the Overview", () => {
    expect(page()).not.toContain("Start the project");
  });

  it("hands the idea card the idea and one slot for the project's buttons, nothing else", () => {
    page();
    expect(mocks.card).not.toHaveLength(0);
    for (const props of mocks.card) {
      expect(Object.keys(props).sort()).toEqual(["caseId", "headAction", "inPage", "linkCases"]);
      expect(props).toMatchObject({ caseId: p.sources[0], inPage: true });
    }
  });
});

describe("the idea card in its project", () => {
  const c = reduce(SEED, emptyLog()).cases.find((x) => x.id === "c1")!;
  const brief = briefForCase(c, { people: SEED.people, depts: SEED.depts, ideas: SEED.ideas }, {
    promiseDays: SEED.promiseDays, viewer: me, affected: [], attachments: 0, updates: 0, passTo: "", history: "",
  });
  const props: OverviewIdeaProps = {
    id: c.id, title: "Cooling water loop on line 3", raised: "3 Nov", dept: "R. Weber · Production", brief,
    steps: [{ label: "Raised", sub: "3 Nov", tone: "done" }], desk: { role: "Quality lead", names: ["A. Roth"], more: 0, escalation: null },
    wait: { text: "Answered", pct: 100, tone: "done" }, files: [], added: [], versions: [], mode: "idea", onMode: vi.fn(),
  };

  it("says who raised it and when, then its title, then the stages and the desk", () => {
    const out = render(h(OverviewIdea, props));
    expect(out).toContain("Raised 3 Nov · R. Weber · Production");
    expect(out).toMatch(/<h1[^>]*>Cooling water loop on line 3<\/h1>/);
    expect(out).toContain("Quality lead");
  });

  it("puts what it is handed for the project in its top row, before the title", () => {
    const out = render(h(OverviewIdea, { ...props, headAction: h("span", null, "PROJECT-BUTTONS") }));
    expect(out.indexOf("Raised 3 Nov")).toBeLessThan(out.indexOf("PROJECT-BUTTONS"));
    expect(out.indexOf("PROJECT-BUTTONS")).toBeLessThan(out.indexOf("<h1"));
  });
});
