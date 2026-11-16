// The project Overview keeps empty parts away (Kevin, 16 Nov 2026): without steps it asks for the first one instead of
// zero tiles, an empty chart and empty lists; with steps each part shows once it has something to say.
import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DemoProvider } from "@/components/dashboard/DemoProvider";
import { Overview } from "@/components/projects/hub/overview/Overview";
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
const render = (p: ReducedProject) => html(h(I18nProvider, { locale: "en", children: h(DemoProvider, {
  tenant: { slug: "demo", prefix: "/demo", name: "Demo", demoDataDefault: true }, seed: LOCAL_SEED,
  children: h(Overview, { p, page, tool: page.tools[0] }),
}) }));

it("OVERVIEW without steps: one card asks for the first step; no tiles, no chart, no empty lists", () => {
  const markup = render(project({ steps: [] }));
  expect(markup).toContain("Plan the first steps");
  for (const empty of ["Steps done this week", "Where the steps are", "Steps done per week", "No steps yet.", "No steps completed in this period."]) expect(markup).not.toContain(empty);
});

it("OVERVIEW with steps: where the steps are shows; the weekly chart stays away while nothing is done", () => {
  const markup = render(project({ steps: [step("s1", { column: "doing" })] }));
  expect(markup).toContain("Where the steps are");
  expect(markup).not.toContain("Plan the first steps");
  expect(markup).not.toContain("Steps done per week");
});

it("OVERVIEW tiles are quiet: one step in Doing for 42 days shows Stuck and no zero or dash tile", () => {
  const markup = render(project({ steps: [step("Ursache eingrenzen", { column: "doing", movedDay: -42 })] }));
  expect(markup).toContain("Stuck");
  expect(markup).toContain("Ursache eingrenzen, 42 days in Doing");
  for (const quiet of ["Steps done this week", "Waiting on someone", "No upcoming due date", ">0<", "—"]) expect(markup).not.toContain(quiet);
});

it("OVERVIEW with only a fresh step: no tile row at all", () => {
  const markup = render(project({ steps: [step("s1", { column: "doing", movedDay: -1 })] }));
  expect(markup).not.toContain("Stuck");
  expect(markup).not.toContain("Steps done this week");
});
