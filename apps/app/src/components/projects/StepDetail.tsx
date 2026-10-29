"use client";
// One card of the board, opened: what it is, who owns it, when it is due, the details, the tool it
// lives in, everything that happened to it, and the moves - the way to move a card without dragging
// (keyboard, phone). Each change is one project.step.* event; text and details save together.
import { useEffect, useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Avatar } from "@/components/dashboard/shared/primitives";
import { STEP_COLUMNS, type ReducedProject, type Step, type StepColumn } from "@/features/projects/types";
import { COLUMN_LABEL, safeUrl, systemFrom, timelineOf, toolOf, TOOLS, type JiraRow } from "@/features/projects/views";
import { useRights, useSend } from "./parts";
import styles from "./Projects.module.css";

const DUE_QUICK: { label: string; days: number }[] = [
  { label: "Today", days: 0 }, { label: "+3 days", days: 3 }, { label: "+1 week", days: 7 }, { label: "+2 weeks", days: 14 },
];

export function StepDetail({ p, s, jira, onClose }: { p: ReducedProject; s: Step; jira: JiraRow; onClose: () => void }) {
  const { act, S, f, persona } = useDemo();
  const r = useRights(p);
  const send = useSend(p);
  const team = [p.lead, ...p.members];
  const edit = r.editStep(s);
  const [text, setText] = useState(s.text);
  const [note, setNote] = useState(s.note);
  const [why, setWhy] = useState<string | null>(null);
  const [inDays, setInDays] = useState("");
  const [removing, setRemoving] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkKey, setLinkKey] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const me = persona.who.name;
  const dirty = text.trim() !== s.text || note.trim() !== s.note;
  const change = (c: Parameters<typeof act.project.editStep>[2]) => send("project.step.edited", { stepId: s.id, ...c }, () => act.project.editStep(p.id, s.id, c));
  const move = (to: StepColumn, w?: string) => send("project.step.moved", { stepId: s.id, to, why: w }, () => act.project.moveStep(p.id, s.id, to, w));
  const save = () => {
    const c: { text?: string; note?: string } = {};
    if (text.trim() && text.trim() !== s.text) c.text = text.trim();
    if (note.trim() !== s.note) c.note = note.trim();
    if (Object.keys(c).length) change(c);
  };
  const late = s.dueDay !== null && s.column !== "done" && S.day > s.dueDay;
  const tool = s.external ? toolOf(s.external.system) : null;
  const href = safeUrl(s.external?.url);
  const badUrl = linkUrl.trim() !== "" && !safeUrl(linkUrl);
  // Everything that happened to this card, oldest first.
  const ids = new Set(p.history.filter((e) => e.payload?.stepId === s.id).map((e) => e.id));
  const story = timelineOf(p).filter((l) => ids.has(l.id));
  const cycle = s.startedDay !== null && s.doneDay !== null ? s.doneDay - s.startedDay : null;

  return (
    <div className={styles.sheetWrap}>
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="Close the step" tabIndex={-1} />
      <div ref={panel} className={styles.sheet} role="dialog" aria-modal="true" aria-label={s.text} tabIndex={-1}>
        <div className={styles.sheetHead}>
          <span className={styles.colPill} data-col={s.column}>{COLUMN_LABEL[s.column]}</span>
          {tool && s.external && (href
            ? <a href={href} target="_blank" rel="noreferrer noopener" className={styles.key}>{tool.name} · {s.external.key}</a>
            : <span className={styles.key}>{tool.name} · {s.external.key}</span>)}
          <button type="button" className={styles.sheetClose} onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className={styles.sheetBody}>
          {edit
            ? <textarea id={"step-title-" + s.id} className={`nh-input ${styles.sheetTitleInput}`} value={text} onChange={(e) => setText(e.target.value)} aria-label="Step" maxLength={500} rows={2} />
            : <h2 id={"step-title-" + s.id} className={styles.sheetTitle}>{s.text}</h2>}

          {r.moveStep(s) && (
            <div className={styles.sheetField}>
              <span className={styles.fieldLabel}>Move to</span>
              <div className={styles.segment} role="group" aria-label="Move to">
                {STEP_COLUMNS.map((c) => (
                  <button
                    key={c} type="button" className={styles.segBtn} data-col={c} aria-pressed={s.column === c} disabled={s.column === c}
                    onClick={() => (c === "blocked" ? setWhy("") : move(c))} aria-label={"Move “" + s.text + "” to " + COLUMN_LABEL[c]}
                  >
                    {COLUMN_LABEL[c]}
                  </button>
                ))}
              </div>
              {why !== null && (
                <form className={styles.whyForm} onSubmit={(e) => { e.preventDefault(); if (why.trim() && move("blocked", why.trim())) setWhy(null); }}>
                  <input className={`nh-input ${styles.input}`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="What blocks it?" aria-label="What blocks it?" autoFocus />
                  <span className={styles.actionRow}>
                    <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!why.trim()}>Mark blocked</button>
                    <button type="button" className={styles.quiet} onClick={() => setWhy(null)}>Cancel</button>
                  </span>
                </form>
              )}
            </div>
          )}
          {s.column === "blocked" && s.why && <div className={styles.blockedWhy}>Blocked: {s.why}</div>}

          <div className={styles.sheetGrid}>
            <div className={styles.sheetField}>
              <span className={styles.fieldLabel}>Owner</span>
              {edit ? (
                <span className={styles.actionRow}>
                  <select className={`nh-input nh-select ${styles.input}`} value={s.owner ?? ""} onChange={(e) => change({ owner: e.target.value })} aria-label="Owner">
                    <option value="">No owner</option>
                    {team.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {s.owner !== me && team.includes(me) && <button type="button" className={styles.quietLink} onClick={() => change({ owner: me })}>Take it</button>}
                </span>
              ) : (
                <span className={styles.owner}>{s.owner ? <><Avatar name={s.owner} size="sm" />{s.owner}</> : "No owner"}</span>
              )}
            </div>
            <div className={styles.sheetField}>
              <span className={styles.fieldLabel}>Due</span>
              <span className={styles.dueNow} data-late={late ? "true" : undefined}>
                {s.dueDay === null ? "No due day" : (late ? "Late since " : "") + f(s.dueDay)}
              </span>
              {edit && (
                <span className={styles.chipRow}>
                  {DUE_QUICK.map((q) => (
                    <button key={q.label} type="button" className={styles.chipBtn} onClick={() => change({ dueDay: S.day + q.days })}>{q.label}</button>
                  ))}
                  <form className={styles.inlineDays} onSubmit={(e) => { e.preventDefault(); const n = Math.round(Number(inDays)); if (inDays.trim() && Number.isFinite(n) && n >= 0) { change({ dueDay: S.day + n }); setInDays(""); } }}>
                    <input className={`nh-input ${styles.input} ${styles.tinyInput}`} type="number" min={0} max={365} value={inDays} onChange={(e) => setInDays(e.target.value)} placeholder="days" aria-label="Due in how many days" />
                  </form>
                  {s.dueDay !== null && <button type="button" className={styles.chipBtn} onClick={() => change({ dueDay: null })}>None</button>}
                </span>
              )}
            </div>
          </div>

          <div className={styles.sheetField}>
            <label className={styles.fieldLabel} htmlFor={"step-note-" + s.id}>Details</label>
            {edit
              ? <textarea id={"step-note-" + s.id} className={`nh-input nh-textarea ${styles.textarea}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What done looks like, where to look, who to ask" maxLength={2000} />
              : <p className={styles.originBody}>{s.note || <span className={styles.muted}>No details yet.</span>}</p>}
          </div>
          {edit && (
            <span className={styles.actionRow}>
              <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!dirty || !text.trim()} onClick={save}>Save changes</button>
              {dirty && <button type="button" className={styles.quiet} onClick={() => { setText(s.text); setNote(s.note); }}>Undo</button>}
            </span>
          )}

          <div className={styles.sheetField}>
            <span className={styles.fieldLabel}>In a tool</span>
            {s.external
              ? <span className={styles.muted}>{tool?.name} {s.external.key}{tool?.id === "jira" && jira.state !== "off" ? " · its status comes back to this board" : ""}</span>
              : <span className={styles.muted}>{jira.waiting ? "Waiting for Jira: the issue is created in the next round." : "Not linked to a ticket yet."}</span>}
            {r.link && (
              <form className={styles.inline} aria-label="Link this step" onSubmit={(e) => {
                e.preventDefault();
                if (badUrl) return;
                const url = linkUrl.trim();
                const k = linkKey.trim();
                if (send("project.linked", { url, key: k }, () => act.project.link(p.id, url, systemFrom(url, k), k || undefined, s.id))) { setLinkUrl(""); setLinkKey(""); }
              }}>
                <input className={`nh-input ${styles.input} ${styles.grow}`} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Ticket address, https://…" aria-label="Ticket address" aria-invalid={badUrl ? "true" : undefined} />
                <input className={`nh-input ${styles.input} ${styles.keyInput}`} value={linkKey} onChange={(e) => setLinkKey(e.target.value)} placeholder="Key, e.g. FS-14" aria-label="Ticket key" />
                <button type="submit" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={(!linkUrl.trim() && !linkKey.trim()) || badUrl}>Link</button>
                {badUrl && <span className="nh-error">Only http and https addresses.</span>}
                {linkUrl.trim() && !badUrl && <span className={styles.hint}>Goes to {toolOf(systemFrom(linkUrl, linkKey)).name}{TOOLS.some((t) => t.id === systemFrom(linkUrl, linkKey)) ? "" : " (a plain link)"}</span>}
              </form>
            )}
          </div>

          <dl className={styles.stepFacts}>
            <dt>Added</dt><dd>{f(s.addedDay)} by {s.by}</dd>
            <dt>In {COLUMN_LABEL[s.column]}</dt><dd>since {f(s.movedDay)}{S.day - s.movedDay > 0 ? " · " + (S.day - s.movedDay) + (S.day - s.movedDay === 1 ? " day" : " days") : ""}</dd>
            {cycle !== null && <><dt>Cycle time</dt><dd>{cycle === 0 ? "the same day" : cycle + (cycle === 1 ? " day" : " days")} from Doing to Done</dd></>}
          </dl>

          {story.length > 0 && (
            <div className={styles.sheetField}>
              <span className={styles.fieldLabel}>History</span>
              <ol className={styles.timeline}>
                {story.map((l) => (
                  <li key={l.id} className={styles.tl}><span className={styles.tlDay}>{f(l.day)}</span><span><span className={styles.strong}>{l.by}</span> {l.text}</span></li>
                ))}
              </ol>
            </div>
          )}

          {r.removeStep(s) && (
            <div className={styles.sheetFoot}>
              {!removing
                ? <button type="button" className={styles.quiet} onClick={() => setRemoving(true)}>Remove this step</button>
                : (
                  <span className={styles.actionRow}>
                    <span className={styles.muted}>Take it off the board? The history keeps it.</span>
                    <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => { if (change({ removed: true })) onClose(); }}>Yes, remove</button>
                    <button type="button" className={styles.quiet} onClick={() => setRemoving(false)}>Keep it</button>
                  </span>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
