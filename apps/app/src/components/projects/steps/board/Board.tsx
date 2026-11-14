"use client";

import { useEffect, useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PersonFace } from "@/components/ui/elements";
import { boardLanes, dropOutcome, type BoardTarget } from "@/features/projects/board-view";
import { NO_FILTER, olderDoneCount, stepFilter, type StepFilter } from "@/features/projects/step-filter";
import { STEP_COLUMNS, type Step, type StepColumn } from "@/features/projects/types";
import { columnLabel } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { teamOf, useRights, useSend, withIds } from "../../parts";
import type { ToolProps } from "../../tools/types";
import { MarkBlockedForm } from "../MarkBlockedForm";
import { StepPanel } from "../StepPanel";
import styles from "./Board.module.css";

export function Board({ p, hints, jira }: ToolProps) {
  const { act, S, seed, actorUserId, f } = useDemo();
  const t = useT();
  const locale = useLocale();
  const rights = useRights(p);
  const send = useSend(p);
  const team = withIds(teamOf(p, seed.seats));
  const [filter, setFilter] = useState<StepFilter>({ ...NO_FILTER, hideOldDone: true });
  const [groupBy, setGroupBy] = useState<"status" | "person">("status");
  const [folded, setFolded] = useState<string[]>([]);
  // Local state only: the Steps page also holds the List, which owns ?step=; two panels would overlap and repeat field ids.
  const [open, setOpen] = useState<string | null>(null);
  // The sheet closes on Escape even when focus fell to the page (a field that blurred, a button that went away); the sheet's own Escape handling runs first and prevents this one.
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) setOpen(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  const [adding, setAdding] = useState<{ column: StepColumn; lane: string } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [spot, setSpot] = useState<BoardTarget | null>(null);
  const [blocked, setBlocked] = useState<{ step: Step; target: BoardTarget } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<string | null>(null);
  const spotRef = useRef<BoardTarget | null>(null);
  const shown = stepFilter(p, filter, { day: S.day, me: actorUserId });
  const lanes = boardLanes(shown, { groupBy });
  const totals = boardLanes(shown, { groupBy: "status" })[0];
  const owners = boardLanes(p.steps, { groupBy: "person" }).filter((l) => l.ownerUserId);
  const waitingCount = stepFilter(p, { ...NO_FILTER, waiting: true }, { day: S.day, me: actorUserId }).filter((s) => !s.dropped).length;
  const older = olderDoneCount(p, S.day);
  const active = filter.query.trim() || filter.owners.length || filter.mine || filter.waiting || filter.dueWeek || filter.notStarted || filter.dropped;
  const toggle = (key: "mine" | "waiting" | "dueWeek" | "notStarted" | "dropped") => setFilter((v) => ({ ...v, [key]: !v[key] }));
  const setTarget = (target: BoardTarget | null) => { spotRef.current = target; setSpot(target); };
  const end = () => { dragRef.current = null; setDrag(null); setTarget(null); setGhost(null); };
  const reassign = (step: Step, target: BoardTarget) => {
    if (target.ownerUserId === undefined || target.ownerUserId === (step.ownerUserId ?? null)) return true;
    const owner = owners.find((l) => l.ownerUserId === target.ownerUserId)?.owner ?? team.find((m) => m.userId === target.ownerUserId)?.name ?? "";
    const change = { ownerUserId: target.ownerUserId, owner };
    return send("project.step.edited", { stepId: step.id, ...change }, () => act.project.editStep(p.id, step.id, change));
  };
  const allowed = (step: Step, target: BoardTarget) => {
    const move = rights.check("project.step.moved", { stepId: step.id, to: target.column, why: target.column === "blocked" ? step.why || "probe" : undefined });
    const owner = target.ownerUserId === undefined || target.ownerUserId === (step.ownerUserId ?? null) || rights.editStep(step);
    return move.ok && owner;
  };
  const drop = () => {
    const step = p.steps.find((s) => s.id === dragRef.current);
    const target = spotRef.current;
    end();
    if (!step || !target) return;
    const outcome = dropOutcome(step, { ...target, allowed: allowed(step, target) });
    if (outcome === "refused") return;
    if (outcome === "ask-blocked") { setBlocked({ step, target }); return; }
    if (step.column === target.column && target.before === step.id) { reassign(step, target); return; }
    const moved = send("project.step.moved", { stepId: step.id, to: target.column, before: target.before, why: step.column === "blocked" ? step.why : undefined }, () => act.project.moveStep(p.id, step.id, target.column, step.column === "blocked" ? step.why : undefined, target.before));
    if (moved) reassign(step, target);
  };
  const point = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setGhost({ x: e.clientX, y: e.clientY });
    const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-board-column]");
    if (!cell) { setTarget(null); return; }
    const before = [...cell.querySelectorAll<HTMLElement>("[data-step]")].find((card) => card.dataset.step !== dragRef.current && e.clientY < card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2)?.dataset.step ?? null;
    setTarget({ column: cell.dataset.boardColumn as StepColumn, ...(groupBy === "person" ? { ownerUserId: cell.dataset.owner || null } : {}), before });
  };

  return <div className={styles.board}>
    <div className={styles.toolbar}>
      <input className={`nh-input ${styles.search}`} type="search" aria-label={t("projectSteps.searchBoard")} placeholder={t("projectSteps.searchBoard")} value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} />
      <div className={styles.faces} role="group" aria-label={t("projectSteps.owner")}>
        {owners.map((owner) => <button key={owner.id} type="button" className={styles.face} aria-label={t("projectSteps.filterOwner", { name: owner.owner ?? "" })} aria-pressed={filter.owners.includes(owner.ownerUserId!)} onClick={() => setFilter((v) => ({ ...v, owners: v.owners.includes(owner.ownerUserId!) ? v.owners.filter((id) => id !== owner.ownerUserId) : [...v.owners, owner.ownerUserId!] }))}><PersonFace name={owner.owner ?? ""} size="sm" /></button>)}
      </div>
      <div className={styles.filters} role="group" aria-label={t("projectSteps.filterLabel")}>
        {(["mine", "waiting", "dueWeek", "notStarted", "dropped"] as const).map((key) => <button key={key} type="button" className={styles.control} aria-pressed={filter[key]} onClick={() => toggle(key)}>{t(key === "mine" ? "projectSteps.onlyMine" : key === "waiting" ? "projectSteps.waiting" : key === "dueWeek" ? "projectSteps.dueWeek" : key === "notStarted" ? "projectSteps.notStarted" : "projectSteps.dropped")}{key === "waiting" && waitingCount > 0 && <span className={styles.count}>{waitingCount}</span>}</button>)}
      </div>
      <div className={styles.segmented} role="group" aria-label={t("projectSteps.groupBy")}>
        {(["status", "person"] as const).map((by) => <button key={by} type="button" className={styles.control} aria-pressed={groupBy === by} onClick={() => setGroupBy(by)}>{t(by === "status" ? "projectSteps.byStatus" : "projectSteps.byPerson")}</button>)}
      </div>
    </div>
    {hints.length > 0 && rights.addStep && <div className={styles.hints} role="group" aria-label={t("projects.suggestedSteps")}>
      <strong>{t("projects.suggestedSteps")}</strong>
      {hints.map((hint) => <div className={styles.hint} key={hint.text}><span>{hint.label} · {hint.text}</span><button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" aria-label={t("projects.addStepNamed", { text: hint.text })} onClick={() => send("project.step.added", { stepId: "probe", text: hint.text }, () => act.project.addStep(p.id, hint.text))}>{t("projectSteps.add")}</button></div>)}
    </div>}
    {!rights.addStep && !p.steps.some((s) => rights.moveStep(s)) && <p>{t("projects.readOnly")}</p>}
    {shown.length === 0 && <p>{t(p.steps.length ? "projectSteps.emptyFilter" : "projectSteps.emptyBoard")}</p>}
    {groupBy === "person" && <div className={styles.columnNames}>{STEP_COLUMNS.map((col) => <strong key={col}>{columnLabel(col, locale)}{totals.columns[col].filter((s) => !s.dropped).length > 0 && <span className={styles.count}>{totals.columns[col].filter((s) => !s.dropped).length}</span>}</strong>)}</div>}
    {lanes.map((lane) => <div key={lane.id} className={groupBy === "person" ? styles.lane : undefined} data-unowned={groupBy === "person" && !lane.ownerUserId || undefined}>
      {groupBy === "person" && <button type="button" className={styles.laneHead} aria-expanded={!folded.includes(lane.id)} onClick={() => setFolded((v) => v.includes(lane.id) ? v.filter((id) => id !== lane.id) : [...v, lane.id])}><span aria-hidden="true">{folded.includes(lane.id) ? "▸" : "▾"}</span>{lane.ownerUserId && <PersonFace name={lane.owner ?? ""} size="sm" />}<strong>{lane.ownerUserId === actorUserId && actorUserId ? t("projectSteps.you") : lane.owner ?? t("projects.noOwner")}</strong>{lane.count > 0 && <span className={styles.count}>{lane.count}</span>}</button>}
      {!folded.includes(lane.id) && <div className={styles.columns}>{STEP_COLUMNS.map((column) => {
        const list = lane.columns[column];
        const target: BoardTarget = { column, ...(groupBy === "person" ? { ownerUserId: lane.ownerUserId } : {}), before: null };
        const dragged = p.steps.find((s) => s.id === drag);
        const canDrop = dragged && dropOutcome(dragged, { ...target, allowed: allowed(dragged, target) }) !== "refused";
        const over = spot?.column === column && spot?.ownerUserId === target.ownerUserId;
        const composer = adding?.column === column && adding.lane === lane.id;
        const line = (before: string | null) => over && canDrop && spot?.before === before ? <div className={styles.dropLine} /> : null;
        return <div key={column} className={styles.column} role="group" aria-label={columnLabel(column, locale)} data-board-column={column} data-owner={lane.ownerUserId ?? ""} data-over={over && canDrop || undefined} data-refused={dragged && !canDrop || undefined}
          onDragOver={(e) => { if (!dragged) return; e.preventDefault(); if (!(e.target as Element).closest("[data-step]")) setTarget(target); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setTarget(null); }}
          onDrop={(e) => { e.preventDefault(); drop(); }}>
          <div className={groupBy === "person" ? styles.personColumnHead : styles.columnHead}><strong>{columnLabel(column, locale)}</strong>{list.filter((s) => !s.dropped).length > 0 && <span className={styles.count}>{list.filter((s) => !s.dropped).length}</span>}</div>
          {list.map((step, index) => <div key={step.id}>{line(step.id)}<article className={styles.card} data-step={step.id} data-done={step.column === "done" || undefined} data-dropped={!!step.dropped || undefined} data-dragging={drag === step.id || undefined} draggable={rights.moveStep(step) && !step.dropped}
            onClick={(e) => { if (!(e.target as Element).closest("button")) setOpen(step.id); }}
            onDragStart={(e) => { dragRef.current = step.id; setDrag(step.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", step.id); }} onDragEnd={end}
            onDragOver={(e) => { if (!dragged) return; e.preventDefault(); e.stopPropagation(); const box = e.currentTarget.getBoundingClientRect(); setTarget({ ...target, before: e.clientY < box.top + box.height / 2 ? step.id : list[index + 1]?.id ?? null }); }}>
            <div className={styles.cardTop}><span className={styles.key}>{step.external?.key ?? (jira.waiting ? <span title={t("projects.waitKeyTitle")}>{t("projects.waitKey")}</span> : null)}</span>{step.ownerUserId && <PersonFace name={step.owner ?? ""} size="sm" />}</div>
            <button type="button" className={styles.cardOpen} onClick={() => setOpen(step.id)} aria-label={t("projectSteps.openStep", { text: step.text })}>{step.text}</button>
            {step.checklist.length > 0 && <div className={styles.progress}><progress max={step.checklist.length} value={step.checklist.filter((item) => item.done).length} aria-label={t("projectSteps.checklistProgress", { done: step.checklist.filter((item) => item.done).length, total: step.checklist.length })} /><span>{step.checklist.filter((item) => item.done).length}/{step.checklist.length}</span></div>}
            {step.waitingOn && <div className={styles.waiting}>{t("projectSteps.waitingFor", { name: step.waitingOn.name ?? t("projectSteps.waitingNobody") })}</div>}
            {!step.waitingOn && step.column === "blocked" && step.why && <div className={styles.waiting}>{step.why}</div>}
            {p.helpAsks.filter((ask) => ask.stepId === step.id && ask.answeredDay === null).map((ask) => <div className={styles.waiting} key={ask.id}>{ask.text}</div>)}
            <div className={styles.cardFoot}><span>{step.owner ?? t("projectSteps.noOwner")}</span>{step.dueDay !== null && <span className={styles.due} data-late={step.column !== "done" && step.dueDay < S.day || undefined}>{step.column !== "done" && step.dueDay < S.day && `${t("projects.lateShort")} · `}{f(step.dueDay)}</span>}</div>
            {rights.moveStep(step) && !step.dropped && <button type="button" className={styles.grip} aria-label={t("projectSteps.dragStep", { text: step.text })} tabIndex={-1} onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); dragRef.current = step.id; setDrag(step.id); setGhost({ x: e.clientX, y: e.clientY }); }} onPointerMove={point} onPointerUp={drop} onPointerCancel={end}>⠿</button>}
          </article></div>)}
          {line(null)}
          {column === "done" && older > 0 && filter.hideOldDone && groupBy === "status" && <button type="button" className={styles.quiet} onClick={() => setFilter({ ...filter, hideOldDone: false })}>{t("projectSteps.olderDone", { count: older })}</button>}
          {composer ? <Composer key={`${lane.id}-${column}`} {...{ p, column, team }} ownerUserId={groupBy === "person" ? lane.ownerUserId : null} onCancel={() => setAdding(null)} onBlocked={(step) => { setBlocked({ step, target }); setAdding(null); }} /> : rights.addStep && <button type="button" className={styles.add} aria-label={t("projects.addStepTo", { column: columnLabel(column, locale) })} onClick={() => setAdding({ column, lane: lane.id })}>+ {t("projectSteps.addStep")}</button>}
        </div>;
      })}</div>}
    </div>)}
    {active ? <button type="button" className={styles.filterChip} onClick={() => setFilter({ ...NO_FILTER, hideOldDone: filter.hideOldDone })}>{t("projectSteps.showing", { shown: shown.length, total: p.steps.length })}</button> : null}
    {blocked && <div className={styles.blocked}><MarkBlockedForm key={blocked.step.id} p={p} step={blocked.step} onCancel={() => setBlocked(null)} onDone={() => { reassign(blocked.step, blocked.target); setBlocked(null); }} /></div>}
    {ghost && <div className={styles.ghost} style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">{p.steps.find((s) => s.id === drag)?.text}</div>}
    {open && <StepPanel p={p} stepId={open} jira={jira} onClose={() => setOpen(null)} />}
  </div>;
}

function Composer({ p, column, team, ownerUserId, onCancel, onBlocked }: {
  p: ToolProps["p"]; column: StepColumn; team: ReturnType<typeof withIds>; ownerUserId: string | null;
  onCancel: () => void; onBlocked: (step: Step) => void;
}) {
  const { act, S } = useDemo();
  const send = useSend(p);
  const t = useT();
  const [text, setText] = useState("");
  const [owner, setOwner] = useState(ownerUserId ?? "");
  const [due, setDue] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    // Blocked creation starts in To do; the existing waiting-on form owns the blocked move.
    const to = column === "blocked" ? "todo" : column;
    const name = team.find((person) => person.userId === owner)?.name;
    const dueDay = due === "" ? undefined : S.day + Math.max(0, Math.round(Number(due)));
    send("project.step.added", { stepId: "probe", text: text.trim(), to }, () => {
      const id = act.project.addStep(p.id, text.trim(), name, dueDay, to, undefined, owner || null);
      if (column === "blocked") onBlocked({ id, text: text.trim(), owner: name ?? null, ownerUserId: owner || null, dueDay: dueDay ?? null, column: "todo", why: "", note: "", addedDay: S.day, movedDay: S.day, by: "", startedDay: null, doneDay: null, external: null, checklist: [], comments: [], waitingOn: null });
      setText(""); setDue("");
    });
  };
  return <form className={styles.composer} onSubmit={(e) => { e.preventDefault(); submit(); }} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onCancel(); } }}>
    <textarea className="nh-input" autoFocus aria-label={t("projects.newStep")} placeholder={t("projectSteps.stepTitle")} maxLength={500} rows={2} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
    <div className={styles.composerRow}><select className="nh-input" aria-label={t("projectSteps.owner")} value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">{t("projectSteps.noOwner")}</option>{team.map((person) => <option key={person.userId} value={person.userId}>{person.name}</option>)}</select><input className="nh-input" type="number" min={0} max={365} aria-label={t("projects.dueInDays")} placeholder={t("projectSteps.due")} value={due} onChange={(e) => setDue(e.target.value)} /></div>
    <div className={styles.composerRow}><button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!text.trim()}>{t("projectSteps.add")}</button><button type="button" className={styles.quiet} onClick={onCancel}>{t("projectSteps.cancel")}</button></div><small>{t("projectSteps.enterAdd")}</small>
  </form>;
}
