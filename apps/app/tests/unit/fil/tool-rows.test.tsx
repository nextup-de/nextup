import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { HeadSlot } from "@/components/projects/tools/HeadSlot";
import { Overview } from "@/components/projects/hub/overview/Overview";
import type { ProjectPage, ReducedProject, ToolInstance } from "@/features/projects/types";
import { createT } from "@/i18n";
import { I18nProvider } from "@/i18n/client";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/acme/projects/pj1" }));
vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => ({ S: { day: 10, seats: [] }, f: (d: number) => "day" + d, actorUserId: "u1" }) }));
vi.mock("@/components/projects/ProjectMeasure", () => ({ BaselinePanel: () => null }));
vi.mock("@/components/projects/draft/useProjectHints", () => ({ useProjectHints: () => ({ baseHint: null }) }));

const t = createT("en");
const tool = (id: string): ToolInstance => ({ id, kind: "overview", title: null, collapsed: false, content: null, rev: 0 });
const page: ProjectPage = { id: "overview", title: "Overview", icon: "home", tools: [tool("a"), tool("b")] };
const p = { id: "pj1", status: "running", startedDay: 0, openedDay: 0, leadUserId: "u1", memberUserIds: [], steps: [], history: [], baseline: null } as unknown as ReducedProject;
const render = (node: React.ReactNode, locale: "en" | "de" = "en") => renderToStaticMarkup(h(I18nProvider, { locale, children: node }));

it("FIL tool rows: without the page header's slot (the server render) the controls stay where the tool wrote them", () => {
  const html = render(h(HeadSlot, { page, tool: tool("a"), children: h("span", { "data-testid": "controls" }, "controls") }));
  expect(html).toContain('data-testid="controls"');
});

it("FIL tool rows: the Overview keeps its title as a hidden heading and puts the range menu and Copy link in one controls row", () => {
  const html = render(h(Overview, { p, page, tool: tool("a") }));
  expect(html).toContain(`<h2 class="nh-sr">${t("projectHub.overviewTitle")}</h2>`);
  expect(html).toContain(t("projectHub.overviewCopyLink"));
  expect(html).toContain(t("projectHub.overviewRange7Days"));
  expect(html).toContain("_controls_");
  expect(html).not.toContain("_head_");
  expect(render(h(Overview, { p, page, tool: tool("b") }), "de")).toContain("Link kopieren");
});
