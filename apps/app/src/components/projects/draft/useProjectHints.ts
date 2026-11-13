"use client";
// The first steps and the metric a planned project offers (P7.5:s2): the brief's own lines with the AI off, and the planning draft the desk stored for the
// case when there is one and the viewer may read it (REM Q7.11). Reading a stored draft calls no model: the brain is asked only when someone presses the
// button on the case (server/agent/plan.ts), never on a page load. People pick, nobody is told.
// Shared by the planning board and the draft page, so both read the same hints.
import { useEffect, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { PlanDraft } from "@/features/agent/types";
import { withBrainSteps } from "@/features/projects/brain";
import type { ReducedProject } from "@/features/projects/types";
import { suggestedBaseline, suggestedSteps, type BaselineHint, type StepHint } from "@/features/projects/views";
import { useLocale } from "@/i18n/client";
import { loadPlanAction } from "@/server/agent/plan";

/** The steps and the metric of a stored planning draft, as the hints take them. */
export function planHints(draft: PlanDraft | null): { steps: string[]; metric: { name: string; unit: string; better: "up" | "down" } | null } {
  return { steps: draft?.steps.map((s) => s.title) ?? [], metric: draft?.metric ? { name: draft.metric.name, unit: draft.metric.unit, better: draft.metric.better } : null };
}

/** The latest stored planning draft of the case, once the server answers; null for none, for one this viewer may not read and while it loads. */
function useStoredPlan(slug: string, caseId: string | null, on: boolean): PlanDraft | null {
  const key = on && caseId ? slug + ":" + caseId : "";
  const [answer, setAnswer] = useState<{ key: string; draft: PlanDraft | null } | null>(null);
  useEffect(() => {
    if (!key || !caseId) return;
    let gone = false;
    loadPlanAction(slug, caseId).then((data) => { if (!gone) setAnswer({ key, draft: data?.draft ?? null }); }, () => undefined);
    return () => { gone = true; };
  }, [key, slug, caseId]);
  return answer && answer.key === key ? answer.draft : null;
}

export function useProjectHints(p: ReducedProject): { stepHints: StepHint[]; baseHint: BaselineHint | null } {
  const ctx = useDemo();
  const locale = useLocale();
  const { S } = ctx;
  // The brief the yes came from: the first source that is a case. An idea gives its KPI instead.
  const source = S.cases.find((c) => p.sources.includes(c.id));
  const idea = S.ideas.find((i) => p.sources.includes(i.id));
  const planning = p.status === "planning";
  // The stored plan's steps and metric join the brief's own (server mode only); people pick, as with the brief's.
  const plan = planHints(useStoredPlan(ctx.tenant.slug, source?.id ?? null, planning && ctx.serverMode));
  const stepHints = planning && source ? withBrainSteps(suggestedSteps(source.body, p.steps, locale), plan.steps, p.steps) : [];
  const baseHint = planning
    ? suggestedBaseline(source?.body ?? "", idea?.criteria.kpi, locale) ?? (plan.metric ? { metric: plan.metric.name, unit: plan.metric.unit, better: plan.metric.better, goal: "" } : null)
    : null;
  return { stepHints, baseHint };
}
