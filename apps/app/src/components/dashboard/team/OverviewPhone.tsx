"use client";
// One case on a phone - the same pattern as the inbox's IdeaDetailPhone. Not the desktop page
// stacked into a column: a full-screen view that slides in over the table, in three pages you swipe
// (or tap) between - Idea and Chat - under a bar that holds back, the page switch and ↑/↓ to the
// next case. The Idea page has the desktop Idea | AI slider; on AI the five scores are rings, and a
// ring opens its reasoning in a bottom sheet.
// The pieces are the desktop ones (OverviewIdea variants, OverviewChats), in the design's classes.
import { useEffect, useRef, useState } from "react";
import s from "./Overview.module.css";
import { Block, OverviewIdea, type OverviewIdeaProps } from "./OverviewIdea";

type Nav = { index: number; count: number; onPrev: () => void; onNext: () => void };
const PAGES = ["Idea", "Chat"] as const;

const Chev = ({ dir }: { dir: "back" | "up" | "down" }) => (
  <svg className={s.phoneChev} data-dir={dir} width="10" height="14" viewBox="0 0 8 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 1L1 6l5 5" /></svg>
);

export function OverviewPhone({ idea, chats, yourMove, nav, editSignal }: {
  idea: OverviewIdeaProps; chats: React.ReactNode; yourMove: boolean; nav: Nav; editSignal: number;
}) {
  const [page, setPage] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const pager = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);

  // The page switch follows the finger: the thumb tracks the scroll, the label snaps when it lands.
  const onScroll = () => {
    const el = pager.current;
    if (!el || !el.clientWidth) return;
    const pos = el.scrollLeft / el.clientWidth;
    if (thumb.current) thumb.current.style.transform = `translateX(${pos * 100}%)`;
    const i = Math.round(pos);
    if (i !== page) setPage(i);
  };
  const go = (i: number) => { const el = pager.current; if (el) el.scrollTo({ left: i * el.clientWidth }); };

  // "Add details" from the chat: back to the Idea page (OverviewIdea opens edit mode).
  useEffect(() => { if (editSignal) go(0); }, [editSignal]);
  // Escape closes the sheet before the page hears it.
  useEffect(() => {
    if (score === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); setScore(null); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [score]);

  return (
    <div className={s.phone}>
      <header className={s.phoneBar}>
        <button type="button" className={s.phoneIcon} onClick={idea.onClose} aria-label="Back to the dashboard"><Chev dir="back" /></button>
        <div className={s.phoneTabs} role="tablist" aria-label="Case pages">
          <span className={s.phoneThumb} ref={thumb} aria-hidden="true" />
          {PAGES.map((label, i) => (
            <button key={label} type="button" role="tab" aria-selected={page === i} className={s.phoneTab} data-on={page === i ? "true" : undefined} onClick={() => go(page === i ? 1 - i : i)}>
              {label}{i === 1 && yourMove && page !== 1 && <span className={s.phoneDot} aria-label="needs you" />}
            </button>
          ))}
        </div>
        <div className={s.phoneStep}>
          <button type="button" className={s.phoneIcon} onClick={nav.onPrev} disabled={nav.index <= 0} aria-label="Previous case"><Chev dir="up" /></button>
          <button type="button" className={s.phoneIcon} onClick={nav.onNext} disabled={nav.index >= nav.count - 1} aria-label="Next case"><Chev dir="down" /></button>
        </div>
      </header>

      <div className={s.phonePager} ref={pager} onScroll={onScroll}>
        <section className={s.phonePage} role="tabpanel" aria-label="Idea"><OverviewIdea {...idea} variant="phone" onOpenScore={setScore} /></section>
        <section className={`${s.phonePage} ${s.phoneChat}`} role="tabpanel" aria-label="Chat">{chats}</section>
      </div>


      {score !== null && (
        <>
          <div className={s.phoneScrim} onClick={() => setScore(null)} aria-hidden="true" />
          <div className={s.phoneSheet} role="dialog" aria-modal="true" aria-label={idea.brief.scores[score].label + " reasoning"}>
            <button type="button" className={s.phoneHandle} aria-label="Close" onClick={() => setScore(null)} />
            <div className={s.phoneSheetBody}>
              <div className={s.phoneScoreTabs} role="tablist" aria-label="Scores">
                {idea.brief.scores.map((x, i) => (
                  <button key={x.label} type="button" role="tab" aria-selected={i === score} className={s.phoneScoreTab} data-on={i === score ? "true" : undefined} onClick={() => setScore(i)}>
                    <span className={s.phoneScoreNum}>{x.value}</span>{x.label}
                  </button>
                ))}
              </div>
              <div key={score} className={s.div57}>
                <div className={s.div18}><span className={s.dept}>{idea.brief.scores[score].label}</span><p className={s.note}>{idea.brief.scores[score].note}</p></div>
                {idea.brief.scores[score].blocks.map((b, k) => <Block key={k} b={b} />)}
                <div className={s.div37}>
                  <span className={s.dept}>Sources</span>
                  <div className={s.div43}>
                    {idea.brief.scores[score].sources.map((src) => (
                      <span key={src.n} className={s.a}>
                        <span className={s.ext2} data-ext={src.ext}>{src.ext}</span>
                        <span className={s.span2}><span className={s.name2}><span className={s.n}>{src.n}</span>{src.name}</span><span className={s.where}>{src.where}</span></span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
