"use client";
// The two-row panel at the top of a case: by when the answer is due, who has it now (LOOP/D16, HD19).
import { useDemo } from "@/components/dashboard/DemoProvider";
import { useT } from "@/i18n/client";
import { answerPromise } from "@/features/cases/promise";
import { promiseText } from "@/features/cases/promise-text";
import type { ReducedCase } from "@/features/cases/reducer";
import { useCaseNames } from "./useCaseNames";
import styles from "./Panel.module.css";

export function AnswerPromise({ c }: { c: ReducedCase }) {
  const t = useT();
  const { S, seed } = useDemo();
  const n = useCaseNames();
  const p = answerPromise(c, { today: S.day, clock: seed.clock });
  const text = promiseText(p, {
    holderRole: n.roleTitle(p.holderRoleId), holderPeople: n.peopleOf(p.holderRoleId, p.holderSeatId),
    escalatedRole: p.escalatedRoleId ? n.roleTitle(p.escalatedRoleId) : null, date: n.date, today: S.day,
  }, t);
  return (
    <dl className={`${styles.panel} ${styles.rows}`}>
      <dt>{t("loopCase.answerByLabel")}</dt>
      <dd data-testid="case-answer-by" className={p.state === "late" ? styles.late : undefined}>{text.answerBy}</dd>
      <dt>{t("loopCase.withLabel")}</dt>
      <dd data-testid="case-holder">{text.with}</dd>
      {text.note && <p className={styles.hint}>{text.note}</p>}
    </dl>
  );
}
