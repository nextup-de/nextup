"use client";
// A draft past its start day went to the seat above (D15): keep it with a new date, hand the lead on, or stop it with a reason.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { peopleOf, useSend } from "../parts";
import styles from "./Draft.module.css";

export function DraftLate({ p, startDay }: { p: ReducedProject; startDay: number }) {
  const { act, S, f, seed } = useDemo();
  const t = useT();
  const send = useSend(p);
  const [days, setDays] = useState("");
  const [why, setWhy] = useState("");
  const [to, setTo] = useState("");
  const [stopWhy, setStopWhy] = useState<string | null>(null);
  const n = Math.floor(Number(days));
  const people = peopleOf(seed.seats).filter((x) => x.userId !== p.leadUserId);

  return (
    <section className={styles.late} aria-labelledby={"late-" + p.id}>
      <h2 id={"late-" + p.id} className={styles.h2}>{t("projectDraft.lateTitle")}</h2>
      <p className={styles.muted}>{t("projectDraft.lateText", { date: f(startDay) })}</p>
      <form className={styles.inline} aria-label={t("projectDraft.lateKeep")} onSubmit={(e) => { e.preventDefault(); if (send("project.start.moved", { dueDay: S.day + n, why: why.trim() }, () => act.project.moveStart(p.id, S.day + n, why.trim()))) { setDays(""); setWhy(""); } }}>
        <input className={`nh-input ${styles.input} ${styles.short}`} type="number" min={1} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} aria-label={t("projectDraft.lateDays")} placeholder={t("projectDraft.lateDays")} />
        <input className={`nh-input ${styles.input} ${styles.grow}`} value={why} onChange={(e) => setWhy(e.target.value)} aria-label={t("projectDraft.lateWhy")} placeholder={t("projectDraft.lateWhy")} />
        <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!(n >= 1) || !why.trim()}>{t("projectDraft.lateKeep")}</button>
      </form>
      {people.length > 0 && (
        <form className={styles.inline} aria-label={t("projectDraft.lateHand")} onSubmit={(e) => { e.preventDefault(); const next = people.find((x) => x.userId === to); if (next && send("project.handed", { toUserId: next.userId, to: next.name }, () => act.project.hand(p.id, next))) setTo(""); }}>
          <select className={`nh-input nh-select ${styles.input} ${styles.grow}`} value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("projectDraft.lateHandTo")}>
            <option value="">{t("projectDraft.lateHandTo")}</option>
            {people.map((x) => <option key={x.userId} value={x.userId}>{x.name}</option>)}
          </select>
          <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!to}>{t("projectDraft.lateHand")}</button>
        </form>
      )}
      {stopWhy === null ? (
        <button type="button" className={styles.quiet} onClick={() => setStopWhy("")}>{t("projectDraft.lateStop")}</button>
      ) : (
        <form className={styles.inline} onSubmit={(e) => { e.preventDefault(); send("project.stopped", { why: stopWhy }, () => act.project.stop(p.id, stopWhy.trim())); }}>
          <input className={`nh-input ${styles.input} ${styles.grow}`} value={stopWhy} onChange={(e) => setStopWhy(e.target.value)} placeholder={t("projectDraft.lateStopWhy")} aria-label={t("projectDraft.lateStopWhy")} autoFocus />
          <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!stopWhy.trim()}>{t("projectDraft.lateStopSend")}</button>
          <button type="button" className={styles.quiet} onClick={() => setStopWhy(null)}>{t("common.cancel")}</button>
        </form>
      )}
    </section>
  );
}
