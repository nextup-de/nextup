"use client";
// The raise page's chat: the coach's questions and the author's answers, the AI's read of the idea
// under the latest reply (the five dials and the advice), the progress rail on the right (one segment
// per unclear topic) and the composer docked at the bottom. Props in, JSX out.
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { levelOf, type Advice, type Dial, type DialKey, type Topic } from "@/features/ideas/raise";
import { Icon, Solid } from "./raiseIcons";
import s from "./Raise.module.css";

// `read`: the five dials as they stand after this reply, which of them got better with the answer before
// it (`up`), and the advice.
export type Read = { dials: Dial[]; up: DialKey[]; advice: Advice; first: boolean };
export type ChatMsg = { id: string; role: "ai" | "user"; text: string; note?: string | null; read?: Read; quick?: { publish: boolean; review: boolean }; link?: { label: string; href: string } };

export function RaiseChat({ msgs, typing, typingLabel, error, gaps, onAsk, onQuick, dock, followKey }: {
  msgs: ChatMsg[];
  typing: boolean; typingLabel: string;
  error: string;
  gaps: Topic[];
  onAsk: (g: Topic) => void;
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
                {m.link && <div className={s.quick}><Link className={s.quickBtn} data-primary="ink" href={m.link.href}>{m.link.label}</Link></div>}
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

const STATUS = { open: "still open", active: "asking now", clear: "clear", unknown: "unknown for now" } as const;

// The unclear topics, one segment each, worked down from the top. A segment opens to its question and
// "Ask this now"; the name shows on hover.
function Rail({ gaps, onAsk }: { gaps: Topic[]; onAsk: (g: Topic) => void }) {
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
  const n = gaps.length, active = gaps.findIndex((g) => g.status === "active");
  return (
    <div className={s.rail} aria-label={gaps.filter((g) => g.status === "clear").length + " of " + n + " points clear"}>
      {/* The window is as tall as its segments at full size (the active one 81px, the rest 54px, 6px links,
          15px padding), so a short list does not float in an empty window. */}
      <div className={s.railStack} style={{ "--rail-h": Math.min(390, 81 + (n - 1) * 60 + 15) + "px" } as React.CSSProperties}>
        {gaps.map((g, i) => {
          const at = i < n / 3 ? "top" : i >= (n * 2) / 3 ? "bottom" : undefined;
          return (
            <Fragment key={g.id}>
              {i > 0 && <span className={s.link} data-s={g.status === "open" ? "open" : undefined} />}
              <span role="button" tabIndex={0} data-rail-seg="1" className={s.seg} data-s={g.status} data-hot={hover === g.id || open === g.id} aria-label={g.label + " — " + STATUS[g.status]} aria-expanded={open === g.id}
                onMouseEnter={() => setHover(g.id)} onMouseLeave={() => setHover((h) => (h === g.id ? null : h))}
                onClick={() => setOpen((o) => (o === g.id ? null : g.id))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => (o === g.id ? null : g.id)); } }}>
                {g.status === "clear" && <svg width="7.5" height="7.5" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2l2 2 4-4.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                {g.status === "active" ? String(active + 1) : g.status === "unknown" ? "?" : ""}
                {hover === g.id && open !== g.id && <span className={s.tip}>{g.label}</span>}
                {open === g.id && (
                  <div className={s.pop} data-at={at} role="dialog" aria-label={g.label} onClick={(e) => e.stopPropagation()}>
                    <div className={s.popHead}>
                      <span className={s.popTitle}>{g.label}</span>
                      <span className={s.popStatus}>{STATUS[g.status]}</span>
                      <button type="button" className={s.popX} title="Close" aria-label="Close" onClick={() => setOpen(null)}><Icon name="x" size={7.5} width={3} /></button>
                    </div>
                    {g.ask && (
                      <div className={s.popBlock}>
                        <span className={s.popKey}>{g.status === "unknown" ? "Unknown for now · to ask" : g.status === "active" ? "Asking now" : "Still to ask"}</span>
                        <span>{g.ask}</span>
                      </div>
                    )}
                    {(g.status === "open" || g.status === "unknown") && <button type="button" className={s.askNow} onClick={() => { setOpen(null); onAsk(g); }}>Ask this now</button>}
                  </div>
                )}
              </span>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
