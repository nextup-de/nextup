"use client";
// TEAM MEMBER home: the raise box, after the collaborator's NextUp mockup. Idea or problem, one line,
// optional screenshots, the people or departments it also hits and who can see it (View), then ↑. NextUp evaluates it
// against the company context (org chart, routing map, goals, spend rule, known problems) -
// features/evaluate - and the lower card shows that evaluation step by step before the case is raised.
// While nothing is typed the lower card explains how NextUp works; while typing it takes context.
// Demo: the steps are timed, the facts are real; the screenshots stay in this browser (src/lib/shots.ts,
// keyed by case id), only their count becomes an event fact.
// Ask first: Enter sends the line to the assistant (docs/ASSISTANT.md), whose answer takes the lower card.
// If it does not solve it, "Raise it anyway" runs the evaluation with the conversation as context. With
// the assistant off for the company, Enter raises straight away, as before.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { EvalOrb } from "@/components/dashboard/team/EvalOrb";
import { SITE } from "@/config/site";
import type { CaseKind, Visibility } from "@/features/cases/events";
import { evaluate, type Evaluation } from "@/features/evaluate";
import { draftRaise } from "@/features/assist/draft";
import { saveShots, shrinkImage, type Shot } from "@/lib/shots";
import { useAssist } from "@/lib/use-assist";
import { linkAssistRaiseAction, rateAssistAction } from "@/server/actions/assist";
import { AssistAnswer } from "./AssistAnswer";
import styles from "./RaiseView.module.css";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";

const KINDS: { id: CaseKind; label: string; placeholder: string }[] = [
  { id: "idea", label: "Idea", placeholder: "Share an idea that would make work better…" },
  { id: "problem", label: "Problem", placeholder: "Describe a problem you keep running into…" },
];
const STEP_MS = 1100; // one step per ~1.1 s -> about 9 s for eight steps
const MAX_SHOTS = 4;
const MIN_CHARS = 8;
const PICK_PAGE = 5; // rows per page in the affected picker; longer lists page instead of scrolling
const PROMPTS = ["Impact", "Who's blocked", "Already tried", "Deadline"];
// Who can see it (the View pill). Only applied in the browser for now - see features/cases/visibility.
const VIEWS: { id: Visibility; label: string; note: string }[] = [
  { id: "everyone", label: "Everyone", note: "The whole company, on the dashboard" },
  { id: "private", label: "Private", note: "Only you and the desk it lands on" },
  { id: "custom", label: "Custom", note: "You, the desk, and who you pick" },
];
const ORB_PX = 96;
const HOW: { id: "raise" | "context" | "score" | "track"; title: string; text: string }[] = [
  { id: "raise", title: "Raise it", text: "Anyone, from any team, submits an idea or a problem in one line." },
  { id: "context", title: "It reads the context", text: SITE.name + " maps it against your org structure, business model, and goals." },
  { id: "score", title: "Validated & scored", text: "Scored on strategic fit, urgency, impact, and KPI relevance." },
  { id: "track", title: "Connected & tracked", text: "The right people pick it up; results roll up to leadership." },
];

type Phase = { at: "edit" } | { at: "thinking"; ev: Evaluation; done: number } | { at: "done"; ev: Evaluation; id: string };
type Pick = { id: string; label: string; meta: string; dept?: string }; // dept: a department row, expandable to its people

export function RaiseView() {
  const ctx = useDemo();
  const { seed, S, persona, act, ready, href, tenant, showToast } = ctx;
  const [kind, setKind] = useState<CaseKind>("idea");
  const [switches, setSwitches] = useState(0); // re-keys the ring so it washes in on every toggle
  const [draft, setDraft] = useState("");
  const [context, setContext] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [affected, setAffected] = useState<string[]>([]);
  const [pick, setPick] = useState<"affected" | "view" | null>(null); // the open picker: who else is affected, or who can see it
  const [view, setView] = useState<Visibility>("everyone");
  const [seenBy, setSeenBy] = useState<string[]>([]); // View → Custom: the people and departments who may see it
  const [pickQuery, setPickQuery] = useState("");
  const [pickPages, setPickPages] = useState<Record<string, number>>({}); // page per group, keyed by group label or dept id
  const [openDept, setOpenDept] = useState<string | null>(null); // department row expanded to its people
  const [reading, setReading] = useState(0); // files still being shrunk
  const [phase, setPhase] = useState<Phase>({ at: "edit" });
  const [reduced, setReduced] = useState(false); // prefers-reduced-motion: the steps land fast and the orb holds still
  const fileRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const raisedFrom = useRef<string | null>(null); // the assistant conversation a raise came out of
  const pageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const { view: ai, ask, reset: resetAi } = useAssist(tenant.slug);

  // Phones: the box rides at the bottom of the screen and on top of the keyboard. iOS does not shrink the
  // layout for the keyboard, so the visual viewport says how much it covers (--kb), how much is still
  // visible (--vv-h) and the CSS keeps the box and the picker in that space; --box-h keeps the card clear of the box.
  useEffect(() => {
    const page = pageRef.current, box = boxRef.current, vv = window.visualViewport;
    if (!page || !box) return;
    const sync = () => {
      const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      page.style.setProperty("--kb", kb + "px");
      page.style.setProperty("--vv-h", (vv ? vv.height : window.innerHeight) + "px");
      page.style.setProperty("--box-h", box.offsetHeight + "px");
    };
    sync();
    vv?.addEventListener("resize", sync); vv?.addEventListener("scroll", sync);
    const ro = new ResizeObserver(sync); ro.observe(box);
    return () => { vv?.removeEventListener("resize", sync); vv?.removeEventListener("scroll", sync); ro.disconnect(); };
  }, [ready]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync(); mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // The evaluation plays out one step at a time; the case is raised once the last step lands.
  useEffect(() => {
    if (phase.at !== "thinking") return;
    const { ev, done } = phase;
    timer.current = setTimeout(() => {
      if (done < ev.steps.length) setPhase({ at: "thinking", ev, done: done + 1 });
      else {
        const id = act.raise(ev.payload);
        if (raisedFrom.current) void linkAssistRaiseAction({ slug: tenant.slug, sessionId: raisedFrom.current, caseId: id });
        raisedFrom.current = null;
        if (!saveShots(tenant.slug, id, shots)) showToast("Case raised — the screenshots did not fit in this browser's storage.");
        setPhase({ at: "done", ev, id });
      }
    }, reduced ? 150 : STEP_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [phase, act, shots, tenant.slug, showToast, reduced]); // shots cannot change while thinking: the box is locked

  // A picker closes on a click outside the pills or on Escape.
  useEffect(() => {
    if (!pick) return;
    const onDown = (e: MouseEvent) => { if (pickRef.current && !pickRef.current.contains(e.target as Node)) setPick(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPick(null); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [pick]);

  if (!ready) return <PageSkeleton kind="raise" delay />;

  const who = persona.who;
  const current = KINDS.find((k) => k.id === kind) ?? KINDS[0];
  const other = kind === "idea" ? "problem" : "idea";
  const locked = phase.at !== "edit";
  const asking = ai.status === "asking";
  const composing = draft.trim().length > 0;
  const canSend = draft.trim().length >= MIN_CHARS && !locked && !asking;
  const words = context.trim() ? context.trim().split(/\s+/).length : 0;

  // Who it also hits: the org chart and the departments, searched by name, role or department.
  const q = pickQuery.trim().toLowerCase();
  const hit = (p: Pick) => !q || p.label.toLowerCase().includes(q) || p.meta.toLowerCase().includes(q);
  const groups: { label: string; items: Pick[] }[] = [
    { label: "People", items: seed.people.filter((p) => p.name !== who.name).map((p) => ({ id: p.name, label: p.name, meta: p.role + " · " + p.dept })).filter(hit) },
    { label: "Departments", items: seed.depts.map((d) => ({ id: d.name, label: d.name, meta: d.people + " people", dept: d.id })).filter(hit) },
  ].filter((g) => g.items.length > 0);
  const inDept = (id: string): Pick[] => seed.people.filter((p) => p.dept === id && p.name !== who.name).map((p) => ({ id: p.name, label: p.name, meta: p.role }));
  // Lists longer than a page are paged, not scrolled; the page is clamped so a narrower search never lands on an empty page.
  const pageOf = <T,>(key: string, items: T[]) => {
    const pages = Math.max(1, Math.ceil(items.length / PICK_PAGE));
    const page = Math.min(pickPages[key] ?? 0, pages - 1);
    return { page, pages, rows: items.slice(page * PICK_PAGE, (page + 1) * PICK_PAGE) };
  };
  const turnPage = (key: string, to: number) => setPickPages((p) => ({ ...p, [key]: to }));

  // Picked files are shrunk to small data URLs right away, so the preview and what gets stored are the same bytes.
  const addShots = (files: FileList | null) => {
    const picked = Array.from(files ?? []).filter((f) => f.type.startsWith("image/")).slice(0, MAX_SHOTS - shots.length);
    if (fileRef.current) fileRef.current.value = ""; // after the snapshot: clearing empties the FileList; same file again must fire change
    if (!picked.length) return;
    setReading((n) => n + picked.length);
    picked.forEach((f) => shrinkImage(f)
      .then((shot) => setShots((s) => (s.length < MAX_SHOTS ? [...s, shot] : s)), () => showToast("Could not read " + f.name + " as an image."))
      .finally(() => setReading((n) => n - 1)));
  };
  const toggleKind = () => { setKind(other); setSwitches((n) => n + 1); };
  const toggleIn = (set: typeof setAffected) => (id: string) => set((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const toggleAffected = toggleIn(setAffected), toggleSeen = toggleIn(setSeenBy);
  // Both pickers share one list: it ticks and toggles whichever selection is open.
  const sel = pick === "view" ? seenBy : affected, toggleSel = pick === "view" ? toggleSeen : toggleAffected;
  const openPick = (p: "affected" | "view") => { setPick((cur) => (cur === p ? null : p)); setPickQuery(""); setPickPages({}); setOpenDept(null); };
  const addPrompt = (label: string) => setContext((c) => (c.trim() ? c.replace(/\s*$/, "") + "\n" + label + ": " : label + ": "));
  const evaluateNow = (text: string, ctxText: string) => {
    setPick(null);
    const ev = evaluate({ kind, text, context: ctxText, affected, attachments: shots.length, who, visibility: view, seenBy }, { ...seed, cases: S.cases });
    setPhase({ at: "thinking", ev, done: 0 });
  };
  const send = () => { if (canSend) evaluateNow(draft, context); };
  // Enter / ↑: ask the assistant first; raise directly only when it is off for this company.
  const primary = () => {
    if (!canSend) return;
    if (!ai.available) return send();
    setPick(null);
    void ask(draft.trim()).then((r) => { if (r === "off") send(); });
  };
  const raiseAnyway = () => {
    const d = draftRaise(ai.turns.length ? ai.turns : [{ role: "user", text: ai.question || draft }]);
    const text = d.title || draft, ctxText = [context.trim(), d.context].filter(Boolean).join("\n");
    raisedFrom.current = ai.turns.length ? ai.sessionId : null;
    setDraft(text); setContext(ctxText);
    resetAi();
    evaluateNow(text, ctxText);
  };
  const reset = () => {
    setDraft(""); setContext(""); setShots([]); setAffected([]); setView("everyone"); setSeenBy([]); setPickQuery(""); setPickPages({}); setOpenDept(null); setPick(null); setPhase({ at: "edit" });
    resetAi();
  };
  const solved = () => {
    if (ai.turnId) void rateAssistAction({ slug: tenant.slug, turnId: ai.turnId, helpful: true });
    showToast("Glad that sorted it.");
    reset();
  };
  const askMore = () => { setDraft(""); fieldRef.current?.focus(); };

  const pickRow = (it: Pick) => {
    const on = sel.includes(it.id);
    return (
      <button key={it.id} type="button" className={styles.pickRow} onClick={() => toggleSel(it.id)} aria-pressed={on}>
        <span className={styles.pickMark} data-on={on ? "true" : undefined} aria-hidden="true">{on ? "✓" : ""}</span>
        <span className={styles.pickText}><span className={styles.pickLabel}>{it.label}</span><span className={styles.pickMeta}>{it.meta}</span></span>
      </button>
    );
  };
  const pager = (key: string, page: number, pages: number) => pages > 1 && (
    <div className={styles.pickPager}>
      <button type="button" className={styles.pickPage} onClick={() => turnPage(key, page - 1)} disabled={page === 0} aria-label="Previous page">‹</button>
      <span className={styles.pickPageN}>{page + 1} / {pages}</span>
      <button type="button" className={styles.pickPage} onClick={() => turnPage(key, page + 1)} disabled={page >= pages - 1} aria-label="Next page">›</button>
    </div>
  );

  const chips: { key: string; label: string; thumb?: string; remove: () => void }[] = [
    ...affected.map((n) => ({ key: "a:" + n, label: n, remove: () => toggleAffected(n) })),
    ...shots.map((s) => ({ key: "s:" + s.url, label: s.name, thumb: s.url, remove: () => setShots((x) => x.filter((y) => y.url !== s.url)) })),
  ];
  const attachLabel = reading > 0 ? "Adding…" : shots.length ? "Attached · " + shots.length : "Attach";
  const viewLabel = view === "custom" ? "Custom · " + seenBy.length : VIEWS.find((v) => v.id === view)?.label ?? "";

  // One picker for Affected and View: View puts its three choices on top, and the list (search,
  // people, departments) shows for Affected and for View → Custom.
  const listOn = pick === "affected" || view === "custom";
  const picker = (
    <div className={styles.picker} role="dialog" aria-label={pick === "view" ? "Who can see it" : "Who else is affected"} data-view={pick === "view" ? "true" : undefined}>
      {pick === "view" && (
        <div className={styles.viewHead}>
          <div className={styles.viewOpts} role="radiogroup" aria-label="Who can see it">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" role="radio" aria-checked={view === v.id} className={styles.viewOpt} data-on={view === v.id ? "true" : undefined} onClick={() => setView(v.id)}>{v.label}</button>
            ))}
          </div>
          <span className={styles.pickMeta}>{VIEWS.find((v) => v.id === view)?.note}</span>
        </div>
      )}
      {listOn && (
        <>
          <div className={styles.pickSearch}>
            <input value={pickQuery} onChange={(e) => { setPickQuery(e.target.value); setPickPages({}); }} placeholder="Search people, departments" aria-label="Search people and departments" autoFocus={pick === "affected"} />
          </div>
          <div className={styles.pickList}>
            {groups.map((g) => {
              const { page, pages, rows } = pageOf(g.label, g.items);
              return (
                <div key={g.label}>
                  <span className={styles.pickGroup}>{g.label}</span>
                  {rows.map((it) => {
                    if (!it.dept) return pickRow(it);
                    // A department row: the checkbox picks the whole department, the small button opens its people.
                    const open = openDept === it.dept, members = inDept(it.dept), picked = members.filter((m) => sel.includes(m.id)).length;
                    const sub = pageOf("dept:" + it.dept, members);
                    return (
                      <div key={it.id} className={styles.pickDept} data-open={open ? "true" : undefined}>
                        <div className={styles.pickDeptRow}>
                          {pickRow(it)}
                          {members.length > 0 && (
                            <button type="button" className={styles.pickSub} onClick={() => setOpenDept(open ? null : it.dept ?? null)} aria-expanded={open} aria-label={(open ? "Hide" : "Pick") + " people in " + it.label} title={open ? "Hide people" : "Pick people in " + it.label}>
                              <span className={styles.pickSubN}>{(picked ? picked + "/" : "") + members.length}</span>
                              <span className={styles.pickSubChev} aria-hidden="true">›</span>
                            </button>
                          )}
                        </div>
                        {open && (
                          <div className={styles.pickNest}>
                            {sub.rows.map(pickRow)}
                            {pager("dept:" + it.dept, sub.page, sub.pages)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {pager(g.label, page, pages)}
                </div>
              );
            })}
            {groups.length === 0 && <div className={styles.pickEmpty}>No matches</div>}
          </div>
        </>
      )}
      <div className={styles.pickFoot}>
        <span className={styles.pickCount}>{listOn ? sel.length + " selected" : ""}</span>
        <span className={styles.pickBtns}>
          {listOn && <button type="button" className={styles.pickClear} onClick={() => (pick === "view" ? setSeenBy([]) : setAffected([]))}>Clear</button>}
          <button type="button" className={styles.pickDone} onClick={() => setPick(null)}>Done</button>
        </span>
      </div>
    </div>
  );

  return (
    <div className={styles.page} ref={pageRef} data-kind={kind} data-phase={phase.at}>
      <h1 className={styles.title}>Raise it, {who.name}</h1>

      <div className={styles.boxWrap} ref={boxRef}>
        <div className={styles.aura} aria-hidden="true" />
        <div className={styles.ring}>
          <span key={switches} className={styles.ringWash} aria-hidden="true" />
          <div className={styles.box}>
            <div className={styles.line}>
              <button type="button" className={styles.mode} onClick={toggleKind} disabled={locked} aria-label={"Raising " + current.label.toLowerCase() + " — switch to " + other} title={"Switch to raising " + (other === "idea" ? "an idea" : "a problem")}>
                <span className={styles.thumb} aria-hidden="true" />
                <span className={styles.modeOpt} data-on={kind === "idea" ? "true" : undefined} aria-hidden="true">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="10" r="5.4" stroke="currentColor" strokeWidth="2" /><rect x="9.4" y="15.6" width="5.2" height="2" rx="1" fill="currentColor" /><rect x="10.2" y="18.4" width="3.6" height="1.7" rx="0.85" fill="currentColor" /></svg>
                </span>
                <span className={styles.modeOpt} data-on={kind === "problem" ? "true" : undefined} aria-hidden="true">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="2" /><rect x="11.05" y="6.8" width="1.9" height="7.1" rx="0.95" fill="currentColor" /><circle cx="12" cy="16.7" r="1.2" fill="currentColor" /></svg>
                </span>
              </button>
              {/* A textarea so a narrow screen can wrap the placeholder onto a second line; Enter still raises, so it stays one line of text. */}
              <textarea ref={fieldRef} className={styles.field} rows={1} value={draft} onChange={(e) => setDraft(e.target.value.replace(/\s*\n\s*/g, " "))} placeholder={current.placeholder} aria-label={current.label} autoFocus readOnly={locked || asking}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); primary(); } }} />
            </div>

            {chips.length > 0 && (
              <div className={styles.chips}>
                {chips.map((c) => (
                  <span key={c.key} className={styles.chip}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, never fetched */}
                    {c.thumb && <img src={c.thumb} alt="" className={styles.chipThumb} />}
                    {c.label}
                    {!locked && <button type="button" className={styles.chipX} onClick={c.remove} aria-label={"Remove " + c.label}>×</button>}
                  </span>
                ))}
              </div>
            )}

            <div className={styles.foot}>
              <div className={styles.adds} ref={pickRef}>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addShots(e.target.files)} />
                {/* On phones only the icon shows (the chips name the files), so Attach, Affected, View and ↑ fit one row. */}
                <button type="button" className={`${styles.pill} ${styles.attach}`} data-on={shots.length > 0 ? "true" : undefined} onClick={() => fileRef.current?.click()} disabled={locked || shots.length + reading >= MAX_SHOTS} aria-busy={reading > 0 || undefined} aria-label={attachLabel}>
                  <span className={styles.pillIcon} aria-hidden="true">⎘</span>
                  <span className={styles.pillText}>{attachLabel}</span>
                </button>
                <div className={styles.pickRoot}>
                  <button type="button" className={styles.pill} data-on={affected.length > 0 || pick === "affected" ? "true" : undefined} onClick={() => openPick("affected")} disabled={locked} aria-expanded={pick === "affected"} aria-haspopup="dialog">
                    <span className={styles.dot} data-on={affected.length > 0 ? "true" : undefined} aria-hidden="true" />
                    {affected.length ? "Affected · " + affected.length : "Affected"}
                  </button>
                  {pick === "affected" && picker}
                </div>
                <div className={styles.pickRoot}>
                  <button type="button" className={styles.pill} data-on={view !== "everyone" || pick === "view" ? "true" : undefined} onClick={() => openPick("view")} disabled={locked} aria-expanded={pick === "view"} aria-haspopup="dialog" aria-label={"Who can see it: " + viewLabel}>
                    <svg className={styles.pillIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                    {viewLabel}
                  </button>
                  {pick === "view" && picker}
                </div>
              </div>
              <div className={styles.sendWrap}>
                <span className={styles.sendRing}>
                  {locked && <span className={styles.pulse} aria-hidden="true" />}
                  <button type="button" className={styles.send} onClick={primary} disabled={!canSend} data-sent={locked ? "true" : undefined} aria-label={ai.available ? "Ask " + SITE.name + " first" : "Raise this " + current.label.toLowerCase()} title={ai.available ? "Ask first" : "Raise it"}>
                    <span className={styles.arrow} aria-hidden="true">↑</span>
                    <span className={styles.check} aria-hidden="true">✓</span>
                  </button>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* One card, three states stacked in the same cell: "How it works" is always laid out (hidden when not
          current) so the card keeps its size while typing and while evaluating. */}
      <div className={styles.card}>
        {(() => {
          const showAnswer = phase.at === "edit" && ai.status !== "idle";
          const showHow = phase.at === "edit" && !composing && !showAnswer, showCtx = phase.at === "edit" && composing && !showAnswer, showEval = phase.at !== "edit";
          const state = (on: boolean) => ({ className: styles.state, "data-on": on ? "true" : undefined, inert: !on, "aria-hidden": !on });
          return (
            <>
              <section {...state(showHow)}>
                <div className={styles.cardHead}>
                  <h2 className={styles.cardTitle}>How {SITE.name} works</h2>
                  <span className={styles.cardTag}>Raised → routed → tracked</span>
                </div>
                <div className={styles.how}>
                  {HOW.map((s) => (
                    <section key={s.id} className={styles.step}>
                      {/* Decorative sketches of each stage, as in the mockup - no data behind them. */}
                      <div className={styles.mini} aria-hidden="true">
                        {s.id === "raise" && <><span className={styles.miniRow}><span className={styles.miniBulb} /><span className={styles.miniBar} /></span><span className={styles.miniTags}><span>Idea</span><span>Problem</span></span></>}
                        {s.id === "context" && ["Org", "Model", "Goals"].map((l, j) => <span key={l} className={styles.miniRow}><span className={styles.miniL}>{l}</span><span className={styles.miniTrack}><span className={styles.miniFill} style={{ width: ["82%", "64%", "91%"][j] }} /></span></span>)}
                        {s.id === "score" && ([["Fit", 4], ["Urgency", 3], ["Impact", 5]] as const).map(([l, n]) => <span key={l} className={styles.miniRow}><span className={styles.miniL}>{l}</span><span className={styles.miniDots}>{[0, 1, 2, 3, 4].map((d) => <span key={d} data-on={d < n ? "true" : undefined} />)}</span></span>)}
                        {s.id === "track" && <><span className={styles.miniRow}><span className={styles.miniFaces}><span>AK</span><span>JS</span><span>MR</span></span><span className={styles.miniFlight}>In flight</span></span><span className={styles.miniTrack}><span className={styles.miniFill} style={{ width: "58%" }} /></span></>}
                      </div>
                      <h3 className={styles.stepTitle}>{s.title}</h3>
                      <p className={styles.stepText}>{s.text}</p>
                    </section>
                  ))}
                </div>
              </section>

              <section {...state(showCtx)}>
                <div className={styles.cardHead}>
                  <h2 className={styles.cardTitle}>Add context</h2>
                  <span className={styles.cardTag}>{words ? words + (words === 1 ? " word" : " words") : "Optional"}</span>
                </div>
                <div className={styles.ctx}>
                  <textarea className={styles.ctxField} value={context} onChange={(e) => setContext(e.target.value)} rows={3} aria-label="Context"
                    placeholder={"What's happening, who does it affect, what have you already tried? The more context, the better " + SITE.name + " can route it."} />
                  <div className={styles.prompts}>
                    <span className={styles.promptsL}>Prompts</span>
                    {PROMPTS.map((p) => <button key={p} type="button" className={styles.prompt} onClick={() => addPrompt(p)}>{p}</button>)}
                  </div>
                </div>
              </section>

              <section {...state(showAnswer)}>
                {showAnswer && <AssistAnswer view={ai} onSolved={solved} onAskMore={askMore} onRaise={raiseAnyway} />}
              </section>

              {/* Evaluating: the orb, the word, and the one step it is on right now; then the receipt. */}
              <section {...state(showEval)}>
                {phase.at !== "edit" && (() => {
                  const ev = phase.ev, at = phase.at === "thinking" ? Math.min(phase.done, ev.steps.length - 1) : -1;
                  const thinking = at >= 0, now = thinking ? ev.steps[at] : null;
                  return (
                    <div className={styles.evalCenter}>
                      <span className={styles.orb} aria-hidden="true"><EvalOrb state="connecting" size={ORB_PX} paused={!thinking || reduced} /></span>
                      <h2 className={styles.evalHead}>{thinking ? "Evaluating" : "Evaluated"}</h2>
                      <p className={styles.evalNow} aria-live="polite">
                        {now ? <>{now.title}<span className={styles.evalN}>{at + 1} / {ev.steps.length}</span></> : <>Score {ev.score.value}<span className={styles.evalN}>{ev.steps.length} checks</span></>}
                      </p>
                      {/* While thinking: what the last landed step found, and the eight steps as a track. Once raised the receipt takes their place. */}
                      {thinking && at > 0 && <p key={ev.steps[at - 1].id} className={styles.evalDetail}>{ev.steps[at - 1].detail}</p>}
                      {thinking && (
                        <ol className={styles.evalTrack} aria-label="Evaluation steps">
                          {ev.steps.map((s, i) => <li key={s.id} className={styles.evalSeg} data-state={i < at ? "done" : i === at ? "now" : "todo"} title={s.title} />)}
                        </ol>
                      )}
                      {phase.at === "done" && (
                        <div className={styles.receipt} role="status">
                          <p className={styles.receiptText}>
                            On <strong>{ev.lead}</strong>’s desk{ev.passesTo ? <>, passed to <strong>{ev.passesTo}</strong> if it is theirs</> : null}. Answer owed in {seed.promiseDays} d — it stays on the overview until then.
                          </p>
                          <div className={styles.receiptRow}>
                            <Link href={href("/dashboard")} className={styles.receiptGo}>See it on the overview</Link>
                            <Link href={href("/cases/" + phase.id)} className={styles.receiptOpen}>Open the case</Link>
                            <button type="button" className={styles.again} onClick={reset}>Raise another</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </section>
            </>
          );
        })()}
      </div>
    </div>
  );
}
