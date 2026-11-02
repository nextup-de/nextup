"use client";
// Console connectors: the directory sync, read-only. Source, switch, last run, last error.
import { useFormat, useT } from "@/i18n/client";
import type { DirectoryBlockView } from "./views";
import styles from "@/app/admin/admin.module.css";

export function DirectoryBlock({ view }: { view: DirectoryBlockView }) {
  const t = useT();
  const f = useFormat();
  return (
    <section className={styles.card} data-testid="console-connectors-directory">
      <h2>{t("adminConnectors.dirTitle")}</h2>
      <p className="nh-hint">{t("adminConnectors.dirHint")}</p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <tbody>
            <tr><th>{t("adminConnectors.dirSource")}</th><td>{t(view.source === "graph" ? "adminConnectors.dirSourceGraph" : "adminConnectors.dirSourceSuccessfactors")}</td></tr>
            <tr><th>{t("adminConnectors.dirOn")}</th><td data-testid="console-connectors-directory-on">{t(view.on ? "adminConnectors.on" : "adminConnectors.off")}</td></tr>
            <tr><th>{t("adminConnectors.dirLastRun")}</th><td data-testid="console-connectors-directory-run">{view.lastRunAt ? f.date(view.lastRunAt, "dateTime") : t("adminConnectors.never")}</td></tr>
          </tbody>
        </table>
      </div>
      {view.lastError ? <p className={styles.error} role="alert">{t("adminConnectors.dirLastError")}: {view.lastError}</p> : null}
    </section>
  );
}
