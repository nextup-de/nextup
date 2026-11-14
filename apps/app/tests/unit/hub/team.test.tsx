import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DemoProvider } from "@/components/dashboard/DemoProvider";
import { Activity } from "@/components/projects/hub/team/Activity";
import { Team } from "@/components/projects/hub/team/Team";
import { reduce } from "@/features/cases/reducer";
import type { CaseEvent } from "@/features/cases/events";
import { LOCAL_SEED } from "@/features/demo";
import type { ReducedProject } from "@/features/projects/types";
import { I18nProvider } from "@/i18n/client";
import { step } from "../res/project-fixture";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/demo/projects", useSearchParams: () => new URLSearchParams() }));

const comment = (id: string, actor: string, day: number, text: string): CaseEvent =>
  ({ id, ts: 0, day, actor, actorUserId: null, target: "p", type: "project.commented", payload: { text } });

const seats = LOCAL_SEED.seats;
const [lead, a, b] = seats;
const base = (): ReducedProject => ({ ...reduce(LOCAL_SEED, { events: [], day: 20 }).projects[0],
  lead: lead.label, leadUserId: lead.userId, members: [a.label], memberUserIds: [a.userId as string],
  steps: [
    step("s1", { ownerUserId: a.userId, column: "doing" }), step("s2", { ownerUserId: a.userId, column: "todo" }),
    step("s3", { ownerUserId: a.userId, column: "done" }), step("s4", { ownerUserId: b.userId, column: "doing" }),
  ],
  history: [comment("c1", "Lead", 3, "First words"), comment("c2", "Lead", 5, "Second words"), comment("c3", "Lead", 5, "Third words")],
});
function render(child: (p: ReducedProject) => ReactNode, p: ReducedProject, locale: "en" | "de" = "en") {
  return html(h(I18nProvider, { locale, children: h(DemoProvider, {
    tenant: { slug: "demo", prefix: "/demo", name: "Demo", demoDataDefault: true }, seed: LOCAL_SEED, children: child(p),
  }) }));
}

it("HUB team Team tool lists the lead, the members and open step counts for this team only", () => {
  const markup = render((p) => h(Team, { p }), base());
  expect(markup).toContain(lead.label);
  expect(markup).toContain(a.label);
  expect(markup).toContain("Lead");
  expect(markup).toContain("2 open");
  expect(markup).not.toContain(b.label);
  expect(markup).not.toContain("3 open");
});

it("HUB team Activity tool lists events newest first under day headers", () => {
  const markup = render((p) => h(Activity, { p }), base());
  expect(markup.indexOf("Third words")).toBeLessThan(markup.indexOf("Second words"));
  expect(markup.indexOf("Second words")).toBeLessThan(markup.indexOf("First words"));
  expect(markup.match(/<h3/g)?.length).toBe(2);
  const de = render((p) => h(Activity, { p }), base(), "de");
  expect(de).toContain("Third words");
});
