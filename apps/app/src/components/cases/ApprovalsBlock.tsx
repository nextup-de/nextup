"use client";
// The approvals of a case on its page (plan GAT, D21 to D23, D33): every run with its steps in order, what each step said (conditions, the reason of a
// send-back or a no, how many were present at a council) and the day it is due. A step never shows who answered and a council never how it voted
// (D3). The answer to the current step is "Your move" on the idea's page (ApproverMove), not here.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { caseApprovalView, type RunView, type StepView } from "@/features/approvals/case-view";
import type { ReducedCase } from "@/features/cases/reducer";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import styles from "./Panel.module.css";

const STEP_KEY = { budget: "approvals.stepBudget", council: "approvals.stepCouncil", role: "approvals.stepRole", person: "approvals.stepRole" } as const;
const STATE_KEY: Record<StepView["state"], MessageKey> = { pending: "approvals.stepPending", yes: "approvals.stepYes", conditions: "approvals.stepConditions", no: "approvals.stepNo" };

export function ApprovalsBlock({ c }: { c: ReducedCase }) {
  const { S, me, f } = useDemo();
  const t = useT();
  const view = caseApprovalView(c, S, me);
  if (view.runs.length === 0) return null;
  const [latest, ...past] = view.runs;

  const stepLine = (run: RunView, step: StepView) => {
    const last = step.answers.at(-1);
    const state = step.state === "pending" && last?.answer === "back" ? t("approvals.stepBack") : t(STATE_KEY[step.state]);
    const name = t(STEP_KEY[step.kind], step.kind === "council" ? { name: step.label || "—" } : { role: step.label || "—" });
    const due = step.state !== "pending" || step.dueDay === null || !run.active ? null
      : step.kind === "council" ? t("approvals.nextMeeting", { date: f(step.dueDay) }) : t("approvals.stepDue", { date: f(step.dueDay) });
    return (
      <li key={step.id} className={styles.step} data-testid="approval-step" data-state={step.state}>
        <div className={styles.stepHead}>
          <span>{name}</span>
          <span className={styles.stepState} data-state={step.state}>{state}</span>
        </div>
        {due && <p className={styles.stepNote}>{due}</p>}
        {step.handed && <p className={styles.stepNote}>{t("approvals.stepHanded", { role: step.handedRole ?? step.seatLabel ?? "" })}</p>}
        {step.answers.map((a, i) => (
          <p key={i} className={styles.stepNote}>
            {a.conditions ? `${t("approvals.conditions")}: ${a.conditions}` : a.reason}
            {a.present !== null ? ` · ${t("approvals.present")}: ${a.present}` : ""}
          </p>
        ))}
      </li>
    );
  };
  const runList = (run: RunView) => (
    <ol className={styles.steps} aria-label={t("approvals.title")} data-testid="approval-run" data-run={run.runId} data-active={run.active ? "true" : undefined}
      data-opening={run.opening ? "true" : undefined} data-supplement={run.supplement ? "true" : undefined}>
      {run.steps.map((step) => stepLine(run, step))}
    </ol>
  );

  // A parallel run is shown by the approver line (ApproverLine, decisions A to D); this block keeps the older runs.
  if (latest.parallel && past.every((run) => run.parallel)) return null;
  return (
    <section className={styles.block} aria-label={t("approvals.title")} data-testid="case-approvals">
      <span className={styles.blockTitle}>{t("approvals.title")}</span>
      {!latest.parallel && runList(latest)}
      {!latest.parallel && latest.outcome !== null && <p className={styles.stepNote}>{t(latest.outcome === "yes" ? "approvals.stepYes" : "approvals.stepNo")}</p>}
      {past.filter((run) => !run.parallel).length > 0 && (
        <details className={styles.past}>
          <summary>{t("approvals.title")} ({past.filter((run) => !run.parallel).length})</summary>
          <div className={styles.runs}>
            {past.filter((run) => !run.parallel).map((run) => <div key={run.runId}>{runList(run)}<p className={styles.stepNote}>{run.outcome === null ? "" : t(run.outcome === "yes" ? "approvals.stepYes" : "approvals.stepNo")}</p></div>)}
          </div>
        </details>
      )}
    </section>
  );
}
