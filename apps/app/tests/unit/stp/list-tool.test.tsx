import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DemoProvider } from "@/components/dashboard/DemoProvider";
import { CellMenu } from "@/components/projects/steps/list/CellMenu";
import { listDueDate, listDueOffset } from "@/components/projects/steps/list/dates";
import { ListTool } from "@/components/projects/tools/ListTool";
import { reduce } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR, type ClockSpec } from "@/features/clock";
import { dateOfWorkday } from "@/features/clock/calendar";
import { LOCAL_SEED } from "@/features/demo";
import { READY_PAGES } from "@/features/projects/pages";
import type { Step } from "@/features/projects/types";
import { demoJiraView, jiraRowOf } from "@/features/projects/views";
import { I18nProvider } from "@/i18n/client";

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
const project = (steps: Step[]) => ({ ...reduce(LOCAL_SEED, { events: [], day: 20 }).projects[0], steps });
const jira = jiraRowOf(project([]), demoJiraView(20), 20, "en");
function render(children: ReactNode, locale: "en" | "de" = "en") {
  return html(h(I18nProvider, { locale, children: h(DemoProvider, {
    tenant: { slug: "demo", prefix: "/demo", name: "Demo", demoDataDefault: true }, seed: LOCAL_SEED, children,
  }) }));
}
function list(steps: Step[], locale: "en" | "de" = "en") {
  return render(h(ListTool, {
    p: project(steps), hints: [], jira, page: READY_PAGES[0],
    tool: { id: "list", kind: "list", title: null, content: null, collapsed: false, rev: 0 }, editor: true,
  }), locale);
}

it("List tool renders six sortable columns, localized filters and keyboard cell triggers", () => {
  const en = list([step("Gateway", { external: { system: "jira", key: "KAN-17" } })]);
  for (const label of ["Search this list", "Only mine", "Waiting on someone", "Due this week", "Not started", "Dropped", "Key", "Step", "Owner", "Status", "Due", "Waiting on", "KAN-17"]) expect(en).toContain(label);
  expect(en.match(/aria-sort="none"/g)).toHaveLength(6);
  expect(en.match(/aria-haspopup="dialog"/g)).toHaveLength(3);
  expect(en).toContain('aria-label="Open step: Gateway"');
  const de = list([step("Gateway")], "de");
  for (const label of ["Liste durchsuchen", "Nur meine", "Nicht begonnen", "Verworfen", "Verantwortlich"]) expect(de).toContain(label);
});

it("List tool keeps older Done visible and offers the remaining rows after the first five", () => {
  const markup = list(Array.from({ length: 8 }, (_, i) => step(`Row ${i}`, { column: "done", movedDay: -100 })));
  expect(markup).toContain("Row 0");
  expect(markup).toContain("Row 4");
  expect(markup).not.toContain("Row 5");
  expect(markup).toContain("5 of 8 · sorted by what needs you first");
  expect(markup).toContain("Show all");
});

it("List cell menus offer NextUp statuses, searchable people, clearing and date presets", () => {
  const s = step("Gateway");
  const menu = (column: "status" | "owner" | "due") => render(h(CellMenu, {
    p: project([s]), step: s, column, jira: { ...jira, state: "synced" },
    team: [{ userId: "a", name: "Alex" }, { userId: "b", name: "Alex" }], onClose: () => {},
  }));
  const status = menu("status");
  expect(status.match(/role="menuitemradio"/g)).toHaveLength(4);
  for (const label of ["To do", "Doing", "Blocked", "Done", "Jira follows this move"]) expect(status).toContain(label);
  const owner = menu("owner");
  expect(owner).toContain('type="search"');
  expect(owner.match(/>Alex<\/button>/g)).toHaveLength(2);
  expect(owner).toContain("No owner");
  const due = menu("due");
  for (const label of ["Today", "+3 days", "+1 week", "+2 weeks", "Clear due date"]) expect(due).toContain(label);
  expect(due).toContain('type="date"');
});

it("List dates round-trip selections and reject holidays and invalid input", () => {
  const today = new Date("2026-11-14T12:00:00Z");
  const clock: ClockSpec = { mode: "workdays", calendar: DEFAULT_CALENDAR };
  const day = listDueDate("2026-11-16", clock, today);
  expect(day).not.toBeNull();
  expect(dateOfWorkday(day!, DEFAULT_CALENDAR)).toBe("2026-11-16");
  for (const date of ["2026-11-14", "2026-12-25", "2026-02-30", "", "invalid"]) expect(listDueDate(date, clock, today)).toBeNull();
  expect(listDueDate("2026-11-16", { mode: "demo" }, today)).toBe(2);
  expect(listDueDate("2026-11-13", { mode: "demo" }, today)).toBeNull();
  const presets = [0, 3, 5, 10] as const;
  expect(presets.map((n) => listDueOffset(clock, n))).toEqual([0, 3, 5, 10]);
  expect(presets.map((n) => listDueOffset({ mode: "demo" }, n))).toEqual([0, 3, 7, 14]);
});
