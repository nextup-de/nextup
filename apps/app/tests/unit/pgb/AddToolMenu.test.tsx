import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { READY_PAGES } from "@/features/projects/pages";
import type { JiraRow } from "@/features/projects/views";
import type { ReducedProject } from "@/features/projects/types";
import { createT } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { AddToolMenu } from "@/components/projects/page/AddToolMenu";

const t = createT("en");
const rights = vi.hoisted(() => ({ editor: true }));
vi.mock("@/components/projects/page/usePageActs", () => ({ usePageActs: () => ({}) }));
vi.mock("@/components/projects/parts", () => ({ useRights: () => ({ addStep: rights.editor }) }));

const p = { pages: null } as unknown as ReducedProject;
const page = READY_PAGES[1];
const render = (jiraOn: boolean, agent: boolean, index = 1) => renderToStaticMarkup(h(I18nProvider, { locale: "en", children: h(AddToolMenu, { p, page, jira: { state: jiraOn ? "ready" : "off" } as JiraRow, agent, index, onClose: vi.fn() }) }));

it("AddToolMenu names where the tool goes, tags kinds with Jira, greys what the project has and hides Agent", () => {
  const html = render(true, false);
  expect(html).toContain(t("projectPages.addToolBetween", { before: t("projectPages.toolBoard"), after: t("projectPages.toolList") }));
  expect(html).toContain(t("projectPages.tagJira"));
  expect(html).toContain(t("projectPages.tagNextUpOnly"));
  expect(html).toContain(t("projectPages.alreadyInProject"));
  expect(html).not.toContain(`>${t("projectPages.toolAgent")}<`);
  expect(render(true, true)).toContain(`>${t("projectPages.toolAgent")}<`);
  expect(render(false, false)).not.toContain(t("projectPages.tagNextUpOnly"));
});

it("AddToolMenu renders nothing for who may not add", () => {
  rights.editor = false;
  expect(render(true, true)).toBe("");
  rights.editor = true;
});
