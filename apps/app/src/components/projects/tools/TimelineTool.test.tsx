/* eslint-disable nextup/no-inline-strings -- test titles are not user-facing */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { JiraRow } from "@/features/projects/views";
import type { ReducedProject, Step, ToolInstance } from "@/features/projects/types";
import { I18nProvider } from "@/i18n/client";
import { TimelineTool } from "./TimelineTool";

const mocks = vi.hoisted(() => ({ editor: true }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => ({ S: { day: 10 }, f: (d: number) => `d${d}`, seed: { clock: { mode: "demo" }, seats: [] }, act: { project: { editStep: vi.fn() } } }) }));
vi.mock("../parts", () => ({ useRights: () => ({ addStep: mocks.editor, editStep: () => mocks.editor }), useSend: () => () => true }));
vi.mock("../steps/StepPanel", () => ({ StepPanel: () => null }));
vi.mock("../steps/CreateStepDialog", () => ({ CreateStepDialog: () => null }));

const step = (id: string, patch: Partial<Step> = {}): Step => ({
  id, text: id, owner: null, dueDay: null, column: "todo", why: "", note: "", addedDay: 0, movedDay: 0, by: "Lead", startedDay: null, doneDay: null,
  external: null, checklist: [], comments: [], waitingOn: null, ...patch,
});
const p = {
  milestones: [{ id: "m1", title: "Pilot", startDay: null, dueDay: 20, note: "", shipped: false, shippedDay: null }],
  steps: [step("Alpha", { milestoneId: "m1", column: "done", startDay: 2, dueDay: 6 }), step("Beta", { milestoneId: "m1", column: "doing", startedDay: 5, dueDay: 14 })],
  sync: { system: "jira", on: true },
} as unknown as ReducedProject;
const tool = { id: "t", kind: "timeline", title: null, collapsed: false, content: null, rev: 0 } as ToolInstance;
const render = (jira = { state: "off" } as JiraRow, locale: "en" | "de" = "en") => renderToStaticMarkup(h(I18nProvider, { locale, children: h(TimelineTool, { p, tool, page: { id: "pg", title: "P", icon: "calendar", tools: [tool] }, jira, editor: mocks.editor, hints: [] }) }));

beforeEach(() => { mocks.editor = true; });

it("TimelineTool draws a group row with its progress, a bar per step with its tone, and the controls", () => {
  const html = render();
  expect(html).toContain("Pilot");
  expect(html).toContain("1 of 2 done");
  expect(html).toContain('data-tone="done"');
  expect(html).toContain('data-tone="doing"');
  expect(html).toContain("Weeks");
  expect(html).toContain("Dates…");
  expect(html).toContain("Add step");
});

it("TimelineTool says the start day stays in NextUp on a syncing project, and gives a viewer no edit controls, in German too", () => {
  expect(render({ state: "synced" } as JiraRow)).toContain("the start day stays in NextUp");
  expect(render({ state: "synced" } as JiraRow, "de")).toContain("Starttag bleibt in NextUp");
  expect(render({ state: "off" } as JiraRow)).not.toContain("start day stays");
  mocks.editor = false;
  const html = render();
  expect(html).not.toContain("Dates…");
  expect(html).not.toContain("Add step");
  expect(html).not.toContain("Change the start of");
});
