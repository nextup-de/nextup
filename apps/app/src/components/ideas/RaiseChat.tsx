"use client";
// The raise page's chat: the coach's questions and the author's answers, the progress rail on the right
// (one segment per unclear topic) and the composer docked at the bottom. On top, the idea as it was asked,
// with its details; the thinking orb under it until NextUp's first reply is ready. That reply comes after
// the full analysis (the dials with their numbers, what the AI found); every later one is the reply's text,
// the AI's read of what the answer changed (those dials as bars and words, no numbers - those are in the
// full analysis, opened from here), then the one point still unclear. Props in, JSX out.
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { useLocale, useT } from "@/i18n/client";
import { levelOf, type Dial, type DialKey, type Move, type Topic } from "@/features/ideas/raise";
import { Icon, Solid } from "./raiseIcons";
import { Analysis, type AnalysisData } from "./RaiseSheets";
import { Evaluating } from "./RaiseStart";
import s from "./Raise.module.css";

// `read`: the five dials as they stand after this reply. `moved`: the dials the answer before
// it moved - the only ones shown. `open`: the point still unclear - one at most.
export type Read = { dials: Dial[]; moved: Partial<Record<DialKey, Move>>; open: Topic[] };
// `idea`: the first message - the idea as asked, its title, what was written under it and its details
// (affected, files, receiver, colleagues, meeting).
// `full`: NextUp's first reply - the full analysis stands above it, in place of the short read.
// `publish`: the one "Publish" button under the latest reply, once the conversation is long enough; it opens
// the last look, from which the final document is sent.
// `asked`: under an earlier reply, the point it left unclear, with where it stands now (ticked once clear).
export type ChatMsg = { id: string; role: "ai" | "user"; text: string; note?: string | null; idea?: { body: string; details: { key: string; value: string }[] }; read?: Read; full?: AnalysisData; asked?: Topic[]; publish?: boolean; link?: { label: string; href: string } };

export function RaiseChat({ msgs, typing, thinking, error, gaps, onAsk, onAnalysis, onPublish, dock, followKey }: {
  msgs: ChatMsg[];
  typing: boolean;
  thinking: { step: number; sub: string } | null; // the first reply on its way: the orb and the evaluation's steps
  error: string;
  gaps: Topic[];
  onAsk: (g: Topic) => void;
  onAnalysis: () => void;
  onPublish: () => void;
  dock: React.ReactNode;
  followKey: string; // changes when the thread grows: scroll to its end
}) {
  const t = useT();
  const scroll = useRef<HTMLDivElement>(null);
  // The thread follows its end - except when NextUp’s first reply has just come in: its analysis box then sits right under
  // the top bar, and the thread stays scrollable from there (up to the idea, down to the reply and the open point).
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const first = msgs.length && msgs[msgs.length - 1].full ? el.querySelector<HTMLElement>("[data-first]") : null;
    if (first) el.scrollTop += first.getBoundingClientRect().top - el.getBoundingClientRect().top - parseFloat(getComputedStyle(el).paddingTop);
    else el.scrollTop = el.scrollHeight;
  }, [followKey]); // eslint-disable-line react-hooks/exhaustive-deps -- only when the thread grows
  return (
    <div className={s.chatView}>
      <div className={s.scrollWrap}>
        <div ref={scroll} className={s.scroll}>
          <div className={s.thread} aria-live="polite">
            {!msgs.length && !typing && !thinking && (
              <div className={s.empty}>
                <h1 className={`${s.emptyTitle} ${s.heading}`}>{t("ideas.chatEmptyTitle")}</h1>
                <p className={s.emptyText}>{t("ideas.chatEmptyText")}</p>
              </div>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={s.msg} data-role={m.role} data-first={m.full ? true : undefined}>
                {m.full && <Analysis {...m.full} inChat />}
                {m.idea ? (
                  <div className={s.bubble} data-idea="true">
                    <span className={s.askTitle}>{m.text}</span>
                    {m.idea.body && <span className={s.askText}>{m.idea.body}</span>}
                  </div>
                ) : <p className={s.bubble}>{m.text}</p>}
                {m.idea && m.idea.details.length > 0 && (
                  <ul className={s.askDetails} aria-label={t("ideas.chatDetails")}>
                    {m.idea.details.map((d) => <li key={d.key + d.value} className={s.askDetail}><span className={s.askKey}>{d.key}</span>{d.value}</li>)}
                  </ul>
                )}
                {m.note && <span className={s.note}><Solid name="sparkle" size={8.25} fill="var(--nh-brand)" />{m.note}</span>}
                {m.read && !m.full && <ReadCard r={m.read} onAnalysis={onAnalysis} />}
                {m.read && m.read.open.length > 0 && <Unclear open={m.read.open} onAsk={onAsk} />}
                {m.asked && m.asked.length > 0 && <Unclear open={m.asked} onAsk={onAsk} past />}
                {m.link && <div className={s.quick}><Link className={s.quickBtn} data-primary="ink" href={m.link.href}>{m.link.label}</Link></div>}
                {m.publish && (
                  <div className={s.quick}>
                    <button type="button" className={s.publish} data-state="ready" onClick={onPublish}><Icon name="up" size={11.25} width={2.4} />{t("ideas.chatPublish")}</button>
                  </div>
                )}
              </div>
            ))}
            {thinking ? <Evaluating step={thinking.step} sub={thinking.sub} inChat /> : typing && (
              <div className={s.typing} aria-label={t("ideas.chatTyping")}><i /><i /><i /></div>
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

// What the answer changed: the dials it moved, each as a bar, an arrow, one word and its reason (as many as
// moved - none, a line saying so) and the way into the full analysis.
function ReadCard({ r, onAnalysis }: { r: Read; onAnalysis: () => void }) {
  const t = useT();
  const locale = useLocale();
  const rows = r.dials.filter((d) => r.moved[d.key]);
  return (
    <div className={s.read} role="group" aria-label={t("ideas.chatAnalysis")}>
      <div className={s.readHead}>
        <Solid name="sparkle" size={11.25} fill="var(--nh-brand)" />
        <span className={s.readTitle}>{t("ideas.chatAnalysis")}</span>
      </div>
      {rows.length ? (
        <div className={s.readRows}>
          {rows.map((d) => (
            <div key={d.key} className={s.readRow}>
              <span className={s.readLabel}>{d.label}</span>
              <span className={s.readBar} aria-hidden="true"><i style={{ width: (d.scored ? Math.max(4, d.value) : 0) + "%" }} /></span>
              <span className={s.readLevel} data-move={r.moved[d.key]}>
                <span className={s.readArrow} aria-label={r.moved[d.key] === "up" ? t("ideas.chatBetter") : t("ideas.chatWorse")}>{r.moved[d.key] === "up" ? "▲" : "▼"}</span>{levelOf(d, locale)}
              </span>
              <span className={s.readNote}>{d.note}</span>
            </div>
          ))}
        </div>
      ) : <p className={s.readSame}>{t("ideas.chatSame")}</p>}
      <div className={s.readFoot}>
        <button type="button" className={s.readMore} onClick={onAnalysis}>{t("ideas.chatViewFull")}<Icon name="right" size={9.75} width={2.6} /></button>
      </div>
    </div>
  );
}

// The point the idea still leaves open, as a plain question; a click answers it next. Under an earlier
// reply (`past`): "Asked", ticked once answered (no longer a button: there is nothing left to ask).
function Unclear({ open, onAsk, past = false }: { open: Topic[]; onAsk: (g: Topic) => void; past?: boolean }) {
  const t = useT();
  return (
    <div className={s.unclear} role="group" aria-label={past ? t("ideas.chatAsked") : t("ideas.chatStillUnclear")} data-past={past || undefined}>
      <span className={s.unclearHead}>{past ? t("ideas.chatAsked") : t("ideas.chatStillUnclear")}</span>
      {open.map((g, i) => {
        const inner = (
          <>
            <span className={s.unclearN}>{i + 1}</span>
            <span className={s.unclearText}><span className={s.unclearLabel}>{g.label}</span>{g.ask}</span>
            {g.status === "clear" && <span className={s.unclearDone} aria-label={t("ideas.chatAnswered")}><Icon name="check" size={12} width={2.6} /></span>}
          </>
        );
        return g.status === "clear"
          ? <div key={g.id} className={s.unclearQ} data-done="true">{inner}</div>
          : <button key={g.id} type="button" className={s.unclearQ} onClick={() => onAsk(g)} title={t("ideas.chatAnswerNext")}>{inner}</button>;
      })}
    </div>
  );
}

const STATUS = { open: "ideas.chatStatusOpen", active: "ideas.chatStatusActive", clear: "ideas.chatStatusClear", unknown: "ideas.chatStatusUnknown" } as const;

// The unclear topics, one segment each, worked down from the top. A segment opens to its question and
// "Ask this now"; the name shows on hover.
function Rail({ gaps, onAsk }: { gaps: Topic[]; onAsk: (g: Topic) => void }) {
  const t = useT();
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
  const left = gaps.filter((g) => g.status === "open" || g.status === "active").length; // still to answer; publishing waits for 0
  return (
    <div className={s.rail} aria-label={t("ideas.chatPointsClear", { clear: gaps.filter((g) => g.status === "clear").length, total: n })}>
      <span className={s.railLeft} data-done={left === 0 || undefined} aria-live="polite">{left ? t("ideas.chatPointsOpen", { n: left }) : t("ideas.chatPointsDone")}</span>
      {/* The window is as tall as its segments at full size (the active one 81px, the rest 54px, 6px links,
          15px padding), so a short list does not float in an empty window. */}
      <div className={s.railStack} style={{ "--rail-h": Math.min(390, 81 + (n - 1) * 60 + 15) + "px" } as React.CSSProperties}>
        {gaps.map((g, i) => {
          const at = i < n / 3 ? "top" : i >= (n * 2) / 3 ? "bottom" : undefined;
          return (
            <Fragment key={g.id}>
              {i > 0 && <span className={s.link} data-s={g.status === "open" ? "open" : undefined} />}
              <span role="button" tabIndex={0} data-rail-seg="1" className={s.seg} data-s={g.status} data-hot={hover === g.id || open === g.id} aria-label={g.label + " — " + t(STATUS[g.status])} aria-expanded={open === g.id}
                onMouseEnter={() => setHover(g.id)} onMouseLeave={() => setHover((h) => (h === g.id ? null : h))}
                onClick={() => setOpen((o) => (o === g.id ? null : g.id))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => (o === g.id ? null : g.id)); } }}>
                {g.status === "clear" && <svg width="7.5" height="7.5" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2l2 2 4-4.4" fill="none" stroke="var(--nh-on-brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                {g.status === "active" ? String(active + 1) : g.status === "unknown" ? "?" : ""}
                {hover === g.id && open !== g.id && <span className={s.tip}>{g.label}</span>}
                {open === g.id && (
                  <div className={s.pop} data-at={at} role="dialog" aria-label={g.label} onClick={(e) => e.stopPropagation()}>
                    <div className={s.popHead}>
                      <span className={s.popTitle}>{g.label}</span>
                      <span className={s.popStatus}>{t(STATUS[g.status])}</span>
                      <button type="button" className={s.popX} title={t("common.close")} aria-label={t("common.close")} onClick={() => setOpen(null)}><Icon name="x" size={7.5} width={3} /></button>
                    </div>
                    {g.ask && (
                      <div className={s.popBlock}>
                        <span className={s.popKey}>{g.status === "unknown" ? t("ideas.chatKeyUnknown") : g.status === "active" ? t("ideas.chatKeyActive") : t("ideas.chatKeyOpen")}</span>
                        <span>{g.ask}</span>
                      </div>
                    )}
                    {(g.status === "open" || g.status === "unknown") && <button type="button" className={s.askNow} onClick={() => { setOpen(null); onAsk(g); }}>{t("ideas.chatAskNow")}</button>}
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
