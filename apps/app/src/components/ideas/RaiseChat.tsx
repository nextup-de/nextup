"use client";
// The raise page's chat: the coach's questions and the author's answers, the AI's read of the idea
// under the latest reply (the five dials and the advice), the "Update your idea?" card, the rail on the
// right (the five points a decision needs) and the composer docked at the bottom. Props in, JSX out.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { levelOf, type Advice, type Dial, type DialKey, type Gap } from "@/features/ideas/raise";
import { Icon, Solid } from "./raiseIcons";
import s from "./Raise.module.css";

export type Suggest = { key: string; before: string; after: string; state: "open" | "yes" | "no"; onYes: (text: string) => void; onNo: () => void };
// `read`: the five dials as they stand after this reply, which of them got better with the answer before
// it (`up`), and the advice.
export type Read = { dials: Dial[]; up: DialKey[]; advice: Advice; first: boolean };
export type ChatMsg = { id: string; role: "ai" | "user"; text: string; note?: string | null; read?: Read; quick?: { publish: boolean; review: boolean }; link?: { label: string; href: string }; suggest?: Suggest };

export function RaiseChat({ msgs, typing, typingLabel, error, gaps, onAsk, onQuick, dock, followKey }: {
  msgs: ChatMsg[];
  typing: boolean; typingLabel: string;
  error: string;
  gaps: Gap[];
  onAsk: (g: Gap) => void;
  onQuick: (what: "publish" | "review") => void;
  dock: React.ReactNode;
  followKey: string; // changes when the thread grows: scroll to its end
}) {
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = scroll.current; if (el) el.scrollTop = el.scrollHeight; }, [followKey]);
  return (
    <div className={s.chatView}>
      <div className={s.scrollWrap}>
        <div ref={scroll} className={s.scroll}>
          <div className={s.thread} aria-live="polite">
            {!msgs.length && !typing && (
              <div className={s.empty}>
                <h1 className={`${s.emptyTitle} ${s.heading}`}>What should change?</h1>
                <p className={s.emptyText}>Describe a problem or an idea in your own words. I’ll ask a few questions and build the draft on the left as we go.</p>
              </div>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={s.msg} data-role={m.role}>
                <p className={s.bubble}>{m.text}</p>
                {m.note && <span className={s.note}><Solid name="sparkle" size={8.25} fill="#007aff" />{m.note}</span>}
                {m.read && <ReadCard r={m.read} />}
                {m.suggest && <SuggestCard key={m.suggest.key} sg={m.suggest} />}
                {m.link && <div className={s.quick}><Link className={s.quickBtn} data-primary="true" href={m.link.href}>{m.link.label}</Link></div>}
                {m.quick && (m.quick.publish || m.quick.review) && (
                  <div className={s.quick}>
                    {m.quick.publish && <button type="button" className={s.quickBtn} data-primary="true" onClick={() => onQuick("publish")}><Icon name="up" size={12} width={2.4} />Publish now</button>}
                    {m.quick.review && <button type="button" className={s.quickBtn} onClick={() => onQuick("review")}><Solid name="sparkle" size={11} />Review analysis</button>}
                  </div>
                )}
              </div>
            ))}
            {typing && (
              <div className={s.typing} aria-label="NextUp is typing"><i /><i /><i />{typingLabel && <span className={s.typingLabel}>{typingLabel}</span>}</div>
            )}
            {error && <p className={s.error} role="alert">{error}</p>}
          </div>
        </div>
        {gaps.length > 0 && <Rail gaps={gaps} onAsk={onAsk} />}
      </div>
      {dock}
    </div>
  );
}

// Before / After, with what changed marked: the common start and end of the two texts stay plain.
function diff(before: string, after: string) {
  let p = 0; while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let q = 0; while (q < before.length - p && q < after.length - p && before[before.length - 1 - q] === after[after.length - 1 - q]) q++;
  return { pre: after.slice(0, p), add: after.slice(p, after.length - q), del: before.slice(p, before.length - q), post: after.slice(after.length - q) };
}

function SuggestCard({ sg }: { sg: Suggest }) {
  const [text, setText] = useState(sg.after);
  if (sg.state !== "open") return <span className={s.sgDone}>{sg.state === "yes" ? "Idea context updated" : "Idea left as it was"}</span>;
  const d = diff(sg.before, text);
  const edited = text.trim() !== sg.after.trim();
  return (
    <div className={s.sg}>
      <div className={s.sgHead}><span className={s.sgTitle}>Update your idea?</span><span className={s.sgTag}>Context</span></div>
      <div className={s.sgCols}>
        <div className={s.sgCol}>
          <span className={s.sgLabel}>Before</span>
          <div className={s.sgBefore}>{sg.before ? <><span>{d.pre}</span><span className={s.sgDel}>{d.del}</span><span>{d.post}</span></> : <span className={s.sgNone}>Nothing yet</span>}</div>
        </div>
        <div className={s.sgCol}>
          <span className={s.sgLabel} data-after="true">After</span>
          <div className={s.sgAfter}>
            <div className={s.sgMirror} aria-hidden="true"><span>{d.pre}</span><span className={s.sgAdd}>{d.add}</span><span>{d.post + "\n "}</span></div>
            <textarea className={s.sgText} rows={1} value={text} onChange={(e) => setText(e.target.value)} aria-label="The idea's context after the update" />
          </div>
        </div>
      </div>
      <div className={s.sgBtns}>
        <button type="button" className={s.sgNo} onClick={sg.onNo}>No</button>
        <button type="button" className={s.sgYes} onClick={() => (text.trim() ? sg.onYes(text.trim()) : sg.onNo())}>{edited ? "Save" : "Yes"}</button>
      </div>
    </div>
  );
}

// What the AI makes of the idea right now, in the chat: the five dials of the analysis, each as a bar,
// one word and what it found, and the advice. No numbers here - those are in the analysis.
function ReadCard({ r }: { r: Read }) {
  return (
    <div className={s.read} role="group" aria-label="AI analysis">
      <div className={s.readHead}>
        <Solid name="sparkle" size={11.25} fill="#007aff" />
        <span className={s.readTitle}>{r.first ? "AI analysis · first read" : "AI analysis"}</span>
        <span className={s.readAdvice} data-advice={r.advice.name === "Approve" ? "go" : r.advice.name === "Pilot" ? "pilot" : "info"}>{r.advice.name}</span>
      </div>
      <div className={s.readRows}>
        {r.dials.map((d) => {
          const up = r.up.includes(d.key);
          return (
            <div key={d.key} className={s.readRow}>
              <span className={s.readLabel}>{d.label}</span>
              <span className={s.readBar} aria-hidden="true"><i style={{ width: (d.scored ? Math.max(4, d.value) : 0) + "%" }} /></span>
              <span className={s.readLevel}>{levelOf(d)}{up && <span className={s.readUp} title="Better since your last answer" aria-label="better since your last answer">▲</span>}</span>
              <span className={s.readNote}>{d.note}</span>
            </div>
          );
        })}
      </div>
      <p className={s.readWhy}>{r.advice.why}</p>
    </div>
  );
}

const STATUS = { open: "still open", active: "next", clear: "clear", unknown: "unknown for now" } as const;

// The five points the person who decides needs, each with what was found or what is still missing.
// Wide enough, a card with their names; narrower, a column of dots with the name on hover. A point
// opens to the fact behind it, or to the question and "Ask this now".
function Rail({ gaps, onAsk }: { gaps: Gap[]; onAsk: (g: Gap) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!(e.target instanceof Element && e.target.closest("[data-rail-seg]"))) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("click", off);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const n = gaps.length, clear = gaps.filter((g) => g.status === "clear").length;
  const ready = gaps.every((g) => g.status === "clear" || g.status === "unknown");
  return (
    <div className={s.rail} aria-label={clear + " of " + n + " points clear"}>
      <div className={s.railCard} data-ready={ready || undefined}>
        <div className={s.railHead}>
          <span className={s.railTitle}>{ready ? "Ready to publish" : "To publish"}</span>
          <span className={s.railCount}>{clear} of {n}</span>
        </div>
        {gaps.map((g, i) => (
          <span key={g.id} role="button" tabIndex={0} data-rail-seg="1" className={s.rp} data-s={g.status} data-hot={hover === g.id || open === g.id} aria-label={g.label + " — " + STATUS[g.status]} aria-expanded={open === g.id}
            onMouseEnter={() => setHover(g.id)} onMouseLeave={() => setHover((h) => (h === g.id ? null : h))}
            onClick={() => setOpen((o) => (o === g.id ? null : g.id))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => (o === g.id ? null : g.id)); } }}>
            <span className={s.rpDot} aria-hidden="true">
              {g.status === "clear" ? <svg width="8" height="8" viewBox="0 0 10 10"><path d="M2 5.2l2 2 4-4.4" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
                : g.status === "unknown" ? "?" : g.status === "active" ? String(i + 1) : ""}
            </span>
            <span className={s.rpText}>
              <span className={s.rpLabel}>{g.label}{g.status === "active" && <span className={s.rpNext}>Next</span>}</span>
              <span className={s.rpSub}>{g.answer ?? (g.status === "unknown" ? "Not known yet" : g.need)}</span>
            </span>
            {hover === g.id && open !== g.id && <span className={s.tip}>{g.label}</span>}
            {open === g.id && (
              <div className={s.pop} role="dialog" aria-label={g.label} onClick={(e) => e.stopPropagation()}>
                <div className={s.popHead}>
                  <span className={s.popTitle}>{g.label}</span>
                  <span className={s.popStatus}>{STATUS[g.status]}</span>
                  <button type="button" className={s.popX} title="Close" aria-label="Close" onClick={() => setOpen(null)}><Icon name="x" size={7.5} width={3} /></button>
                </div>
                {g.answer ? (
                  <div className={s.popBlock}><span className={s.popKey}>What NextUp found</span><span>{g.answer}</span></div>
                ) : (
                  <>
                    <div className={s.popBlock}><span className={s.popKey}>{g.status === "unknown" ? "Unknown for now · to ask" : "Still needed"}</span><span>{g.ask}</span></div>
                    <button type="button" className={s.askNow} onClick={() => { setOpen(null); onAsk(g); }}>Ask this now</button>
                  </>
                )}
              </div>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
