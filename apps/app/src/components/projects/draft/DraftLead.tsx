"use client";
// The lead question of a draft (D11): the person asked to lead it takes it, or declines and says why. Everyone else
// only sees who it waits for.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { DraftView } from "@/features/projects/draft";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useSend } from "../parts";
import styles from "./Draft.module.css";

export function DraftLead({ p, view }: { p: ReducedProject; view: DraftView }) {
  const { act } = useDemo();
  const t = useT();
  const send = useSend(p);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  if (p.leadState !== "pending") return null;
  if (!view.may.answerLead) return <p className={styles.notice} role="status">{t("projectDraft.leadWaiting", { name: p.lead })}</p>;
  return (
    <section className={styles.ask} aria-label={t("projectDraft.leadAsk", { name: p.openedBy })}>
      <p className={styles.strong}>{t("projectDraft.leadAsk", { name: p.openedBy })}</p>
      {!declining ? (
        <span className={styles.actionRow}>
          <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={() => send("project.lead.answered", { take: true }, () => act.project.answerLead(p.id, true))}>{t("projectDraft.leadTake")}</button>
          <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => setDeclining(true)}>{t("projectDraft.leadDecline")}</button>
        </span>
      ) : (
        <form className={styles.inline} onSubmit={(e) => { e.preventDefault(); send("project.lead.answered", { take: false, reason: reason.trim() }, () => act.project.answerLead(p.id, false, reason.trim())); }}>
          <input className={`nh-input ${styles.input} ${styles.grow}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("projectDraft.leadDeclineWhy")} aria-label={t("projectDraft.leadDeclineWhy")} maxLength={500} autoFocus />
          <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!reason.trim()}>{t("projectDraft.leadDeclineSend")}</button>
          <button type="button" className={styles.quiet} onClick={() => setDeclining(false)}>{t("common.cancel")}</button>
        </form>
      )}
    </section>
  );
}
