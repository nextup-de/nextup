// A project's Idea page is its origin, read only (DESIGN_RULES §8; Kevin and Sam, 16 Nov 2026). Kevin kept this layout on
// 17 Nov 2026, after nextup#978 tried the idea card as the head: the project's own head (title, Manage, ⓘ, the done-by line)
// and the viewer's "Your move" stay above the idea, and the idea card carries none of the project's buttons. One fact
// once (§9): the head says the title and its ⓘ who raised it, so the card starts at its stages.
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
  DashboardView: (props: Record<string, unknown>) => { mocks.card.push(props); return h("div", { "data-idea-card": "" }, "IDEA-CARD"); },
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
  it("keeps the project's head above the idea: its title, Manage and the done-by line", () => {
    const out = page();
    expect(out).toContain('data-testid="page-header"');
    const head = out.slice(out.indexOf('data-testid="page-header"'), out.indexOf("data-idea-card"));
    expect(head).toContain(p.title);
    expect(head).toContain("MANAGE");
    expect(head).toContain('data-testid="done-by-line"');
  });

  it("keeps the lead's Your move above the idea, leading to the Overview where its button is", () => {
    const out = page();
    const above = out.slice(0, out.indexOf("data-idea-card"));
    expect(above).toContain("Your move");
    expect(above).toContain(`/demo/projects/${p.id}?page=project-overview`);
    expect(out).not.toContain("Start the project"); // the start is on the Overview, never on the idea
  });

  it("hands the idea card the idea alone: no slot for the project's buttons or its move", () => {
    const out = page();
    expect(mocks.card).not.toHaveLength(0);
    for (const props of mocks.card) {
      expect(Object.keys(props).sort()).toEqual(["caseId", "inPage", "linkCases"]);
      expect(props).toMatchObject({ caseId: p.sources[0], inPage: true });
    }
    const card = out.slice(out.indexOf("data-idea-card"));
    expect(card).not.toContain("MANAGE");
    expect(card).not.toContain("Your move");
    expect(card).not.toContain('data-testid="done-by-line"');
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

  it("starts at its stages and desk: the title and who raised it are the head's to say", () => {
    const out = render(h(OverviewIdea, { ...props, inProject: true }));
    expect(out).not.toContain("<h1");
    expect(out).not.toContain("Cooling water loop on line 3");
    expect(out).not.toContain("R. Weber · Production");
    expect(out).toContain("Quality lead");
  });

  it("says its own title and who raised it on the idea's own page", () => {
    const out = render(h(OverviewIdea, props));
    expect(out).toMatch(/<h1[^>]*>Cooling water loop on line 3<\/h1>/);
    expect(out).toContain("Raised 3 Nov · R. Weber · Production");
  });
});
