"use client";
// "Last look before it goes out" (Claude Design handoff "Publish Preview"): what "Publish" opens before
// NextUp looks for a receiver. The idea laid out as the receiver's inbox will show it, every part the
// author wrote editable in place and the missing ones addable; NextUp's analysis only as a locked note.
// "Looks good · finalize" goes on to the final document (RaiseFinal.tsx), whose "Send idea" opens the receiver suggestions (RaisePublish.tsx).
// "Export" (Claude Design handoff "Export button", in place of Back) opens the export view (RaiseExport.tsx). Props in.
import { useEffect, useRef, useState } from "react";
import { initials } from "@/features/ideas/raise";
import type { Meeting } from "./raisePreview";
import s from "./PublishPreview.module.css";

// The author's words as the case will carry them: kept per draft by the raise page.
export type LookPrompt = { label: string; text: string; custom?: boolean };
export type Look = { title: string; description: string; context: string; prompts: LookPrompt[] };

const PRESETS = ["Impact", "Who’s blocked", "Already tried", "Trial", "Deadline"];
const DURS = ["15 min", "30 min", "45 min"], WHENS = ["this week", "next week", "no rush"];
const next = (all: string[], v: string) => all[(all.indexOf(v) + 1) % all.length];
const toneOf = (ext: string) => (ext === "XLSX" || ext === "CSV" ? "sheet" : ext === "PDF" ? "pdf" : /^(PNG|JPG|JPEG)$/.test(ext) ? "image" : undefined);

const Plus = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
const Remove = ({ onClick, what }: { onClick: () => void; what: string }) => (
  <button type="button" className={s.x} onClick={onClick} title="Remove" aria-label={"Remove " + what}>
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
  </button>
);

// The second between "Publish" and the last look: the same window, its parts as grey placeholders while NextUp lays it out.
export function PreviewLoading() {
  return (
    <div className={s.wrap}>
      <div className={s.scrim} aria-hidden="true" />
      <div className={s.panel} role="dialog" aria-modal="true" aria-label="Preparing the preview" aria-busy="true">
        <div className={s.head}>
          <div className={s.headText}>
            <span className={s.kicker}>Preview · preparing</span>
            <h2 className={s.heading}>Laying out how it lands in their inbox…</h2>
          </div>
        </div>
        <div className={s.skelBody} aria-hidden="true">
          <span className={s.skel} data-w="70" data-h="title" />
          <span className={s.skel} data-w="100" />
          <span className={s.skel} data-w="92" />
          <span className={s.skel} data-w="60" />
          <div className={s.skelRow}><span className={s.skel} data-h="box" /><span className={s.skel} data-h="box" /></div>
          <span className={s.skel} data-w="40" />
          <span className={s.skel} data-w="100" data-h="block" />
        </div>
        <div className={s.foot}><span className={s.skel} data-w="30" /><span className={s.skelBtn} /></div>
      </div>
    </div>
  );
}

export function PublishPreview(p: {
  author: string; // left out of the colleagues to add
  look: Look; onLook: (l: Look) => void;
  meet: Meeting | null; onMeet: (m: Meeting | null) => void;
  coll: string[]; people: readonly { name: string; role: string }[]; onColl: (names: string[]) => void;
  affected: string[]; depts: readonly string[]; onAffected: (names: string[]) => void;
  files: readonly { id: string; name: string }[]; onAddFiles: (list: FileList | null) => void; onRemoveFile: (id: string) => void;
  aiLine: string;
  onClose: () => void; onConfirm: () => void;
  onExport: () => void; // the export view (RaiseExport.tsx): the A4 page, copied, saved as .doc or PDF
}) {
  const { look, onLook } = p;
  const [tray, setTray] = useState<"coll" | "aff" | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const ok = !!look.title.trim() && !!look.description.trim();
  const set = (patch: Partial<Look>) => onLook({ ...look, ...patch });
  const setPrompt = (i: number, patch: Partial<LookPrompt>) => set({ prompts: look.prompts.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const used = look.prompts.map((x) => x.label);
  const collOpts = p.people.filter((x) => x.name !== p.author && !p.coll.includes(x.name)).slice(0, 10);
  const affOpts = p.depts.filter((d) => !p.affected.includes(d));
  const toggle = (t: "coll" | "aff") => setTray((x) => (x === t ? null : t));
  const { onClose } = p;
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  // Opened: the window takes the focus once; Escape closes it.
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={s.wrap}>
      <button type="button" className={s.scrim} onClick={onClose} aria-label="Close the preview" tabIndex={-1} />
      <div ref={panel} className={s.panel} role="dialog" aria-modal="true" aria-labelledby="pv-heading" tabIndex={-1}>
        <div className={s.head}>
          <div className={s.headText}>
            <span className={s.kicker}>Preview · how it lands in their inbox</span>
            <h2 id="pv-heading" className={s.heading}>Last look before it goes out</h2>
          </div>
          <button type="button" className={s.close} onClick={onClose} title="Close" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className={s.body}>
          <div className={s.card}>
            <textarea className={s.title} rows={1} value={look.title} onChange={(e) => set({ title: e.target.value })} placeholder="Give it a title" aria-label="Title" />
            <textarea className={s.desc} rows={2} value={look.description} onChange={(e) => set({ description: e.target.value })} placeholder="What’s the idea?" aria-label="Description" />

            <div className={s.pair}>
              <div className={s.cell}>
                <span className={s.label}>Requested meeting</span>
                {p.meet ? (
                  <div className={s.meet}>
                    <span className={s.meetIcon} aria-hidden="true">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0062cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>
                    </span>
                    <span className={s.meetText}>
                      <button type="button" className={s.meetDur} onClick={() => p.meet && p.onMeet({ ...p.meet, dur: next(DURS, p.meet.dur) })} title="Change length">{p.meet.dur} meeting</button>
                      <button type="button" className={s.meetWhen} onClick={() => p.meet && p.onMeet({ ...p.meet, when: next(WHENS, p.meet.when) })} title="Change when">{p.meet.when.replace(/^./, (c) => c.toUpperCase())}</button>
                    </span>
                    <Remove onClick={() => p.onMeet(null)} what="the meeting" />
                  </div>
                ) : (
                  <button type="button" className={s.dashed} data-solo="" onClick={() => p.onMeet({ dur: "15 min", when: "this week" })}><Plus />Request a meeting</button>
                )}
              </div>
              <div className={s.cell}>
                <span className={s.label}>Raised with</span>
                <div className={s.chips}>
                  {p.coll.map((n) => (
                    <span key={n} className={s.person}><span className={s.personIni} aria-hidden="true">{initials(n)}</span>{n}<Remove onClick={() => p.onColl(p.coll.filter((x) => x !== n))} what={n} /></span>
                  ))}
                  <button type="button" className={s.dashed} onClick={() => toggle("coll")} aria-expanded={tray === "coll"}><Plus />Add</button>
                </div>
                {tray === "coll" && (
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
                <button type="button" className={s.dashed} onClick={() => toggle("aff")} aria-expanded={tray === "aff"}><Plus />Add</button>
              </div>
              {tray === "aff" && (
                <div className={s.tray}>
                  {affOpts.map((d) => <button key={d} type="button" className={s.trayBtn} onClick={() => p.onAffected([...p.affected, d])}><Plus />{d}</button>)}
                </div>
              )}
            </div>

            <div className={s.section}>
              <span className={s.label}>Context</span>
              <textarea className={s.ctx} rows={2} value={look.context} onChange={(e) => set({ context: e.target.value })} placeholder="What’s happening today, what you’ve seen, what you’d try first" aria-label="Context" />
              {look.prompts.length > 0 && (
                <div className={s.prompts}>
                  {look.prompts.map((x, i) => (
                    <div key={i} className={s.prompt}>
                      {x.custom
                        ? <input className={s.promptLabelEdit} value={x.label} onChange={(e) => setPrompt(i, { label: e.target.value })} autoFocus={!x.label && i === look.prompts.length - 1} placeholder="Label" aria-label="Label" />
                        : <span className={s.promptLabel}>{x.label}</span>}
                      <textarea className={s.promptText} rows={1} value={x.text} onChange={(e) => setPrompt(i, { text: e.target.value })} placeholder="Add a line" aria-label={x.label || "Line"} />
                      <span className={s.promptX}><Remove onClick={() => set({ prompts: look.prompts.filter((_, k) => k !== i) })} what={x.label || "this line"} /></span>
                    </div>
                  ))}
                </div>
              )}
              <div className={s.chips}>
                {PRESETS.filter((l) => !used.includes(l)).map((label) => (
                  <button key={label} type="button" className={s.dashed} onClick={() => set({ prompts: [...look.prompts, { label, text: "" }] })}><Plus />{label}</button>
                ))}
                <button type="button" className={s.dashed} onClick={() => set({ prompts: [...look.prompts, { label: "", text: "", custom: true }] })}><Plus />Custom</button>
              </div>
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
                <label className={s.addFile}><Plus />Add file<input className={s.hidden} type="file" multiple onChange={(e) => { p.onAddFiles(e.target.files); e.target.value = ""; }} /></label>
              </div>
            </div>
          </div>

          <div className={s.ai}>
            <span className={s.aiIcon} aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6e6e73" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            </span>
            <span className={s.aiText}>
              <span className={s.aiTitle}>NextUp analysis is attached below this</span>
              <span className={s.aiSub}>{p.aiLine} Generated by NextUp, so it can’t be edited here.</span>
            </span>
          </div>
        </div>

        <div className={s.foot}>
          <span className={s.hint}>{ok ? "Changes save to your draft" : "Needs a title and a description"}</span>
          <button type="button" className={s.export} disabled={!ok} onClick={p.onExport} title="Open the export view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>
            Export
          </button>
          <button type="button" className={s.go} disabled={!ok} onClick={p.onConfirm}>
            Looks good · finalize
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
