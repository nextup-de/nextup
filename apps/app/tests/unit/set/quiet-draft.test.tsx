// The draft's setup says each fact once (DESIGN_RULES §9, docs/plans/2026-11-16_quiet-screens): the title and the stepper,
// no lede, no "Step 6 of 6", no "5 of 5 done", no list that repeats the stepper; the open step has one main button, and
// whoever is not the lead reads who starts it. States come from the real reducer.
import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { I18nProvider } from "@/i18n/client";
import { DraftView } from "@/components/projects/draft/DraftView";

const mocks = vi.hoisted(() => ({ ctx: {} as Record<string, unknown> }));
vi.mock("@/components/dashboard/DemoProvider", () => ({ useDemo: () => mocks.ctx }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/demo/projects/p_one", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/projects/draft/useProjectHints", () => ({ useProjectHints: () => ({ stepHints: [], baseHint: null }) }));
vi.mock("@/components/projects/ProjectMeasure", () => ({ BaselinePanel: () => h("div", null, "Baseline body") }));

const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_lb", roleId: "role_lead", label: "L. Brandt", userId: "u_lb", sort: 1 },
  { id: "seat_hs", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 2 },
  { id: "seat_mr", roleId: "role_ops", label: "M. Roth", userId: "u_mr", sort: 3 },
];
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes: LOCAL_SEED.routes, promiseDays: PROMISE_DAYS, seats, clock: { mode: "workdays", calendar: DEFAULT_CALENDAR } };
const NAME: Record<string, string> = { u_tv: "T. Vogel", u_lb: "L. Brandt", u_hs: "H. Sander", u_mr: "M. Roth", u_ci: "C. Ilg" };
let n = 0;
const ev = (type: CaseEventType, target: string | null, payload: EventPayload, day: number, by: string): CaseEvent =>
  ({ id: "q" + n++, ts: 0, type, actor: NAME[by] ?? by, actorUserId: by, target, payload, day });
const P = (type: CaseEventType, payload: EventPayload, day: number, by: string) => ev(type, "p_one", payload, day, by);
const raised = ev("case.raised", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" }, 0, "u_ci");
const yes = ev("case.decided", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", draft: true }, 0, "u_tv");
const take = P("project.lead.answered", { take: true }, 1, "u_lb");
const template = P("project.template", { key: "8d", version: 1 }, 1, "u_lb");
const invited = P("project.invited", { userId: "u_mr", role: "member" }, 1, "u_lb");
const accepted = P("project.invite.answered", { inviteId: invited.id, userId: "u_mr", take: true }, 2, "u_mr");
const goal = P("project.goal", { goal: "Fewer complaints", doneWhen: "Under 3 a month" }, 1, "u_lb");
const baseline = P("project.baseline", { metric: "Complaints", unit: "per month", value: 9, better: "down", source: "QMS" }, 1, "u_lb");

function render(events: CaseEvent[], viewer: string, role: "member" | "leader" = "leader", confirmed = true) {
  const S = reduce(SEED, { events: [raised, yes, ...events], day: 2 });
  // A reward is possible by default (plan RES, D16): these cases take the baseline's second confirmation as given, unless asked not to.
  if (confirmed) for (const p of S.projects) if (p.baseline && !p.baseline.none) p.baseline.confirmed = { byUserId: "u_hs", day: 2 };
  mocks.ctx = { S, act: {}, href: (path: string) => "/demo" + path, f: (d: number) => "day " + d, seed: { ...LOCAL_SEED, seats }, role, actorUserId: viewer,
    me: meFor(viewer, seats), persona: { role: { id: role }, who: { name: NAME[viewer], handle: null } }, showToast: vi.fn(), flag: () => true };
  const p = S.projects.find((x) => x.id === "p_one");
  if (!p) throw new Error("no draft");
  return html(h(I18nProvider, { locale: "en", children: h(DraftView, { p }) }));
}

beforeEach(() => { n = 0; });

it("SET quiet: the title and the stepper; no lede, no top line, no step count and no done count", () => {
  const out = render([take, template, invited, accepted, goal, baseline], "u_lb");
  for (const gone of ["From the idea", "Start expected", "Step 6 of 6", "of 5 done", "Ready to start?", "Start opens the board", "Still needed to start", "Template and team help"]) expect(out).not.toContain(gone);
  expect(out).toContain('data-testid="draft-progress"');
});

it("SET quiet: with everything needed the lead's Start is the one main button; who is not the lead reads who starts it", () => {
  const lead = render([take, template, invited, accepted, goal, baseline], "u_lb");
  expect(lead).toMatch(/nh-btn-primary[^"]*"[^>]*>Start the project</);
  expect(lead.match(/nh-btn-primary/g)?.length).toBe(1);
  const other = render([take, template, invited, accepted, goal, baseline], "u_mr", "member");
  expect(other).not.toContain("Start the project");
  expect(other).toContain("L. Brandt starts it.");
});

it("SET quiet: an open optional step is skipped with the main button; nothing explains what a template does", () => {
  const out = render([take], "u_lb");
  expect(out).toContain('data-step="template"');
  expect(out).toMatch(/nh-btn-primary[^"]*"[^>]*>Skip</);
  for (const gone of ["A template puts the first steps", "Steps already moved or edited stay"]) expect(out).not.toContain(gone);
});

it("SET quiet: a taken baseline that waits names who confirms it in the stepper, not \"Needed to start\"; the draft opens on it", () => {
  const out = render([take, template, invited, accepted, goal, baseline], "u_lb", "leader", false);
  expect(out).toContain('data-step="baseline"');
  expect(out).toMatch(/Baseline<\/span><span[^>]*>Waits for [^<]+</);
  expect(out).not.toMatch(/Baseline<\/span><span[^>]*>Needed to start/);
  expect(out).not.toContain(">Start the project<");
});
