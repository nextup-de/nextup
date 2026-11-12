"use client";
// "Done by 12 Nov", in the one red the board uses once it is late, and for whoever may a sheet to move it: a new date and why
// (D19: the lead once, then the sponsor and managers). One project.doneby.moved event.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useSend } from "../parts";
import styles from "./Move.module.css";
import { useMoveView } from "./useMoveView";

export function DoneByLine({ p }: { p: ReducedProject }) {
  const { act, S, f } = useDemo();
  const t = useT();
  const v = useMoveView(p);
  const send = useSend(p);
  const [open, setOpen] = useState(false);
  const [inDays, setInDays] = useState("");
  const [why, setWhy] = useState("");
  if (p.status !== "running" || v.doneBy === null) return null;

  const n = inDays.trim() === "" ? NaN : Math.floor(Number(inDays));
  const day = Number.isFinite(n) && n >= 1 ? S.day + n : null;
  const close = () => { setOpen(false); setInDays(""); setWhy(""); };

  return (
    <div data-testid="done-by">
      <div className={styles.line}>
        <span className={styles.doneBy} data-late={v.doneByLate ? "true" : undefined} data-testid="done-by-line">
          {t("projectMove.doneByLine", { date: f(v.doneBy) })}{v.doneByLate ? " · " + t("projectMove.doneByLateTag") : ""}
        </span>
        {v.canMoveDoneBy && !open && <button type="button" className={styles.quiet} onClick={() => setOpen(true)}>{t("projectMove.doneByMove")}</button>}
      </div>
      {v.canMoveDoneBy && open && (
        <form
          className={styles.form} aria-label={t("projectMove.doneByMoveTitle")}
          onSubmit={(e) => { e.preventDefault(); if (day !== null && why.trim() && send("project.doneby.moved", { doneBy: day, why: why.trim() }, () => act.project.moveDoneBy(p.id, day, why.trim()))) close(); }}
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
            <button type="button" className={styles.quiet} onClick={close}>{t("common.cancel")}</button>
          </span>
        </form>
      )}
    </div>
  );
}
