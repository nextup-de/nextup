"use client";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { newId } from "@/features/cases/events";
import { calendarWeeks, dropOnDay, quickAdd, shiftPeriod, unscheduled, type CalendarScale } from "@/features/projects/calendar-view";
import type { StepColumn } from "@/features/projects/types";
import { STEP_COLUMNS } from "@/features/projects/types";
import { columnLabel } from "@/features/projects/views";
import { stepKey } from "@/features/projects/list-view";
import { INTL_LOCALE } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import { formatDate } from "@/i18n/format";
import type { projectCalendar } from "@/i18n/messages/projectCalendar";
import { teamOf, useRights, useSend, withIds } from "../../parts";
import { CreateStepDialog } from "../../steps/CreateStepDialog";
import { StepPanel } from "../../steps/StepPanel";
import type { ToolProps } from "../../tools/types";
import { HeadSlot } from "../../tools/HeadSlot";
import { useDayMap } from "./days";
import styles from "./Calendar.module.css";

export function Calendar({ p, jira, page, tool }: ToolProps) {
  const { act, S, seed, actorUserId } = useDemo();
  const t = useT();
  const locale = useLocale();
  const rights = useRights(p);
  const send = useSend(p);
  const map = useDayMap();
  const c: Cx = (key, params) => t(`projectCalendar.${key}`, params);
  const [anchor, setAnchor] = useState(map.today);
  const [scale, setScale] = useState<CalendarScale>("month");
  const [drawer, setDrawer] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [quick, setQuick] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ stepId: string; from: "chip" | "drawer" } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [preset, setPreset] = useState<{ dueDay: number; title: string; column: StepColumn } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const weeks = calendarWeeks(p, { month: anchor, scale, day: S.day, workdays: map.workdays, dateOf: map.dateOf, dayOf: map.dayOf });
  const loose = unscheduled(p);
  const dayName = (iso: string) => formatDate(locale, `${iso}T12:00:00Z`, "dayMonth");
  const title = new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${anchor}T12:00:00Z`));
  const heads = weeks[0]?.map((cell) => new Intl.DateTimeFormat(INTL_LOCALE[locale], { weekday: "short", timeZone: "UTC" }).format(new Date(`${cell.date}T12:00:00Z`))) ?? [];
  const team = withIds(teamOf(p, seed.seats));
  const hovered = over ? map.dayOf(over) : null;

  const place = (stepId: string, day: number | null) => {
    const step = p.steps.find((s) => s.id === stepId);
    const event = step && dropOnDay(step, day);
    setDrag(null); setOver(null);
    if (!step || !event) return;
    send(event.type, event.payload, () => act.project.editStep(p.id, step.id, { dueDay: day }));
  };

  return <section className={styles.calendar} aria-label={t("projectPlan.calendarLabel")}>
    <HeadSlot page={page} tool={tool}><div className={styles.toolbar}>
      <button type="button" className={styles.control} onClick={() => setAnchor(map.today)}>{t("projectPlan.calToday")}</button>
      <button type="button" className={styles.control} aria-label={t("projectPlan.calPrev")} onClick={() => setAnchor(shiftPeriod(anchor, scale, -1))}>‹</button>
      <strong className={styles.title}>{title}</strong>
      <button type="button" className={styles.control} aria-label={t("projectPlan.calNext")} onClick={() => setAnchor(shiftPeriod(anchor, scale, 1))}>›</button>
      <span className={styles.spacer} />
      <button type="button" className={styles.control} aria-expanded={drawer} onClick={() => setDrawer(!drawer)}>{c("notScheduled")}<span className={styles.count}>{loose.length}</span></button>
      <div role="group" aria-label={t("projectPlan.scaleLabel")} className={styles.segmented}>
        {(["month", "week"] as const).map((s) => <button key={s} type="button" className={styles.control} aria-pressed={scale === s} onClick={() => setScale(s)}>{t(s === "month" ? "projectPlan.calMonth" : "projectPlan.calWeek")}</button>)}
      </div>
    </div></HeadSlot>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.body}>
      <div className={styles.grid} data-days={map.workdays ? 5 : 7}>
        {heads.map((head) => <div key={head} className={styles.head}>{head}</div>)}
        {weeks.flat().map((cell) => {
          const canDrop = cell.day !== null && rights.addStep;
          return <div key={cell.date} className={styles.cell} role="group" aria-label={t("projectPlan.calDayLabel", { date: dayName(cell.date), count: cell.chips.length })}
            data-today={cell.today || undefined} data-out={!cell.inPeriod || undefined} data-over={over === cell.date && canDrop || undefined} data-off={cell.day === null || undefined}
            onDragOver={(e) => { if (drag && canDrop) { e.preventDefault(); setOver(cell.date); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null); }}
            onDrop={(e) => { e.preventDefault(); if (drag) place(drag, cell.day); }}>
            <div className={styles.dayTop}>
              <span className={styles.dayNum}>{Number(cell.date.slice(8))}</span>
              {cell.today && <span className={styles.todayLabel}>{t("projectPlan.calToday")}</span>}
              {canDrop && <button type="button" className={styles.addDay} aria-label={c("addStepOn", { date: dayName(cell.date) })} onClick={() => { setQuick(cell.date); setMenu(null); }}>+</button>}
            </div>
            {over === cell.date && canDrop && <span className={styles.drop} role="status">{c("dropHint", { date: dayName(cell.date) })}</span>}
            {cell.chips.map((chip) => <div key={chip.stepId} className={styles.chipRow}>
              <button type="button" className={styles.chip} data-late={chip.late || undefined} data-done={chip.done || undefined} draggable={rights.addStep}
                aria-label={c("openStep", { step: p.steps.find((s) => s.id === chip.stepId)?.text ?? chip.key })}
                onDragStart={(e) => { setDrag(chip.stepId); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", chip.stepId); }} onDragEnd={() => { setDrag(null); setOver(null); }}
                onClick={() => setOpen(chip.stepId)}>{chip.key} · {chip.title}</button>
              {rights.addStep && <button type="button" className={styles.more} aria-label={c("stepMenu", { step: chip.title })} aria-haspopup="menu" aria-expanded={menu?.stepId === chip.stepId && menu.from === "chip"} onClick={() => { setMenu(menu?.stepId === chip.stepId && menu.from === "chip" ? null : { stepId: chip.stepId, from: "chip" }); setError(null); }}>⋯</button>}
              {menu?.stepId === chip.stepId && menu.from === "chip" && <DayPicker label={c("moveToDay")} date={cell.date} onClose={() => setMenu(null)} onPick={(date) => { const day = map.dayOf(date); if (day === null) { setError(c("noWorkday")); return; } setMenu(null); place(chip.stepId, day); }} c={c} />}
            </div>)}
            {quick === cell.date && cell.day !== null && <QuickAdd date={dayName(cell.date)} day={cell.day} team={team} me={actorUserId} c={c} onCancel={() => setQuick(null)}
              onMore={(input) => { setPreset({ dueDay: input.day, title: input.title, column: input.column }); setQuick(null); }}
              onAdd={(input) => {
                const event = quickAdd(input.day, input.title, (prefix) => newId(prefix), { column: input.column, owner: input.owner?.name ?? null, ownerUserId: input.owner?.userId ?? null });
                if (!event) return;
                const pl = event.payload;
                if (send(event.type, pl, () => act.project.addStep(p.id, pl.text, pl.owner, pl.dueDay, pl.to, undefined, pl.ownerUserId ?? null))) setQuick(null);
              }} />}
          </div>;
        })}
      </div>
      {drawer && <aside className={styles.drawer} aria-label={c("notScheduled")}>
        <div className={styles.drawerHead}>
          <h3>{c("notScheduled")} <span className={styles.drawerCount}>· {loose.length}</span></h3>
          <button type="button" className={styles.more} aria-label={t("projectPlan.drawerClose")} onClick={() => setDrawer(false)}>×</button>
        </div>
        <p className={styles.hint}>{c("drawerHint")}</p>
        {loose.length === 0 && <p className={styles.hint}>{c("drawerEmpty")}</p>}
        <ul>{loose.map((step) => <li key={step.id} className={styles.drawerRow}>
          <span className={styles.drawerStep} draggable={rights.addStep} onDragStart={(e) => { setDrag(step.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", step.id); }} onDragEnd={() => { setDrag(null); setOver(null); }}>
            <button type="button" className={styles.card} aria-label={c("openStep", { step: step.text })} onClick={() => setOpen(step.id)}>
              <span className={styles.cardKey}>{stepKey(step)}</span>
              <span className={styles.cardTitle}>{step.text}</span>
              <span className={styles.cardMeta}>{step.owner ?? t("projectSteps.noOwner")} · {columnLabel(step.column, locale)}</span>
            </button>
          </span>
          {rights.addStep && <button type="button" className={styles.control} aria-haspopup="dialog" aria-expanded={menu?.stepId === step.id && menu.from === "drawer"} onClick={() => { setMenu(menu?.stepId === step.id && menu.from === "drawer" ? null : { stepId: step.id, from: "drawer" }); setError(null); }}>{c("schedule")}</button>}
          {menu?.stepId === step.id && menu.from === "drawer" && <DayPicker label={c("schedule")} date={map.today} onClose={() => setMenu(null)} onPick={(date) => { const day = map.dayOf(date); if (day === null) { setError(c("noWorkday")); return; } setMenu(null); place(step.id, day); }} c={c} />}
        </li>)}</ul>
        {hovered !== null && drag && <p className={styles.hint} role="status">{c("dropHint", { date: dayName(over!) })}</p>}
      </aside>}
    </div>
    {open && <StepPanel p={p} stepId={open} jira={jira} onClose={() => setOpen(null)} />}
    {preset && <CreateStepDialog p={p} open onClose={() => setPreset(null)} preset={preset} />}
  </section>;
}

type CalKey = keyof typeof projectCalendar.en;
type Cx = (key: CalKey, params?: Record<string, string>) => string;

function DayPicker({ label, date, onPick, onClose, c }: { label: string; date: string; onPick: (date: string) => void; onClose: () => void; c: Cx }) {
  const [value, setValue] = useState(date);
  return <form className={styles.picker} aria-label={label} onSubmit={(e) => { e.preventDefault(); if (value) onPick(value); }} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
    <label>{c("date")}<input className="nh-input" type="date" autoFocus required value={value} onChange={(e) => setValue(e.target.value)} /></label>
    <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm">{c("move")}</button>
  </form>;
}

function QuickAdd({ date, day, team, me, c, onAdd, onMore, onCancel }: {
  date: string; day: number; team: { userId: string; name: string }[]; me: string | null; c: Cx;
  onAdd: (input: { day: number; title: string; column: StepColumn; owner: { userId: string; name: string } | null }) => void;
  onMore: (input: { day: number; title: string; column: StepColumn }) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState(team.some((x) => x.userId === me) ? me ?? "" : "");
  const [column, setColumn] = useState<StepColumn>("todo");
  return <form className={styles.quick} aria-label={c("newStepOn", { date })} onSubmit={(e) => { e.preventDefault(); onAdd({ day, title, column, owner: team.find((x) => x.userId === owner) ?? null }); }} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onCancel(); } }}>
    <strong>{c("newStepOn", { date })}</strong>
    <input className="nh-input" autoFocus aria-label={t("projectPlan.createLabel")} placeholder={t("projectPlan.quickAddPlaceholder")} maxLength={500} value={title} onChange={(e) => setTitle(e.target.value)} />
    <select className="nh-input" aria-label={t("projectPlan.fieldOwner")} value={owner} onChange={(e) => setOwner(e.target.value)}>
      <option value="">{t("projectPlan.fieldNoOwner")}</option>
      {team.map((x) => <option key={x.userId} value={x.userId}>{x.name}</option>)}
    </select>
    <select className="nh-input" aria-label={t("projectSteps.column")} value={column} onChange={(e) => setColumn(e.target.value as StepColumn)}>
      {STEP_COLUMNS.filter((col) => col !== "blocked").map((col) => <option key={col} value={col}>{columnLabel(col, locale)}</option>)}
    </select>
    <div className={styles.quickRow}>
      <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!title.trim()}>{t("projectPlan.quickAddSubmit")}</button>
      <button type="button" className={styles.moreFields} onClick={() => onMore({ day, title, column })}>{c("moreFields")}</button>
      <button type="button" className={styles.control} onClick={onCancel}>{t("projectPlan.quickAddCancel")}</button>
    </div>
  </form>;
}
