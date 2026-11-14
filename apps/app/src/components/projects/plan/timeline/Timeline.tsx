"use client";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { datesEdit, dragEdit, timelineRows, TIMELINE_GROUPS, TIMELINE_SCALES, type DateEdit, type TimelineGroup, type TimelineGroupBy, type TimelineRow, type TimelineScale } from "@/features/projects/timeline-view";
import type { ReducedProject, StepColumn } from "@/features/projects/types";
import { useIdInUrl, useUrlId } from "@/lib/use-url-id";
import { useRights, useSend } from "../../parts";
import { CreateStepDialog } from "../../steps/CreateStepDialog";
import { StepPanel } from "../../steps/StepPanel";
import type { JiraRow } from "@/features/projects/views";
import styles from "./Timeline.module.css";
import { useT } from "@/i18n/client";

const COLUMN_PX = 96;
const UNIT: Record<TimelineScale, number> = { weeks: 7, months: 30, quarters: 91 };
type Drag = { stepId: string; part: "move" | "start" | "end"; x: number; days: number };
type Line = { kind: "group"; group: TimelineGroup } | { kind: "row"; row: TimelineRow };

export function Timeline({ p, jira }: { p: ReducedProject; jira: JiraRow }) {
  const { S, f, seed, act } = useDemo();
  const t = useT();
  const rights = useRights(p);
  const send = useSend(p);
  const [groupBy, setGroupBy] = useState<TimelineGroupBy>("milestone");
  const [scale, setScale] = useState<TimelineScale>("weeks");
  const [open, setOpen] = useState<string | null>(useUrlId("step"));
  useIdInUrl(open, setOpen, "step");
  const [datesFor, setDatesFor] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const workdays = seed.clock.mode === "workdays";
  const view = timelineRows(p, { groupBy, scale, day: S.day, workdays });
  const unit = scale === "weeks" ? (workdays ? 5 : 7) : scale === "months" ? (workdays ? 21 : 30) : workdays ? 63 : 91;
  const dayPx = COLUMN_PX / (unit || UNIT[scale]);
  const dayLeft = (d: number) => (d - view.from) * dayPx;
  const syncing = p.sync?.system === "jira" && p.sync.on;
  const step = (id: string) => p.steps.find((s) => s.id === id);
  const lines: Line[] = view.groups.flatMap((g): Line[] => [...(groupBy === "none" ? [] : [{ kind: "group" as const, group: g }]), ...g.rows.map((row) => ({ kind: "row" as const, row }))]);
  const colLabel = { todo: t("projectPlan.timelineTodo"), doing: t("projectPlan.timelineDoing"), blocked: t("projectPlan.timelineBlocked"), done: t("projectPlan.timelineDone") } satisfies Record<StepColumn, string>;
  const groupTitle = (g: TimelineGroup) => groupBy === "milestone" ? g.title ?? t("projectPlan.timelineNoMilestone")
    : groupBy === "person" ? (g.userId ? seed.seats.find((s) => s.userId === g.userId)?.label ?? g.userId : t("projectPlan.timelineNoOwner")) : g.column ? colLabel[g.column] : "";

  const apply = (id: string, change: DateEdit) => {
    const s = step(id);
    if (!s) return;
    const ok = send("project.step.edited", { stepId: id, ...change.edit }, () => act.project.editStep(p.id, id, change.edit));
    if (!ok) return;
    const text = change.edit.dueDay !== undefined && change.edit.dueDay !== null ? t("projectPlan.timelineDueMoved", { date: f(change.edit.dueDay) })
      : change.edit.startDay !== undefined && change.edit.startDay !== null ? t("projectPlan.timelineStartMoved", { date: f(change.edit.startDay) }) : s.text;
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ text, undo: () => { send("project.step.edited", { stepId: id, ...change.undo }, () => act.project.editStep(p.id, id, change.undo)); setToast(null); } });
    toastTimer.current = window.setTimeout(() => setToast(null), 8000);
  };

  const begin = (e: ReactPointerEvent, row: TimelineRow, part: Drag["part"]) => {
    const s = step(row.stepId);
    if (!s || !rights.editStep(s) || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ stepId: row.stepId, part, x: e.clientX, days: 0 });
  };
  const move = (e: ReactPointerEvent) => { if (drag) setDrag({ ...drag, days: Math.round((e.clientX - drag.x) / dayPx) }); };
  const end = () => {
    if (!drag) return;
    const s = step(drag.stepId);
    const change = s ? dragEdit(s, { part: drag.part, days: drag.days }) : null;
    setDrag(null);
    if (change) apply(drag.stepId, change);
  };

  const preview = (row: TimelineRow) => {
    const s = drag?.stepId === row.stepId ? step(row.stepId) : undefined;
    const change = s && drag ? dragEdit(s, { part: drag.part, days: drag.days }) : null;
    if (!s || !change) return row.bar;
    return timelineRows({ steps: [{ ...s, ...change.edit }], milestones: [] }, { groupBy: "none", scale, day: S.day }).groups[0].rows[0].bar;
  };

  return <div className={styles.timeline}>
    <div className={styles.head}>
      <h2 className={styles.title}>{t("projectPlan.timeline")}</h2>
      <div className={styles.controls}>
        <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => scroller.current?.scrollTo({ left: Math.max(0, dayLeft(S.day) - COLUMN_PX * 2), behavior: "smooth" })}>{t("projectPlan.calToday")}</button>
        <label className={styles.group}>{t("projectPlan.timelineGroupBy")}:
          <select className="nh-input nh-select" value={groupBy} onChange={(e) => setGroupBy(TIMELINE_GROUPS.find((g) => g === e.target.value) ?? "milestone")}>
            {TIMELINE_GROUPS.map((g) => <option key={g} value={g}>{g === "milestone" ? t("projectPlan.fieldMilestone") : g === "person" ? t("projectPlan.timelineGroupPerson") : g === "status" ? t("projectPlan.groupStatus") : t("projectPlan.timelineGroupNone")}</option>)}
          </select>
        </label>
        <div className={styles.scale} role="radiogroup" aria-label={t("projectPlan.scaleLabel")}>
          {TIMELINE_SCALES.map((sc) => <button key={sc} type="button" role="radio" aria-checked={scale === sc} data-on={scale === sc ? "true" : undefined} onClick={() => setScale(sc)}>{sc === "weeks" ? t("projectPlan.scaleWeeks") : sc === "months" ? t("projectPlan.scaleMonths") : t("projectPlan.scaleQuarters")}</button>)}
        </div>
        {rights.addStep && <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={() => setAdding(true)}>+ {t("projectPlan.timelineAddStep")}</button>}
      </div>
    </div>
    {syncing && jira.state === "synced" && <p className={styles.note}>{t("projectPlan.timelineSyncNote")}</p>}
    {view.empty ? <p className={styles.note}>{t("projectPlan.timelineEmpty")}</p> : <div className={styles.frame}>
      <div className={styles.left}>
        <div className={styles.leftHead}>{t("projectPlan.timelineStep")}</div>
        {lines.map((line) => line.kind === "group"
          ? <div key={line.group.id} className={styles.groupRow}><strong>{groupTitle(line.group)}</strong><span className={styles.muted}>· {t("projectPlan.timelineDoneOf", { done: line.group.done, total: line.group.total })}</span></div>
          : <div key={line.row.stepId} className={styles.stepRow} data-done={line.row.column === "done" ? "true" : undefined}>
              {line.row.key && <span className={styles.key}>{line.row.key}</span>}
              <span className={styles.stepText}>{line.row.text}</span>
              {rights.editStep(step(line.row.stepId) as NonNullable<ReturnType<typeof step>>) && <button type="button" className={styles.datesButton} aria-expanded={datesFor === line.row.stepId} onClick={() => setDatesFor(datesFor === line.row.stepId ? null : line.row.stepId)}>{t("projectPlan.timelineDates")}</button>}
            </div>)}
      </div>
      <div className={styles.scroller} ref={scroller}>
        <div className={styles.grid} role="group" aria-label={t("projectPlan.timelineGrid")} style={{ width: view.columns.length * COLUMN_PX }}>
          <div className={styles.gridHead}>{view.columns.map((c) => <span key={c.start} className={styles.colHead} style={{ width: COLUMN_PX }}>{f(c.start)}</span>)}</div>
          <span className={styles.today} style={{ left: dayLeft(S.day) }} aria-hidden="true" />
          {lines.map((line) => line.kind === "group"
            ? <div key={line.group.id} className={styles.groupLane} />
            : <div key={line.row.stepId} className={styles.lane}>
                {(() => {
                  const bar = preview(line.row);
                  const dragging = drag?.stepId === line.row.stepId;
                  const editable = rights.editStep(step(line.row.stepId) as NonNullable<ReturnType<typeof step>>);
                  return <div className={styles.bar} data-tone={line.row.tone} data-dragging={dragging ? "true" : undefined} style={{ left: dayLeft(bar.start), width: Math.max(dayPx, (bar.end - bar.start) * dayPx) }}
                    onPointerDown={(e) => { if (e.target === e.currentTarget) begin(e, line.row, "move"); }} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)}>
                    {editable && <span className={styles.handle} data-side="start" role="presentation" aria-label={t("projectPlan.timelineDragStart", { step: line.row.text })} onPointerDown={(e) => { e.stopPropagation(); begin(e, line.row, "start"); }} onPointerMove={move} onPointerUp={end} />}
                    <button type="button" className={styles.barOpen} aria-label={t("projectPlan.timelineOpenStep", { step: line.row.text })} onClick={() => setOpen(line.row.stepId)}>{line.row.text}</button>
                    {editable && <span className={styles.handle} data-side="end" role="presentation" aria-label={t("projectPlan.timelineDragEnd", { step: line.row.text })} onPointerDown={(e) => { e.stopPropagation(); begin(e, line.row, "end"); }} onPointerMove={move} onPointerUp={end} />}
                    {dragging && <span className={styles.dragLabel} role="status">{t("projectPlan.timelineSpan", { from: f(bar.start), to: f(bar.end), days: bar.end - bar.start, was: line.row.bar.end - line.row.bar.start })}</span>}
                  </div>;
                })()}
              </div>)}
        </div>
      </div>
    </div>}
    {datesFor && step(datesFor) && <DatesForm key={datesFor} p={p} stepId={datesFor} today={S.day} f={f} onApply={(id, c) => { apply(id, c); setDatesFor(null); }} onCancel={() => setDatesFor(null)} />}
    {toast && <div className={styles.toast} role="status"><span>{toast.text}</span><button type="button" onClick={toast.undo}>{t("projectPlan.toastUndo")}</button></div>}
    {open && <StepPanel p={p} stepId={open} jira={jira} onClose={() => setOpen(null)} />}
    <CreateStepDialog p={p} open={adding} onClose={() => setAdding(false)} />
  </div>;
}

/** 'Dates…': start and due as days from today, with the dates they fall on, so the edit works without a mouse (D6). */
function DatesForm({ p, stepId, today, f, onApply, onCancel }: { p: ReducedProject; stepId: string; today: number; f: (d: number) => string; onApply: (id: string, change: DateEdit) => void; onCancel: () => void }) {
  const t = useT();
  const s = p.steps.find((st) => st.id === stepId);
  const bar = s ? timelineRows({ steps: [s], milestones: [] }, { groupBy: "none", scale: "weeks", day: today }).groups[0].rows[0].bar : null;
  const [start, setStart] = useState(String((s?.startDay ?? bar?.start ?? today) - today));
  const [due, setDue] = useState(String((s?.dueDay ?? bar?.end ?? today) - today));
  const [error, setError] = useState(false);
  if (!s) return null;
  const startDay = Number.isInteger(Number(start)) && start.trim() !== "" ? today + Number(start) : null;
  const dueDay = Number.isInteger(Number(due)) && due.trim() !== "" ? today + Number(due) : null;
  const submit = () => {
    const change = startDay !== null && dueDay !== null ? datesEdit(s, { start: startDay, due: dueDay }) : null;
    if (startDay === null || dueDay === null || dueDay < startDay) { setError(true); return; }
    if (change) onApply(stepId, change); else onCancel();
  };
  return <form className={styles.dates} aria-label={t("projectPlan.timelineDatesFor", { step: s.text })} onSubmit={(e) => { e.preventDefault(); submit(); }} onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
    <strong>{t("projectPlan.timelineDatesFor", { step: s.text })}</strong>
    <label>{t("projectPlan.timelineStart")} <input className="nh-input" type="number" step={1} autoFocus value={start} onChange={(e) => { setStart(e.target.value); setError(false); }} /> <span className={styles.muted}>{t("projectPlan.timelineDaysFromToday")}{startDay !== null ? ` · ${f(startDay)}` : ""}</span></label>
    <label>{t("projectPlan.fieldDue")} <input className="nh-input" type="number" step={1} value={due} onChange={(e) => { setDue(e.target.value); setError(false); }} /> <span className={styles.muted}>{t("projectPlan.timelineDaysFromToday")}{dueDay !== null ? ` · ${f(dueDay)}` : ""}</span></label>
    {error && <p role="alert" className={styles.error}>{t("projectPlan.timelineInvalid")}</p>}
    <div className={styles.actions}><button type="submit" className="nh-btn nh-btn-primary nh-btn-sm">{t("projectPlan.milestoneSave")}</button><button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={onCancel}>{t("projectPlan.quickAddCancel")}</button></div>
  </form>;
}
