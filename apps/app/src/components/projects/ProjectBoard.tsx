"use client";
// The project's board: To do · Doing · Blocked · Done, as a Kanban. Cards are dragged between columns
// and up and down inside one (the order is the team's priority), each column takes a new step at its
// foot, and a click opens the card: owner, due day, details, its tool, its history and the moves (the
// keyboard and touch way to move it). A drop on Blocked asks what blocks it first. Every move is one
// project.* event, asked of the server's rules first, so a card only drags for someone who may move it.
// While the project is planned, the idea's own brief offers its first steps - each added only with a click.
import { useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Avatar } from "@/components/dashboard/shared/primitives";
import { board } from "@/features/projects/selectors";
import { STEP_COLUMNS, type ReducedProject, type Step, type StepColumn } from "@/features/projects/types";
import { COLUMN_LABEL, safeUrl, toolOf, type StepHint } from "@/features/projects/views";
import { useRights, useSend } from "./parts";
import { StepDetail } from "./StepDetail";
import styles from "./Projects.module.css";

const EMPTY: Record<StepColumn, string> = {
  todo: "Nothing waiting.",
  doing: "Drag a step here when someone starts it.",
  blocked: "Nothing blocked.",
  done: "Finished steps land here.",
};

/** Where a dragged card would land: above `before`, or at the foot of `col`. */
type Spot = { col: StepColumn; before: string | null };

export function ProjectBoard({ p, hints }: { p: ReducedProject; hints: StepHint[] }) {
  const { act, persona } = useDemo();
  const r = useRights(p);
  const send = useSend(p);
  const cols = board(p);
  const team = [p.lead, ...p.members];
  const me = persona.who;
  const mine = (s: Step) => s.owner !== null && (s.owner === me.name || s.owner === me.handle);
  const [filter, setFilter] = useState("all"); // "all" | "mine" | "unowned" | an owner's name
  const shown = (s: Step) => filter === "all" || (filter === "mine" ? mine(s) : filter === "unowned" ? !s.owner : s.owner === filter);
  const owners = team.filter((n) => p.steps.some((s) => s.owner === n));
  const hidden = p.steps.filter((s) => !shown(s)).length;

  // A planned board with no steps opens with To do's composer, so the first step is one click away.
  const [adding, setAdding] = useState<StepColumn | null>(p.steps.length === 0 && r.addStep ? "todo" : null);
  const [open, setOpen] = useState<string | null>(null);
  const opened = p.steps.find((s) => s.id === open) ?? null;

  // Drag and drop: the card in hand, where it would land, and a drop on Blocked waiting for its reason.
  const [drag, setDrag] = useState<string | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [askBlock, setAskBlock] = useState<Spot & { id: string } | null>(null);
  const dragged = p.steps.find((s) => s.id === drag) ?? null;
  const end = () => { setDrag(null); setSpot(null); };

  const moveTo = (s: Step, at: Spot, why?: string) =>
    send("project.step.moved", { stepId: s.id, to: at.col, why, before: at.before }, () => act.project.moveStep(p.id, s.id, at.col, why, at.before));

  const drop = () => {
    const s = dragged;
    const at = spot;
    end();
    if (!s || !at || !r.moveStep(s)) return;
    if (s.column === at.col) {
      // Dropped where it already is: nothing to record.
      const ids = cols[at.col].map((x) => x.id);
      const next = ids[ids.indexOf(s.id) + 1] ?? null;
      if (at.before === s.id || at.before === next) return;
      moveTo(s, at, s.why || undefined); // a reorder keeps a blocked step's reason
      return;
    }
    if (at.col === "blocked") setAskBlock({ ...at, id: s.id }); // a blocked step needs its reason first
    else moveTo(s, at);
  };

  /** Over a card: the top half puts the dragged card above it, the bottom half below it. */
  const overCard = (e: React.DragEvent, col: StepColumn, s: Step) => {
    if (!dragged) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const box = e.currentTarget.getBoundingClientRect();
    const list = cols[col];
    const k = list.findIndex((x) => x.id === s.id);
    const before = e.clientY < box.top + box.height / 2 ? s.id : list[k + 1]?.id ?? null;
    if (spot?.col !== col || spot.before !== before) setSpot({ col, before });
  };

  // Touch: phones have no HTML5 drag, so each card has a grip that drags by pointer events. The finger's
  // point says which column and which card it is over; near the board's edge the columns scroll along.
  const boardRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; text: string } | null>(null);
  const grip = {
    down: (e: React.PointerEvent, s: Step) => {
      if (!r.moveStep(s)) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag(s.id);
      setGhost({ x: e.clientX, y: e.clientY, text: s.text });
    },
    move: (e: React.PointerEvent) => {
      if (!dragged) return;
      setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
      const b = boardRef.current;
      if (b) {
        const box = b.getBoundingClientRect();
        if (e.clientX > box.right - 40) b.scrollLeft += 14;
        else if (e.clientX < box.left + 40) b.scrollLeft -= 14;
      }
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const colEl = under?.closest<HTMLElement>('[role="group"][data-col]');
      const col = colEl?.dataset.col as StepColumn | undefined;
      if (!col || !(col in cols)) return;
      // The first card (not the one in hand) whose middle is below the finger: read from the cards'
      // places, not from what is under the finger - the drop line itself shifts the cards as it appears.
      const next = colEl
        ? [...colEl.querySelectorAll<HTMLElement>("article[data-step]")].find((c) => {
            if (c.dataset.step === dragged.id) return false;
            const box = c.getBoundingClientRect();
            return e.clientY < box.top + box.height / 2;
          })
        : undefined;
      const before = next?.dataset.step ?? null;
      if (spot?.col !== col || spot.before !== before) setSpot({ col, before });
    },
    up: () => { setGhost(null); drop(); },
    cancel: () => { setGhost(null); end(); },
  };

  return (
    <section className={styles.boardWrap} aria-labelledby={"board-" + p.id}>
      <div className={styles.boardHead}>
        <div className={styles.boardTitle}>
          <h2 id={"board-" + p.id} className={styles.h2}>Board</h2>
          <span className={styles.muted}>{p.steps.length ? cols.done.length + " of " + p.steps.length + " done" : "No steps yet"}</span>
        </div>
        {p.steps.length > 0 && (
          <div className={styles.filters} role="group" aria-label="Show steps">
            {[["all", "All"], ["mine", "Mine"], ["unowned", "No owner"]].map(([k, label]) => (
              <button key={k} type="button" className={styles.filter} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
            ))}
            {owners.map((n) => (
              <button key={n} type="button" className={styles.filterFace} aria-pressed={filter === n} onClick={() => setFilter(filter === n ? "all" : n)} aria-label={"Only " + n + "’s steps"} title={n}>
                <Avatar name={n} size="sm" />
              </button>
            ))}
            {hidden > 0 && <span className={styles.hint}>{hidden} hidden</span>}
          </div>
        )}
      </div>

      {!r.addStep && !p.steps.some((s) => r.moveStep(s)) && p.steps.length > 0 && (
        <p className={styles.readOnly}>You follow this project. Its team moves the steps; open a card to see its details.</p>
      )}

      {hints.length > 0 && r.addStep && (
        <div className={styles.suggest} role="group" aria-label="Suggested steps">
          <div className={styles.suggestHead}>Suggested steps <span className={styles.muted}>from the idea’s brief - you decide which go on the board</span></div>
          {hints.map((h) => (
            <div key={h.text} className={styles.suggestRow}>
              <span className={styles.suggestLabel}>{h.label}</span>
              <span className={styles.suggestText}>{h.text}</span>
              <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => send("project.step.added", { stepId: "probe", text: h.text }, () => act.project.addStep(p.id, h.text))} aria-label={"Add step: " + h.text}>Add</button>
            </div>
          ))}
        </div>
      )}

      <div ref={boardRef} className={styles.board} data-dragging={drag ? "true" : undefined}>
        {STEP_COLUMNS.map((col) => {
          const list = cols[col].filter(shown);
          const line = (before: string | null) => dragged && spot?.col === col && spot.before === before ? <div className={styles.dropLine} aria-hidden="true" /> : null;
          const canAdd = r.addStep && col !== "blocked";
          return (
            <div
              key={col} className={styles.column} data-col={col} role="group" aria-label={COLUMN_LABEL[col]} data-over={dragged && spot?.col === col ? "true" : undefined}
              onDragOver={(e) => {
                if (!dragged) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                // Over the column itself (not a card): the foot of the column.
                if (!(e.target as Element).closest("[data-step]") && (spot?.col !== col || spot.before !== null)) setSpot({ col, before: null });
              }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSpot((o) => (o?.col === col ? null : o)); }}
              onDrop={(e) => { e.preventDefault(); drop(); }}
            >
              <div className={styles.colHead}>
                <span className={styles.colDot} aria-hidden="true" />
                <span className={styles.colName}>{COLUMN_LABEL[col]}</span>
                <span className={styles.count}>{cols[col].length}</span>
              </div>
              <div className={styles.colCards}>
                {list.map((s) => (
                  <div key={s.id} className={styles.slot}>
                    {line(s.id)}
                    <StepCard
                      p={p} s={s} dragging={drag === s.id} mine={mine(s)}
                      onDragStart={() => setDrag(s.id)} onDragEnd={end} onDragOver={(e) => overCard(e, col, s)} onOpen={() => setOpen(s.id)} grip={grip}
                      ask={askBlock?.id === s.id ? askBlock : null} onAsked={() => setAskBlock(null)}
                    />
                  </div>
                ))}
                {line(null)}
                {list.length === 0 && adding !== col && <p className={styles.colEmpty}>{cols[col].length ? "None for this filter." : EMPTY[col]}</p>}
              </div>
              {adding === col
                ? <Composer p={p} col={col} team={team} focus={p.steps.length > 0} onClose={() => setAdding(null)} />
                : canAdd && (
                  <button type="button" className={styles.addCard} onClick={() => setAdding(col)} aria-label={"Add a step to " + COLUMN_LABEL[col]}>
                    <span aria-hidden="true">+</span> Add a step
                  </button>
                )}
            </div>
          );
        })}
      </div>

      {ghost && <div className={styles.dragGhost} style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">{ghost.text}</div>}
      {opened && <StepDetail p={p} s={opened} onClose={() => setOpen(null)} />}
    </section>
  );
}

/** A new step at the foot of a column: Enter adds it and keeps the box open for the next one. */
function Composer({ p, col, team, focus, onClose }: { p: ReducedProject; col: StepColumn; team: string[]; focus: boolean; onClose: () => void }) {
  const { act, S } = useDemo();
  const send = useSend(p);
  const [text, setText] = useState("");
  const [owner, setOwner] = useState("");
  const [inDays, setInDays] = useState("");
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    const n = inDays.trim() === "" ? NaN : Math.max(0, Math.round(Number(inDays)));
    const due = Number.isNaN(n) ? undefined : S.day + n;
    const to = col === "todo" ? undefined : col;
    if (send("project.step.added", { stepId: "probe", text: t, to }, () => act.project.addStep(p.id, t, owner || undefined, due, to))) { setText(""); setInDays(""); }
  };

  return (
    <form className={styles.composer} aria-label={"New step in " + COLUMN_LABEL[col]} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <textarea
        className={`nh-input ${styles.composerText}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="What needs doing?" aria-label="New step" maxLength={500} rows={2}
        autoFocus={focus}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          if (e.key === "Escape") onClose();
        }}
      />
      <div className={styles.composerRow}>
        <select className={`nh-input nh-select ${styles.input} ${styles.grow}`} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
          <option value="">No owner yet</option>
          {team.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <input className={`nh-input ${styles.input} ${styles.days}`} type="number" min={0} max={365} value={inDays} onChange={(e) => setInDays(e.target.value)} placeholder="Due in days" aria-label="Due in days" />
      </div>
      <div className={styles.composerRow}>
        <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!text.trim()}>Add step</button>
        <button type="button" className={styles.quiet} onClick={onClose}>Close</button>
      </div>
    </form>
  );
}

type CardProps = {
  p: ReducedProject; s: Step; dragging: boolean; mine: boolean;
  onDragStart: () => void; onDragEnd: () => void; onDragOver: (e: React.DragEvent) => void; onOpen: () => void;
  grip: Grip;
  ask: Spot | null; onAsked: () => void;
};

/** The touch drag's handlers, from the board. */
type Grip = { down: (e: React.PointerEvent, s: Step) => void; move: (e: React.PointerEvent) => void; up: () => void; cancel: () => void };

function StepCard({ p, s, dragging, mine, onDragStart, onDragEnd, onDragOver, onOpen, ask, onAsked, grip }: CardProps) {
  const { act, S, f } = useDemo();
  const r = useRights(p);
  const send = useSend(p);
  const [why, setWhy] = useState("");
  const canDrag = r.moveStep(s) && !ask;
  const late = s.dueDay !== null && s.column !== "done" && S.day > s.dueDay;
  const soon = !late && s.dueDay !== null && s.column !== "done" && s.dueDay - S.day <= 2;
  const age = S.day - s.movedDay;
  const tool = s.external ? toolOf(s.external.system) : null;
  const href = safeUrl(s.external?.url);
  const close = () => { setWhy(""); onAsked(); };

  return (
    <article
      className={styles.step} aria-label={s.text} draggable={canDrag} data-step={s.id} data-col={s.column}
      data-dragging={dragging ? "true" : undefined} data-mine={mine ? "true" : undefined} data-late={late ? "true" : undefined}
      onDragStart={(e) => { if (!canDrag) return; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", s.id); onDragStart(); }}
      onDragEnd={onDragEnd} onDragOver={onDragOver}
    >
      {(tool || age > 0) && (
        <div className={styles.stepTop}>
          {tool && s.external && (href
            ? <a href={href} target="_blank" rel="noreferrer noopener" className={styles.key} title={"Open in " + tool.name}>{s.external.key}</a>
            : <span className={styles.key} title={tool.name}>{s.external.key}</span>)}
          {s.column !== "done" && age > 0 && <span className={styles.age} title={"In " + COLUMN_LABEL[s.column] + " for " + age + (age === 1 ? " day" : " days")}>{age}d</span>}
        </div>
      )}
      <div className={styles.stepRow}>
        <button type="button" className={styles.stepOpen} onClick={onOpen} aria-label={"Open “" + s.text + "”"}>{s.text}</button>
        {/* Touch screens only (CSS): hold and drag. The keyboard moves a card from its sheet. */}
        {canDrag && (
          <span
            className={styles.dragGrip} role="button" tabIndex={-1} aria-label={"Drag “" + s.text + "”"}
            // No mousedown default: the card is draggable the HTML5 way too, and that drag would cancel this one.
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => grip.down(e, s)} onPointerMove={grip.move} onPointerUp={grip.up} onPointerCancel={grip.cancel}
          >
            <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true"><circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" /><circle cx="3" cy="8" r="1.5" /><circle cx="9" cy="8" r="1.5" /><circle cx="3" cy="13" r="1.5" /><circle cx="9" cy="13" r="1.5" /></svg>
          </span>
        )}
      </div>
      {s.column === "blocked" && s.why && <div className={styles.blockedWhy}>{s.why}</div>}
      <div className={styles.stepFoot}>
        {s.owner ? <span className={styles.owner}><Avatar name={s.owner} size="sm" /><span>{s.owner}</span></span> : <span className={styles.noOwner}>No owner</span>}
        <span className={styles.stepIcons}>
          {s.note && <span className={styles.noteMark} title="Has details" aria-label="Has details">≡</span>}
          {s.dueDay !== null && (s.column === "done"
            ? <span className={styles.dueChip}>{s.doneDay !== null ? "done " + f(s.doneDay) : "due " + f(s.dueDay)}</span>
            : <span className={styles.dueChip} data-late={late ? "true" : undefined} data-soon={soon ? "true" : undefined}>{late ? "late · " : ""}{f(s.dueDay)}</span>)}
        </span>
      </div>
      {ask && (
        <form className={styles.whyForm} onSubmit={(e) => { e.preventDefault(); if (why.trim() && send("project.step.moved", { stepId: s.id, to: "blocked", why: why.trim(), before: ask.before }, () => act.project.moveStep(p.id, s.id, "blocked", why.trim(), ask.before))) close(); }}>
          <input className={`nh-input ${styles.input}`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="What blocks it?" aria-label="What blocks it?" autoFocus />
          <span className={styles.actionRow}>
            <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!why.trim()}>Mark blocked</button>
            <button type="button" className={styles.quiet} onClick={close}>Cancel</button>
          </span>
        </form>
      )}
    </article>
  );
}
