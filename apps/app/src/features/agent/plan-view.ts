// What the case page shows of the agent's planning run (plan AGT, D15, D19, D25). Pure: the viewer, the case, the agent's state and the switches in,
// what to show out. The words of a draft are never decided here: `draft: "words"` means this viewer may read them (maySeePlan), and the server
// action that returns them checks that again when it reads them. The raiser learns only that a draft exists.
import type { SeatRow } from "@/features/auth/identity";
import type { ReducedCase } from "@/features/cases/reducer";
import { TEMPLATES, type TemplateKey } from "@/features/templates/library";
import { PlanV2Reply, planDraftOf, type PlanV2Request } from "./contract";
import { PLAN_RUNS_MAX } from "./limits";
import { mayPlanCase, maySeePlan, maySeePlanExists, type AgentViewer } from "./permissions";
import type { AgentState, PlanDraft } from "./types";

export type PlanPanel = {
  /** The button, with the runs the case has left; null when this viewer may not ask. */
  button: { runsLeft: number } | null;
  /** words: the latest draft's words may be shown; exists: only that a draft exists; null: no draft or none this viewer may know of. */
  draft: "words" | "exists" | null;
};

export type PlanPanelInput = {
  /** A company with a database in a stage that is not the demo; the agent never runs without one (D8). */
  available: boolean;
  /** The flag `agent` is on for the company. */
  flag: boolean;
  /** The AI gate is open for purpose `agent`. A closed gate shows nothing, never an error (D25). */
  gateOpen: boolean;
  viewer: AgentViewer;
  kase: ReducedCase;
  seats: readonly SeatRow[];
  agent: Pick<AgentState, "plans">;
};

/** The panel, or null when there is nothing to show this viewer. */
export function planPanelOf(a: PlanPanelInput): PlanPanel | null {
  if (!a.available || !a.flag || !a.gateOpen) return null;
  const plans = a.agent.plans[a.kase.id] ?? [];
  const may = mayPlanCase(a.viewer, a.kase, { seats: [...a.seats] }, a.agent);
  const button = may.ok ? { runsLeft: Math.max(0, PLAN_RUNS_MAX - plans.length) } : null;
  const draft: PlanPanel["draft"] = plans.length === 0 ? null : maySeePlan(a.viewer, a.kase, a.seats).ok ? "words" : maySeePlanExists(a.viewer, a.kase, a.seats) ? "exists" : null;
  return button === null && draft === null ? null : { button, draft };
}

/** The titles of the three shipped templates, as the brain's request carries them. */
const TEMPLATE_TITLES: Record<TemplateKey, string> = { "quick-win": "Quick win", "8d": "8D problem solving", investment: "Investment" };

/** The latest version of each shipped template: key, title and its steps with their roles (the brain's `templates`, D19). */
export function planTemplates(): PlanV2Request["templates"] {
  return (Object.keys(TEMPLATES) as TemplateKey[]).map((key) => {
    const latest = TEMPLATES[key].reduce((a, b) => (b.version > a.version ? b : a));
    return { key, title: TEMPLATE_TITLES[key], steps: latest.steps.map((s) => ({ title: s.text.slice(0, 200), role: s.role })) };
  });
}

/** The draft as stored (the contract's plan object as JSON), read again through the contract: bounded text and no more than the contract has. Null for anything else. */
export function planDraftFromText(text: string): PlanDraft | null {
  try {
    const plan = PlanV2Reply.shape.plan.safeParse(JSON.parse(text));
    return plan.success ? planDraftOf(plan.data) : null;
  } catch {
    return null;
  }
}
