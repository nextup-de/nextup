"use client";
// Why a no was given (plan SEE, D12, D14, D15): the category, the reason, what would make it a yes, the day it comes back, the case or
// project it duplicates, and - for the raiser - a way to start a better idea from it. The second look (NOR) follows it as it works today.
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { useRelatedCase } from "@/components/cases/useRelatedCase";
import { caseActions } from "@/features/cases/case-actions";
import { followHref } from "@/features/cases/links";
import type { ReducedCase } from "@/features/cases/reducer";
import type { NoBlock as NoBlockData } from "@/features/cases/raiser-view";
import { useT } from "@/i18n/client";
import styles from "@/components/dashboard/shared/CaseLoop.module.css";

export function NoBlock({ c, block }: { c: ReducedCase; block: NoBlockData }) {
  const { S, f, href, me, role } = useDemo();
  const t = useT();
  const related = useRelatedCase();
  const can = caseActions(c, me, role, S);
  const dup = block.duplicateOf === null ? null : related.ofCaseOrProject(block.duplicateOf);
  return (
    <section className={styles.noBlock} aria-label={t("caseSee.noTitle")} data-testid="no-block">
      <span className={styles.k}>{t("caseSee.noTitle")} · <span data-testid="no-category">{t(block.categoryLabel)}</span></span>
      {block.reason && <p className={styles.missing} data-testid="no-reason">{block.reason}</p>}
      {block.changeIf.trim() !== "" && <p className={styles.missing} data-testid="no-change-if"><span className={styles.k}>{t("caseNo.changeIfLabel")}</span>{block.changeIf}</p>}
      {block.revisitDay !== null && <p className={styles.missing} data-testid="no-revisit">{t("caseSee.revisitOn", { date: f(block.revisitDay) })}</p>}
      {dup && (
        <p className={styles.missing} data-testid="no-duplicate">
          {dup.to ? <Link href={dup.to} className={styles.bannerLink}>{t("caseSee.duplicateOfLink", { title: dup.title ?? "" })}</Link> : t("caseSee.duplicateOfLink", { title: t("loopCase.aCase") })}
        </p>
      )}
      {block.decidedWhileAsked && <span className={styles.small} data-testid="no-before-answer">{t("caseSee.decidedBeforeAnswer")}</span>}
      {can.betterIdea && (
        <div className={styles.actions}>
          <Link href={href(followHref(c.id))} className={styles.soft} data-testid="start-better">{t("caseSee.startBetter")}</Link>
        </div>
      )}
    </section>
  );
}
