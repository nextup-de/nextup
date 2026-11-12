"use client";
// Goal, done-when, an optional done-by and an optional brief (D17). The sponsor may set the goal too; everyone else reads it.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { DraftView } from "@/features/projects/draft";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useSend } from "../parts";
import styles from "./Draft.module.css";

export function DraftGoal({ p, view }: { p: ReducedProject; view: DraftView }) {
  const { act, S, f } = useDemo();
  const t = useT();
  const send = useSend(p);
  const g = p.goal;
  const [goal, setGoal] = useState(g?.goal ?? "");
  const [doneWhen, setDoneWhen] = useState(g?.doneWhen ?? "");
  const [inDays, setInDays] = useState(g?.doneBy != null ? String(Math.max(1, g.doneBy - S.day)) : "");
  const [brief, setBrief] = useState(g?.brief ?? "");
  const days = inDays.trim() === "" ? undefined : Math.floor(Number(inDays));
  const doneBy = days !== undefined && Number.isFinite(days) && days >= 1 ? S.day + days : undefined;

  return (
    <section className={styles.section} aria-labelledby={"goal-" + p.id}>
      <h2 id={"goal-" + p.id} className={styles.h2}>{t("projectDraft.goalTitle")}</h2>
      {!view.may.setGoal ? (
        g ? (
          <dl className={styles.facts}>
            <dt>{t("projectDraft.goalLabel")}</dt><dd>{g.goal}</dd>
            <dt>{t("projectDraft.goalDoneWhen")}</dt><dd>{g.doneWhen}</dd>
            {g.doneBy !== null && <><dt>{t("projectDraft.goalDoneByLabel")}</dt><dd>{f(g.doneBy)}</dd></>}
            {g.brief && <dd className={styles.brief}>{g.brief}</dd>}
          </dl>
        ) : <p className={styles.muted}>{t("projectDraft.checkOpen")}</p>
      ) : (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            const payload = { goal: goal.trim(), doneWhen: doneWhen.trim(), ...(doneBy !== undefined ? { doneBy } : {}), ...(brief.trim() ? { brief: brief.trim() } : {}) };
            send("project.goal", payload, () => act.project.setGoal(p.id, payload));
          }}
        >
          <label className={styles.field}>
            <span className={styles.label}>{t("projectDraft.goalLabel")}</span>
            <input className={`nh-input ${styles.input}`} value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={400} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t("projectDraft.goalDoneWhen")}</span>
            <input className={`nh-input ${styles.input}`} value={doneWhen} onChange={(e) => setDoneWhen(e.target.value)} maxLength={400} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t("projectDraft.goalDoneIn")}</span>
            <input className={`nh-input ${styles.input} ${styles.short}`} type="number" min={1} inputMode="numeric" value={inDays} onChange={(e) => setInDays(e.target.value)} />
            {doneBy !== undefined && <span className={styles.muted}>{t("projectDraft.goalDoneBy", { date: f(doneBy) })}</span>}
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t("projectDraft.goalBrief")}</span>
            <textarea className={`nh-input nh-textarea ${styles.textarea}`} value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={1200} />
          </label>
          <span className={styles.hint}>{t("projectDraft.goalHint")}</span>
          <span className={styles.actionRow}>
            <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={goal.trim().length < 3 || doneWhen.trim().length < 3}>{t("projectDraft.goalSave")}</button>
            {g && g.goal === goal.trim() && g.doneWhen === doneWhen.trim() && <span className={styles.muted}>{t("projectDraft.goalSaved")}</span>}
          </span>
        </form>
      )}
    </section>
  );
}
