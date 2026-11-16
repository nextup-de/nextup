"use client";
// The approver's answer to the current step (plan GAT, D21 to D23; decisions A to D), as "Your move" (DESIGN_RULES §9): Approve is the filled
// button, "Do not approve" the quiet one, approve with conditions and send back sit under More; the words a choice needs open under the buttons.
// Present is asked for a council. The answer names the run, the step and the revision the page showed (D22): a form opened before a send-back is
// refused by the server. Keyed by the step and its revision, so it starts empty again when either changes, and it sends once: the moves are off
// while the answer is on its way. Answering needs the server (answerApprovalAction, D8), so the demo without one never draws it.
import { useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { YourMove, type Move } from "@/components/inbox/YourMove";
import { BACK_REASON_MIN, CONDITIONS_MAX, PRESENT_MAX } from "@/features/approvals/types";
import { answerApprovalAction, type ApprovalAnswerInput } from "@/server/actions/approvals";
import { noCategoryLabel, noCategorySub, type NoCategory } from "@/features/cases/no";
import type { ReducedCase } from "@/features/cases/reducer";
import { dayOfDate, noSheet } from "@/features/cases/sheets";
import { useT } from "@/i18n/client";
import styles from "@/components/inbox/YourMove.module.css";

type Mode = "conditions" | "back" | "refuse" | null;

export function ApproverMove({ c, mine, council }: { c: ReducedCase; mine: { runId: string; stepId: string; dueRev: number; parallel: boolean }; council: boolean }) {
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
  // A parallel run's no returns the idea to its raiser (decision B): a reason is all it needs, and there is no send-back.
  const returns = mine.parallel;
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
    : mode === "refuse" ? (returns ? trimmed.length >= BACK_REASON_MIN : no.ok) : false;
  const confirm = () => {
    if (mode === "conditions") void send("conditions", { conditions: trimmed });
    else if (mode === "back") void send("back", { reason: trimmed });
    else if (mode === "refuse" && returns) void send("no", { reason: trimmed });
    else if (mode === "refuse") {
      const payload = no.payload();
      if (payload && payload.category !== undefined) void send("no", { reason: payload.reason, category: payload.category as ApprovalAnswerInput["category"], ...(payload.changeIf ? { changeIf: payload.changeIf } : {}), ...(payload.revisitDay !== undefined ? { revisitDay: payload.revisitDay } : {}) });
    }
  };
  const tomorrow = new Date(today.getTime() + 864e5).toISOString().slice(0, 10);
  const pick = (m: Mode) => { setMode(m); setText(""); };

  const approve: Move = { key: "approve", label: t("approvals.approve"), testId: "approval-approve", disabled: sent || !presentOk, onSelect: () => void send("yes") };
  const refuse: Move = { key: "decline", label: t("approvals.refuse"), testId: "approval-refuse", disabled: sent, onSelect: () => pick("refuse") };
  const more: Move[] = [
    { key: "conditions", label: t("approvals.approveConditions"), testId: "approval-conditions", disabled: sent, onSelect: () => pick("conditions") },
    ...(returns ? [] : [{ key: "back", label: t("approvals.sendBack"), testId: "approval-back", disabled: sent, onSelect: () => pick("back") }]),
  ];

  return (
    <YourMove moves={{ primary: mode === null ? approve : null, quiet: mode === null ? [refuse] : [], more: mode === null ? more : [] }} name="approval">
      {(council || error !== null || mode !== null) && <div className={styles.form} role="group" aria-label={t("approvals.approve")} data-testid="approval-form">
        {council && (
          <>
            <label className={styles.formLabel} htmlFor={`present-${mine.stepId}`}>{t("approvals.present")}</label>
            <input id={`present-${mine.stepId}`} className={styles.field} type="number" inputMode="numeric" min={0} max={PRESENT_MAX} value={present} onChange={(e) => setPresent(e.target.value)} data-testid="approval-present" />
          </>
        )}
        {error !== null && <p className={styles.error} role="alert" data-testid="approval-error">{error}</p>}
        {mode !== null && (
          <>
            {mode === "refuse" && !returns && (
              <div className={styles.options} role="group" aria-label={t("shell.noEyebrow")}>
                {no.categories.filter((x) => !x.hidden && x.id !== "duplicate").map((x) => (
                  <button key={x.id} type="button" className={styles.option} aria-pressed={category === x.id} title={t(noCategorySub(x.id))} onClick={() => { setCategory(x.id); if (x.date === "none") setDate(""); }}>{t(noCategoryLabel(x.id))}</button>
                ))}
              </div>
            )}
            <label className={styles.formLabel} htmlFor={`approval-text-${mine.stepId}`}>
              {mode === "conditions" ? t("approvals.conditions") : mode === "back" ? t("approvals.sendBack") : returns ? t("approvals.refuseReason", { from: c.from }) : t("shell.noReasonLabel", { from: c.from })}
            </label>
            <textarea id={`approval-text-${mine.stepId}`} className={styles.field} rows={3} value={text} onChange={(e) => setText(e.target.value)} data-testid="approval-text" autoFocus />
            {mode === "refuse" && !returns && (
              <>
                <label className={styles.formLabel} htmlFor={`approval-if-${mine.stepId}`}>{t("shell.noChangeIfLabel")}</label>
                <textarea id={`approval-if-${mine.stepId}`} className={styles.field} rows={2} value={changeIf} onChange={(e) => setChangeIf(e.target.value)} />
                {no.picked && no.picked.date !== "none" && (
                  <>
                    <label className={styles.formLabel} htmlFor={`approval-date-${mine.stepId}`}>{t(no.picked.date === "required" ? "shell.noRevisitRequired" : "shell.noRevisitOptional")}</label>
                    <input id={`approval-date-${mine.stepId}`} className={styles.field} type="date" min={tomorrow} value={date} onChange={(e) => setDate(e.target.value)} />
                    {day !== null && !Number.isNaN(day) ? <p className={styles.note}>{t("shell.noRevisitHint", { date: f(day) })}</p> : date !== "" ? <p className={styles.error}>{t("shell.noRevisitBad")}</p> : null}
                  </>
                )}
              </>
            )}
            <div className={styles.formRow}>
              <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" disabled={sent || !ready || !presentOk} data-testid="approval-send" onClick={confirm}>
                {mode === "conditions" ? t("approvals.approveConditions") : mode === "back" ? t("approvals.sendBack") : t("approvals.refuse")}
              </button>
              <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => setMode(null)}>{t("common.cancel")}</button>
            </div>
          </>
        )}
      </div>}
    </YourMove>
  );
}
