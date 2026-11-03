"use client";
// The idea as the receiver's inbox will show it (Claude Design handoff "Publish Preview", the white card):
// title, description, who it affects, the context with its
// labelled lines, and the attachments - each part the author's to edit in place, the missing ones
// addable. The publish preview (PublishPreview.tsx) and the Idea view (RaiseSheets.tsx IdeaSheet) both
// show it, so the idea looks and edits the same in both. `locked`: published, read only. Props in.
import { useState } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import s from "./PublishPreview.module.css";

// The author's words as the case will carry them.
export type LookPrompt = { label: string; text: string; custom?: boolean };
export type Look = { title: string; description: string; context: string; prompts: LookPrompt[] };

export type IdeaCardProps = {
  look: Look; onLook: (l: Look) => void;
  onTitleDone?: () => void; // the title field lost the focus
  affected: string[]; depts: readonly string[]; onAffected: (names: string[]) => void;
  files: readonly { id: string; name: string }[]; onAddFiles: (list: FileList | null) => void; onRemoveFile: (id: string) => void;
  locked?: boolean;
};

const PRESETS: MessageKey[] = ["ideas.cardPresetImpact", "ideas.cardPresetBlocked", "ideas.cardPresetTried", "ideas.cardPresetTrial", "ideas.cardPresetDeadline"];
const toneOf = (ext: string) => (ext === "XLSX" || ext === "CSV" ? "sheet" : ext === "PDF" ? "pdf" : /^(PNG|JPG|JPEG)$/.test(ext) ? "image" : undefined);

export const Plus = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
const Remove = ({ onClick, what }: { onClick: () => void; what: string }) => {
  const t = useT();
  return (
  <button type="button" className={s.x} onClick={onClick} title={t("ideas.cardRemove")} aria-label={t("ideas.cardRemoveWhat", { what })}>
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
  </button>
  );
};

export function IdeaCard(p: IdeaCardProps) {
  const t = useT();
  const { look, onLook, locked = false } = p;
  const [tray, setTray] = useState<"aff" | null>(null);
  const set = (patch: Partial<Look>) => onLook({ ...look, ...patch });
  const setPrompt = (i: number, patch: Partial<LookPrompt>) => set({ prompts: look.prompts.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const used = look.prompts.map((x) => x.label);
  const affOpts = p.depts.filter((d) => !p.affected.includes(d));
  const toggle = (k: "aff") => setTray((x) => (x === k ? null : k));
  const presets = PRESETS.map((k) => ({ k, label: t(k) }));

  return (
    <div className={s.card} data-locked={locked || undefined}>
      <textarea className={s.title} rows={1} value={look.title} readOnly={locked} onChange={(e) => set({ title: e.target.value })} onBlur={p.onTitleDone} placeholder={t("ideas.cardTitlePlaceholder")} aria-label={t("ideas.cardTitle")} />
      <textarea className={s.desc} rows={2} value={look.description} readOnly={locked} onChange={(e) => set({ description: e.target.value })} placeholder={t("ideas.cardDescPlaceholder")} aria-label={t("ideas.cardDescription")} />

      <div className={s.section}>
        <span className={s.label}>{t("ideas.cardAffects")}</span>
        <div className={s.chips}>
          {p.affected.map((a) => <span key={a} className={s.dept}>{a}<Remove onClick={() => p.onAffected(p.affected.filter((x) => x !== a))} what={a} /></span>)}
          {locked && !p.affected.length && <span className={s.none}>{t("ideas.cardNoTeams")}</span>}
          <button type="button" className={s.dashed} onClick={() => toggle("aff")} aria-expanded={tray === "aff"}><Plus />{t("ideas.cardAdd")}</button>
        </div>
        {tray === "aff" && !locked && (
          <div className={s.tray}>
            {affOpts.map((d) => <button key={d} type="button" className={s.trayBtn} onClick={() => p.onAffected([...p.affected, d])}><Plus />{d}</button>)}
          </div>
        )}
      </div>

      <div className={s.section}>
        <span className={s.label}>{t("ideas.cardContext")}</span>
        {(!locked || look.context.trim()) && <textarea className={s.ctx} rows={2} value={look.context} readOnly={locked} onChange={(e) => set({ context: e.target.value })} placeholder={t("ideas.cardContextPlaceholder")} aria-label={t("ideas.cardContext")} />}
        {look.prompts.length > 0 && (
          <div className={s.prompts}>
            {look.prompts.map((x, i) => (
              <div key={i} className={s.prompt}>
                {x.custom && !locked
                  ? <input className={s.promptLabelEdit} value={x.label} onChange={(e) => setPrompt(i, { label: e.target.value })} autoFocus={!x.label && i === look.prompts.length - 1} placeholder={t("ideas.cardLabel")} aria-label={t("ideas.cardLabel")} />
                  : <span className={s.promptLabel}>{x.label}</span>}
                <textarea className={s.promptText} rows={1} value={x.text} readOnly={locked} onChange={(e) => setPrompt(i, { text: e.target.value })} placeholder={t("ideas.cardAddLine")} aria-label={x.label || t("ideas.cardLine")} />
                <span className={s.promptX}><Remove onClick={() => set({ prompts: look.prompts.filter((_, k) => k !== i) })} what={x.label || t("ideas.cardThisLine")} /></span>
              </div>
            ))}
          </div>
        )}
        {locked && !look.context.trim() && !look.prompts.length && <span className={s.none}>{t("ideas.cardNothingAdded")}</span>}
        {!locked && (
          <div className={s.chips}>
            {presets.filter((x) => !used.includes(x.label)).map(({ k, label }) => (
              <button key={k} type="button" className={s.dashed} onClick={() => set({ prompts: [...look.prompts, { label, text: "" }] })}><Plus />{label}</button>
            ))}
            <button type="button" className={s.dashed} onClick={() => set({ prompts: [...look.prompts, { label: "", text: "", custom: true }] })}><Plus />{t("ideas.cardCustom")}</button>
          </div>
        )}
      </div>

      <div className={s.section}>
        <span className={s.label}>{t("ideas.cardAttachments")}</span>
        <div className={s.files}>
          {p.files.map((f) => {
            const ext = (f.name.split(".").pop() || "file").slice(0, 4).toUpperCase();
            return (
              <span key={f.id} className={s.file}>
                <span className={s.ext} data-tone={toneOf(ext)}>{ext}</span>
                <span className={s.who}><span className={s.fileName}>{f.name}</span><span className={s.fileSub}>{t("ideas.cardAttached")}</span></span>
                <Remove onClick={() => p.onRemoveFile(f.id)} what={f.name} />
              </span>
            );
          })}
          {locked && !p.files.length && <span className={s.none}>{t("ideas.cardNone")}</span>}
          <label className={s.addFile}><Plus />{t("ideas.cardAddFile")}<input className={s.hidden} type="file" multiple onChange={(e) => { p.onAddFiles(e.target.files); e.target.value = ""; }} /></label>
        </div>
      </div>
    </div>
  );
}
