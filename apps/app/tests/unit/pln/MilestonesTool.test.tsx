import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { MilestonesTool } from "@/components/projects/tools/MilestonesTool";
import { READY_PAGES } from "@/features/projects/pages";
import type { ReducedProject, Step } from "@/features/projects/types";
import type { JiraRow } from "@/features/projects/views";
import { I18nProvider } from "@/i18n/client";

vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => ({ act: { project: {} }, S: { day: 5 }, f: (d: number) => "day " + d, seed: { clock: { mode: "demo" } } }) }));
vi.mock("@/components/projects/parts", () => ({ useRights: () => ({ addStep: true }), useSend: () => () => true }));
vi.mock("@/components/projects/steps/StepPanel", () => ({ StepPanel: () => null }));

const step = (id: string, patch: Partial<Step>): Step => ({ id, text: "Step " + id, dueDay: null, column: "todo", milestoneId: null, external: null, ...patch } as Step);
const p = {
  lead: "Lead", history: [],
  milestones: [{ id: "m1", title: "Pilot live", startDay: 0, dueDay: 20, note: "", shipped: false, shippedDay: null }, { id: "m2", title: "Empty one", startDay: null, dueDay: 30, note: "", shipped: false, shippedDay: null }],
  steps: [step("a", { milestoneId: "m1", dueDay: 18, column: "doing" }), step("loose", {})],
} as unknown as ReducedProject;
const render = () => renderToStaticMarkup(h(I18nProvider, { locale: "en", children: h(MilestonesTool, { p, tool: READY_PAGES[2].tools[2], page: READY_PAGES[2], jira: {} as JiraRow, editor: true, hints: [] }) }));

it("MilestonesTool shows a card per milestone with state, dates, progress and the estimate, and offers steps to an empty one", () => {
  const html = render();
  expect(html).toContain("Pilot live");
  expect(html).toContain("Starts day 0 · ships");
  expect(html).toContain("day 20 · 15 days left");
  expect(html).toContain("0 of 1 steps done");
  expect(html).toContain("Estimate: on time");
  expect(html).toContain("No steps yet");
  expect(html).toContain("Add steps →");
  expect(html).toContain("Ships");
  expect(html).toContain("day 30");
  expect(html).toMatch(/Not shipped<span[^>]*>2<\/span>/);
});
