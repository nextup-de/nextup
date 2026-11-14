import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DEFAULT_PAGES } from "@/features/projects/pages";
import type { ReducedProject, Step } from "@/features/projects/types";
import type { JiraRow } from "@/features/projects/views";
import { createT } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { CalendarTool } from "@/components/projects/tools/CalendarTool";

vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => ({ act: { project: {} }, S: { day: 10 }, seed: { clock: { mode: "demo" }, seats: [] }, actorUserId: "u1" }) }));
vi.mock("@/components/projects/parts", () => ({ useRights: () => ({ addStep: true }), useSend: () => () => true, teamOf: () => [], withIds: () => [] }));
vi.mock("@/components/projects/steps/StepPanel", () => ({ StepPanel: () => null }));
vi.mock("@/components/projects/steps/CreateStepDialog", () => ({ CreateStepDialog: () => null }));

const t = createT("en");
const step = (id: string, dueDay: number | null): Step => ({ id, text: "Step " + id, dueDay, column: "todo", external: null } as Step);
const p = { steps: [step("a", 10), step("b", null)] } as unknown as ReducedProject;
const tool = DEFAULT_PAGES[2].tools[0];
const render = () => renderToStaticMarkup(h(I18nProvider, { locale: "en", children: h(CalendarTool, { p, tool, page: DEFAULT_PAGES[2], jira: {} as JiraRow, editor: true, hints: [] }) }));

it("CalendarTool shows the toolbar, a chip on today and the count of unscheduled steps", () => {
  const html = render();
  expect(html).toContain(t("projectPlan.calToday"));
  expect(html).toContain(t("projectPlan.calMonth"));
  expect(html).toContain("a · Step a");
  expect(html).toMatch(/Not scheduled<span[^>]*>1<\/span>/);
});
