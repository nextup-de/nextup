"use client";
// The decision log while the dev panel's Demo data switch is on: lines built from this tab's sample data.
// With the switch off it shows what the server rendered.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { canOpen } from "@/components/dashboard/derive";
import { sampleDecisionLines } from "@/features/demo/sample-decisions";
import { useT } from "@/i18n/client";
import { DecisionLog, type DecisionFilters } from "./DecisionLog";

type Props = { company: string; page: number; pageSize: number; filters: DecisionFilters; projectsOn: boolean; children: React.ReactNode };

export function SampleDecisions({ company, page, pageSize, filters, projectsOn, children }: Props) {
  const ctx = useDemo();
  const t = useT();
  if (!ctx.sampleData) return <>{children}</>;
  const all = sampleDecisionLines(ctx.D.cases.filter((c) => canOpen(ctx, c)), ctx.S, ctx.seed.roles ?? [], filters, ctx.f);
  const lines = all.slice((page - 1) * pageSize, page * pageSize);
  const filtered = filters.period !== "all" || filters.answer !== "" || filters.project !== "" || filters.q !== "";
  return <DecisionLog t={t} company={company} page={page} pageSize={pageSize} filters={filters} projectsOn={projectsOn} lines={lines} total={all.length} filtered={filtered} />;
}
