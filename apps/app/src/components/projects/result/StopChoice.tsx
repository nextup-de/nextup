"use client";
// Stop the project (plan RES, D24): the reason, and what happens to the idea behind it - kept archived (the default) or returned to its desk. In server
// mode the stop and the returns are one server operation (stopProjectAction) and the page waits for its result before it says anything; in the demo
// the acts stop and reopen run in order. A retry after a failure sends the same request id, so nothing is written twice.
import { useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { ResultView } from "@/features/projects/result-view";
import type { StopPick } from "@/features/projects/stop-choice";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { stopProjectAction } from "@/server/actions/project-stop";
import { useRights } from "../parts";
import styles from "./Result.module.css";

const newRequestId = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "r" + Math.random().toString(36).slice(2) + Date.now().toString(36));

export function StopChoice({ p, stop }: { p: ReducedProject; stop: NonNullable<ResultView["stop"]> }) {
  const { act, S, serverMode, tenant, showToast } = useDemo();
  const t = useT();
  const r = useRights(p);
  const [why, setWhy] = useState<string | null>(null);
  const [pick, setPick] = useState<StopPick>("keep");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The id of this attempt: the same body keeps it (a retry), a changed body gets a new one.
  const attempt = useRef<{ key: string; id: string } | null>(null);
  if (!stop.can) return null;
  if (why === null) return <button type="button" className={styles.quiet} onClick={() => setWhy("")}>{t("projects.stopProject")}</button>;

  const text = why.trim();
  const reopenable = r.stopReturn;
  const close = () => { setWhy(null); setPick("keep"); setError(null); attempt.current = null; };
  const submit = async () => {
    if (!text || busy) return;
    const chosen: StopPick = reopenable ? pick : "keep";
    const verdict = r.check("project.stopped", { why: text });
    if (!verdict.ok) { showToast(verdict.error); return; }
    const key = text + "|" + chosen;
    if (attempt.current?.key !== key) attempt.current = { key, id: newRequestId() };
    setBusy(true);
    setError(null);
    try {
      if (serverMode) {
        const res = await stopProjectAction({ slug: tenant.slug, projectId: p.id, why: text, pick: chosen, requestId: attempt.current.id });
        if (!res.ok) { setError(res.error); return; }
        for (const id of res.skipped) showToast(t("projectResult.stopNotReturned", { label: S.cases.find((c) => c.id === id)?.title ?? id }));
      } else {
        const res = await act.project.stopAndReturn(p.id, text, chosen);
        if (!res.ok) { setError(t("projectResult.stopFailed", { error: res.error })); return; }
      }
      close();
    } catch (e) {
      setError(t("projectResult.stopFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.sheet} aria-label={t("projectResult.stopSheetLabel")} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <label className={styles.field}>
        <span className={styles.label}>{t("projects.stopWhy")}</span>
        <input className={`nh-input ${styles.input}`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder={t("projects.stopWhy")} aria-label={t("projects.stopWhy")} autoFocus />
      </label>
      {reopenable && (
        <fieldset className={styles.step}>
          <legend className={styles.label}>{t("projectResult.stopPickLabel")}</legend>
          <label className={styles.choice}>
            <input type="radio" name={"stop-pick-" + p.id} checked={pick === "keep"} onChange={() => setPick("keep")} />
            {t("projectResult.stopKeep")}
          </label>
          <label className={styles.choice}>
            <input type="radio" name={"stop-pick-" + p.id} checked={pick === "return"} onChange={() => setPick("return")} />
            {t("projectResult.stopReturn")}
          </label>
          {pick === "return" && <p className={styles.hint}>{t("projectResult.stopReturnHint")}</p>}
        </fieldset>
      )}
      {error !== null && <p className={styles.error} role="alert">{error}</p>}
      <span className={styles.row}>
        <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!text || busy}>{busy ? t("projectResult.stopWorking") : t("projects.stopIt")}</button>
        <button type="button" className={styles.quiet} onClick={close} disabled={busy}>{t("common.cancel")}</button>
      </span>
    </form>
  );
}
