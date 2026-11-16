"use client";
// The approver line on the idea page (decisions A to D, Kevin and Sam, 16 Nov 2026): once the first decider said yes, each named approver with what they
// said (approved, waiting, no) and "n of m approved". When one no returned the idea, its reason, and for the raiser the button that sends it again, which
// asks every approver afresh. Old sequential runs stay in ApprovalsBlock. The facts come from features/approvals/status.ts; this only renders them.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { mayResendApproval } from "@/features/approvals/rights";
import { approvalLine, ideaApprovalStatus, type ApproverAnswer } from "@/features/approvals/status";
import type { ReducedCase } from "@/features/cases/reducer";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import dash from "@/components/dashboard/shared/CaseDetailView.module.css";
import styles from "./ApproverLine.module.css";

const ANSWER_KEY: Record<ApproverAnswer, MessageKey> = { approved: "approvals.stepYes", pending: "approvals.stepPending", no: "approvals.stepNo" };

export function ApproverLine({ c }: { c: ReducedCase }) {
  const { S, me, act, showToast } = useDemo();
  const t = useT();
  const [sent, setSent] = useState(false);
  const status = ideaApprovalStatus(c, S);
  if (!status.parallel || status.total === 0) return null;
  const line = approvalLine(status, t);
  const mayResend = !sent && mayResendApproval({ userId: me.userId }, c);
  const resend = () => {
    setSent(true); // one resend per click: the run that follows replaces this view
    act.provisional(c.id, { resend: true });
    showToast(t("approvals.resent"));
  };

  return (
    <section className={styles.line} aria-label={t("approvals.approvers")} data-testid="approver-line" data-state={status.state}>
      <div className={styles.head}>
        <span className={styles.title}>{t("approvals.approvers")}</span>
        {line !== "" && <span className={styles.count} data-testid="approver-count">{line}</span>}
      </div>
      <ul className={styles.people}>
        {status.approvers.map((a) => (
          <li key={a.stepId} className={styles.person} data-testid="approver" data-answer={a.answer}>
            <span className={styles.name}>{a.name || t("approvals.approvers")}</span>
            <span className={styles.state} data-answer={a.answer}>{t(ANSWER_KEY[a.answer])}</span>
          </li>
        ))}
      </ul>
      {status.state === "approved" && <p className={styles.note}>{t("approvals.approversDecided")}</p>}
      {status.returned !== null && (
        <>
          <p className={styles.reason} data-testid="approver-returned">{t("approvals.returnedLine", { name: status.returned.by, reason: status.returned.reason })}</p>
          {mayResend ? (
            <>
              <p className={styles.note}>{t("approvals.returnedHint")}</p>
              <div className={styles.row}>
                <button type="button" className={dash.primary} data-testid="approver-resend" onClick={resend}>{t("approvals.resend")}</button>
              </div>
            </>
          ) : !sent && <p className={styles.note}>{t("approvals.returnedWait", { name: c.from })}</p>}
        </>
      )}
    </section>
  );
}
