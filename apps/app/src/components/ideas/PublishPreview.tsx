"use client";
// "Last look before it goes out" (Claude Design handoff "Publish Preview"): what "Publish" opens before
// NextUp looks for a receiver. The idea laid out as the receiver's inbox will show it, every part the
// author wrote editable in place and the missing ones addable (IdeaCard.tsx, shared with the Idea view); NextUp's analysis only as a locked note.
// "Looks good · finalize" goes on to the final document (RaiseFinal.tsx), whose "Send idea" opens the receiver suggestions (RaisePublish.tsx).
// "Export" (Claude Design handoff "Export button", in place of Back) opens the export view (RaiseExport.tsx). Props in.
import { useEffect, useRef } from "react";
import { IdeaCard, type Look } from "./IdeaCard";
import type { Meeting } from "./raisePreview";
import s from "./PublishPreview.module.css";

export type { Look, LookPrompt } from "./IdeaCard";

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
  const panel = useRef<HTMLDivElement>(null);
  const ok = !!look.title.trim() && !!look.description.trim();
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
          <IdeaCard author={p.author} look={look} onLook={onLook} meet={p.meet} onMeet={p.onMeet} coll={p.coll} people={p.people} onColl={p.onColl}
            affected={p.affected} depts={p.depts} onAffected={p.onAffected} files={p.files} onAddFiles={p.onAddFiles} onRemoveFile={p.onRemoveFile} />

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
