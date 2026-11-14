import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DEFAULT_PAGES } from "@/features/projects/pages";
import type { JiraRow } from "@/features/projects/views";
import type { ReducedProject, ToolInstance } from "@/features/projects/types";
import { createT } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { ToolSection } from "@/components/projects/page/ToolSection";

vi.mock("@/components/projects/page/usePageActs", () => ({ usePageActs: () => ({}) }));
vi.mock("@/components/projects/page/AddPageDialog", () => ({ AddPageDialog: () => null }));
vi.mock("@/components/projects/tools/registry", () => ({ TOOL_REGISTRY: new Proxy({}, { get: () => () => h("div", { "data-testid": "body" }, "BODY") }) }));

const t = createT("en");
const jira = { state: "synced", siteUrl: "https://j.example", projectKey: "NUP" } as JiraRow;
const page = DEFAULT_PAGES[2];
const base = { steps: [{ id: "s", dueDay: 3 }, { id: "t", dueDay: null }], links: [], sync: { system: "jira", on: true }, pages: null } as unknown as ReducedProject;
const render = (tool: ToolInstance, { editor = true, p = base } = {}) => renderToStaticMarkup(h(I18nProvider, { locale: "en", children: h(ToolSection, { p, page, tool, jira, editor, hints: [], index: 0, count: page.tools.length, onAddAt: vi.fn() }) }));

it("ToolSection head shows name, the Jira line only while syncing, the count line and the controls", () => {
  const html = render(page.tools[0]);
  expect(html).toContain(t("projectPages.toolCalendar"));
  expect(html).toContain(t("projectPages.syncedWithJira"));
  expect(html).toContain(t("projectPages.datedStepsCount", { count: 1 }));
  expect(html).toContain(t("projectPages.collapse"));
  expect(html).toContain("data-testid");
  expect(render(page.tools[0], { p: { ...base, sync: null } })).not.toContain(t("projectPages.syncedWithJira"));
});

it("ToolSection collapsed hides the body and offers Expand; a title replaces the name", () => {
  const html = render({ ...page.tools[0], collapsed: true, title: "Q3" });
  expect(html).not.toContain("data-testid");
  expect(html).toContain(t("projectPages.expand"));
  expect(html).toContain("Q3");
});

it("ToolSection gives a viewer no grip, no collapse button and no changing menu item", () => {
  const html = render(page.tools[2], { editor: false });
  expect(html).not.toContain("⋮⋮");
  expect(html).not.toContain(t("projectPages.collapse"));
  expect(html).not.toContain(t("projectPages.toolMenuLabel", { tool: t("projectPages.toolMilestones") }));
});
