"use client";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PersonFace } from "@/components/ui/elements";
import { undoOf, type RequestRow } from "@/features/projects/requests-view";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useSend } from "../../parts";
import { StepDialog } from "./StepDialog";
import { useText } from "./useText";
import styles from "./Inbox.module.css";

type Props = { p: ReducedProject; row: RequestRow; mayAct: boolean; onOutcome: (message: string) => void; onReopen: () => void };

export function RequestCard({ p, row, mayAct, onOutcome, onReopen }: Props) {
  const { act, f, seed } = useDemo();
  const t = useT();
  const { text } = useText();
  const send = useSend(p);
  const { request, form, answers } = row;
  const [stepping, setStepping] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [why, setWhy] = useState("");
  const name = seed.seats.find((s) => s.userId !== null && s.userId === request.byUserId)?.label ?? text("someone");
  const day = f(request.day);
  const undo = undoOf(p, request);
  const step = request.stepId === null ? undefined : p.steps.find((s) => s.id === request.stepId);

  const decline = () => {
    const reason = why.trim();
    if (!reason || !send("project.request.declined", { requestId: request.id, why: reason }, () => act.project.request.decline(p.id, request.id, reason))) return;
    setDeclining(false);
    setWhy("");
    onOutcome(text("declinedToast"));
  };

  return (
    <li className={styles.card} aria-label={t("projectRequests.ariaRequestCard", { name })}>
      <div className={styles.who}>
        <PersonFace name={name} size="sm" />
        <span className={styles.whoText}>
          <span className={styles.name}>{name}</span>
          <span className={styles.muted}>{form ? text("via", { form: form.title, date: day }) : text("viaGone", { date: day })}</span>
          {form && request.formRev !== form.rev && <span className={styles.muted}>{t("projectRequests.requestOldRevision", { rev: request.formRev })}</span>}
        </span>
        {request.state === "new" && <span className={styles.newChip}>{t("projectRequests.requestStateNew")}</span>}
      </div>
      <dl className={styles.answers}>
        {answers.map(({ field, value }) => (
          <div key={field.id}>
            <dt>{field.label}</dt>
            <dd>{field.kind === "date" && /^-?\d+$/.test(value) ? f(Number(value)) : value}</dd>
          </div>
        ))}
        {answers.length === 0 && <div><dd className={styles.muted}>{t("projectRequests.requestNoAnswer")}</dd></div>}
      </dl>
      {request.state === "declined" && request.why && <p className={styles.reason}>{t("projectRequests.requestReason", { why: request.why })}</p>}
      {request.state === "stepped" && step && <p className={styles.reason}>{text("stepOpen")}: {step.text}</p>}
      {request.state === "stepped" && undo === "stepMoved" && <p className={styles.reason}>{text("undoMoved")}</p>}
      {mayAct && (
        <div className={styles.actions}>
          {request.state === "new" && (
            <>
              <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={() => setStepping(true)}>{t("projectRequests.requestMakeStep")}</button>
              <button type="button" className={styles.quiet} aria-expanded={declining} onClick={() => setDeclining(!declining)}>{t("projectRequests.requestDecline")}</button>
            </>
          )}
          {undo === "reopen" && <button type="button" className={styles.quiet} onClick={onReopen}>{t("projectRequests.requestReopen")}</button>}
        </div>
      )}
      {declining && request.state === "new" && (
        <form className={styles.popover} onSubmit={(e) => { e.preventDefault(); decline(); }}>
          <h3>{text("declineTitle")}</h3>
          <label>
            <span>{text("declineReason", { name })}</span>
            <input className="nh-input" autoFocus maxLength={400} value={why} onChange={(e) => setWhy(e.target.value)} />
          </label>
          <span className={styles.actions}>
            <button type="button" className={styles.quiet} onClick={() => { setDeclining(false); setWhy(""); }}>{text("declineCancel")}</button>
            <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!why.trim()}>{t("projectRequests.requestDeclineConfirm")}</button>
          </span>
        </form>
      )}
      {stepping && <StepDialog p={p} row={row} name={name} onClose={() => setStepping(false)} onDone={() => { setStepping(false); onOutcome(text("steppedToast")); }} />}
    </li>
  );
}
