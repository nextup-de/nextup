// The Result, Baseline and Reward say each fact once (DESIGN_RULES §9, docs/plans/2026-11-16_quiet-screens): a check row
// carries one date (when it opens, then when it is due, none once a number stands), "Not confirmed yet" is said by one chip,
// and the Reward is not drawn before a reward is due.
import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DemoProvider } from "@/components/dashboard/DemoProvider";
import { BaselinePanel, MeasurePanel, RewardPanel } from "@/components/projects/ProjectMeasure";
import { reduce } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import type { Measure, ReducedProject } from "@/features/projects/types";
import { I18nProvider } from "@/i18n/client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/demo/projects", useSearchParams: () => new URLSearchParams() }));

const DAY = 20;
const project = (patch: Partial<ReducedProject> = {}): ReducedProject => ({ ...reduce(LOCAL_SEED, { events: [], day: DAY }).projects[0],
  status: "measuring", doneDay: 0, stopped: null, reward: null, rewardDue: false, measures: [], checks: [],
  baseline: { none: false, metric: "Wait time", unit: "hours", value: 50, better: "down", source: "Log", day: -40, by: "Lead" }, ...patch });
const measure = (patch: Partial<Measure> = {}): Measure => ({
  check: 30, value: 30, source: "Log", note: "", day: 15, by: "Lead", byUserId: null,
  sourceKind: "typed", sourceInfo: { kind: "typed" }, impact: null, confirmed: false,
  confirmedByUserId: null, confirmedDay: null, verdict: "better", changePct: -40, eventId: null,
  sentBack: false, reentered: false, managerOnly: false, questions: [], previous: [], ...patch,
});
const render = (node: ReturnType<typeof h>, locale: "en" | "de" = "en") => html(h(I18nProvider, { locale, children: h(DemoProvider, {
  tenant: { slug: "demo", prefix: "/demo", name: "Demo", demoDataDefault: true }, seed: LOCAL_SEED, children: node,
}) }));
const count = (text: string, part: string) => text.split(part).length - 1;

it("a check before it opens is its date and nothing else; it does not say the date twice", () => {
  const markup = render(h(MeasurePanel, { p: project({ checks: [{ check: 90, opensDay: DAY + 30, dueDay: DAY + 35, measured: false, late: false }] }) }));
  expect(markup).toContain("90-day check");
  expect(markup).toContain("opens ");
  for (const gone of ["due ", "Opens ", "Open since", "The lead records it", "the verdict is computed", "Checks open"]) expect(markup).not.toContain(gone);
});

it("a typed number nobody confirmed yet says so once, by its chip; who typed it waits in Details", () => {
  const p = project({ measures: [measure()], checks: [{ check: 30, opensDay: DAY - 10, dueDay: DAY - 5, measured: true, late: false }] });
  const markup = render(h(MeasurePanel, { p }));
  expect(count(markup.toLowerCase(), "not confirmed")).toBe(1);
  expect(markup).toContain("50 → 30 hours");
  expect(markup).toContain("Typed by Lead");
  expect(markup).toMatch(/<details[^>]*data-name="measure-details-30"/);
  expect(markup).not.toMatch(/<details[^>]*data-name="measure-details-30"[^>]*open/);
  expect(markup).not.toContain("due "); // no date once a number stands
  const de = render(h(MeasurePanel, { p }), "de");
  expect(count(de.toLowerCase(), "nicht bestätigt")).toBe(1);
});

it("the Result is not drawn with nothing to say", () => {
  expect(render(h(MeasurePanel, { p: project({ doneDay: null, status: "running" }) }))).toBe("");
});

it("the baseline is the number and, while it waits for a second person, one chip; its source and who took it are folded", () => {
  const markup = render(h(BaselinePanel, { p: project({ status: "planning", doneDay: null }), hint: null }));
  expect(markup).toContain("50 hours");
  expect(markup).toMatch(/<details[^>]*data-name="baseline-details"/);
  for (const gone of ["the number before the start", "A second person confirms the baseline", "The sponsor or the route"]) expect(markup).not.toContain(gone);
});

it("the Reward is not drawn before a reward is due", () => {
  expect(render(h(RewardPanel, { p: project() }))).toBe("");
  expect(render(h(RewardPanel, { p: project({ status: "measured" }) }))).toBe("");
  const due = render(h(RewardPanel, { p: project({ status: "measured", rewardDue: true }) }));
  expect(due).toContain("Reward");
  for (const gone of ["payroll pays it", "A reward is due after", "gives no reward"]) expect(due).not.toContain(gone);
});
