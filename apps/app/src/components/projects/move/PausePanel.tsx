"use client";
// Pause a running project, for at most 20 working days, with why (D20); while paused the banner says until when and why, and
// whoever may ends it early with Resume. A pause ends by itself on its last day.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Banner } from "@/components/ui/elements";
import { PAUSE_MAX_DAYS } from "@/features/clock/kinds/project";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useSend } from "../parts";
import styles from "./Move.module.css";
import { useMoveView } from "./useMoveView";

export function PausePanel({ p }: { p: ReducedProject }) {
  const { act, S, f } = useDemo();
  const t = useT();
  const v = useMoveView(p);
  const send = useSend(p);
  const [open, setOpen] = useState(false);
  const [inDays, setInDays] = useState("");
  const [why, setWhy] = useState("");

  if (v.paused) {
    return (
      <div className={styles.stack} role="status" data-testid="paused-banner">
        <Banner
          tone="info"
          action={v.canResume ? <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => send("project.resumed", {}, () => act.project.resume(p.id))}>{t("projectMove.resume")}</button> : undefined}
        >
          {t("projectMove.pausedBanner", { date: f(v.paused.until), why: v.paused.why })}
        </Banner>
      </div>
    );
  }
  if (!v.canPause) return null;

  const n = inDays.trim() === "" ? NaN : Math.floor(Number(inDays));
  const until = Number.isFinite(n) && n >= 1 && n <= PAUSE_MAX_DAYS ? S.day + n : null;
  const close = () => { setOpen(false); setInDays(""); setWhy(""); };

  return (
    <div>
      {!open && <div className={styles.line}><button type="button" className={styles.quiet} onClick={() => setOpen(true)}>{t("projectMove.pauseOpen")}</button></div>}
      {open && (
        <form
          className={styles.form} aria-label={t("projectMove.pauseTitle")}
          onSubmit={(e) => { e.preventDefault(); if (until !== null && why.trim() && send("project.paused", { why: why.trim(), untilDay: until }, () => act.project.pause(p.id, why.trim(), until))) close(); }}
        >
          <label className={styles.field}>
            <span className={styles.label}>{t("projectMove.pauseInDays", { max: PAUSE_MAX_DAYS })}</span>
            <input className={`nh-input ${styles.input} ${styles.short}`} type="number" min={1} max={PAUSE_MAX_DAYS} inputMode="numeric" value={inDays} onChange={(e) => setInDays(e.target.value)} autoFocus />
            {until !== null && <span className={styles.hint}>{t("projectMove.pauseUntil", { date: f(until) })}</span>}
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t("projectMove.whyLabel")}</span>
            <input className={`nh-input ${styles.input}`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder={t("projectMove.whyPlaceholder")} maxLength={400} />
          </label>
          <span className={styles.row}>
            <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={until === null || !why.trim()}>{t("projectMove.pauseSave")}</button>
            <button type="button" className={styles.quiet} onClick={close}>{t("common.cancel")}</button>
          </span>
        </form>
      )}
    </div>
  );
}
