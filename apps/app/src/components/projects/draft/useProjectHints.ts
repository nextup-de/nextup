"use client";
// The first steps and the metric a planned project offers (P7.5:s2): the brief's own lines with the AI off, the brain's
// plan through the existing AI gate when it is on. Nothing here calls a model itself; people pick, nobody is told.
// Shared by the planning board and the draft page, so both read the same hints.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { withBrainSteps } from "@/features/projects/brain";
import type { ReducedProject } from "@/features/projects/types";
import { suggestedBaseline, suggestedSteps, type BaselineHint, type StepHint } from "@/features/projects/views";
import { useLocale } from "@/i18n/client";
import { useBrainPlan } from "@/lib/use-brain";

export function useProjectHints(p: ReducedProject): { stepHints: StepHint[]; baseHint: BaselineHint | null } {
  const ctx = useDemo();
  const locale = useLocale();
  const { S } = ctx;
  // The brief the yes came from: the first source that is a case. An idea gives its KPI instead.
  const source = S.cases.find((c) => p.sources.includes(c.id));
  const idea = S.ideas.find((i) => p.sources.includes(i.id));
  const planning = p.status === "planning";
  // The brain's steps and metric join the brief's own (server mode only); people pick, as with the brief's.
  const brain = useBrainPlan(ctx.tenant.slug, source?.id ?? null, planning && ctx.serverMode);
  const stepHints = planning && source ? withBrainSteps(suggestedSteps(source.body, p.steps, locale), brain?.steps ?? [], p.steps) : [];
  const baseHint = planning
    ? suggestedBaseline(source?.body ?? "", idea?.criteria.kpi, locale) ?? (brain?.metric ? { metric: brain.metric.name, unit: brain.metric.unit, better: brain.metric.better, goal: "" } : null)
    : null;
  return { stepHints, baseHint };
}
