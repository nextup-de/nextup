"use client";
// The demo controls: the presenter's remote for the static demo's story (features/ideas/demo-script.ts), in
// the dev menu's language and size (dark panel, IBM Plex Mono caps, the toggles' solid orange). It sits in
// the dev column right under the Dev button. Its grip drags the card anywhere; the Dev button and its panel
// stay in their corner and only step aside when the card would cover them - the one part of the page it
// moves. A reload or the reset button puts it back. The chevron folds it to a pill like the Dev button's
// (remembered in this browser). Clicks on it never reach the page behind: no menu of the app closes, nothing
// moves out of its way. The next step's title with where it happens, and one button that takes it; the
// three dots go a step back or restart the demo. The steps:
//
//   Start demo        fresh from the seed, as Jonas on the raise page
//   Fill sample idea  the reporting-screen idea in the start view - the presenter presses Ask NextUp
//   First, Second answer  the next answer in the composer - the presenter presses Send
//   Full conversation the rest of the eight topics in one go - then the presenter publishes it
//   Receiver view     the inbox of whoever received it
//   Manager view      the Dashboard
//
// The button waits (dimmed, its tooltip says why) while the step cannot be taken yet - until NextUp has
// answered, until the idea is published. The raise page says which fills it can take (lib/demo-controls.ts).
// Static demo only.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { DEMO_IDEA, FILLED_ANSWERS } from "@/features/ideas/demo-script";
import { getRaiseHooks, getRun, getServerRun, noRaiseHooks, RUN_PARAM, setRun, subscribeRaiseHooks, subscribeRun } from "@/lib/demo-controls";
import styles from "./DemoControls.module.css";
import dev from "./DevPanel.module.css";

// `where`: the tag on the right - where the step happens. `verb`: the button. `back`: what going back to
// this step shows again - the page the presenter was on after taking it.
type Step = { label: string; where: string; verb: string; sub: string; can: boolean; run: () => void; back?: () => void };
const ORDINAL = ["First", "Second", "Third", "Fourth", "Fifth"];
const FOLDED = "nextup.demo.card.folded.v1"; // whether the card is folded, in this browser
const EDGE = 8; // a dragged card never goes closer to the window's edge than this
const GAP = 8; // the Dev button keeps this far from a card that would cover it

let folded: boolean | null = null;
const foldSubs = new Set<() => void>();
const getFolded = () => {
  if (folded === null) { try { folded = localStorage.getItem(FOLDED) === "1"; } catch { folded = false; } }
  return folded;
};
const setFolded = (on: boolean) => {
  folded = on;
  try { localStorage.setItem(FOLDED, on ? "1" : "0"); } catch { /* private mode: until the reload */ }
  foldSubs.forEach((f) => f());
};
const subscribeFolded = (f: () => void) => { foldSubs.add(f); return () => { foldSubs.delete(f); }; };

type Spot = { x: number; y: number }; // the dragged card's top-left corner
// Where the card was dragged to, for this page load: kept from one page of the demo to the next, gone on a reload.
let kept: Spot | null = null;

// The card out of the dev column, at `p`, kept inside the window. Returns where it went.
function placeCard(el: HTMLElement, p: Spot): Spot {
  const x = Math.min(Math.max(EDGE, p.x), window.innerWidth - el.offsetWidth - EDGE);
  const y = Math.min(Math.max(EDGE, p.y), window.innerHeight - el.offsetHeight - EDGE);
  el.dataset.moved = "true";
  Object.assign(el.style, { left: x + "px", top: y + "px" });
  return { x, y };
}
// Back in the dev column, under the Dev button.
function unplaceCard(el: HTMLElement) {
  delete el.dataset.moved;
  Object.assign(el.style, { left: "", top: "" });
}
// The dev column (DevPanel.tsx: the Dev button, and its panel when open) stays in its corner - unless the
// dragged card covers it: then it steps up to just above the card, or below it when there is no room above.
function dodge(col: HTMLElement, card: HTMLElement) {
  col.style.bottom = "";
  if (card.dataset.moved !== "true") return;
  const c = card.getBoundingClientRect(), r = col.getBoundingClientRect();
  if (r.right <= c.left - GAP || r.left >= c.right + GAP || r.bottom <= c.top - GAP || r.top >= c.bottom + GAP) return;
  const h = window.innerHeight;
  col.style.bottom = (c.top - GAP - r.height >= EDGE ? h - c.top + GAP : Math.max(EDGE, h - c.bottom - GAP - r.height)) + "px";
}

export function DemoControls() {
  const ctx = useDemo();
  const { S, href } = ctx;
  const hooks = useSyncExternalStore(subscribeRaiseHooks, getRaiseHooks, noRaiseHooks);
  const run = useSyncExternalStore(subscribeRun, getRun, getServerRun); // this page load's run
  const isFolded = useSyncExternalStore(subscribeFolded, getFolded, () => false);
  const [menu, setMenu] = useState<"up" | "down" | null>(null); // open, above or below the card
  const [moved, setMoved] = useState(() => kept !== null); // dragged out of the dev column (until a reload or the reset)
  const card = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);

  // Where it was on the last page; inside the window when the window shrinks or the card unfolds; the Dev
  // button out of its way whenever either of them changes size (the Dev panel opening, the card folding).
  useEffect(() => {
    const el = card.current, col = el?.parentElement;
    if (!el || !col) return;
    const again = () => { if (kept) kept = placeCard(el, kept); dodge(col, el); };
    again();
    const sizes = new ResizeObserver(again);
    sizes.observe(el);
    sizes.observe(col);
    window.addEventListener("resize", again);
    return () => { sizes.disconnect(); window.removeEventListener("resize", again); col.style.bottom = ""; };
  }, []);

  // Only the grip drags.
  const onGripDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0 || !card.current) return;
    const r = card.current.getBoundingClientRect();
    drag.current = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault(); // no text selection while dragging
    setMenu(null);
  };
  const onGripMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const d = drag.current, el = card.current, col = el?.parentElement;
    if (!d || d.id !== e.pointerId || !el || !col) return;
    kept = placeCard(el, { x: e.clientX - d.dx, y: e.clientY - d.dy });
    dodge(col, el);
    if (!moved) setMoved(true);
  };
  const onGripUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (drag.current && drag.current.id === e.pointerId) drag.current = null;
  };
  const resetSpot = () => {
    const el = card.current, col = el?.parentElement;
    kept = null; setMoved(false); setMenu(null);
    if (el) unplaceCard(el);
    if (el && col) dodge(col, el);
  };
  // Clicks on the card stay on the card: the app's own "click outside closes it" listeners (on document,
  // after React's) never see them.
  const keep = (e: React.SyntheticEvent) => e.nativeEvent.stopImmediatePropagation();

  // The menu closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (card.current && !card.current.contains(e.target as Node)) setMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menu]);
  // It opens on the side of the card with room: above, unless the card was dragged near the top.
  const toggleMenu = () => setMenu((m) => (m ? null : (card.current?.getBoundingClientRect().top ?? 999) < 160 ? "down" : "up"));

  // The case the script published: the newest one raised in this browser with the idea's title.
  const added = S.cases.filter((c) => !c.seed);
  const published = added.find((c) => c.title === DEMO_IDEA.text) ?? added.at(-1) ?? null;

  // Start from the seed: the raise page loads again (components/demo/StaticDemo.tsx wipes what the last run
  // added), and the run there begins with Start demo taken (lib/demo-controls.ts RUN_PARAM).
  const start = () => window.location.assign(href("/raise") + "?" + RUN_PARAM);

  const raise = () => ctx.setRole("member"); // back on Jonas's raise page, the conversation as it was
  const inbox = () => { if (published) ctx.setLeadAs(published.assignee); };
  const steps: Step[] = [
    { label: "Start demo", where: "Demo", verb: "Start", sub: "A fresh demo, from the seed", can: true, run: start, back: raise },
    { label: "Fill sample idea", where: "Raise", verb: "Fill", sub: hooks.fillIdea ? "Then press Ask NextUp" : "On the raise page, before anything is sent", can: !!hooks.fillIdea, run: () => hooks.fillIdea?.(), back: raise },
    ...Array.from({ length: FILLED_ANSWERS }, (_, k): Step => ({
      label: ORDINAL[k] + " answer", where: "Chat", verb: "Fill", sub: hooks.at === k + 1 && hooks.fillAnswer ? "Then press Send" : "Waiting for NextUp’s question",
      can: hooks.at === k + 1 && !!hooks.fillAnswer, run: () => hooks.fillAnswer?.(), back: raise,
    })),
    { label: "Full conversation", where: "Chat", verb: "Fill", sub: hooks.fillRest ? "Then publish it" : "Waiting for NextUp’s reply to the " + ORDINAL[FILLED_ANSWERS - 1].toLowerCase() + " answer", can: !!hooks.fillRest, run: () => hooks.fillRest?.(), back: raise },
    { label: "Receiver view", where: "Inbox", verb: "Open", sub: published ? "The inbox of " + published.assignee : "Publish the idea first", can: !!published, run: inbox, back: inbox },
    { label: "Manager view", where: "Dashboard", verb: "Open", sub: "The Dashboard", can: true, run: () => ctx.setRole("manager") },
  ];
  const at = run.started ? run.done + 1 : 0; // the step the button takes; steps.length once all are taken
  const step = steps[at] ?? null;
  const take = () => { if (!step?.can) return; setRun({ done: at }); step.run(); };
  // A step back: the button offers the last step again, and the page from before it comes back.
  const goBack = () => { setMenu(null); const to = Math.max(0, run.done - 1); setRun({ done: to }); steps[to].back?.(); };
  const restart = () => { setMenu(null); start(); };

  // Folded: a pill like the Dev button's; a click unfolds it where it is.
  if (isFolded) return (
    <div className={styles.card} ref={card} role="group" aria-label="Demo controls" data-folded="true" onMouseDown={keep} onClick={keep} onTouchStart={keep}>
      <button type="button" className={dev.toggle} onClick={() => setFolded(false)} aria-label="Expand demo controls" title={step ? "Next: " + step.label : "Demo done"}>
        <span className={dev.toggleDot} />Demo
      </button>
    </div>
  );

  return (
    <div className={styles.card} ref={card} role="group" aria-label="Demo controls" onMouseDown={keep} onClick={keep} onTouchStart={keep}>
      <div className={styles.head}>
        <span className={styles.grip} onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={onGripUp}
          title="Drag to move" aria-hidden="true">
          <svg width="6" height="12" viewBox="0 0 6 12" fill="currentColor"><circle cx="1.2" cy="1.5" r="1.2" /><circle cx="4.8" cy="1.5" r="1.2" /><circle cx="1.2" cy="6" r="1.2" /><circle cx="4.8" cy="6" r="1.2" /><circle cx="1.2" cy="10.5" r="1.2" /><circle cx="4.8" cy="10.5" r="1.2" /></svg>
        </span>
        <span className={styles.title} aria-live="polite">{step ? step.label : "Demo done"}</span>
        <span className={styles.where}>{step ? step.where : "Demo"}</span>
        {moved && (
          <button type="button" className={styles.icon} onClick={resetSpot} aria-label="Reset position" title="Back under the Dev button">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 1.5l7 7M9.5 3.5v6h-6" /></svg>
          </button>
        )}
        <button type="button" className={styles.icon} onClick={() => { setMenu(null); setFolded(true); }} aria-label="Collapse demo controls" title="Collapse">
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg>
        </button>
        <button type="button" className={styles.icon} onClick={toggleMenu} aria-label="Demo menu" aria-haspopup="menu" aria-expanded={!!menu}>
          <svg width="4" height="14" viewBox="0 0 4 14" fill="currentColor" aria-hidden="true"><circle cx="2" cy="2" r="1.4" /><circle cx="2" cy="7" r="1.4" /><circle cx="2" cy="12" r="1.4" /></svg>
        </button>
      </div>
      <div className={styles.rule} />
      <button type="button" className={styles.go} onClick={step ? take : restart} disabled={!!step && !step.can}
        title={step ? step.sub : "Start the demo over"} aria-label={step ? step.label : "Restart demo"}>
        <span>{step ? step.verb : "Restart"}</span>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 6h13M9 1l5 5-5 5" /></svg>
      </button>
      {menu && (
        <div className={styles.menu} data-side={menu} role="menu">
          <button type="button" role="menuitem" onClick={goBack} disabled={!run.started || run.done <= 0}>Back a step</button>
          <button type="button" role="menuitem" onClick={restart}>Restart demo</button>
        </div>
      )}
    </div>
  );
}
