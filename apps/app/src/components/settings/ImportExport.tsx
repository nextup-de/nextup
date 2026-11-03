"use client";
// Settings -> Import and export (API D13): choose up to four CSV files, check them, read every error, apply all
// or nothing; and the four files out again. The server checks and writes (server/actions/settings/import-export.ts).
import { useRef, useState, useTransition } from "react";
import type { CheckResult, FileKind } from "@/features/api/structure-csv";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { applyImportAction, checkImportAction } from "@/server/actions/settings/import-export";
import styles from "./ImportExport.module.css";

type Props = { slug: string; prefix: string; counts: Record<FileKind, number>; columns: Record<FileKind, readonly string[]> };

const file = (k: FileKind) => `${k}.csv`;
const ORDER: FileKind[] = ["units", "roles", "members", "routes"];
const KIND_LABEL: Record<FileKind, MessageKey> = {
  units: "settingsImport.kindUnits", roles: "settingsImport.kindRoles", members: "settingsImport.kindMembers", routes: "settingsImport.kindRoutes",
};

export function ImportExport({ prefix, slug, counts, columns }: Props) {
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [done, setDone] = useState<{ added: number; changed: number } | null>(null);
  const [pending, start] = useTransition();

  const data = () => new FormData(formRef.current ?? undefined);
  const reset = () => { formRef.current?.reset(); setResult(null); setError(null); setDone(null); };

  const check = () =>
    start(async () => {
      setDone(null);
      const r = await checkImportAction(slug, data());
      setError(r.ok ? null : r.error);
      setResult(r.ok ? r.result : null);
    });
  const apply = () =>
    start(async () => {
      const r = await applyImportAction(slug, data());
      if (r.ok) {
        const sum = Object.values(r.applied).reduce((a, x) => ({ added: a.added + x.added, changed: a.changed + x.changed }), { added: 0, changed: 0 });
        formRef.current?.reset();
        setResult(null);
        setError(null);
        setDone(sum);
      } else {
        setError(r.error);
        if (r.errors) setResult((old) => (old ? { ...old, ok: false, errors: r.errors ?? old.errors } : old));
      }
    });

  const plan = result?.plan;
  const rows = plan ? Object.values(plan.rows).reduce((a, n) => a + (n ?? 0), 0) : 0;
  const sameN = plan ? Object.values(plan.same).reduce((a, n) => a + n, 0) : 0;
  const added = plan ? [...plan.units, ...plan.roles, ...plan.members, ...plan.routes].filter((x) => x.op === "add").length : 0;
  const changed = plan ? [...plan.units, ...plan.roles, ...plan.members, ...plan.routes].filter((x) => x.op === "change").length : 0;
  const errorRows = result ? new Set(result.errors.map((e) => `${e.file}:${e.line}`)).size : 0;
  const stepNow = done ? 3 : result ? 2 : 1;

  return (
    <div className={styles.wrap}>
      <section className={styles.card} aria-labelledby="imp-h">
        <h2 id="imp-h" className={styles.title}>{t("settingsImport.importTitle")}</h2>
        <ol className={styles.steps}>
          {(["stepUpload", "stepCheck", "stepApply"] as const).map((s, i) => (
            <li key={s} aria-current={stepNow === i + 1 ? "step" : undefined} className={stepNow === i + 1 ? styles.now : stepNow > i + 1 ? styles.past : undefined}>
              {t(`settingsImport.${s}`)}
            </li>
          ))}
        </ol>
        <form ref={formRef} className={styles.form} onSubmit={(e) => { e.preventDefault(); check(); }}>
          {ORDER.map((k) => (
            <label key={k} className={styles.file}>
              <span>{t(KIND_LABEL[k])} <code className={styles.key}>{file(k)}</code></span>
              <input type="file" name={k} accept=".csv,text/csv" onChange={() => { setResult(null); setDone(null); }} aria-label={t(KIND_LABEL[k])} />
              <span className="nh-hint">{columns[k].join(", ")}</span>
            </label>
          ))}
          <p className="nh-hint">{t("settingsImport.dropHint")} {t("settingsImport.orderHint")}</p>
          <div className={styles.buttons}>
            <button type="submit" className="nh-btn nh-btn-primary" disabled={pending}>{t("settingsImport.check")}</button>
            {(result || done) && <button type="button" className="nh-btn nh-btn-ghost" onClick={reset}>{t("settingsImport.uploadFixed")}</button>}
          </div>
        </form>

        {error && <p role="alert" className={styles.error}>{t(error)}</p>}

        {done && (
          <p role="status" className={styles.ok}>
            {t("settingsImport.applied", done)}{" "}
            <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={reset}>{t("settingsImport.importNext")}</button>
          </p>
        )}

        {result && plan && (
          <div className={styles.result}>
            <p>{t("settingsImport.summary", { rows, ready: added + changed, added, changed, errors: errorRows, same: sameN })}</p>
            {ORDER.filter((k) => plan.ignored[k]?.length).map((k) => (
              <p key={k} className="nh-hint">{t("settingsImport.ignored", { file: file(k), names: (plan.ignored[k] ?? []).join(", ") })}</p>
            ))}
            {result.errors.length > 0 && (
              <>
                <h3 className={styles.sub}>{t("settingsImport.errorsTitle")} ({result.errors.length})</h3>
                <ul className={styles.errors}>
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      <span className={styles.where}>
                        {e.line > 0 ? t("settingsImport.errorAt", { file: file(e.file), line: e.line, column: e.column || "-" }) : t("settingsImport.errorFile", { file: file(e.file) })}
                      </span>
                      <span>{t(e.message, e.values)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className={styles.buttons}>
              <button type="button" className="nh-btn nh-btn-primary" disabled={pending || !result.ok || added + changed === 0} onClick={apply}>
                {t("settingsImport.apply")}
              </button>
            </div>
            <p className="nh-hint">
              {!result.ok ? t("settingsImport.applyHint") : added + changed === 0 ? t("settingsImport.nothingToDo") : t("settingsImport.applyReady")}
            </p>
          </div>
        )}
      </section>

      <section className={styles.card} aria-labelledby="exp-h">
        <h2 id="exp-h" className={styles.title}>{t("settingsImport.exportTitle")}</h2>
        <ul className={styles.exports}>
          {ORDER.map((k) => (
            <li key={k}>
              <span>{t(KIND_LABEL[k])}</span>
              <code className={styles.key}>{file(k)}</code>
              <span className="nh-hint">{t("settingsImport.rowsCount", { count: counts[k] })}</span>
              <a className="nh-btn nh-btn-ghost nh-btn-sm" href={`${prefix}/settings/import-export/export/${k}`} download>{t("settingsImport.download")}</a>
            </li>
          ))}
        </ul>
        <p className="nh-hint">{t("settingsImport.exportNote")}</p>
      </section>
    </div>
  );
}
