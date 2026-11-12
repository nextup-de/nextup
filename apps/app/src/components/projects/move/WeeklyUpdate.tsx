"use client";
// The weekly update (D21): from the check-in day the lead finds the offline draft built from the board since the previous
// check-in, edits it and sends it as one project.update; the latest update stays below. No model is asked.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useSend } from "../parts";
import styles from "./Move.module.css";
import { useMoveView } from "./useMoveView";

export function WeeklyUpdate({ p }: { p: ReducedProject }) {
  const t = useT();
  const v = useMoveView(p);
  const latest = p.latestUpdate;
  if (!v.update && !latest) return null;
  return (
    <section className={styles.block} aria-labelledby={"update-" + p.id} data-testid="weekly-update">
      <h2 id={"update-" + p.id} className={styles.title}>{t("projectMove.updateTitle")}</h2>
      {/* Keyed by the week, so the draft of the next check-in starts fresh while an edit of this one is kept. */}
      {v.update && <UpdateForm key={v.update.week} p={p} week={v.update.week} draft={v.update.draft} />}
      {latest && <LatestUpdate text={latest.text} day={latest.day} />}
    </section>
  );
}

function UpdateForm({ p, week, draft }: { p: ReducedProject; week: number; draft: string }) {
  const { act } = useDemo();
  const t = useT();
  const send = useSend(p);
  const [text, setText] = useState(draft);
  return (
    <form className={styles.form} onSubmit={(e) => { e.preventDefault(); send("project.update", { text: text.trim(), week }, () => act.project.update(p.id, text.trim(), week)); }}>
      <p className={styles.hint}>{t(p.draft ? "projectMove.updateHint" : "projectMove.updateHintLegacy")}</p>
      <label className={styles.field}>
        <span className={styles.label}>{t("projectMove.updateLabel")}</span>
        <textarea className={`nh-input nh-textarea ${styles.textarea}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={7} />
      </label>
      <span className={styles.row}>
        <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!text.trim()}>{t("projectMove.updateSend")}</button>
      </span>
    </form>
  );
}

function LatestUpdate({ text, day }: { text: string; day: number }) {
  const { f } = useDemo();
  const t = useT();
  return (
    <div className={styles.stack} data-testid="latest-update">
      <p className={styles.hint}>{t("projectMove.updateLatest", { date: f(day) })}</p>
      <p className={styles.latest}>{text}</p>
    </div>
  );
}
