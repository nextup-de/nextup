"use client";
// "Saved per year" on the Dashboard: one tile with the sum in euros, and on a click the calculation behind it - one row
// per counted result (the project, its check, euros per year, linked to the project), the sum, the other figures and,
// apart and never in the sum, what is typed but not confirmed yet. Counted in features/metrics/impact.ts, the same sum as
// the pilot report. Projects only: no person is named or counted.
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { Saved } from "@/features/metrics/types";
import { useFormat, useT } from "@/i18n/client";
import { shows } from "@/lib/utils/quiet";
import s from "./DashboardBoard.module.css";

export function SavedTile({ saved, onOpen, delay }: { saved: Saved; onOpen: () => void; delay: number }) {
  const t = useT();
  const fmt = useFormat();
  return (
    <button type="button" className={s.tile} data-accent="saved" onClick={onOpen} data-testid="dashboard-tile-saved" style={{ animationDelay: delay + "ms" }}>
      <span className={s.tileLabel}><span className={s.tileDot} aria-hidden="true" />{t("metrics.savedTitle")}</span>
      <span className={s.tileValue}>{fmt.euro(saved.eur)}</span>
    </button>
  );
}

export function SavedOverlay({ saved, onClose, close }: { saved: Saved; onClose: () => void; close: React.ReactNode }) {
  const t = useT();
  const fmt = useFormat();
  const { href } = useDemo();
  const others = [
    shows(saved.co2Kg) ? t("metrics.savedCo2", { n: fmt.number(saved.co2Kg) }) : null,
    shows(saved.kwh) ? t("metrics.savedEnergy", { n: fmt.number(saved.kwh) }) : null,
    shows(saved.scrap) ? t("metrics.savedScrap", { n: fmt.number(saved.scrap) }) : null,
  ].filter((x): x is string => x !== null);
  return (
    <div className={s.overlay} role="dialog" aria-label={t("metrics.savedTitle")} data-testid="dashboard-saved" data-accent="saved">
      <div className={s.overlayHead}>
        <div className={s.titleCol}>
          <h3 className={s.overlayTitle}><span className={s.overlayValue}>{fmt.euro(saved.eur)}</span> <span className={s.muted}>{t("metrics.savedTitle")}</span></h3>
          <span className={s.note}>{t("metrics.savedNote")}</span>
        </div>
        {close}
      </div>
      <div className={s.panel}>
        <div className={s.calc} role="table" aria-label={t("metrics.savedCalc")}>
          {saved.rows.map((r) => (
            <div key={r.projectId + ":" + r.check} className={s.calcRow} role="row" data-testid="dashboard-saved-row">
              <span role="cell" className={s.calcName}><Link href={href("/projects/" + encodeURIComponent(r.projectId))} onClick={onClose}>{r.title}</Link></span>
              <span role="cell" className={s.note}>{r.check !== null ? t("metrics.savedCheck", { check: r.check }) : null}</span>
              <span role="cell" className={s.num}>{fmt.euro(r.eur)}</span>
            </div>
          ))}
          <div className={s.calcSum} role="row" data-testid="dashboard-saved-sum">
            <span role="cell">{t("metrics.savedSum")}</span>
            <span role="cell" />
            <span role="cell" className={s.num}>{fmt.euro(saved.eur)}</span>
          </div>
        </div>
        {others.map((line) => <span key={line} className={s.note}>{line}</span>)}
        {shows(saved.unconfirmedEur) && <span className={s.note} data-testid="dashboard-saved-unconfirmed">{t("metrics.savedUnconfirmed", { eur: fmt.euro(saved.unconfirmedEur) })}</span>}
      </div>
    </div>
  );
}
