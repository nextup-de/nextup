"use client";
// The approvals of a project draft (plan GAT, D21, D23, D33): every run of the case that opened it - the active one first, then the finished ones - with its
// steps: who approves, by when, and what they answered. A step that went late shows the seat it was handed to. Nothing here is a right or a rule; it reads the
// case's runs (features/approvals/steps.ts runsOf), and words come from the catalog. Roles and councils are named, never people (D3).
import { useDemo } from "@/components/dashboard/DemoProvider";
import { runsOf, stepLabel } from "@/features/approvals/steps";
import type { ApprovalStep } from "@/features/approvals/types";
import type { ReducedCase } from "@/features/cases/reducer";
import { useT } from "@/i18n/client";
import styles from "./ApprovalSteps.module.css";

export function ApprovalSteps({ kase }: { kase: Pick<ReducedCase, "approvals" | "approvalRuns" | "openingRunId"> }) {
  const { S, f } = useDemo();
  const t = useT();
  const runs = runsOf(kase);
  if (runs.length === 0) return null;
  const roleTitle = (id: string | null | undefined) => S.approvals.roles.find((r) => r.id === id)?.title ?? "";
  const label = (s: ApprovalStep): string => {
    const { kind, name } = stepLabel(s, S.approvals, S.approvals.roles);
    return t(kind === "budget" ? "approvals.stepBudget" : kind === "council" ? "approvals.stepCouncil" : "approvals.stepRole", kind === "council" ? { name } : { role: name });
  };
  const state = (s: ApprovalStep): string => t(s.state === "yes" ? "approvals.stepYes" : s.state === "conditions" ? "approvals.stepConditions" : s.state === "no" ? "approvals.stepNo" : "approvals.stepPending");
  return (
    <div className={styles.runs} data-testid="approval-runs">
      {runs.map(({ run, active }) => (
        <div key={run.runId} className={styles.run} data-run={run.runId} data-active={active ? "true" : undefined}>
          {runs.length > 1 && <p className={styles.runHead}>{run.supplement ? t("approvals.askMissingApproval") : t("approvals.waitsForApproval")}{run.done && run.outcome === "no" ? " · " + t("approvals.stepNo") : ""}</p>}
          <ol className={styles.steps}>
            {run.steps.map((s) => {
              const handed = s.state === "pending" && s.seatId !== null ? roleTitle(S.seats.find((x) => x.id === s.seatId)?.roleId) : "";
              return (
                <li key={s.id} className={styles.step} data-state={s.state} data-testid="approval-step">
                  <span className={styles.stepLabel}>{label(s)}</span>
                  <span className={styles.stepState}>{state(s)}</span>
                  <span className={styles.stepMeta}>
                    {s.dueDay !== null && t(s.kind === "council" && s.state === "pending" ? "approvals.nextMeeting" : "approvals.stepDue", { date: f(s.dueDay) })}
                    {handed && ` · ${t("approvals.stepHanded", { role: handed })}`}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
