import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DemoProvider } from "@/components/dashboard/DemoProvider";
import { I18nProvider } from "@/i18n/client";
import { LOCAL_SEED } from "@/features/demo";
import { reduce } from "@/features/cases/reducer";
import { DEFAULT_PAGES } from "@/features/projects/pages";
import { demoJiraView, jiraRowOf } from "@/features/projects/views";
import type { Step } from "@/features/projects/types";
import { BoardTool } from "@/components/projects/tools/BoardTool";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/demo/projects",
  useSearchParams: () => new URLSearchParams(),
}));

const step = (id: string, patch: Partial<Step> = {}): Step => ({
  id, text: id, owner: "Lead", ownerUserId: "a", dueDay: null, column: "todo", why: "", note: "",
  addedDay: 0, movedDay: 0, by: "Lead", startedDay: null, doneDay: null, external: null,
  checklist: [], comments: [], waitingOn: null, ...patch,
});
function render(locale: "en" | "de", steps: Step[]) {
  const p = { ...reduce(LOCAL_SEED, { events: [], day: 20 }).projects[0], steps };
  return html(h(I18nProvider, { locale, children: h(DemoProvider, {
    tenant: { slug: "demo", prefix: "/demo", name: "Demo", demoDataDefault: true }, seed: LOCAL_SEED,
    children: h(BoardTool, { p, hints: [], jira: jiraRowOf(p, demoJiraView(20), 20, locale),
      page: DEFAULT_PAGES[0], tool: { id: "board", kind: "board", title: null, content: null, collapsed: false, rev: 0 }, editor: true }),
  }) }));
}

it("STP board: renders localized toolbar and four NextUp status columns without By epic", () => {
  const en = render("en", [step("Map suppliers")]);
  for (const label of ["Search this board", "Only mine", "Waiting on someone", "Due this week", "By status", "By person", "Not started", "Dropped", "To do", "Doing", "Blocked", "Done"]) expect(en).toContain(label);
  expect(en).not.toContain("By epic");
  const de = render("de", [step("Lieferanten erfassen")]);
  expect(de).toContain("Board durchsuchen");
  expect(de).toContain("Nur meine");
  expect(de).toContain("Nach Person");
});

it("STP board: cards expose their key, waiting-on text and accessible checklist progress", () => {
  const markup = render("en", [step("Test alerts", {
    external: { system: "jira", key: "KAN-17" },
    waitingOn: { kind: "outside", name: "Supplier", userId: null },
    checklist: [{ id: "a", text: "Prepare", done: true }, { id: "b", text: "Test", done: false }],
  })]);
  expect(markup).toContain("KAN-17");
  expect(markup).toContain("Waiting on Supplier");
  expect(markup).toContain('aria-label="Steps inside · 1 of 2 done"');
  expect(markup).toContain('aria-label="Open step: Test alerts"');
});


it("STP board: hides Done older than fourteen days behind the explicit Show chip", () => {
  const markup = render("en", [step("Recent done", { column: "done", movedDay: 0 }), step("Older done card", { column: "done", movedDay: -100 })]);
  expect(markup).toContain("Recent done");
  expect(markup).not.toContain("Older done card");
  expect(markup).toContain("1 older done · Show");
});
