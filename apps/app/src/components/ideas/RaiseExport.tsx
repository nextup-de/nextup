"use client";
// The export view (Claude Design handoff "Export view"): opened by "Export" in the last look
// (PublishPreview.tsx), it covers the page beside the ideas sidebar with exactly what goes out, laid out
// as an A4 sheet. The panel beside it switches NextUp's assessment in or out and copies the text, saves
// a .doc or prints a PDF (features/ideas/export.ts). Back returns to the last look; Close leaves both. Props in.
import { useEffect, useRef, useState } from "react";
import { exportFileName, exportHtml, exportParts, exportText, type ExportAnalysis, type ExportIdea } from "@/features/ideas/export";
import s from "./RaiseExport.module.css";

const Copy = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
const Doc = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>;
const Pdf = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;

export function RaiseExport({ idea, analysis, onBack, onClose }: {
  idea: ExportIdea; // what the author wrote and chose, with the byline and receiver
  analysis: ExportAnalysis; // NextUp's assessment, shown and exported only when switched on
  onBack: () => void; // back to the last look, edits kept
  onClose: () => void; // closes the view and the last look
}) {
  const [withAi, setWithAi] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const out: ExportIdea = { ...idea, analysis: withAi ? analysis : null };
  const p = exportParts(out);

  const copy = () => {
    navigator.clipboard?.writeText(exportText(out)).catch(() => {});
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };
  const doc = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿", exportHtml(out)], { type: "application/msword" }));
    a.download = exportFileName(p.title);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  // The PDF is the browser's print dialog on the same A4 document, in a window of its own.
  const pdf = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(exportHtml(out)); w.document.close(); w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className={s.view}>
      <div className={s.wrap}>
        <div className={s.head}>
          <button type="button" className={s.back} onClick={onBack} title="Back to editing" aria-label="Back to editing">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <h2 className={s.title}>Export · A4</h2>
          <button type="button" className={s.close} onClick={onClose} title="Close" aria-label="Close">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <span className={s.spacer} aria-hidden="true" />
        </div>

        <div className={s.row}>
          <article className={s.page} aria-label="Export preview">
            <span className={s.eyebrow}>{p.kind} · Final</span>
            <span className={s.docTitle}>{p.title}</span>
            {idea.meta && <span className={s.meta}>{idea.meta}</span>}
            {idea.receiver && <span className={s.goes}>Goes to <strong>{idea.receiver}</strong></span>}
            <div className={s.rule} />
            <div className={s.sec} data-first="">
              <span className={s.label}>Summary</span>
              <span className={s.summary}>{p.summary || "No description yet"}</span>
            </div>
            {p.ctx && (
              <div className={s.sec}>
                <span className={s.label}>Context</span>
                <span className={s.ctx}>{p.ctx}</span>
              </div>
            )}
            {p.rows.length > 0 && (
              <div className={s.sec}>
                <span className={s.label} data-rows="">Details</span>
                {p.rows.map(([label, value]) => (
                  <div key={label + value} className={s.detail}><span className={s.detailLabel}>{label}</span><span className={s.detailValue}>{value}</span></div>
                ))}
              </div>
            )}
            {withAi && (
              <div className={s.sec} data-ai="">
                <span className={s.label}>Assessment · by Nextup</span>
                <div className={s.rec}><span className={s.recPill}>{analysis.rec}</span><span className={s.recWhy}>{analysis.why}</span></div>
                <div className={s.scores}>
                  {analysis.scores.map((x) => <div key={x.label} className={s.score}><span className={s.scoreLabel}>{x.label}</span><span className={s.scoreVal}>{x.val}</span></div>)}
                </div>
                <span className={s.caption}>Overall {analysis.overall} / 100 · generated by Nextup, not edited by the author</span>
              </div>
            )}
            <div className={s.foot}><span>Raised by {idea.author} via Nextup</span><span>Page 1 of 1</span></div>
          </article>

          <aside className={s.panel} aria-label="Export options">
            <div className={s.group}>
              <span className={s.groupLabel}>Include</span>
              <button type="button" className={s.switch} role="switch" aria-checked={withAi} onClick={() => setWithAi((x) => !x)}>
                <span className={s.switchText}><span className={s.switchTitle}>AI analysis</span><span className={s.switchSub}>Scores and recommendation</span></span>
                <span className={s.track} data-on={withAi}><span className={s.knob} /></span>
              </button>
            </div>
            <div className={s.group} data-split="">
              <span className={s.groupLabel}>Export</span>
              <button type="button" className={s.act} onClick={copy}><Copy /><span aria-live="polite">{copied ? "Copied" : "Copy text"}</span></button>
              <button type="button" className={s.act} onClick={doc}><Doc />Save as doc</button>
              <button type="button" className={s.act} onClick={pdf}><Pdf />Save as PDF</button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
