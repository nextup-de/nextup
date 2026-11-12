"use client";
// The second look of a no on the case page (plan NOR, D18, D27): the raiser asks for it once, inside the days the company gives,
// and the desk that may answer it keeps the no or reopens the case, with a reason. Once asked, the page says when, and what was
// answered. The smallest UI that reaches the events; SEE replaces the presentation later.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { caseActions } from "@/features/cases/case-actions";
import { APPEAL_TEXT_MAX, APPEAL_TEXT_MIN } from "@/features/cases/no";
import type { ReducedCase } from "@/features/cases/reducer";
import { useT } from "@/i18n/client";
import styles from "@/components/dashboard/shared/CaseLoop.module.css";

export function SecondLook({ c }: { c: ReducedCase }) {
  const { S, f, me, role, act } = useDemo();
  const t = useT();
  const can = caseActions(c, me, role, S);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const [answering, setAnswering] = useState(false);
  const [uphold, setUphold] = useState(true);
  const [reason, setReason] = useState("");
  const a = c.appeal;
  const textOk = text.trim().length >= APPEAL_TEXT_MIN && text.length <= APPEAL_TEXT_MAX;
  const reasonOk = reason.trim().length >= S.rules.noReasonMin;
  if (!a && !can.appeal) return null;

  return (
    <section aria-label={t("caseNo.secondLook")} data-testid="second-look">
      {a && (
        <p className={styles.missing} data-testid="second-look-asked">
          <span className={styles.k}>{t("caseNo.secondLook")}</span>
          {t("loopCase.secondLookAsked", { date: f(a.day) })}{a.text ? " — " + a.text : ""}
        </p>
      )}
      {a?.decided && (
        <p className={styles.missing} data-testid="second-look-answer">
          {t(a.decided.uphold ? "loopCase.secondLookKept" : "loopCase.secondLookReopened", { reason: a.decided.reason })} {t("loopCase.secondLookAnsweredOn", { date: f(a.decided.day) })}
        </p>
      )}
      {can.appeal && !asking && (
        <div className={styles.actions}>
          <button type="button" className={styles.soft} data-testid="second-look-ask" onClick={() => setAsking(true)}>
            {t("loopCase.secondLookUntil", { action: t("loopCase.secondLookAsk"), date: f(can.appeal.until) })}
          </button>
        </div>
      )}
      {can.appeal && asking && (
        <form onSubmit={(e) => { e.preventDefault(); if (!textOk) return; act.appeal(c.id, text.trim()); setAsking(false); setText(""); }}>
          <label htmlFor={"appeal-text-" + c.id} className={styles.k}>{t("loopCase.secondLookText")}</label>
          <textarea id={"appeal-text-" + c.id} className={`${styles.field} ${styles.area}`} value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={APPEAL_TEXT_MAX} autoFocus />
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={!textOk}>{t("loopCase.secondLookSend")}</button>
            <button type="button" className={styles.soft} onClick={() => setAsking(false)}>{t("common.cancel")}</button>
          </div>
        </form>
      )}
      {can.answerAppeal && !answering && (
        <div className={styles.actions}>
          <button type="button" className={styles.primary} data-testid="second-look-answer-open" onClick={() => setAnswering(true)}>{t("loopCase.secondLookAnswer")}</button>
        </div>
      )}
      {can.answerAppeal && answering && (
        <form onSubmit={(e) => { e.preventDefault(); if (!reasonOk) return; act.answerAppeal(c.id, uphold, reason.trim()); setAnswering(false); setReason(""); }}>
          <fieldset className={styles.missing}>
            <label><input type="radio" name={"uphold-" + c.id} checked={uphold} onChange={() => setUphold(true)} /> {t("loopCase.secondLookKeep")}</label>{" "}
            <label><input type="radio" name={"uphold-" + c.id} checked={!uphold} onChange={() => setUphold(false)} /> {t("loopCase.secondLookReopen")}</label>
          </fieldset>
          <label htmlFor={"appeal-reason-" + c.id} className={styles.k}>{t("loopCase.secondLookReason", { n: S.rules.noReasonMin })}</label>
          <textarea id={"appeal-reason-" + c.id} className={`${styles.field} ${styles.area}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} autoFocus />
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={!reasonOk}>{t("loopCase.secondLookSendAnswer")}</button>
            <button type="button" className={styles.soft} onClick={() => setAnswering(false)}>{t("common.cancel")}</button>
          </div>
        </form>
      )}
    </section>
  );
}
