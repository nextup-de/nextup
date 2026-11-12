"use client";
// What a raiser who is not on the team sees after the start (plan RES, D21): the title and status, the steps done of the steps that count, the
// latest weekly update, a pause and why, the results with their verdict and whether a second person confirmed them, when recognition is due and a
// stop with its reason. No board, team, links, comments or buttons. A presentation that narrows the page: the browser still receives the project's
// events (Q1), so this is not where privacy is decided.
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { RaiserPanel as RaiserPanelData } from "@/features/projects/result-view";
import { useT } from "@/i18n/client";
import { VerdictChip } from "../parts";
import styles from "./Result.module.css";

export function RaiserPanel({ panel }: { panel: RaiserPanelData }) {
  const { f } = useDemo();
  const t = useT();
  return (
    <section className={styles.panel} aria-label={panel.title} data-testid="raiser-panel">
      <p className={styles.hint}>{t("projectResult.raiserLede")}</p>
      <div className={styles.panelBlock}>
        <p className={styles.panelText} data-testid="raiser-steps">{t("projectResult.raiserSteps", { done: panel.stepsDone, total: panel.stepsTotal })}</p>
      </div>
      <div className={styles.panelBlock}>
        <p className={styles.panelTitle}>{panel.latestUpdate ? t("projectResult.raiserUpdate", { date: f(panel.latestUpdate.day) }) : t("projectResult.raiserNoUpdate")}</p>
        {panel.latestUpdate && <p className={styles.panelText} data-testid="raiser-update">{panel.latestUpdate.text}</p>}
      </div>
      {panel.paused && (
        <div className={styles.panelBlock}>
          <p className={styles.panelText} data-testid="raiser-paused">{t("projectResult.raiserPaused", { date: f(panel.paused.until), why: panel.paused.why })}</p>
        </div>
      )}
      {panel.results.length > 0 && (
        <div className={styles.panelBlock}>
          <p className={styles.panelTitle}>{t("projectResult.raiserResults")}</p>
          <ul className={styles.results} data-testid="raiser-results">
            {panel.results.map((x) => (
              <li key={x.check} className={styles.result}>
                {t("projectResult.raiserResult", { check: x.check, value: x.value + (panel.unit ? " " + panel.unit : "") })} <VerdictChip verdict={x.verdict} />{" "}
                <span className={styles.muted}>{x.confirmed ? t("projectResult.raiserConfirmed") : t("projectResult.raiserUnconfirmed")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {panel.recognitionDueDay !== null && (
        <div className={styles.panelBlock}>
          <p className={styles.panelText} data-testid="raiser-recognition">{t("projectResult.recognitionDue", { date: f(panel.recognitionDueDay) })}</p>
        </div>
      )}
      {panel.stopped && (
        <div className={styles.panelBlock}>
          <p className={styles.panelText} data-testid="raiser-stopped">{t("projectResult.raiserStopped", { why: panel.stopped.why })}</p>
        </div>
      )}
    </section>
  );
}
