"use client";
// Goal, done-when, an optional done-by and an optional brief (D17). The sponsor may set the goal too; everyone else reads it.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { ReducedCase } from "@/features/cases/reducer";
import type { DraftView } from "@/features/projects/draft";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useSend } from "../parts";
import styles from "./Draft.module.css";

/** The brief field takes up to this many characters (project.goal). */
const BRIEF_MAX = 1200;

/** The idea's text as one paragraph for the brief: its body (else its title), blanks collapsed, cut at a word break when it runs past the limit. */
export function briefOfIdea(c: Pick<ReducedCase, "title" | "body">): string {
  const text = (c.body.trim() || c.title.trim()).replace(/\s+/g, " ");
  if (text.length <= BRIEF_MAX) return text;
  const cut = text.slice(0, BRIEF_MAX - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)).trimEnd() + "…";
}

/**
 * What the brief field starts with (plan REM, P5.4): the brief the lead stored, whatever it is - an empty one is a choice - and, while no goal is stored, the text of the
 * idea whose yes opened the project, so the lead edits it instead of retyping it. Empty when the idea is not in the state.
 */
export function initialBrief(p: Pick<ReducedProject, "id" | "goal">, cases: readonly Pick<ReducedCase, "title" | "body" | "decided">[]): string {
  if (p.goal) return p.goal.brief;
  const idea = cases.find((c) => c.decided?.answer === "yes" && c.decided.projectId === p.id);
  return idea ? briefOfIdea(idea) : "";
}

export function DraftGoal({ p, view }: { p: ReducedProject; view: DraftView }) {
  const { act, S, f } = useDemo();
  const t = useT();
  const send = useSend(p);
  const g = p.goal;
  const [goal, setGoal] = useState(g?.goal ?? "");
  const [doneWhen, setDoneWhen] = useState(g?.doneWhen ?? "");
  const [inDays, setInDays] = useState(g?.doneBy != null ? String(Math.max(1, g.doneBy - S.day)) : "");
  const [brief, setBrief] = useState(() => initialBrief(p, S.cases));
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
