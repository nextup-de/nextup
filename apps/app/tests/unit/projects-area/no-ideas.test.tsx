// Projects shows projects only, for every role (Kevin and Sam, 16 Nov 2026): ideas are raised and followed in the Ideas
// tab and decided in the Inbox. The Overview, Progress, Collaboration and the sidebar's list draw no idea - only a project
// an approved idea became, under the project's own title.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressView } from "@/components/dashboard/shared/ProgressView";
import { ProjectsHub } from "@/components/projects/ProjectsHub";
import { ProjectsSidebar } from "@/components/projects/ProjectsSidebar";
import { Collaboration } from "@/components/projects/area/Collaboration";
import { reduce } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { ROLES } from "@/features/demo/seed";
import { meFor } from "@/features/auth/identity";
import { demoData } from "@/features/metrics";
import { I18nProvider } from "@/i18n/client";

const mocks = vi.hoisted(() => ({ ctx: {} as Record<string, unknown> }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/projects" }));
vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => mocks.ctx }));
// The ideas table: drawn anywhere under Projects, it leaves this marker.
vi.mock("@/components/dashboard/team/DashboardView", () => ({ DashboardView: () => "IDEAS-TABLE" }));

const S = reduce(LOCAL_SEED, { events: [], day: 0 });
const D = demoData(LOCAL_SEED, S, true);
// Every idea or problem that did not become a project: none of their titles may show.
const ideaTitles = S.cases.filter((c) => !S.projects.some((p) => p.sources.includes(c.id))).map((c) => c.title);
const render = (node: React.ReactNode) => renderToStaticMarkup(h(I18nProvider, { locale: "en", children: node }));

const ctxFor = (role: "member" | "leader" | "manager") => {
  const persona = ROLES.find((r) => r.id === role)!;
  const userId = LOCAL_SEED.seats.find((s) => s.label === persona.who.name && s.userId)?.userId ?? null;
  return {
    S, D, seed: LOCAL_SEED, ready: true, demo: true, serverMode: false, role, persona, actorUserId: userId, me: meFor(userId, LOCAL_SEED.seats),
    tenant: { slug: "acme", prefix: "/acme" }, log: { events: [], day: 0 }, href: (url: string) => url, flag: () => true,
    f: (d: number) => "day " + d, deptName: (id: string) => id, act: {},
  };
};

describe.each(["member", "leader", "manager"] as const)("Projects as %s", (role) => {
  beforeEach(() => { mocks.ctx = ctxFor(role); });

  it.each([
    ["the Overview", () => h(ProjectsHub, { tab: "projects" })],
    ["Progress", () => h(ProgressView)],
    ["Collaboration", () => h(Collaboration)],
    ["the sidebar", () => h(ProjectsSidebar, { area: "overview", projectId: null, caseId: null, onHide: vi.fn() })],
  ])("%s draws no idea", (_name, node) => {
    expect(ideaTitles.length).toBeGreaterThan(0);
    const html = render(node());
    expect(html).not.toContain("IDEAS-TABLE");
    expect(html).not.toContain("/idea?id=");
    for (const title of ideaTitles) expect(html).not.toContain(title);
  });
});

it("the Overview shows the projects, a draft from an approved idea among them", () => {
  mocks.ctx = ctxFor("manager");
  const html = render(h(ProjectsHub, { tab: "projects" }));
  for (const p of S.projects) expect(html).toContain(p.title);
});

it("the old address of the ideas table still draws the table", () => {
  mocks.ctx = ctxFor("leader");
  expect(render(h(ProjectsHub, { tab: "ideas" }))).toContain("IDEAS-TABLE");
});
