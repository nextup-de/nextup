"use client";
// How we work (D21): the weekday of the weekly check-in and a short note. The lead and managers set it, on the draft and on a
// running project; everyone else reads it. One project.howwework event.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Fold } from "@/components/ui/elements";
import type { MessageKey } from "@/i18n";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useRights, useSend } from "../parts";
import styles from "./Move.module.css";
import { useMoveView } from "./useMoveView";

const DAYS = [1, 2, 3, 4, 5] as const;
const dayKey = (d: number) => `projectMove.weekday${d}` as MessageKey;

/** `folded`: on the Overview it is one line that opens, with the check-in day as its answer (DESIGN_RULES §9). */
export function HowWeWork({ p, className, folded = false }: { p: ReducedProject; className?: string; folded?: boolean }) {
  const { act } = useDemo();
  const t = useT();
  const r = useRights(p);
  const v = useMoveView(p);
  const send = useSend(p);
  const current = p.checkInWeekday ?? v.checkInWeekday;
  const [day, setDay] = useState(current ?? 1);
  const [note, setNote] = useState(p.howWeWorkNote);
  const saved = p.checkInWeekday === day && p.howWeWorkNote === note.trim();
  const live = p.status === "planning" || p.status === "running";
  // Nothing to read before there is a rhythm or a note, and nothing to set for someone who may not.
  if (!r.howWeWork && !live) return null;
  if (!r.howWeWork && current === null && !p.howWeWorkNote) return null;

  const body = !r.howWeWork ? (
    <>
      {current !== null && <p className={styles.hint}>{t("projectMove.howCurrent", { day: t(dayKey(current)) })}</p>}
      {p.howWeWorkNote && <p className={styles.latest}>{p.howWeWorkNote}</p>}
    </>
  ) : (
    <form className={styles.form} onSubmit={(e) => { e.preventDefault(); send("project.howwework", { checkInWeekday: day, ...(note.trim() ? { note: note.trim() } : {}) }, () => act.project.howWeWork(p.id, day, note.trim() || undefined)); }}>
      <label className={styles.field}>
        <span className={styles.label}>{t("projectMove.howWeekday")}</span>
        <select className={`nh-input nh-select ${styles.input} ${styles.short}`} value={day} onChange={(e) => setDay(Number(e.target.value))}>
          {DAYS.map((d) => <option key={d} value={d}>{t(dayKey(d))}</option>)}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>{t("projectMove.howNote")}</span>
        <textarea className={`nh-input nh-textarea ${styles.textarea}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} rows={3} />
      </label>
      <span className={styles.row}>
        <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={saved}>{t("projectMove.howSave")}</button>
        {saved && p.checkInWeekday !== null && <span className={styles.hint}>{t("projectMove.howSaved")}</span>}
      </span>
    </form>
  );
  // Folded, the check-in day is the line's answer; a reader opens it only for a note.
  if (folded && !r.howWeWork && !p.howWeWorkNote) return null;
  if (folded) return (
    <div data-testid="how-we-work">
      <Fold name={"how-" + p.id} summary={t("projectMove.howTitle")} meta={current !== null ? <span className={styles.closedOnly}>{t(dayKey(current))}</span> : undefined}>
        {r.howWeWork ? body : <p className={styles.latest}>{p.howWeWorkNote}</p>}
      </Fold>
    </div>
  );
  return (
    <section className={`${styles.block} ${className ?? ""}`} aria-labelledby={"how-" + p.id} data-testid="how-we-work">
      <h2 id={"how-" + p.id} className={styles.title}>{t("projectMove.howTitle")}</h2>
      {body}
    </section>
  );
}
