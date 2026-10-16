"use client";
// The demo controls: the presenter's remote for the static demo's story (features/ideas/demo-script.ts), in
// the dev menu's language and size (dark panel, IBM Plex Mono caps, the toggles' solid orange). It sits in
// the dev column right under the Dev button. Its grip drags the card anywhere; the Dev button and its panel
// stay in their corner and only step aside when the card would cover them - the one part of the page it
// moves. A reload or the reset button puts it back. The chevron folds it to a pill like the Dev button's
// (remembered in this browser). Clicks on it never reach the page behind: no menu of the app closes, nothing
// moves out of its way. The next step's title with where it happens, and one button that takes it; the
// three dots go a step back or restart the demo. Every click the story needs is a step here:
//
//   Fill sample idea  the reporting-screen idea in the start view
//   Send to NextUp    Ask NextUp: the chat with NextUp's reply, its short read and what is still unclear
//   First, Second answer + Send answer  each filled and sent: three exchanges before it can be published
//   Preview           the last look before it goes out
//   Find receiver     to the receiver NextUp ranks first
//   Switch to team leader  the inbox of whoever received it
//   Open the idea     the idea open in that inbox
//   Accept it         "Yes, do it" (a project opens when projects are on)
//   Open the project  the team leader's new project (skipped when projects are off)
//   Manager view      the Dashboard
//
// The button waits (dimmed, its tooltip says why) while the step cannot be taken yet - until NextUp has
// answered, until the idea is sent. The raise page says which clicks it can take (lib/demo-controls.ts).
// A step the presenter took on the page itself (the role switched in the dev panel, the idea opened in the
// inbox, its own "Yes, do it", the project opened from a link) is passed over, so the button never gets stuck.
// Static demo only.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { usePathname, useRouter } from "next/navigation";
import { DEMO_IDEA, FILLED_ANSWERS } from "@/features/ideas/demo-script";
import { projectOfCase } from "@/features/projects/selectors";
import { getInboxCase, getRaiseHooks, getRun, getServerRun, noInboxCase, noRaiseHooks, RUN_PARAM, setRun, subscribeInboxCase, subscribeRaiseHooks, subscribeRun } from "@/lib/demo-controls";
import styles from "./DemoControls.module.css";
import dev from "./DevPanel.module.css";

// `where`: the tag on the right - where the step happens. `verb`: the button. `undo`: how "Back a step" leaves
// this step - the screen before it (browser history, or the role switched back); none where only data changed.
// `past`: already done on the page itself (the composer's own send, the chat's Publish): the button passes it over.
type Step = { label: string; where: string; verb: string; sub: string; can: boolean; run: () => void; undo?: () => void; past?: boolean };
const ORDINAL = ["First", "Second", "Third", "Fourth"];
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
  const router = useRouter();
  const hooks = useSyncExternalStore(subscribeRaiseHooks, getRaiseHooks, noRaiseHooks);
  const run = useSyncExternalStore(subscribeRun, getRun, getServerRun); // this page load's run
  const inboxCase = useSyncExternalStore(subscribeInboxCase, getInboxCase, noInboxCase); // the case open in the leader's inbox
  const pathname = usePathname();
  // Remember how far the script got: while NextUp answers the page offers nothing, and `at` reads -1.
  useEffect(() => { if (hooks.at > run.reached) setRun({ reached: hooks.at }); }, [hooks.at, run.reached]);
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
  // added), and the run there begins at Fill sample idea (lib/demo-controls.ts RUN_PARAM).
  const start = () => window.location.assign(href("/raise") + "?" + RUN_PARAM);

  const raise = () => ctx.setRole("member"); // back on Jonas's raise page, the conversation as it was
  const history = () => router.back(); // the screen before, from the browser's history (the raise page's URL names its screens)
  const inbox = () => { if (published) ctx.setLeadAs(published.assignee); };
  const openCase = () => { if (published) router.push(href("/leader?id=" + encodeURIComponent(published.id))); };
  // "Yes, do it": with projects on, the yes opens a project led by the receiver, named after the idea.
  const accept = () => {
    if (!published) return;
    if (ctx.flag("projects")) ctx.act.accept(published.id, { lead: published.assignee, title: published.title });
    else ctx.act.decide(published.id, "yes");
    ctx.showToast("Yes. " + published.from + " has been told" + (ctx.flag("projects") ? "; the project is open." : "."));
  };
  // The project that yes opened, on the team leader's screen; the manager's view comes only after it.
  const project = published?.decided?.answer === "yes" ? projectOfCase(S, published) : undefined;
  const projectHref = project ? href("/projects/" + encodeURIComponent(project.id)) : null;
  const openProject = () => { if (projectHref) router.push(projectHref); };
  const leading = ctx.role === "leader";
  // The same clicks made on the page itself pass the steps over, so the button always offers what is still to do.
  const decided = !!published?.decided;
  const managing = ctx.role === "manager" && decided; // the manager's screens once the yes is in: the end of the story
  const caseOpen = !!published && leading && (inboxCase === published.id || pathname === href("/cases/" + encodeURIComponent(published.id)));
  const onProject = !!projectHref && pathname === projectHref;
  const reached = Math.max(run.reached, hooks.at); // how far the conversation got in the script this run
  const steps: Step[] = [
    { label: "Fill sample idea", where: "Raise", verb: "Fill", sub: hooks.fillIdea ? "The reporting-screen idea" : "On the raise page, before anything is sent", can: !!hooks.fillIdea, run: () => hooks.fillIdea?.(), past: reached >= 1 },
    { label: "Send to NextUp", where: "Raise", verb: "Send", sub: hooks.send ? "Ask NextUp" : "Fill the idea first", can: !!hooks.send, run: () => hooks.send?.(), past: reached >= 1 },
    ...Array.from({ length: FILLED_ANSWERS }, (_, k): Step[] => [
      { label: ORDINAL[k] + " answer", where: "Chat", verb: "Fill", sub: hooks.at === k + 1 && hooks.fillAnswer ? "The script’s answer to NextUp’s question" : "Waiting for NextUp’s question", can: hooks.at === k + 1 && !!hooks.fillAnswer, run: () => hooks.fillAnswer?.(),
        past: reached >= k + 2 || (hooks.at === k + 1 && !!hooks.send && !hooks.fillAnswer) },
      { label: "Send answer", where: "Chat", verb: "Send", sub: hooks.at === k + 1 && hooks.send ? "Send it to NextUp" : "Fill the answer first", can: hooks.at === k + 1 && !!hooks.send, run: () => hooks.send?.(), past: reached >= k + 2 },
    ]).flat(),
    { label: "Preview", where: "Chat", verb: "Preview", sub: hooks.preview ? "The last look before it goes out" : "Waiting for NextUp’s reply", can: !!hooks.preview, run: () => hooks.preview?.(), undo: history, past: !!hooks.findReceiver || !!published },
    { label: "Find receiver", where: "Preview", verb: "Send", sub: hooks.findReceiver ? "To the receiver NextUp suggests" : "Open the preview first", can: !!hooks.findReceiver, run: () => hooks.findReceiver?.(), undo: history, past: !!published },
    { label: "Switch to team leader", where: "Inbox", verb: "Switch", sub: published ? "The inbox of " + published.assignee : "Waiting for the idea to be sent", can: !!published, run: inbox, undo: raise,
      past: !!published && (leading || decided) },
    { label: "Open the idea", where: "Inbox", verb: "Open", sub: published ? published.title : "Send the idea first", can: !!published && leading, run: openCase, undo: inbox, // not history: the person is not in the URL
      past: caseOpen || decided },
    { label: "Accept it", where: "Inbox", verb: "Accept", sub: "Yes, do it", can: !!published && leading && !decided, run: accept,
      past: decided },
    { label: "Open the project", where: "Projects", verb: "Open", sub: project ? project.title : "Accept the idea first", can: !!project, run: openProject, undo: openCase,
      past: !ctx.flag("projects") || onProject || managing || (decided && !project) },
    { label: "Manager view", where: "Dashboard", verb: "Open", sub: "The Dashboard", can: true, run: () => ctx.setRole("manager"), undo: inbox,
      past: managing },
  ];
  // The step the button takes; steps.length once all are taken.
  let at = run.done + 1;
  while (steps[at]?.past) at += 1;
  // Opening and accepting the idea need the leader's inbox: away from it before the yes (the role switched by
  // hand), the button offers the switch again instead of waiting.
  const toLead = steps.findIndex((s) => s.label === "Switch to team leader");
  if (published && !leading && !decided && at > toLead && steps[at]?.where === "Inbox") at = toLead;
  const step = steps[at] ?? null;
  const take = () => { if (!step?.can) return; setRun({ done: at }); step.run(); };
  // A step back: the button offers the last step again, and the screen from before it comes back. A step that
  // changed data (a message sent, the yes) stays done - nothing is undone, the step is only offered again.
  const goBack = () => { setMenu(null); const undo = steps[run.done]?.undo; setRun({ done: Math.max(-1, run.done - 1) }); undo?.(); };
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
          <button type="button" role="menuitem" onClick={goBack} disabled={run.done < 0}>Back a step</button>
          <button type="button" role="menuitem" onClick={restart}>Restart demo</button>
        </div>
      )}
    </div>
  );
}
