"use client";
// "Done by 12 Nov", in the one red the board uses once it is late; for whoever may, a sheet (from the Manage menu) to move it: a new date and why
// (D19: the lead once, then the sponsor and managers). One project.doneby.moved event.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useSend } from "../parts";
import styles from "./Move.module.css";
import { useMoveView } from "./useMoveView";

/** The done-by date under the title: read-only. Moving it is in the head's Manage menu (DoneByForm). */
export function DoneByLine({ p }: { p: ReducedProject }) {
  const { f } = useDemo();
  const t = useT();
  const v = useMoveView(p);
  if (p.status !== "running" || v.doneBy === null) return null;
  return (
    <p className={styles.doneBy} data-late={v.doneByLate ? "true" : undefined} data-testid="done-by-line">
      {t("projectMove.doneByLine", { date: f(v.doneBy) })}{v.doneByLate ? " · " + t("projectMove.doneByLateTag") : ""}
    </p>
  );
}

/** Whoever may move the date: true while the Manage menu should offer it. */
export function useCanMoveDoneBy(p: ReducedProject): boolean {
  const v = useMoveView(p);
  return p.status === "running" && v.doneBy !== null && v.canMoveDoneBy;
}

/** The sheet to move the date: a new date and why. Opened from the head's Manage menu. */
export function DoneByForm({ p, onClose }: { p: ReducedProject; onClose: () => void }) {
  const { act, S, f } = useDemo();
  const t = useT();
  const send = useSend(p);
  const [inDays, setInDays] = useState("");
  const [why, setWhy] = useState("");

  const n = inDays.trim() === "" ? NaN : Math.floor(Number(inDays));
  const day = Number.isFinite(n) && n >= 1 ? S.day + n : null;

  return (
    <form
      className={styles.sheet} aria-label={t("projectMove.doneByMoveTitle")} data-testid="done-by"
      onSubmit={(e) => { e.preventDefault(); if (day !== null && why.trim() && send("project.doneby.moved", { doneBy: day, why: why.trim() }, () => act.project.moveDoneBy(p.id, day, why.trim()))) onClose(); }}
    >
      <label className={styles.field}>
        <span className={styles.label}>{t("projectMove.doneByInDays")}</span>
        <input className={`nh-input ${styles.input} ${styles.short}`} type="number" min={1} inputMode="numeric" value={inDays} onChange={(e) => setInDays(e.target.value)} autoFocus />
        {day !== null && <span className={styles.hint}>{t("projectMove.doneByNew", { date: f(day) })}</span>}
      </label>
      <label className={styles.field}>
        <span className={styles.label}>{t("projectMove.whyLabel")}</span>
        <input className={`nh-input ${styles.input}`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder={t("projectMove.whyPlaceholder")} maxLength={400} />
      </label>
      <span className={styles.row}>
        <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={day === null || !why.trim()}>{t("projectMove.doneBySave")}</button>
        <button type="button" className={styles.quiet} onClick={onClose}>{t("common.cancel")}</button>
      </span>
    </form>
  );
}
