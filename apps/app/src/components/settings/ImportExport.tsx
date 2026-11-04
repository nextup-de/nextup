"use client";
// Settings -> Import and export (API D13): choose up to four CSV files, check them, read every error, apply all
// or nothing; and the four files out again. The server checks and writes (server/actions/settings/import-export.ts).
import { useRef, useState, useTransition } from "react";
import { Banner, SectionCard } from "@/components/ui/elements";
import type { CheckResult, FileKind } from "@/features/api/structure-csv";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { applyImportAction, checkImportAction } from "@/server/actions/settings/import-export";
import s from "./settings.module.css";
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
    <div className={s.page}>
      <SectionCard name="import" title={t("settingsImport.importTitle")}>
        <ol className={styles.steps}>
          {(["stepUpload", "stepCheck", "stepApply"] as const).map((step, i) => (
            <li key={step} aria-current={stepNow === i + 1 ? "step" : undefined} className={stepNow === i + 1 ? styles.now : stepNow > i + 1 ? styles.past : undefined}>
              {t(`settingsImport.${step}`)}
            </li>
          ))}
        </ol>
        <form ref={formRef} className={styles.form} onSubmit={(e) => { e.preventDefault(); check(); }}>
          {ORDER.map((k) => (
            <label key={k} className={styles.file}>
              <span className={styles.kind}>{t(KIND_LABEL[k])} <code className={styles.key}>{file(k)}</code></span>
              <input className={styles.picker} type="file" name={k} accept=".csv,text/csv" onChange={() => { setResult(null); setDone(null); }} aria-label={t(KIND_LABEL[k])} />
              <span className={s.help}>{columns[k].join(", ")}</span>
            </label>
          ))}
          <p className={s.cardHint}>{t("settingsImport.dropHint")} {t("settingsImport.orderHint")}</p>
          <div className={styles.buttons}>
            <button type="submit" className={s.save} disabled={pending}>{t("settingsImport.check")}</button>
            {(result || done) && <button type="button" className={s.soft} onClick={reset}>{t("settingsImport.uploadFixed")}</button>}
          </div>
        </form>

        {error && <Banner tone="error">{t(error)}</Banner>}

        {done && (
          <div role="status">
            <Banner tone="info" action={<button type="button" className={s.soft} onClick={reset}>{t("settingsImport.importNext")}</button>}>
              {t("settingsImport.applied", done)}
            </Banner>
          </div>
        )}

        {result && plan && (
          <div className={styles.result}>
            <p className={styles.summary}>{t("settingsImport.summary", { rows, ready: added + changed, added, changed, errors: errorRows, same: sameN })}</p>
            {ORDER.filter((k) => plan.ignored[k]?.length).map((k) => (
              <p key={k} className={s.cardHint}>{t("settingsImport.ignored", { file: file(k), names: (plan.ignored[k] ?? []).join(", ") })}</p>
            ))}
            {result.errors.length > 0 && (
              <>
                <h3 className={s.subLabel}>{t("settingsImport.errorsTitle")} ({result.errors.length})</h3>
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
              <button type="button" className={s.save} disabled={pending || !result.ok || added + changed === 0} onClick={apply}>
                {t("settingsImport.apply")}
              </button>
            </div>
            <p className={s.cardHint}>
              {!result.ok ? t("settingsImport.applyHint") : added + changed === 0 ? t("settingsImport.nothingToDo") : t("settingsImport.applyReady")}
            </p>
          </div>
        )}
      </SectionCard>

      <SectionCard name="export" title={t("settingsImport.exportTitle")} hint={t("settingsImport.exportNote")}>
        <ul className={s.lines}>
          {ORDER.map((k) => (
            <li key={k} className={`${s.line} ${styles.exportLine}`}>
              <span className={styles.exportName}>
                <strong>{t(KIND_LABEL[k])}</strong>
                <code className={styles.key}>{file(k)}</code>
              </span>
              <span className={s.mute}>{t("settingsImport.rowsCount", { count: counts[k] })}</span>
              <a className={s.soft} href={`${prefix}/settings/import-export/export/${k}`} download>{t("settingsImport.download")}</a>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
