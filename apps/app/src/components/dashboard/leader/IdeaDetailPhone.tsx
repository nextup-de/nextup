"use client";
// One idea on a phone. Not the desktop page stacked into a column: a full-screen view that slides
// in over the inbox, in three pages you swipe (or tap) between - Idea, AI, Feed - under a bar that
// holds back, the page switch and ↑/↓ to the next idea. The AI page opens on the five scores as a
// strip of rings; a ring opens its reasoning in a bottom sheet, and so do people, departments and
// the decision. Sources fold into one row. The decision sits in a dock at the bottom, where the
// thumb is. Same pieces as IdeaDetail (IdeaParts).
import { useEffect, useId, useRef, useState } from "react";
import type { IdeaBrief } from "@/features/ideas/brief";
import { AiBrief, Blocks, Chevron, DecisionList, FeedBody, FileChip, initialsOf, PanelRow, PersonCard, Sources, Sparkle, StatusBox, type IdeaProps } from "./IdeaParts";
import base from "./IdeaDetail.module.css";
import styles from "./IdeaDetailPhone.module.css";

type Nav = { index: number; count: number; onPrev: () => void; onNext: () => void };
type Sheet =
  | { kind: "score"; i: number }
  | { kind: "author" }
  | { kind: "dept"; id: string; member: string | null }
  | { kind: "person"; name: string }
  | { kind: "feed"; i: number }
  | { kind: "decide" };

const PAGES = ["Idea", "AI", "Feed"] as const; // the first reads "Case" for a case

function Ring({ value, size }: { value: number; size: number }) {
  return (
    <svg viewBox="0 0 72 72" width={size} height={size} className={styles.ring} aria-hidden="true">
      <circle cx="36" cy="36" r="30" className={base.arcTrack} strokeDasharray="141.4 188.5" />
      <circle cx="36" cy="36" r="30" className={base.arcFill} strokeDasharray={((value / 100) * 141.4).toFixed(1) + " 188.5"} />
    </svg>
  );
}

export function IdeaDetailPhone({ idea, brief, status, feed, onDecide, onComment, onClose, nav }: IdeaProps & { nav: Nav }) {
  const uid = useId();
  const [page, setPage] = useState(0);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const pager = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const rec = brief.actions.find((d) => d.key === brief.rec);

  // The page switch follows the finger: the thumb tracks the scroll, the label snaps when it lands.
  const onScroll = () => {
    const el = pager.current;
    if (!el || !el.clientWidth) return;
    const p = el.scrollLeft / el.clientWidth;
    if (thumb.current) thumb.current.style.transform = `translateX(${p * 100}%)`;
    const i = Math.round(p);
    if (i !== page) setPage(i);
  };
  const go = (i: number) => { const el = pager.current; if (el) el.scrollTo({ left: i * el.clientWidth }); };

  // Escape closes a sheet before the inbox hears it.
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); setSheet(null); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [sheet]);

  const decide = (k: string) => { setSheet(null); onDecide(k); };

  return (
    <div className={styles.phone}>
      <header className={styles.bar}>
        <button type="button" className={styles.icon} onClick={onClose} aria-label="Back to inbox"><Chevron back /></button>
        <div className={styles.tabs} role="tablist" aria-label="Idea pages">
          <span className={styles.thumb} ref={thumb} aria-hidden="true" />
          {PAGES.map((p, i) => (
            <button key={p} type="button" role="tab" aria-selected={page === i} className={styles.tab} data-on={page === i ? "true" : undefined} onClick={() => go(i)}>{i === 0 && idea.kind === "case" ? "Case" : p}</button>
          ))}
        </div>
        <div className={styles.step}>
          <button type="button" className={styles.icon} onClick={nav.onPrev} disabled={nav.index <= 0} aria-label="Previous idea"><span className={styles.up}><Chevron back /></span></button>
          <button type="button" className={styles.icon} onClick={nav.onNext} disabled={nav.index >= nav.count - 1} aria-label="Next idea"><span className={styles.down}><Chevron back /></span></button>
        </div>
      </header>

      <div className={styles.pager} ref={pager} onScroll={onScroll}>
        {/* ── Idea ── */}
        <section className={styles.page} aria-label={idea.kind === "case" ? "Case" : "Idea"} role="tabpanel">
          <div className={styles.head}>
            <button type="button" className={styles.author} onClick={() => setSheet({ kind: "author" })}>
              <span className={base.authorAvatar}>{initialsOf(brief.author.name)}</span>
              <span className={base.authorText}><span className={base.authorName}>{brief.author.name}</span><span className={base.authorLine}>raised {idea.raised}</span></span>
            </button>
            <span className={base.badge} data-tone={idea.tone}>{idea.badge}</span>
          </div>
          <h1 className={styles.title}>{idea.title}</h1>
          <p className={styles.lede}>{brief.description}</p>


          {(brief.depts.length > 0 || brief.people.length > 0) && (
            <div className={styles.block}>
              <span className={base.label}>Affects</span>
              <div className={styles.rail}>
                {brief.depts.map((d) => (
                  <button key={d.id} type="button" className={base.deptChip} onClick={() => setSheet({ kind: "dept", id: d.id, member: null })}>{d.name}{d.ai && <Sparkle />}</button>
                ))}
                {brief.people.map((p) => (
                  <button key={p.name} type="button" className={base.personChip} onClick={() => setSheet({ kind: "person", name: p.name })}><span className={base.chipAvatar}>{initialsOf(p.name)}</span>{p.name}{p.ai && <Sparkle />}</button>
                ))}
              </div>
            </div>
          )}
          {brief.context && (
            <div className={styles.block}><span className={base.label}>Context</span><p className={base.para}>{brief.context}</p></div>
          )}
          {brief.prompts.length > 0 && <dl className={`${base.panel} ${styles.prompts}`}>{brief.prompts.map((p) => <PanelRow key={p.label} k={p.label}>{p.text}</PanelRow>)}</dl>}
          {brief.files.length > 0 && (
            <div className={styles.block}>
              <span className={base.label}>Attachments · {brief.files.length}</span>
              <div className={styles.rail}>{brief.files.map((f) => <FileChip key={f.name} ext={f.ext} name={f.short} title={f.name} meta={f.size} />)}</div>
            </div>
          )}
        </section>

        {/* ── AI ── */}
        <section className={styles.page} aria-label="What the AI found" role="tabpanel">
          <div className={styles.rings} role="group" aria-label="Scores">
            {brief.scores.map((s, i) => (
              <button key={s.label} type="button" className={styles.ringBtn} onClick={() => setSheet({ kind: "score", i })} aria-label={s.label + " " + s.value + " of 100, show the reasoning"}>
                <span className={styles.ringWrap}><Ring value={s.value} size={52} /><span className={styles.ringNum}>{s.value}</span></span>
                <span className={styles.ringLabel}>{s.label}</span>
              </button>
            ))}
          </div>
          <span className={styles.hint}>Tap a score for the reasoning</span>
          <AiBrief brief={brief} srcId={uid + "-ai"} foldSources />
        </section>

        {/* ── Feed ── */}
        <section className={`${styles.page} ${styles.feed}`} aria-label="From the feed" role="tabpanel">
          <FeedBody brief={brief} feed={feed} onPerson={(i) => setSheet({ kind: "feed", i })} onComment={onComment} />
        </section>
      </div>

      <footer className={styles.dock}>
        <span className={styles.dockText}>
          {status ? <><span className={styles.dockLabel}>{status.label}</span><span className={styles.dockSub}>{status.sub || status.lines[0]}</span></>
            : rec ? <><span className={styles.dockLabel}><Sparkle size={12} />AI suggests</span><span className={styles.dockSub}>{rec.label}</span></>
            : <span className={styles.dockLabel}>Nothing left to decide</span>}
        </span>
        {brief.actions.length > 0 && <button type="button" className={styles.decide} onClick={() => setSheet({ kind: "decide" })}>Decide</button>}
      </footer>

      {sheet && <PhoneSheet brief={brief} feed={feed} sheet={sheet} setSheet={setSheet} status={status} decide={decide} srcId={uid + "-score"} />}
    </div>
  );
}

function PhoneSheet({ brief, feed, sheet, setSheet, status, decide, srcId }: { brief: IdeaBrief; feed: IdeaProps["feed"]; sheet: Sheet; setSheet: (s: Sheet | null) => void; status: IdeaProps["status"]; decide: (k: string) => void; srcId: string }) {
  // The handle: a tap closes the sheet, a drag pulls it down with the finger and closes it past 80px.
  const sheetRef = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const moved = useRef(false); // a drag that snapped back is not a tap
  // clientY is in screen pixels; the sheet moves in page pixels, which differ by the page scale.
  const dyOf = (e: React.PointerEvent, el: HTMLElement) => e.clientY - (start.current ?? e.clientY);
  const grab = (e: React.PointerEvent<HTMLButtonElement>) => { start.current = e.clientY; moved.current = false; e.currentTarget.setPointerCapture(e.pointerId); };
  const drag = (e: React.PointerEvent) => {
    const el = sheetRef.current;
    if (start.current === null || !el) return;
    el.style.transition = "none";
    el.style.transform = `translateY(${Math.max(0, dyOf(e, el))}px)`;
  };
  const drop = (e: React.PointerEvent) => {
    const el = sheetRef.current;
    if (start.current === null || !el) return;
    const dy = dyOf(e, el);
    start.current = null;
    moved.current = Math.abs(dy) > 6;
    if (dy > 80) { setSheet(null); return; }
    el.style.transition = "transform 220ms ease";
    el.style.transform = "";
  };
  let label = "", body: React.ReactNode = null;
  if (sheet.kind === "score") {
    const s = brief.scores[sheet.i];
    label = s.label + " reasoning";
    body = (
      <>
        <div className={styles.scoreTabs} role="tablist" aria-label="Scores">
          {brief.scores.map((x, i) => (
            <button key={x.label} type="button" role="tab" aria-selected={i === sheet.i} className={styles.scoreTab} data-on={i === sheet.i ? "true" : undefined} onClick={() => setSheet({ kind: "score", i })}>
              <span className={styles.scoreTabNum}>{x.value}</span>{x.label}
            </button>
          ))}
        </div>
        <div key={sheet.i} className={styles.reason}>
          <div className={styles.reasonHead}>
            <span className={styles.ringWrap}><Ring value={s.value} size={64} /><span className={styles.ringNumBig}>{s.value}</span></span>
            <p className={base.leadPara}>{s.note}</p>
          </div>
          <Blocks blocks={s.blocks} srcId={srcId} />
          <Sources id={srcId} list={s.sources} fold />
        </div>
      </>
    );
  } else if (sheet.kind === "author") {
    label = brief.author.name;
    body = <PersonCard p={brief.author} />;
  } else if (sheet.kind === "person") {
    const p = brief.people.find((x) => x.name === sheet.name);
    label = sheet.name;
    body = p ? <PersonCard p={p} why={p.why} /> : null;
  } else if (sheet.kind === "feed") {
    const p = feed[sheet.i]?.person ?? null;
    label = feed[sheet.i]?.name ?? "";
    body = p ? <PersonCard p={p} /> : null;
  } else if (sheet.kind === "dept") {
    const d = brief.depts.find((x) => x.id === sheet.id);
    const m = d && sheet.member ? d.members.find((x) => x.name === sheet.member) ?? null : null;
    label = d?.name ?? "";
    body = !d ? null : m ? (
      <div className={base.drill}>
        <button type="button" className={base.back} onClick={() => setSheet({ ...sheet, member: null })}><Chevron back />{d.name}</button>
        <PersonCard p={m} />
      </div>
    ) : (
      <>
        <div className={base.popListHead}><span className={base.popName}>{d.name}</span><span className={base.small}>{d.members.length} {d.members.length === 1 ? "person" : "people"}</span></div>
        {d.why && <div className={base.aiWhy}><Sparkle /><span>{d.why}</span></div>}
        <div className={styles.members}>
          {d.members.map((x) => (
            <button key={x.name} type="button" className={base.member} onClick={() => setSheet({ ...sheet, member: x.name })}>
              <span className={base.memberAvatar}>{initialsOf(x.name)}</span>
              <span className={base.popWho}><span className={base.memberName}>{x.name}</span><span className={base.popRole}>{x.role}</span></span>
              <span className={base.memberGo}><Chevron /></span>
            </button>
          ))}
        </div>
      </>
    );
  } else {
    label = "Your decision";
    body = (
      <>
        <h2 className={base.sideTitle}>Your decision</h2>
        <StatusBox status={status} />
        <DecisionList brief={brief} onDecide={decide} />
      </>
    );
  }
  return (
    <>
      <div className={styles.scrim} onClick={() => setSheet(null)} />
      <div className={styles.sheet} ref={sheetRef} role="dialog" aria-modal="true" aria-label={label}>
        <button type="button" className={styles.handle} aria-label="Close" onClick={() => { if (!moved.current) setSheet(null); }} onPointerDown={grab} onPointerMove={drag} onPointerUp={drop} onPointerCancel={drop} />
        <div className={styles.sheetBody}>{body}</div>
      </div>
    </>
  );
}
