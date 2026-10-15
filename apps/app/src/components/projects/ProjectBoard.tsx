"use client";
// The project's board: To do · Doing · Blocked · Done. The team adds steps (text, owner, due day),
// the lead or a step's owner moves them, and a blocked step says why. While the project is planned,
// the idea's own brief offers its first steps - each one added only with a click.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { board } from "@/features/projects/selectors";
import { STEP_COLUMNS, type ReducedProject, type Step, type StepColumn } from "@/features/projects/types";
import { COLUMN_LABEL, safeUrl, type StepHint } from "@/features/projects/views";
import { useRights, useSend } from "./parts";
import styles from "./Projects.module.css";

export function ProjectBoard({ p, hints }: { p: ReducedProject; hints: StepHint[] }) {
  const { act, S } = useDemo();
  const r = useRights(p);
  const send = useSend(p);
  const cols = board(p);
  const team = [p.lead, ...p.members];
  const [text, setText] = useState("");
  const [owner, setOwner] = useState("");
  const [inDays, setInDays] = useState("");
  const done = cols.done.length;

  const add = (t: string, o?: string, due?: number) =>
    send("project.step.added", { stepId: "probe", text: t }, () => act.project.addStep(p.id, t, o || undefined, due));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const days = inDays.trim() === "" ? undefined : Math.max(0, Math.round(Number(inDays)));
    if (add(text.trim(), owner, days === undefined || Number.isNaN(days) ? undefined : S.day + days)) { setText(""); setInDays(""); }
  };

  return (
    <section className={styles.panel} aria-labelledby={"board-" + p.id}>
      <div className={styles.panelHead}>
        <h2 id={"board-" + p.id} className={styles.h2}>Board</h2>
        <span className={styles.muted}>{p.steps.length ? done + " of " + p.steps.length + " done" : "No steps yet"}</span>
      </div>

      {hints.length > 0 && r.addStep && (
        <div className={styles.suggest} role="group" aria-label="Suggested steps">
          <div className={styles.suggestHead}>Suggested steps <span className={styles.muted}>from the idea’s brief - you decide which go on the board</span></div>
          {hints.map((h) => (
            <div key={h.text} className={styles.suggestRow}>
              <span className={styles.suggestLabel}>{h.label}</span>
              <span className={styles.suggestText}>{h.text}</span>
              <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => add(h.text)} aria-label={"Add step: " + h.text}>Add</button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.board}>
        {STEP_COLUMNS.map((col) => (
          <div key={col} className={styles.column} data-col={col} role="group" aria-label={COLUMN_LABEL[col]}>
            <div className={styles.colHead}>{COLUMN_LABEL[col]}<span className={styles.count}>{cols[col].length}</span></div>
            {cols[col].map((s) => <StepCard key={s.id} p={p} s={s} />)}
          </div>
        ))}
      </div>

      {r.addStep && (
        <form className={styles.addStep} onSubmit={submit} aria-label="Add a step">
          <input className={`nh-input ${styles.input} ${styles.grow}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="A step, in a few words" aria-label="New step" maxLength={500} />
          <select className={`nh-input nh-select ${styles.input}`} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
            <option value="">No owner yet</option>
            {team.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <input className={`nh-input ${styles.input} ${styles.days}`} type="number" min={0} max={365} value={inDays} onChange={(e) => setInDays(e.target.value)} placeholder="Due in days" aria-label="Due in days" />
          <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!text.trim()}>Add step</button>
        </form>
      )}
    </section>
  );
}

function StepCard({ p, s }: { p: ReducedProject; s: Step }) {
  const { act, S, f } = useDemo();
  const r = useRights(p);
  const send = useSend(p);
  const [why, setWhy] = useState<string | null>(null); // the "what blocks it?" field, while it is open
  const late = s.dueDay !== null && s.column !== "done" && S.day > s.dueDay;
  const href = safeUrl(s.external?.url);
  const move = (to: StepColumn, w?: string) => send("project.step.moved", { stepId: s.id, to, why: w }, () => act.project.moveStep(p.id, s.id, to, w));

  return (
    <article className={styles.step} aria-label={s.text}>
      <div className={styles.stepText}>{s.text}</div>
      <div className={styles.stepMeta}>
        <span>{s.owner ?? "No owner"}</span>
        {s.dueDay !== null && <span data-late={late ? "true" : undefined}>{late ? "late since " : "due "}{f(s.dueDay)}</span>}
        {s.external && (href
          ? <a href={href} target="_blank" rel="noreferrer noopener" className={styles.key}>{s.external.key}</a>
          : <span className={styles.key}>{s.external.key}</span>)}
      </div>
      {s.column === "blocked" && s.why && <div className={styles.blockedWhy}>{s.why}</div>}
      {r.moveStep(s) && why === null && (
        <div className={styles.stepMoves}>
          {STEP_COLUMNS.filter((c) => c !== s.column).map((c) => (
            <button key={c} type="button" className={styles.moveBtn} onClick={() => (c === "blocked" ? setWhy("") : move(c))} aria-label={"Move “" + s.text + "” to " + COLUMN_LABEL[c]}>
              {COLUMN_LABEL[c]}
            </button>
          ))}
        </div>
      )}
      {why !== null && (
        <form className={styles.whyForm} onSubmit={(e) => { e.preventDefault(); if (why.trim() && move("blocked", why.trim())) setWhy(null); }}>
          <input className={`nh-input ${styles.input}`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="What blocks it?" aria-label="What blocks it?" autoFocus />
          <span className={styles.actionRow}>
            <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!why.trim()}>Mark blocked</button>
            <button type="button" className={styles.quiet} onClick={() => setWhy(null)}>Cancel</button>
          </span>
        </form>
      )}
    </article>
  );
}
