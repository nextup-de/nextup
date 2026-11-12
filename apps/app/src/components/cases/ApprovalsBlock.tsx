"use client";
// The approvals of a case on its page (plan GAT, D21 to D23, D33): every run with its steps in order, what each step said (conditions, the reason of a
// send-back or a no, how many were present at a council), the day it is due and, for the one who holds the current step, the form to answer it. A step
// never shows who answered and a council never how it voted (D3). In the demo the block is read-only (D8): the answer is written by the settle
// operation on the server (answerApprovalAction), so the form needs a server behind the page.
import { useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { caseApprovalView, type RunView, type StepView } from "@/features/approvals/case-view";
import { BACK_REASON_MIN, CONDITIONS_MAX, PRESENT_MAX } from "@/features/approvals/types";
import { answerApprovalAction, type ApprovalAnswerInput } from "@/server/actions/approvals";
import { noCategoryLabel, noCategorySub, type NoCategory } from "@/features/cases/no";
import type { ReducedCase } from "@/features/cases/reducer";
import { dayOfDate, noSheet } from "@/features/cases/sheets";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import dash from "@/components/dashboard/shared/CaseDetailView.module.css";
import styles from "./Panel.module.css";

const STEP_KEY = { budget: "approvals.stepBudget", council: "approvals.stepCouncil", role: "approvals.stepRole" } as const;
const STATE_KEY: Record<StepView["state"], MessageKey> = { pending: "approvals.stepPending", yes: "approvals.stepYes", conditions: "approvals.stepConditions", no: "approvals.stepNo" };

export function ApprovalsBlock({ c }: { c: ReducedCase }) {
  const { S, me, f, serverMode } = useDemo();
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

  return (
    <section className={styles.block} aria-label={t("approvals.title")} data-testid="case-approvals">
      <span className={styles.blockTitle}>{t("approvals.title")}</span>
      {runList(latest)}
      {latest.outcome !== null && <p className={styles.stepNote}>{t(latest.outcome === "yes" ? "approvals.stepYes" : "approvals.stepNo")}</p>}
      {serverMode && view.myStep && <ApproverForm key={`${view.myStep.stepId}@${view.myStep.dueRev}`} c={c} mine={view.myStep} council={latest.steps.find((x) => x.id === view.myStep?.stepId)?.kind === "council"} />}
      {past.length > 0 && (
        <details className={styles.past}>
          <summary>{t("approvals.title")} ({past.length})</summary>
          <div className={styles.runs}>
            {past.map((run) => <div key={run.runId}>{runList(run)}<p className={styles.stepNote}>{run.outcome === null ? "" : t(run.outcome === "yes" ? "approvals.stepYes" : "approvals.stepNo")}</p></div>)}
          </div>
        </details>
      )}
    </section>
  );
}

type Mode = "conditions" | "back" | "refuse" | null;

/**
 * The approver's answer to the current step: Approve, Approve with conditions, Send back with a reason, Do not approve with NOR's no fields; Present for
 * a council. The answer names the run, the step and the revision the page showed (D22): a form opened before a send-back is refused by the server. It is
 * keyed by the step and its revision, so it starts empty again when either changes, and it sends once: the button is off while the answer is on its way.
 */
function ApproverForm({ c, mine, council }: { c: ReducedCase; mine: { runId: string; stepId: string; dueRev: number }; council: boolean }) {
  const { S, showToast, f, tenant } = useDemo();
  const t = useT();
  // One id for this form's submit: a double click and a retry after a lost answer are one answer, the second one read back by the server (D32).
  const requestId = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState("");
  const [present, setPresent] = useState("");
  const [category, setCategory] = useState<NoCategory | null>(null);
  const [changeIf, setChangeIf] = useState("");
  const [date, setDate] = useState("");
  const [sent, setSent] = useState(false);
  const [today] = useState(() => new Date());

  const seen = present.trim() === "" ? null : Number(present);
  const presentOk = !council || seen === null || (Number.isInteger(seen) && seen >= 0 && seen <= PRESENT_MAX);
  const day = date === "" ? null : dayOfDate(date, S.clock, today, S.day) ?? Number.NaN;
  const no = noSheet(c, S.rules, S.day, { category, reason: text, changeIf, revisitDay: day }, []);
  const send = async (answer: ApprovalAnswerInput["approvalAnswer"], fields: Partial<ApprovalAnswerInput> = {}) => {
    if (sent || !presentOk) return;
    setSent(true); // one answer per form: a second click is not a second answer
    setError(null);
    requestId.current ??= crypto.randomUUID();
    try {
      const done = await answerApprovalAction(tenant.slug, c.id, {
        runId: mine.runId, stepId: mine.stepId, dueRev: mine.dueRev, approvalAnswer: answer, requestId: requestId.current,
        ...(council && seen !== null ? { present: seen } : {}), ...fields,
      });
      if (done.ok) showToast(t(answer === "no" ? "approvals.refuse" : answer === "back" ? "approvals.sendBack" : answer === "conditions" ? "approvals.approveConditions" : "approvals.approve"));
      else { setError(done.error); setSent(false); }
    } catch {
      setError(t("floor.offline")); // the answer may or may not have arrived: the same request id asks the server to settle it once
      setSent(false);
    }
  };
  const trimmed = text.trim();
  const ready = mode === "conditions" ? trimmed.length >= 1 && trimmed.length <= CONDITIONS_MAX
    : mode === "back" ? trimmed.length >= BACK_REASON_MIN
    : mode === "refuse" ? no.ok : false;
  const confirm = () => {
    if (mode === "conditions") void send("conditions", { conditions: trimmed });
    else if (mode === "back") void send("back", { reason: trimmed });
    else if (mode === "refuse") {
      const payload = no.payload();
      if (payload && payload.category !== undefined) void send("no", { reason: payload.reason, category: payload.category as ApprovalAnswerInput["category"], ...(payload.changeIf ? { changeIf: payload.changeIf } : {}), ...(payload.revisitDay !== undefined ? { revisitDay: payload.revisitDay } : {}) });
    }
  };
  const tomorrow = new Date(today.getTime() + 864e5).toISOString().slice(0, 10);

  return (
    <div className={styles.form} role="group" aria-label={t("approvals.approve")} data-testid="approval-form">
      {council && (
        <>
          <label className={styles.formLabel} htmlFor={`present-${mine.stepId}`}>{t("approvals.present")}</label>
          <input id={`present-${mine.stepId}`} className={styles.field} type="number" inputMode="numeric" min={0} max={PRESENT_MAX} value={present} onChange={(e) => setPresent(e.target.value)} data-testid="approval-present" />
        </>
      )}
      <div className={styles.row}>
        <button type="button" className={dash.primary} disabled={sent || !presentOk} data-testid="approval-approve" onClick={() => void send("yes")}>{t("approvals.approve")}</button>
        <button type="button" className={dash.soft} disabled={sent} aria-pressed={mode === "conditions"} data-testid="approval-conditions" onClick={() => { setMode("conditions"); setText(""); }}>{t("approvals.approveConditions")}</button>
        <button type="button" className={dash.soft} disabled={sent} aria-pressed={mode === "back"} data-testid="approval-back" onClick={() => { setMode("back"); setText(""); }}>{t("approvals.sendBack")}</button>
        <button type="button" className={dash.soft} disabled={sent} aria-pressed={mode === "refuse"} data-testid="approval-refuse" onClick={() => { setMode("refuse"); setText(""); }}>{t("approvals.refuse")}</button>
      </div>
      {error !== null && <p className={styles.flag} role="alert" data-testid="approval-error">{error}</p>}
      {mode !== null && (
        <>
          {mode === "refuse" && (
            <div className={styles.options} role="group" aria-label={t("shell.noEyebrow")}>
              {no.categories.filter((x) => !x.hidden && x.id !== "duplicate").map((x) => (
                <button key={x.id} type="button" className={dash.soft} aria-pressed={category === x.id} title={t(noCategorySub(x.id))} onClick={() => { setCategory(x.id); if (x.date === "none") setDate(""); }}>{t(noCategoryLabel(x.id))}</button>
              ))}
            </div>
          )}
          <label className={styles.formLabel} htmlFor={`approval-text-${mine.stepId}`}>
            {mode === "conditions" ? t("approvals.conditions") : mode === "back" ? t("approvals.sendBack") : t("shell.noReasonLabel", { from: c.from })}
          </label>
          <textarea id={`approval-text-${mine.stepId}`} className={styles.area} rows={3} value={text} onChange={(e) => setText(e.target.value)} data-testid="approval-text" />
          {mode === "refuse" && (
            <>
              <label className={styles.formLabel} htmlFor={`approval-if-${mine.stepId}`}>{t("shell.noChangeIfLabel")}</label>
              <textarea id={`approval-if-${mine.stepId}`} className={styles.area} rows={2} value={changeIf} onChange={(e) => setChangeIf(e.target.value)} />
              {no.picked && no.picked.date !== "none" && (
                <>
                  <label className={styles.formLabel} htmlFor={`approval-date-${mine.stepId}`}>{t(no.picked.date === "required" ? "shell.noRevisitRequired" : "shell.noRevisitOptional")}</label>
                  <input id={`approval-date-${mine.stepId}`} className={styles.field} type="date" min={tomorrow} value={date} onChange={(e) => setDate(e.target.value)} />
                  <p className={styles.stepNote}>{day !== null && !Number.isNaN(day) ? t("shell.noRevisitHint", { date: f(day) }) : date !== "" ? t("shell.noRevisitBad") : ""}</p>
                </>
              )}
            </>
          )}
          <div className={styles.row}>
            <button type="button" className={dash.primary} disabled={sent || !ready || !presentOk} data-testid="approval-send" onClick={confirm}>
              {mode === "conditions" ? t("approvals.approveConditions") : mode === "back" ? t("approvals.sendBack") : t("approvals.refuse")}
            </button>
            <button type="button" className={dash.soft} onClick={() => setMode(null)}>{t("common.cancel")}</button>
          </div>
        </>
      )}
    </div>
  );
}
