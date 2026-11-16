"use client";
import { useEffect, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { demoAttachments } from "@/features/demo/jira-attachments-demo";
import { kindOf } from "@/features/files/items";
import { linkedIssues } from "@/features/integrations/jira/attachments";
import type { AttachmentsAnswer } from "@/features/integrations/jira/types";
import { stepKey } from "@/features/projects/list-view";
import type { ReducedProject } from "@/features/projects/types";
import { formatDate } from "@/i18n/format";
import { useLocale, useT } from "@/i18n/client";
import { projectAttachmentsAction } from "@/server/actions/project-attachments";
import { FileIcon } from "./FileIcon";
import { formatSize } from "./FileList";
import styles from "./Jira.module.css";

/** Does this project have Jira to read: a linked issue, and its sync not stopped. Without it nothing is asked and nothing shows (D5). */
export const syncsWithJira = (p: ReducedProject): boolean => (p.sync ? p.sync.on : true) && linkedIssues(p).size > 0;

/**
 * The Jira attachments of the project's linked issues, under the SharePoint list: read-only links, read with the company's integration account
 * (the hint says so), never a claim that everything is synced. A partial read says the list may be incomplete; an unreadable one says so and
 * offers Try again; not-connected and no-access show nothing and clear what was shown.
 */
export function JiraAttachments({ p }: { p: ReducedProject }) {
  const { serverMode } = useDemo();
  const [round, setRound] = useState(0);
  const key = `${p.id}:${round}`;
  const asks = serverMode && syncsWithJira(p);
  const [got, setGot] = useState<{ key: string; answer: AttachmentsAnswer } | null>(null);

  useEffect(() => {
    if (!asks) return;
    let stale = false;
    void projectAttachmentsAction(p.id).then((answer) => { if (!stale) setGot({ key, answer }); }).catch(() => { if (!stale) setGot({ key, answer: { state: "offline" } }); });
    return () => { stale = true; };
  }, [asks, p.id, key]);

  // The answer belongs to the project and the round it was asked for: another project starts over, and nothing stale shows.
  const answer: AttachmentsAnswer | "loading" | null = !serverMode
    ? (() => { const rows = demoAttachments(p); return rows.length ? { state: "ok", rows, more: 0, partial: false } : null; })()
    : !asks ? null : got && got.key === key ? got.answer : "loading";
  if (answer === null || (answer !== "loading" && (answer.state === "not-connected" || answer.state === "no-access"))) return null;
  return <AttachmentsGroup p={p} answer={answer} onRetry={() => setRound((n) => n + 1)} />;
}

/** The group for an answer: what the three states and the rows look like. */
export function AttachmentsGroup({ p, answer, onRetry }: { p: ReducedProject; answer: AttachmentsAnswer | "loading"; onRetry: () => void }) {
  const t = useT();
  const locale = useLocale();
  if (answer !== "loading" && (answer.state === "not-connected" || answer.state === "no-access")) return null;
  const when = (iso: string) => formatDate(locale, iso, "dayMonth");
  return <section className={styles.group} aria-labelledby={`jira-attachments-${p.id}`} data-testid="jira-attachments">
    <h3 id={`jira-attachments-${p.id}`} className={styles.title}>{t("projectJsy.attachmentsTitle")}</h3>
    {answer === "loading" && <p className={styles.state} role="status">{t("projectJsy.attachmentsLoading")}</p>}
    {answer !== "loading" && answer.state === "offline" && <>
      <p className={styles.note} role="alert">{t("projectJsy.attachmentsOffline")}</p>
      <button type="button" className={styles.retry} onClick={onRetry}>{t("projectFiles.retry")}</button>
    </>}
    {answer !== "loading" && answer.state === "empty" && <p className={styles.state}>{t("projectJsy.attachmentsEmpty")}</p>}
    {answer !== "loading" && answer.state === "ok" && <>
      <p className={styles.hint}>{t("projectJsy.attachmentsHint")}</p>
      {answer.partial && <p className={styles.note} role="status">{t("projectJsy.attachmentsPartial")}</p>}
      <ul className={styles.list}>
        {answer.rows.map((row) => {
          const step = row.stepId ? p.steps.find((s) => s.id === row.stepId) : undefined;
          const meta = row.who ? t("projectJsy.attachmentMeta", { size: formatSize(row.size), who: row.who, date: when(row.created) }) : `${formatSize(row.size)} · ${when(row.created)}`;
          return <li key={`${row.issueKey}:${row.id}`} className={styles.row}>
            <FileIcon kind={kindOf(row.filename)} size={30} />
            <span className={styles.text}><span className={styles.name}>{row.filename}</span><span className={styles.meta}>{meta}</span></span>
            {step && <span className={styles.chip}>{stepKey(step)}</span>}
            {row.openUrl && <a className={styles.open} href={row.openUrl} target="_blank" rel="noopener noreferrer">{t("projectJsy.attachmentOpen")} <span aria-hidden="true">↗</span></a>}
          </li>;
        })}
      </ul>
      {answer.more > 0 && <p className={styles.more}>{t("projectJsy.attachmentsMore", { count: answer.more })}</p>}
    </>}
  </section>;
}
