import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AddPageDialog } from "@/components/projects/page/AddPageDialog";
import { READY_PAGES } from "@/features/projects/pages";
import { reduce } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { demoJiraView, jiraRowOf } from "@/features/projects/views";
import { I18nProvider } from "@/i18n/client";

vi.mock("@/components/projects/page/usePageActs", () => ({ usePageActs: () => ({}) }));
vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => ({ flag: () => false, showToast: vi.fn() }) }));
const p = { ...reduce(LOCAL_SEED, { events: [], day: 0 }).projects[0], pages: READY_PAGES };
const props = { p, open: true, onClose: vi.fn(), onCreated: vi.fn() };
const render = (extra = {}, locale: "en" | "de" = "en") => renderToStaticMarkup(h(I18nProvider, { locale, children: h(AddPageDialog, { ...props, ...extra }) }));

it("Add page dialog renders the numbered selection, preview, groups and single-instance refusal", () => {
  const html = render({ preselect: { kind: "calendar" } });
  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain("Page preview");
  expect(html).toContain("1 tool picked");
  expect(html).toContain("Work on steps");
  expect(html).toContain("Cards in columns");
  expect(html).toContain('disabled="" title="Already in this project"');
  expect(html).not.toContain("NextUp only");
  expect(html).not.toContain("Help with the next step");
});

it("Add page dialog shows Jira tags only for a configured connector and only four kinds are Jira tools", () => {
  const jira = jiraRowOf(p, demoJiraView(0), 0, "en");
  const html = render({ jira });
  expect(html.match(/data-jira="true"/g)).toHaveLength(4);
  expect(html).toContain("NextUp only");
  expect(html).toContain("Jira project NUP");
  expect(render({ jira: { ...jira, projectKey: null } })).not.toContain("NextUp only");
});

it("Add page dialog starts empty with Next disabled, supports German, and unmounts on close", () => {
  expect(render()).toMatch(/disabled="">Next: name it/);
  expect(render({}, "de")).toContain("Neue Seite");
  expect(render({ open: false })).toBe("");
});
