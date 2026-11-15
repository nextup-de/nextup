import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { READY_PAGES } from "@/features/projects/pages";
import type { JiraRow } from "@/features/projects/views";
import type { ReducedProject } from "@/features/projects/types";
import { createT } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { ToolMenu } from "@/components/projects/page/ToolMenu";

vi.mock("@/components/projects/page/usePageActs", () => ({ usePageActs: () => ({}) }));
vi.mock("@/components/projects/page/AddPageDialog", () => ({ AddPageDialog: () => null }));

const t = createT("en");
const page = READY_PAGES[2];
const p = { pages: null, sync: null } as unknown as ReducedProject;
const jira = { state: "off", siteUrl: null, projectKey: null } as JiraRow;
const render = (editor: boolean, locale: "en" | "de" = "en") => renderToStaticMarkup(h(I18nProvider, { locale, children: h(ToolMenu, { p, page, tool: page.tools[0], jira, editor, name: "Calendar", onRename: vi.fn() }) }));

it("ToolMenu shows a closed ⋯ trigger to an editor, labelled with the tool, and nothing to a viewer", () => {
  const html = render(true);
  expect(html).toContain('aria-haspopup="menu"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain(t("projectPages.toolMenuLabel", { tool: t("projectPages.toolCalendar") }));
  expect(html).not.toContain('role="menu"');
  expect(render(false)).toBe("");
});
