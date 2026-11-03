"use client";
// Set the baseline (MET D12, D19): the period every number is compared with, plus optional imported values from a
// CSV with the source named. Saved through saveBaselineAction, which rechecks that the viewer is a manager.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { baselineFromCsv } from "@/features/metrics/baseline";
import type { Baseline } from "@/features/metrics/types";
import { useT } from "@/i18n/client";
import { saveBaselineAction } from "@/server/actions/metrics";
import s from "./DashboardBoard.module.css";

const CSV_HEADER = "metric;value"; // the file format's header, not a label
type Reason = "header" | "key" | "value";
const REASON = { header: "metrics.blReasonHeader", key: "metrics.blReasonKey", value: "metrics.blReasonValue" } as const;

export function BaselineDialog({ slug, demoClock, current, onClose, onSaved }: {
  slug: string; demoClock: boolean; current: Baseline | null; onClose: () => void; onSaved: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [from, setFrom] = useState(demoClock ? String(current?.fromDay ?? "") : current?.fromDate ?? "");
  const [to, setTo] = useState(demoClock ? String(current?.toDay ?? "") : current?.toDate ?? "");
  const [csv, setCsv] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const csvLine = (line: number, reason: Reason) => t("metrics.blErrCsv", { line, reason: t(REASON[reason]) });
  const parsed = csv.trim() === "" ? null : baselineFromCsv(csv);
  const csvError = parsed && "error" in parsed ? csvLine(parsed.line, parsed.error) : null;

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setCsv(await file.text());
    if (source === "") setSource(file.name);
  };

  const save = async () => {
    setError(null);
    const form = new FormData();
    form.set(demoClock ? "fromDay" : "fromDate", from);
    form.set(demoClock ? "toDay" : "toDate", to);
    if (csv.trim() !== "") { form.set("csv", csv); form.set("source", source); }
    setBusy(true);
    try {
      const r = await saveBaselineAction(slug, form);
      if ("ok" in r) { onSaved(); router.refresh(); return; }
      if (r.error === "csv") setError(csvLine(r.line, r.reason));
      else setError(t(r.error === "period" ? "metrics.blErrPeriod" : r.error === "source" ? "metrics.blErrSource" : r.error === "too-large" ? "metrics.blErrTooLarge" : "metrics.blErrForbidden"));
    } catch {
      setError(t("metrics.blErrFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={s.closeAll} onClick={onClose} aria-hidden="true" />
      <div className={s.dialog} role="dialog" aria-modal="true" aria-label={t("metrics.blTitle")} data-testid="dashboard-baseline-dialog">
        <h3 className={s.cardTitle}>{t("metrics.blTitle")}</h3>
        <p className={s.note}>{t("metrics.blIntro")}</p>
        <div className={s.fieldRow}>
          <label className="nh-field">
            <span className="nh-label">{t(demoClock ? "metrics.blFromDay" : "metrics.blFrom")}</span>
            <input className="nh-input" type={demoClock ? "number" : "date"} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="nh-field">
            <span className="nh-label">{t(demoClock ? "metrics.blToDay" : "metrics.blTo")}</span>
            <input className="nh-input" type={demoClock ? "number" : "date"} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <label className="nh-field">
          <span className="nh-label">{t("metrics.blCsv")}</span>
          <textarea className="nh-input nh-textarea" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={CSV_HEADER} spellCheck={false} />
          <span className="nh-hint">{t("metrics.blCsvHint")}</span>
        </label>
        <input type="file" accept=".csv,text/csv,text/plain" aria-label={t("metrics.blFile")} onChange={(e) => void loadFile(e.target.files?.[0])} />
        {csv.trim() !== "" && (
          <label className="nh-field">
            <span className="nh-label">{t("metrics.blSource")}</span>
            <input className="nh-input" value={source} onChange={(e) => setSource(e.target.value)} />
          </label>
        )}
        {(csvError ?? error) && <div className="nh-error" role="alert">{csvError ?? error}</div>}
        <div className={s.dialogActions}>
          <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={onClose}>{t("metrics.blCancel")}</button>
          <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" disabled={busy || csvError !== null} onClick={() => void save()} data-testid="dashboard-baseline-save">{t("metrics.blSave")}</button>
        </div>
      </div>
    </>
  );
}
