"use client";
import { useEffect, useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { timePerColumn } from "@/features/projects/flow-view";
import type { ReducedProject } from "@/features/projects/types";
import { baselineText, fmtNumber, measureSourceLine } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { VerdictChip } from "../../parts";
import { ResultPanel } from "./ResultPanel";
import styles from "./Results.module.css";

export function Results({ p }: { p: ReducedProject }) {
  const { S, f } = useDemo();
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  const baseline = p.baseline && !p.baseline.none ? p.baseline : null;
  const latest = p.measures.filter((m) => !m.sentBack).reduce<typeof p.measures[number] | null>((last, m) => !last || m.day >= last.day ? m : last, null);
  const next = p.checks.filter((c) => !c.measured || p.measures.some((m) => m.check === c.check && m.sentBack)).sort((a, b) => a.dueDay - b.dueDay)[0];
  const owner = p.leadUserId ? S.seats.find((s) => s.userId === p.leadUserId)?.label ?? p.lead : p.lead;
  const confirmer = latest?.confirmedByUserId ? S.seats.find((s) => s.userId === latest.confirmedByUserId)?.label : null;
  const confirmation = latest ? latest.sourceKind !== "typed"
    ? measureSourceLine(latest, { by: latest.by, confirmedBy: confirmer ?? "", day: f }, t)
    : latest.confirmed
      ? confirmer ? t("projectHub.resultsConfirmedBy", { name: confirmer, date: f(latest.confirmedDay ?? latest.day) }) : t("projectResult.raiserConfirmed")
      : t("projectHub.resultsAwaitingConfirmation") : null;
  const title = p.goal?.goal || baseline?.metric || p.title;
  const times = timePerColumn(p).filter((row) => row.medianDays !== null && row.medianDays > 0);
  const maxDays = Math.max(1, ...times.map((row) => row.medianDays ?? 0));
  const columnLabels = { todo: t("projectHub.overviewToDo"), doing: t("projectHub.overviewDoing"), blocked: t("projectHub.overviewBlocked") };

  return (
    <div className={styles.results} aria-label={t("projectHub.resultsAriaLabel")}>
      <p className={styles.hint}>{t("projectHub.resultsHint")}</p>
      <button type="button" className={`${styles.card} ${styles.resultCard}`} aria-label={t("projectHub.resultsOpen")} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className={styles.main}>
          <span className={styles.heading}><span className={styles.title}>{title}</span><VerdictChip verdict={latest?.verdict ?? "not measured"} /></span>
          <span className={styles.progressLine}>
            <span><span className={styles.muted}>{t("projectHub.resultsBaseline")}</span> {p.baseline ? baselineText(p.baseline, locale) : t("projectHub.resultsEmpty")}</span>
            {baseline && latest && <><span aria-hidden="true">→</span><span><span className={styles.muted}>{t("projectHub.resultsActual")}</span> <strong>{fmtNumber(latest.value, locale)} {baseline.unit}</strong></span></>}
          </span>
          {confirmation && <span className={styles.muted}>{confirmation}</span>}
        </span>
        {next && <span className={styles.owner}><span>{owner || t("projectHub.overviewNoOwner")}</span><span className={styles.muted}>{t("projectHub.resultsCheckAfterDays", { days: next.check })}</span><span className={styles.muted}>{t("projectHub.resultsCheckDue", { date: f(next.dueDay) })}</span></span>}
      </button>
      {times.length > 0 && <section className={styles.card} aria-label={t("projectHub.resultsColumnChartAriaLabel")}>
        <div className={styles.chartHeading}><h2 className={styles.title}>{t("projectHub.resultsColumnTime")}</h2><span className={styles.muted}>{t("projectHub.resultsMedianDays")}</span></div>
        <div className={styles.bars}>
          {times.map((row) => <div className={styles.barRow} key={row.column}>
            <span>{columnLabels[row.column]}</span>
            <span className={styles.track} aria-hidden="true"><span className={styles.fill} data-column={row.column} style={{ width: `${((row.medianDays ?? 0) / maxDays) * 100}%` }} /></span>
            <strong>{fmtNumber(row.medianDays ?? 0, locale)}</strong>
          </div>)}
        </div>
      </section>}
      <dialog ref={dialog} className={styles.drawer} aria-label={t("projectHub.resultsTitle")} onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
        {open && <>
          <div className={styles.drawerHead}><h2 className={styles.title}>{t("projectHub.resultsTitle")}</h2><button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" aria-label={t("projectHub.resultsClose")} onClick={() => setOpen(false)}>×</button></div>
          <ResultPanel p={p} />
        </>}
      </dialog>
    </div>
  );
}
