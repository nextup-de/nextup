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
  // A role that owns no route (the review role, an approver) is named from the company's roles (GAT).
  const roleTitle = (roleId: string | null) => n.roleTitle(roleId) || (roleId === null ? "" : S.approvals.roles.find((r) => r.id === roleId)?.title ?? "");
  const text = promiseText(p, {
    holderRole: roleTitle(p.holderRoleId), holderPeople: n.peopleOf(p.holderRoleId, p.holderSeatId),
    escalatedRole: p.escalatedRoleId ? roleTitle(p.escalatedRoleId) : null, date: n.date, today: S.day,
  }, t);
  return (
    <dl className={`${styles.panel} ${styles.rows}`}>
      <dt>{t("loopCase.answerByLabel")}</dt>
      <dd data-testid="case-answer-by" className={p.state === "late" && p.stage === undefined ? styles.late : undefined}>{text.answerBy}</dd>
      <dt>{t("loopCase.withLabel")}</dt>
      <dd data-testid="case-holder">{text.with}</dd>
      {text.note && <p className={styles.hint}>{text.note}</p>}
    </dl>
  );
}
