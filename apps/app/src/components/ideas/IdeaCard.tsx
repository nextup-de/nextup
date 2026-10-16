"use client";
// The idea as the receiver's inbox will show it (Claude Design handoff "Publish Preview", the white card):
// title, description, a requested meeting, who it was raised with, who it affects, the context with its
// labelled lines, and the attachments - each part the author's to edit in place, the missing ones
// addable. The publish preview (PublishPreview.tsx) and the Idea view (RaiseSheets.tsx IdeaSheet) both
// show it, so the idea looks and edits the same in both. `locked`: published, read only. Props in.
import { useState } from "react";
import { initials } from "@/features/ideas/raise";
import type { Meeting } from "./raisePreview";
import s from "./PublishPreview.module.css";

// The author's words as the case will carry them.
export type LookPrompt = { label: string; text: string; custom?: boolean };
export type Look = { title: string; description: string; context: string; prompts: LookPrompt[] };

export type IdeaCardProps = {
  author: string; // left out of the colleagues to add
  look: Look; onLook: (l: Look) => void;
  onTitleDone?: () => void; // the title field lost the focus
  meet: Meeting | null; onMeet: (m: Meeting | null) => void;
  coll: string[]; people: readonly { name: string; role: string }[]; onColl: (names: string[]) => void;
  affected: string[]; depts: readonly string[]; onAffected: (names: string[]) => void;
  files: readonly { id: string; name: string }[]; onAddFiles: (list: FileList | null) => void; onRemoveFile: (id: string) => void;
  locked?: boolean;
};

const PRESETS = ["Impact", "Who’s blocked", "Already tried", "Trial", "Deadline"];
const DURS = ["15 min", "30 min", "45 min"], WHENS = ["this week", "next week", "no rush"];
const next = (all: string[], v: string) => all[(all.indexOf(v) + 1) % all.length];
const toneOf = (ext: string) => (ext === "XLSX" || ext === "CSV" ? "sheet" : ext === "PDF" ? "pdf" : /^(PNG|JPG|JPEG)$/.test(ext) ? "image" : undefined);

export const Plus = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
const Remove = ({ onClick, what }: { onClick: () => void; what: string }) => (
  <button type="button" className={s.x} onClick={onClick} title="Remove" aria-label={"Remove " + what}>
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
  </button>
);

export function IdeaCard(p: IdeaCardProps) {
  const { look, onLook, locked = false } = p;
  const [tray, setTray] = useState<"coll" | "aff" | null>(null);
  const set = (patch: Partial<Look>) => onLook({ ...look, ...patch });
  const setPrompt = (i: number, patch: Partial<LookPrompt>) => set({ prompts: look.prompts.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const used = look.prompts.map((x) => x.label);
  const collOpts = p.people.filter((x) => x.name !== p.author && !p.coll.includes(x.name)).slice(0, 10);
  const affOpts = p.depts.filter((d) => !p.affected.includes(d));
  const toggle = (t: "coll" | "aff") => setTray((x) => (x === t ? null : t));

  return (
    <div className={s.card} data-locked={locked || undefined}>
      <textarea className={s.title} rows={1} value={look.title} readOnly={locked} onChange={(e) => set({ title: e.target.value })} onBlur={p.onTitleDone} placeholder="Give it a title" aria-label="Title" />
      <textarea className={s.desc} rows={2} value={look.description} readOnly={locked} onChange={(e) => set({ description: e.target.value })} placeholder="What’s the idea?" aria-label="Description" />

      <div className={s.pair}>
        <div className={s.cell}>
          <span className={s.label}>Requested meeting</span>
          {p.meet ? (
            <div className={s.meet}>
              <span className={s.meetIcon} aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0062cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>
              </span>
              <span className={s.meetText}>
                <button type="button" className={s.meetDur} disabled={locked} onClick={() => p.meet && p.onMeet({ ...p.meet, dur: next(DURS, p.meet.dur) })} title="Change length">{p.meet.dur} meeting</button>
                <button type="button" className={s.meetWhen} disabled={locked} onClick={() => p.meet && p.onMeet({ ...p.meet, when: next(WHENS, p.meet.when) })} title="Change when">{p.meet.when.replace(/^./, (c) => c.toUpperCase())}</button>
              </span>
              <Remove onClick={() => p.onMeet(null)} what="the meeting" />
            </div>
          ) : locked ? <span className={s.none}>None</span> : (
            <button type="button" className={s.dashed} data-solo="" onClick={() => p.onMeet({ dur: "15 min", when: "this week" })}><Plus />Request a meeting</button>
          )}
        </div>
        <div className={s.cell}>
          <span className={s.label}>Raised with</span>
          <div className={s.chips}>
            {p.coll.map((n) => (
              <span key={n} className={s.person}><span className={s.personIni} aria-hidden="true">{initials(n)}</span>{n}<Remove onClick={() => p.onColl(p.coll.filter((x) => x !== n))} what={n} /></span>
            ))}
            {locked && !p.coll.length && <span className={s.none}>No one</span>}
            <button type="button" className={s.dashed} onClick={() => toggle("coll")} aria-expanded={tray === "coll"}><Plus />Add</button>
          </div>
          {tray === "coll" && !locked && (
            <div className={s.tray}>
              {collOpts.map((o) => <button key={o.name} type="button" className={s.trayBtn} title={o.role} onClick={() => p.onColl([...p.coll, o.name])}><Plus />{o.name}</button>)}
            </div>
          )}
        </div>
      </div>

      <div className={s.section}>
        <span className={s.label}>Affects</span>
        <div className={s.chips}>
          {p.affected.map((a) => <span key={a} className={s.dept}>{a}<Remove onClick={() => p.onAffected(p.affected.filter((x) => x !== a))} what={a} /></span>)}
          {locked && !p.affected.length && <span className={s.none}>No teams named</span>}
          <button type="button" className={s.dashed} onClick={() => toggle("aff")} aria-expanded={tray === "aff"}><Plus />Add</button>
        </div>
        {tray === "aff" && !locked && (
          <div className={s.tray}>
            {affOpts.map((d) => <button key={d} type="button" className={s.trayBtn} onClick={() => p.onAffected([...p.affected, d])}><Plus />{d}</button>)}
          </div>
        )}
      </div>

      <div className={s.section}>
        <span className={s.label}>Context</span>
        {(!locked || look.context.trim()) && <textarea className={s.ctx} rows={2} value={look.context} readOnly={locked} onChange={(e) => set({ context: e.target.value })} placeholder="What’s happening today, what you’ve seen, what you’d try first" aria-label="Context" />}
        {look.prompts.length > 0 && (
          <div className={s.prompts}>
            {look.prompts.map((x, i) => (
              <div key={i} className={s.prompt}>
                {x.custom && !locked
                  ? <input className={s.promptLabelEdit} value={x.label} onChange={(e) => setPrompt(i, { label: e.target.value })} autoFocus={!x.label && i === look.prompts.length - 1} placeholder="Label" aria-label="Label" />
                  : <span className={s.promptLabel}>{x.label}</span>}
                <textarea className={s.promptText} rows={1} value={x.text} readOnly={locked} onChange={(e) => setPrompt(i, { text: e.target.value })} placeholder="Add a line" aria-label={x.label || "Line"} />
                <span className={s.promptX}><Remove onClick={() => set({ prompts: look.prompts.filter((_, k) => k !== i) })} what={x.label || "this line"} /></span>
              </div>
            ))}
          </div>
        )}
        {locked && !look.context.trim() && !look.prompts.length && <span className={s.none}>Nothing added</span>}
        {!locked && (
          <div className={s.chips}>
            {PRESETS.filter((l) => !used.includes(l)).map((label) => (
              <button key={label} type="button" className={s.dashed} onClick={() => set({ prompts: [...look.prompts, { label, text: "" }] })}><Plus />{label}</button>
            ))}
            <button type="button" className={s.dashed} onClick={() => set({ prompts: [...look.prompts, { label: "", text: "", custom: true }] })}><Plus />Custom</button>
          </div>
        )}
      </div>

      <div className={s.section}>
        <span className={s.label}>Attachments</span>
        <div className={s.files}>
          {p.files.map((f) => {
            const ext = (f.name.split(".").pop() || "file").slice(0, 4).toUpperCase();
            return (
              <span key={f.id} className={s.file}>
                <span className={s.ext} data-tone={toneOf(ext)}>{ext}</span>
                <span className={s.who}><span className={s.fileName}>{f.name}</span><span className={s.fileSub}>Attached</span></span>
                <Remove onClick={() => p.onRemoveFile(f.id)} what={f.name} />
              </span>
            );
          })}
          {locked && !p.files.length && <span className={s.none}>None</span>}
          <label className={s.addFile}><Plus />Add file<input className={s.hidden} type="file" multiple onChange={(e) => { p.onAddFiles(e.target.files); e.target.value = ""; }} /></label>
        </div>
      </div>
    </div>
  );
}
