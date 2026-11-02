"use client";
// /admin/integrations (company stack): the directory sync - switch, source, how the last run went and a
// "Run now" button. Never the cursor, never an employeeId (D5): the page only passes what DirectoryStatus holds.
import { useState, useTransition } from "react";
import { Field } from "@/components/ui/Field";
import type { DirectorySourceKind } from "@/features/directory";
import { runDirectoryNowAction, setDirectoryAction, type DirectoryActionState } from "@/server/actions/directory-admin";
import { useFormat, useT } from "@/i18n/client";
import styles from "@/app/admin/admin.module.css";

export type DirectoryAdminView = {
  on: boolean;
  source: DirectorySourceKind;
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  counts: { added: number; updated: number; deactivated: number; handed: number };
};

export function DirectoryAdmin({ view }: { view: DirectoryAdminView }) {
  const t = useT();
  const f = useFormat();
  const [on, setOn] = useState(view.on);
  const [source, setSource] = useState<DirectorySourceKind>(view.source);
  const [note, setNote] = useState<DirectoryActionState | null>(null);
  const [pending, start] = useTransition();
  const when = (iso: string | null) => (iso ? f.date(iso, "dateTime") : t("connectors.dirNever"));
  const act = (fn: () => Promise<DirectoryActionState>) => {
    setNote(null);
    start(async () => setNote(await fn()));
  };
  const error = note?.error === "notAdmin" ? t("connectors.dirNotAdmin") : note?.error === "switchOnFirst" ? t("connectors.dirSwitchOnFirst") : null;

  return (
    <section className={styles.card}>
      <h2>{t("connectors.dirTitle")}</h2>
      <p className="nh-hint">{t("connectors.dirHint")}</p>
      <div className={styles.grid}>
        <label><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> {t("connectors.dirOn")}</label>
        <Field id="dir-source" label={t("connectors.dirSource")}>
          <select className="nh-input" id="dir-source" value={source} onChange={(e) => setSource(e.target.value === "successfactors" ? "successfactors" : "graph")}>
            <option value="graph">{t("connectors.dirSourceGraph")}</option>
            <option value="successfactors">{t("connectors.dirSourceSuccessfactors")}</option>
          </select>
        </Field>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <tbody>
            <tr><th>{t("connectors.dirLastRun")}</th><td>{when(view.lastRunAt)}</td></tr>
            <tr><th>{t("connectors.dirLastOk")}</th><td>{when(view.lastOkAt)}</td></tr>
            <tr><th>{t("connectors.dirAdded")}</th><td>{view.counts.added}</td></tr>
            <tr><th>{t("connectors.dirUpdated")}</th><td>{view.counts.updated}</td></tr>
            <tr><th>{t("connectors.dirDeactivated")}</th><td>{view.counts.deactivated}</td></tr>
            <tr><th>{t("connectors.dirHanded")}</th><td>{view.counts.handed}</td></tr>
          </tbody>
        </table>
      </div>
      {view.lastError ? <p className={styles.error} role="alert">{t("connectors.dirLastError")}: {view.lastError}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {note?.ok ? <p className="nh-hint" role="status">{t("connectors.dirSaved")}</p> : null}
      <div className={styles.jiraActions}>
        <button type="button" className="nh-btn nh-btn-primary" disabled={pending} onClick={() => act(() => setDirectoryAction(on, source))}>{t("connectors.dirSave")}</button>
        <button type="button" className="nh-btn" disabled={pending || !view.on} onClick={() => act(runDirectoryNowAction)}>{pending ? t("connectors.dirWorking") : t("connectors.dirRunNow")}</button>
      </div>
    </section>
  );
}
