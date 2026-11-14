"use client";
import type { ReactNode } from "react";
import type { SaveState } from "@/features/projects/tool-content";
import { useT } from "@/i18n/client";
import s from "./content.module.css";

type Status = { reloading: boolean; state: SaveState; remaining: number; changedBy?: string; flush: () => Promise<boolean>; showTheirs: () => void; keepMine: () => void };
export function ContentEditor({ save, children }: { save: Status; children: ReactNode }) {
  const t = useT();
  return <div className={s.editor} onBlur={() => { void save.flush(); }}>
    {children}
    <div className={s.status} role="status" aria-live="polite">
      {save.state === "saving" && t("projectPages.saving")}
      {save.state === "saved" && t("projectPages.saved")}
      {save.state === "dirty" && t("projectHub.docSaveDirty")}
      {save.state === "failed" && <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => { void save.flush(); }}>{t("projectPages.notSaved")}</button>}
      {save.state === "stale" && <div className={s.conflict}>
        <span>{t("projectHub.docSaveChanged", { name: save.changedBy || t("projectHub.docSaveSomeone") })}</span>
        <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={save.reloading} onClick={save.showTheirs}>{t("projectHub.docSaveShowTheirs")}</button>
        <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={save.reloading} onClick={save.keepMine}>{t("projectHub.docSaveKeepMine")}</button>
      </div>}
      {save.remaining < 1000 && <span>{t(save.remaining < 0 ? "projectHub.docSaveTooLong" : "projectHub.docSaveRemaining", { count: Math.abs(save.remaining) })}</span>}
    </div>
  </div>;
}
