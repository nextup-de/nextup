// The project Overview keeps empty parts away (Kevin, 16 Nov 2026): without steps it asks for the first one instead of
// zero tiles, an empty chart and empty lists; with steps each part shows once it has something to say.
import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DemoProvider } from "@/components/dashboard/DemoProvider";
import { Overview } from "@/components/projects/hub/overview/Overview";
import { NextPanel } from "@/components/projects/ProjectNext";
import { reduce } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { DEFAULT_PAGES } from "@/features/projects/pages";
import type { ReducedProject } from "@/features/projects/types";
import { I18nProvider } from "@/i18n/client";
import { step } from "../res/project-fixture";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => "/demo/projects/p", useSearchParams: () => new URLSearchParams() }));

const [lead] = LOCAL_SEED.seats;
const project = (patch: Partial<ReducedProject> = {}): ReducedProject => ({ ...reduce(LOCAL_SEED, { events: [], day: 20 }).projects[0],
  lead: lead.label, leadUserId: lead.userId, members: [], memberUserIds: [], status: "running", ...patch });
const page = DEFAULT_PAGES[0];
const wrap = (children: ReturnType<typeof h>) => html(h(I18nProvider, { locale: "en", children: h(DemoProvider, {
  tenant: { slug: "demo", prefix: "/demo", name: "Demo", demoDataDefault: true }, seed: LOCAL_SEED, children,
}) }));
const render = (p: ReducedProject) => wrap(h(Overview, { p, page, tool: page.tools[0] }));

it("OVERVIEW without steps: no tiles, no chart, no empty lists and no sentence about how the page fills in", () => {
  const markup = render(project({ steps: [] }));
  // Adding the first step is the move card's, for who may add steps (DESIGN_RULES §9); a reader sees no Steps line at all.
  for (const empty of ["Steps done this week", "Where the steps are", "Steps done per week", "No steps yet.", "No steps completed in this period.", "Nothing to show yet"]) expect(markup).not.toContain(empty);
});

it("OVERVIEW with steps: one card says how far the steps are, what happens next sits beside it, no weekly chart", () => {
  const markup = render(project({ steps: [step("s1", { column: "doing" })] }));
  expect(markup).toContain('aria-label="0 of 1 steps done"');
  expect(markup).toContain('aria-label="Doing 1"'); // the bar says it in words
  expect(markup).toContain("What happens next");
  for (const gone of ["Plan the first steps", "Steps done per week", "Where the steps are", "Who has what"]) expect(markup).not.toContain(gone);
});

it("OVERVIEW quiet: a step in Doing for 42 days shows as stuck in what happens next, no zero or dash anywhere", () => {
  const markup = render(project({ steps: [step("Ursache eingrenzen", { column: "doing", movedDay: -42 })] }));
  expect(markup).toContain('data-stuck="true">42 days in Doing');
  for (const quiet of ["Steps done this week", "Waiting on someone", "No upcoming due date", ">0<", "—", "Not taken yet"]) expect(markup).not.toContain(quiet);
});

it("OVERVIEW with only a fresh step: no tile row at all", () => {
  const markup = render(project({ steps: [step("s1", { column: "doing", movedDay: -1 })] }));
  expect(markup).not.toContain("Stuck");
  expect(markup).not.toContain("Steps done this week");
});

it("OVERVIEW with every step done: one done card, no tiles, no bar, no legend of zeros", () => {
  const markup = render(project({ steps: [step("a", { column: "done", doneDay: -20 }), step("b", { column: "done", doneDay: -12 })] }));
  expect(markup).toContain("All 2 steps done");
  for (const gone of ["Last one done on", "Where the steps are", "data-column=\"done\"", "Steps done this week", "Waiting on someone", "No upcoming due date", ">0<", "—"]) expect(markup).not.toContain(gone);
});

it("WHAT HAPPENS NEXT stays away when every step is done, and asks for the first step only without steps", () => {
  const done = wrap(h(NextPanel, { p: project({ steps: [step("a", { column: "done", doneDay: -5 })] }) }));
  expect(done).toBe("");
  const none = wrap(h(NextPanel, { p: project({ steps: [] }) }));
  expect(none).toContain("Add the first one on the board");
});

it("DONE CARD carries what comes next: a recognised project says where it stands and offers no button", () => {
  const markup = render(project({ status: "recognised", steps: [step("a", { column: "done", doneDay: -5 })] }));
  expect(markup).toContain("The one step is done");
  expect(markup).toContain('data-name="overview-result"'); // the Result line says where it stands
  expect(markup).not.toContain("Mark it done");
});

it("DONE CARD while running: no button for a viewer the rights refuse, and no status line either", () => {
  // The button follows resultView(...).done.can, the same check as Manage › Mark it done; the e2e demo walks the lead's side.
  const markup = render(project({ steps: [step("a", { column: "done", doneDay: -5 })] }));
  expect(markup).toContain("The one step is done");
  expect(markup).not.toContain("Mark it done");
  expect(markup).not.toContain("data-testid=\"overview-stands\"");
});
