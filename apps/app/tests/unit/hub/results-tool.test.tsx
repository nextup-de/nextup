import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DemoProvider } from "@/components/dashboard/DemoProvider";
import { ResultPanel } from "@/components/projects/hub/results/ResultPanel";
import { Results } from "@/components/projects/hub/results/Results";
import { reduce } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import type { Measure, ReducedProject } from "@/features/projects/types";
import { step } from "../res/project-fixture";
import { I18nProvider } from "@/i18n/client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/demo/projects", useSearchParams: () => new URLSearchParams() }));

const project = (): ReducedProject => ({ ...reduce(LOCAL_SEED, { events: [], day: 20 }).projects[0],
  title: "Shorter waits", goal: null, steps: [], history: [], measures: [], checks: [],
  baseline: { none: false, metric: "Wait time", unit: "hours", value: 50, better: "down", source: "Log", day: 1, by: "Lead" },
});
const measure = (patch: Partial<Measure> = {}): Measure => ({
  check: 30, value: 30, source: "Log", note: "", day: 35, by: "Lead", byUserId: null,
  sourceKind: "typed", sourceInfo: { kind: "typed" }, impact: null, confirmed: false,
  confirmedByUserId: null, confirmedDay: null, verdict: "better", changePct: -40, eventId: null,
  sentBack: false, reentered: false, managerOnly: false, questions: [], previous: [], ...patch,
});
function render(p: ReducedProject, locale: "en" | "de" = "en", panel = false) {
  const children: ReactNode = panel ? h(ResultPanel, { p }) : h(Results, { p });
  return html(h(I18nProvider, { locale, children: h(DemoProvider, {
    tenant: { slug: "demo", prefix: "/demo", name: "Demo", demoDataDefault: true }, seed: LOCAL_SEED, children,
  }) }));
}

it("Results card shows the real baseline and latest measurement, verdict, next check and confirmation state", () => {
  const p = { ...project(), measures: [measure()], checks: [{ check: 90, opensDay: 90, dueDay: 95, measured: false, late: false }] };
  const markup = render(p);
  for (const label of ["Wait time", "Baseline", "Measured value", "50 hours", "30", "better", "Awaiting confirmation", "Check after 90 days", 'aria-haspopup="dialog"']) expect(markup).toContain(label);
  expect(markup).not.toContain("Add result");
  expect(markup).not.toContain("How long a step sits in each column");
  const de = render(p, "de");
  for (const label of ["Ausgangswert", "Gemessener Wert", "besser", "Ergebnis öffnen"]) expect(de).toContain(label);
});

it("Results card excludes a sent-back measurement and keeps a genuine zero result", () => {
  const p = { ...project(), measures: [measure({ value: 0 }), measure({ day: 40, value: 999, sentBack: true, verdict: "worse" })] };
  const markup = render(p);
  expect(markup).toContain("better");
  expect(markup).toContain("0 hours");
  expect(markup).not.toContain("999");
  expect(markup).not.toContain("worse");
});

it("Results side panel mounts the existing baseline, check and reward panels with RES history", () => {
  const p = { ...project(), doneDay: 5, measures: [measure({ sentBack: true, questions: [{ day: 40, why: "Please check the source", byUserId: null }] })], checks: [{ check: 30, opensDay: 35, dueDay: 40, measured: true, late: false }] };
  const markup = render(p, "en", true);
  for (const label of ["baseline-", "measure-", "reward-", "Please check the source"]) expect(markup).toContain(label);
});

it("Results chart displays median column days from moves and omits columns without stays", () => {
  const p = { ...project(), steps: [step("s", { addedDay: 0, column: "done", doneDay: 7 })], history: [
    { id: "move1", ts: 0, day: 2, actor: "Lead", target: "p", type: "project.step.moved" as const, payload: { stepId: "s", to: "doing" } },
    { id: "move2", ts: 0, day: 7, actor: "Lead", target: "p", type: "project.step.moved" as const, payload: { stepId: "s", to: "done" } },
  ] };
  const markup = render(p);
  for (const label of ["How long a step sits in each column", "Median days", "To do", "Doing", ">2</strong>", ">5</strong>"]) expect(markup).toContain(label);
  expect(markup).not.toContain("Blocked");
});
