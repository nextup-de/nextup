"use client";
// The two sheets that open over the chat: the idea itself (edited in place) and the AI analysis -
// five dials with their reasoning, what was found, similar ideas, reviewers and sources. Props in.
import Link from "next/link";
import { useState } from "react";
import type { Advice, Dial } from "@/features/ideas/raise";
import { Icon, Solid } from "./raiseIcons";
import { PersonButton } from "./RaisePerson";
import s from "./Raise.module.css";

export type Similar = { title: string; status: string; where: string; by?: string; href: string | null }; // by: who raised it
export type Reviewer = { initials: string; name: string; role: string; why: string };
export type Source = { name: string; where: string; ext: "IDEA" | "DATA" | "DOC" };

function Sheet({ label, onClose, an, children }: { label: string; onClose: () => void; an?: boolean; children: React.ReactNode }) {
  return (
    <div className={s.sheet}>
      <div className={s.sheetCol}>
        <div className={s.closeRow}>
          <button type="button" className={s.close} onClick={onClose} title={"Close " + label} aria-label={"Close " + label}><Icon name="x" size={13.5} stroke="#fff" width={2.4} /></button>
        </div>
        {an === undefined ? children : <div className={s.paper} data-an={an}>{children}</div>}
      </div>
    </div>
  );
}

export function IdeaSheet({ description, context, locked, onChange, onClose }: {
  description: string; context: string; locked: boolean;
  onChange: (description: string, context: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet label="idea" onClose={onClose} an={false}>
      <div className={s.paperHead}><span className={s.paperLabel}>Idea</span></div>
      {locked ? <p className={s.ideaBody}>{description}</p>
        : <textarea className={s.ideaEdit} rows={4} value={description} onChange={(e) => onChange(e.target.value, context)} aria-label="Idea" />}
      {(!locked || context) && (
        <div className={s.ideaCtx}>
          <span className={s.ideaCtxLabel}>Context</span>
          {locked ? <p className={s.ideaCtxText}>{context}</p>
            : <textarea className={s.ideaEdit} data-ctx="true" rows={3} value={context} onChange={(e) => onChange(description, e.target.value)} aria-label="Context" />}
        </div>
      )}
    </Sheet>
  );
}

export function AnalysisSheet({ ready, onClose, dials, summary, advice, pattern, cats, similar, reviewers, sources }: {
  ready: boolean; onClose: () => void;
  dials: Dial[]; summary: string; advice: Advice; pattern: string; cats: string[];
  similar: Similar[]; reviewers: Reviewer[]; sources: Source[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (!ready) {
    return (
      <Sheet label="analysis" onClose={onClose}>
        <div className={s.anEmpty}>
          <h2 className={`${s.anEmptyTitle} ${s.serif}`}>No analysis yet</h2>
          <p className={s.anEmptyText}>Send your first message. Nextup researches the business context before grilling — its findings and updated results land here.</p>
          <button type="button" className={s.blackPill} onClick={onClose}>Start grilling</button>
        </div>
      </Sheet>
    );
  }
  const d = open === null ? null : dials[open];
  const sourceList = (
    <div className={s.sources}>
      {sources.map((src, i) => (
        <span key={src.name} className={s.source}>
          <span className={s.srcTag} data-ext={src.ext}>{src.ext}</span>
          <span className={s.srcText}><span className={s.srcName}><span className={s.srcN}>{i + 1}</span>{src.name}</span><span className={s.srcWhere}>{src.where}</span></span>
        </span>
      ))}
    </div>
  );
  return (
    <Sheet label="analysis" onClose={onClose} an>
      <div className={s.dialsBox}>
        <div className={s.dials}>
          {dials.map((x, i) => (
            <div key={x.key} className={s.dial} data-open={open === i}>
              <span className={s.dialLabel}>{x.label}</span>
              <div className={s.gauge}>
                <svg viewBox="0 0 72 72" aria-hidden="true">
                  <circle cx="36" cy="36" r="30" fill="none" stroke="#e3eaf7" strokeWidth="10" strokeLinecap="round" strokeDasharray="141.4 188.5" />
                  <circle className={s.arc} cx="36" cy="36" r="30" fill="none" stroke="#007aff" strokeWidth="10" strokeLinecap="round" strokeDasharray={(141.4 * x.value / 100).toFixed(1) + " 188.5"} />
                </svg>
                <div className={s.gaugeText}><span className={s.gaugeVal}>{x.scored ? x.value : "–"}</span><span className={s.gaugeOf}>/ 100</span></div>
                <button type="button" className={s.dialBtn} aria-expanded={open === i} title="Show reasoning" aria-label={"Show reasoning for " + x.label} onClick={() => setOpen(open === i ? null : i)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {d ? (
        <div className={s.reason}>
          <div className={s.sec}><span className={s.secLabel}>{d.label}</span><p className={s.big}>{d.note}</p></div>
          <div className={s.sec} data-rule="true"><span className={s.secLabel}>What it’s based on</span><p className={s.small}>{d.basis}</p></div>
          <div className={s.sec} data-rule="true" data-gap="6"><span className={s.secLabel}>Sources</span>{sourceList}</div>
        </div>
      ) : (
        <>
          <div className={s.found}><Solid name="sparkle" size={12} fill="#007aff" /><span className={s.foundLabel}>What the AI found</span></div>
          <div className={s.sec} data-gap="6"><p className={s.big}>{summary}</p></div>
          <div className={s.advice}>
            <span className={s.adviceKey}>Advice</span><span className={s.adviceVal} data-strong="true">{advice.name}</span>
            <span className={s.adviceKey}>Why</span><span className={s.adviceVal}>{advice.why}</span>
          </div>
          <div className={s.sec} data-rule="true"><span className={s.secLabel}>Pattern</span><p className={s.small}>{pattern}</p></div>
          <div className={s.sec} data-rule="true" data-gap="6">
            <span className={s.secLabel}>Categorised as</span>
            <div className={s.cats}>{cats.map((c) => <span key={c} className={s.cat}>{c}</span>)}</div>
          </div>
          <div className={s.sec} data-rule="true" data-gap="7">
            <span className={s.secLabel}>Similar ideas</span>
            {similar.map((m) => {
              const top = <div className={s.simTop}><span className={s.simTitle}>{m.title}</span><span className={s.simStatus}>{m.status}</span></div>;
              return (
                <div key={m.title} className={s.sec}>
                  {m.href ? <Link href={m.href} className={s.simLink}>{top}</Link> : top}
                  <span className={s.simWhere}>{m.where}{m.by && <> <PersonButton name={m.by} className={s.inlineName}>{m.by}</PersonButton></>}</span>
                </div>
              );
            })}
          </div>
          <div className={s.sec} data-rule="true" data-gap="7">
            <span className={s.secLabel}>Suggested reviewers</span>
            {reviewers.map((r) => (
              <div key={r.name} className={s.sec}>
                <div className={s.who}><PersonButton name={r.name} className={s.whoPill}><span className={s.whoAv}>{r.initials}</span>{r.name}</PersonButton><span className={s.whoRole}>{r.role}</span></div>
                <p className={s.small}>{r.why}</p>
              </div>
            ))}
          </div>
          <div className={s.sec} data-rule="true" data-gap="6">
            <div className={s.secHead}><span className={s.secLabel}>Sources</span><span className={s.secCount}>{sources.length}</span></div>
            {sourceList}
          </div>
          <span className={s.disclaimer}>AI suggestions only. You make the decision.</span>
        </>
      )}
    </Sheet>
  );
}
