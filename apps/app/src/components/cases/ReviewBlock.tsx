"use client";
// The review of a raise on the case page (plan GAT, D12 to D15): who has it and by when; for the reviewer Forward with the route to pick, Back to the
// author, No, and Merge and Link from the relations above; for the desk a line when the clock forwarded it unreviewed. The reviewer never sees a Yes:
// the review forwards, the desk says yes (D13). Nothing here is the viewer's own idea: caseActions hides it all from the raiser.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { caseApprovalView } from "@/features/approvals/case-view";
import { caseActions } from "@/features/cases/case-actions";
import type { ReducedCase } from "@/features/cases/reducer";
import { useT } from "@/i18n/client";
import dash from "@/components/dashboard/shared/CaseDetailView.module.css";
import styles from "./Panel.module.css";

export function ReviewBlock({ c }: { c: ReducedCase }) {
  const { S, me, role, act, showToast, openSheet, f } = useDemo();
  const t = useT();
  const can = caseActions(c, me, role, S);
  const view = caseApprovalView(c, S, me);
  const [to, setTo] = useState("");
  const review = view.review;
  if (review === null) return null;
  const routes = can.forward ?? [];
  const chosen = routes.some((r) => r.id === to) ? to : routes[0]?.id ?? "";
  if (!review.pending) {
    // The clock forwarded it because nobody reviewed it in time: the desk is told, once and plainly (D14).
    if (!review.auto || c.review === null) return null;
    return (
      <section className={styles.block} aria-label={t("approvals.title")} data-testid="review-auto">
        <p className={styles.blockText}>{t("approvals.reviewAuto", { days: Math.max(1, c.review.dueDay - c.review.since) })}</p>
      </section>
    );
  }
  if (can.forward === null) return null; // the raiser and everyone else read it in the answer promise
  const role_ = S.approvals.roles.find((r) => r.id === S.seats.find((s) => s.id === c.review?.seatId)?.roleId)?.title ?? review.seatLabel ?? "";
  return (
    <section className={styles.block} aria-label={t("approvals.reviewStage", { role: role_ })} data-testid="review-block">
      <span className={styles.blockTitle}>{t("approvals.reviewStage", { role: role_ })} · {t("approvals.stepDue", { date: f(review.dueDay) })}</span>
      <p className={styles.blockText}>{t("approvals.reviewNoYes")}</p>
      <div className={styles.row} role="group" aria-label={t("approvals.forwardTo")}>
        <select className={styles.field} value={chosen} onChange={(e) => setTo(e.target.value)} aria-label={t("approvals.forwardTo")} data-testid="review-route">
          {routes.map((r) => <option key={r.id} value={r.id}>{r.type} · {r.owner}</option>)}
        </select>
        <button type="button" className={dash.primary} disabled={chosen === ""} data-testid="review-forward"
          onClick={() => { act.review(c.id, chosen); showToast(t("approvals.forward")); }}>
          {t("approvals.forward")}
        </button>
      </div>
      <div className={styles.row}>
        {can.back && <button type="button" className={dash.soft} data-testid="review-back" onClick={() => openSheet("ask", c.id)}>{t("approvals.back")}</button>}
        {can.no && <button type="button" className={dash.soft} data-testid="review-no" onClick={() => openSheet("no", c.id)}>{t("brief.actionNo")}</button>}
      </div>
      {can.back && <p className={styles.stepNote}>{t("approvals.backHint")}</p>}
    </section>
  );
}
