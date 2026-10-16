"use client";
// The two sheets that open over the chat: the idea itself (edited in place, the same card as the publish
// preview's) and the AI analysis - five dials with their reasoning, what was found, similar ideas, reviewers
// and sources. The analysis also stands in the chat, above NextUp's first reply (RaiseChat.tsx). Props in.
import Link from "next/link";
import { useState } from "react";
import type { CompanyFact } from "@/features/ideas/company-read";
import type { Advice, Dial, DialKey } from "@/features/ideas/raise";
import { Icon, Solid } from "./raiseIcons";
import { PersonButton } from "./RaisePerson";
import { IdeaCard, type IdeaCardProps, type Look } from "./IdeaCard";
import s from "./Raise.module.css";
import pv from "./PublishPreview.module.css";
import { avatarTone } from "@/lib/avatar";

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

// The idea, laid out and edited as in the last look before publishing (IdeaCard.tsx). The card keeps
// its own copy while open - a line just added has no text yet, so it is not in the idea - and hands
// every change on; the page opens it afresh (a new `key`) per draft.
export function IdeaSheet({ initial, card, locked, onChange, onTitle, onClose }: {
  initial: Look; locked: boolean;
  card: Omit<IdeaCardProps, "look" | "onLook" | "onTitleDone" | "locked">;
  onChange: (l: Look) => void;
  onTitle: (title: string) => void;
  onClose: () => void;
}) {
  const [look, setLook] = useState(initial);
  return (
    <Sheet label="idea" onClose={onClose}>
      {locked && (
        <div className={pv.sheetHead}>
          <span className={pv.kicker}>Published · as it landed in their inbox</span>
        </div>
      )}
      <IdeaCard {...card} locked={locked} look={look} onLook={(l) => { setLook(l); if (l.title === look.title) onChange(l); }} onTitleDone={() => onTitle(look.title)} />
      {!locked && <span className={pv.sheetHint}>NextUp sees your changes with your next message.</span>}
    </Sheet>
  );
}

// What the analysis shows: in its own sheet, and in the chat under NextUp's first reply.
export type AnalysisData = {
  dials: Dial[]; company: Record<DialKey, CompanyFact[]>; // what was looked up across the company, per dial
  summary: string; advice: Advice; pattern: string; cats: string[];
  similar: Similar[]; reviewers: Reviewer[]; sources: Source[];
  improved?: DialKey[]; // the first feedback in the chat: the checks that came out better than the idea as written
};

export function AnalysisSheet({ ready, onClose, ...a }: AnalysisData & { ready: boolean; onClose: () => void }) {
  if (!ready) {
    return (
      <Sheet label="analysis" onClose={onClose}>
        <div className={s.anEmpty}>
          <h2 className={`${s.anEmptyTitle} ${s.heading}`}>No analysis yet</h2>
          <p className={s.anEmptyText}>Send your first message. Nextup researches the business context before grilling — its findings and updated results land here.</p>
          <button type="button" className={s.blackPill} onClick={onClose}>Start grilling</button>
        </div>
      </Sheet>
    );
  }
  return <Sheet label="analysis" onClose={onClose} an><Analysis {...a} /></Sheet>;
}

// The five dials (each opens to its reasoning) and what the AI found. `inChat`: under NextUp's first reply -
// a card in the thread, up to the similar ideas; the reviewers and sources stay in the sheet.
export function Analysis({ dials, company, summary, advice, pattern, cats, similar, reviewers, sources, improved, inChat = false }: AnalysisData & { inChat?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
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
  const body = (
    <>
      <div className={s.dialsBox}>
        <div className={s.dials}>
          {dials.map((x, i) => (
            <div key={x.key} className={s.dial} data-open={open === i}>
              <span className={s.dialLabel}>{x.label}{improved?.includes(x.key) && <span className={s.dialUp} role="img" aria-label="Improved" title="Improved">▲</span>}</span>
              <div className={s.gauge}>
                <svg viewBox="0 0 72 72" aria-hidden="true">
                  <circle cx="36" cy="36" r="30" fill="none" stroke="#e3eaf7" strokeWidth="10" strokeLinecap="round" strokeDasharray="141.4 188.5" />
                  <circle className={s.arc} cx="36" cy="36" r="30" fill="none" stroke="#007aff" strokeWidth="10" strokeLinecap="round" strokeDasharray={(141.4 * x.value / 100).toFixed(1) + " 188.5"} />
                </svg>
                <div className={s.gaugeText}><span className={s.gaugeVal} data-long={x.scored && x.value >= 100}>{x.scored ? x.value : "–"}</span><span className={s.gaugeOf}>/ 100</span></div>
                <button type="button" className={s.dialBtn} aria-expanded={open === i} title="Show reasoning" aria-label={"Show reasoning for " + x.label} onClick={() => setOpen(open === i ? null : i)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
        {improved && improved.length > 0 && (
          <p className={s.dialsGain}><b>{improved.length} of {dials.length} checks improved:</b> {improved.map((k) => dials.find((x) => x.key === k)?.label).filter(Boolean).join(", ")}</p>
        )}
      </div>

      {d ? (
        <div className={s.reason}>
          <div className={s.sec}><span className={s.secLabel}>{d.label}</span><p className={s.big}>{d.note}</p></div>
          {company[d.key].length > 0 && (
            <div className={s.sec} data-rule="true" data-gap="7">
              <span className={s.secLabel}>Checked across the company</span>
              <ul className={s.facts}>
                {company[d.key].map((f) => <li key={f.text} className={s.fact}><span className={s.factSrc}>{f.source}</span><span className={s.factText}>{f.text}</span></li>)}
              </ul>
            </div>
          )}
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
          {!inChat && <>
          <div className={s.sec} data-rule="true" data-gap="7">
            <span className={s.secLabel}>Suggested reviewers</span>
            {reviewers.map((r) => (
              <div key={r.name} className={s.sec}>
                <div className={s.who}><PersonButton name={r.name} className={s.whoPill}><span className={s.whoAv} data-avatar={avatarTone(r.name)}>{r.initials}</span>{r.name}</PersonButton><span className={s.whoRole}>{r.role}</span></div>
                <p className={s.small}>{r.why}</p>
              </div>
            ))}
          </div>
          <div className={s.sec} data-rule="true" data-gap="6">
            <div className={s.secHead}><span className={s.secLabel}>Sources</span><span className={s.secCount}>{sources.length}</span></div>
            {sourceList}
          </div>
          <span className={s.disclaimer}>AI suggestions only. You make the decision.</span>
          </>}
        </>
      )}
    </>
  );
  return inChat ? <div className={`${s.paper} ${s.anChat}`} data-an="true" role="group" aria-label="Full analysis">{body}</div> : body;
}
