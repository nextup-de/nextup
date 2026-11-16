"use client";
// The Archive (Paper "Jira pages · new header", frame "NextUp · Work · Archive (Jira Archived)"): the steps taken off the
// board, where they were and who took them off when. Read-only: putting a step back needs an event NextUp does not have yet.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PersonFace } from "@/components/ui/elements";
import { archivedSteps } from "@/features/projects/archive-view";
import { stepKey } from "@/features/projects/list-view";
import { columnLabel } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { StepPanel } from "../steps/StepPanel";
import type { ToolProps } from "./types";
import styles from "./Archive.module.css";

export function ArchiveTool({ p, jira }: ToolProps) {
  const { S, f } = useDemo();
  const t = useT();
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rows = archivedSteps(p, query);
  const total = archivedSteps(p).length;
  const nameOf = (userId: string | null) => (userId ? S.seats.find((s) => s.userId === userId)?.label ?? null : null);

  return <section className={styles.card} aria-label={t("projectPages.toolArchive")}>
    <div className={styles.toolbar}>
      <label className={styles.search}>
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
        <input type="search" aria-label={t("projectPages.archiveSearch")} placeholder={t("projectPages.archiveSearch")} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <span className={styles.note}>{t("projectPages.archiveNote")}</span>
    </div>
    {total === 0 ? <p className={styles.empty}>{t("projectPages.archiveEmpty")}</p> : <>
      <table className={styles.table}>
        <thead><tr>
          <th scope="col">{t("projectSteps.key")}</th>
          <th scope="col">{t("projectSteps.listStep")}</th>
          <th scope="col">{t("projectPages.archiveWasIn")}</th>
          <th scope="col">{t("projectPages.archiveArchived")}</th>
        </tr></thead>
        <tbody>{rows.map(({ step, byUserId, day, why }) => {
          const who = nameOf(byUserId);
          return <tr key={step.id}>
            <td className={styles.key}>{stepKey(step)}</td>
            <td><button type="button" className={styles.step} title={why || undefined} onClick={() => setOpen(step.id)}>{step.text}</button></td>
            <td className={styles.muted}>{columnLabel(step.column, locale)}</td>
            <td><span className={styles.who}>{who && <PersonFace name={who} size="sm" />}<span>{[who, f(day)].filter(Boolean).join(" · ")}</span></span></td>
          </tr>;
        })}</tbody>
      </table>
      {rows.length === 0 && <p className={styles.empty}>{t("projectSteps.emptyFilter")}</p>}
      <div className={styles.footer}>{t("projectPages.archiveCount", { count: total })}</div>
    </>}
    {open && <StepPanel p={p} stepId={open} jira={jira} onClose={() => setOpen(null)} />}
  </section>;
}
