"use client";
import { useCallback, useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { DEFAULT_SORT, listRows, stepKey, type ListColumn, type ListSort } from "@/features/projects/list-view";
import { NO_FILTER, stepFilter, type StepFilter } from "@/features/projects/step-filter";
import { columnLabel } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { useIdInUrl, useUrlId } from "@/lib/use-url-id";
import { teamOf, useRights, useSend, withIds } from "../../parts";
import type { ToolProps } from "../../tools/types";
import { StepFilterRow } from "../StepFilterRow";
import { StepPanel } from "../StepPanel";
import { CellMenu } from "./CellMenu";
import styles from "./List.module.css";

const columns: ListColumn[] = ["key", "step", "owner", "status", "due", "waitingOn"];
const labels = { key: "projectSteps.key", step: "projectSteps.listStep", owner: "projectSteps.owner", status: "projectSteps.status", due: "projectSteps.due", waitingOn: "projectSteps.waitingOn" } as const;

export function List({ p, jira, page, tool }: ToolProps) {
  const { S, seed, actorUserId, act, f, persona } = useDemo();
  const t = useT();
  const locale = useLocale();
  const rights = useRights(p);
  const send = useSend(p);
  const team = withIds(teamOf(p, seed.seats));
  const [filter, setFilter] = useState<StepFilter>({ ...NO_FILTER });
  const [sort, setSort] = useState<ListSort>(DEFAULT_SORT);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(useUrlId("step"));
  useIdInUrl(open, setOpen, "step");
  const [cell, setCell] = useState<{ stepId: string; column: "owner" | "status" | "due" } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const closeCell = useCallback(() => { setCell(null); trigger.current?.focus(); }, []);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const ctx = { day: S.day, me: actorUserId };
  const rows = listRows(p, filter, sort, ctx);
  const visible = all || rows.length <= 7 ? rows : rows.slice(0, 5);
  const owners = [...new Map(p.steps.filter((s) => s.ownerUserId).map((s) => [s.ownerUserId!, { userId: s.ownerUserId!, name: s.owner ?? "" }])).values()];
  const waitingCount = stepFilter(p, { ...NO_FILTER, waiting: true }, ctx).filter((s) => !s.dropped).length;
  const active = filter.query.trim() || filter.owners.length || filter.mine || filter.waiting || filter.dueWeek || filter.notStarted || filter.dropped;
  const sortLabel = sort.column === "attention" ? t("projectSteps.listAttention") : `${t(labels[sort.column])} ${sort.direction === "asc" ? "↑" : "↓"}`;
  const add = () => {
    if (!text.trim() || !rights.addStep) return;
    if (send("project.step.added", { stepId: "probe", text: text.trim() }, () => act.project.addStep(p.id, text.trim()))) setText("");
  };
  const takeIt = (stepId: string) => {
    if (!actorUserId) return;
    const change = { ownerUserId: actorUserId, owner: team.find((m) => m.userId === actorUserId)?.name ?? persona.who.name };
    send("project.step.edited", { stepId, ...change }, () => act.project.editStep(p.id, stepId, change));
  };
  return <div className={styles.list}>
    {active ? <button type="button" className={styles.filterChip} onClick={() => { setFilter({ ...NO_FILTER }); setAll(false); }}>{t("projectSteps.showing", { shown: rows.length, total: p.steps.length })}</button> : null}
    <div className={styles.tableWrap}>
      {/* Paper "Jira pages · new header": the List keeps its filter row inside its card, also when it is the page's first tool. */}
      <div className={styles.toolbar}><StepFilterRow search="projectSteps.searchList" filter={filter} onFilter={(next) => { setFilter(next); setAll(false); }} owners={owners} waitingCount={waitingCount} page={page} tool={tool} inline /></div>
      <table className={styles.table}>
        <thead><tr>{columns.map((column) => <th key={column} scope="col" aria-sort={sort.column === column ? sort.direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" aria-label={t("projectSteps.sortBy", { field: t(labels[column]) })} onClick={() => { setSort({ column, direction: sort.column === column && sort.direction === "asc" ? "desc" : "asc" }); setCell(null); }}>{t(labels[column])}{sort.column === column ? sort.direction === "asc" ? " ↑" : " ↓" : ""}</button></th>)}</tr></thead>
        <tbody>{visible.map((step) => {
          const late = !step.dropped && step.column !== "done" && step.dueDay !== null && step.dueDay < S.day;
          const soon = !late && step.column === "doing" && step.dueDay !== null;
          const waiting = step.waitingOn;
          const waitingName = waiting?.kind === "person" ? seed.seats.find((s) => s.userId === waiting.userId)?.label ?? waiting.name : waiting?.name;
          return <tr key={step.id} data-done={step.column === "done" || undefined} data-dropped={!!step.dropped || undefined} onClick={() => setOpen(step.id)}>
            <td data-label={t(labels.key)} className={styles.key}>{stepKey(step)}</td>
            <td data-label={t(labels.step)}><button type="button" className={styles.step} aria-label={t("projectSteps.openStep", { text: step.text })} onClick={() => setOpen(step.id)}>{step.text}</button></td>
            {(["owner", "status", "due"] as const).map((column) => <td key={column} data-label={t(labels[column])} className={styles.anchor}>
              {column === "owner" && !step.owner && !step.dropped && step.column !== "done" && actorUserId && rights.editStep(step) ? <button type="button" className={styles.take} onClick={(e) => { e.stopPropagation(); takeIt(step.id); }}>{t("projectSteps.takeItArrow")}</button> : <button type="button" className={column === "status" ? styles.status : styles.cell} data-status={column === "status" ? step.column : undefined} data-due={column === "due" ? step.dueDay === null ? "none" : late ? "late" : soon ? "soon" : "date" : undefined} disabled={!!step.dropped || !(column === "status" ? rights.moveStep(step) : rights.editStep(step))} aria-haspopup="dialog" aria-expanded={cell?.stepId === step.id && cell.column === column} aria-label={t(column === "owner" ? "projectSteps.changeOwner" : column === "status" ? "projectSteps.changeStatus" : "projectSteps.changeDue")} onClick={(e) => { e.stopPropagation(); trigger.current = e.currentTarget; setCell(cell?.stepId === step.id && cell.column === column ? null : { stepId: step.id, column }); }}>{column === "owner" ? step.ownerUserId === actorUserId && actorUserId ? t("projectSteps.you") : step.owner || t("projectSteps.noOwner") : column === "status" ? columnLabel(step.column, locale) : step.dueDay === null ? t("projectSteps.noDate") : late ? `${t("projects.lateShort")} · ${f(step.dueDay)}` : soon ? t("projectSteps.dueIn", { date: f(step.dueDay), count: step.dueDay - S.day }) : f(step.dueDay)}</button>}
              {cell?.stepId === step.id && cell.column === column && <CellMenu key={`${step.id}-${column}`} {...{ p, step, column, jira, team }} onClose={closeCell} />}
            </td>)}
            <td data-label={t(labels.waitingOn)} className={styles.waiting}>{waitingName ? t("projectSteps.listWaiting", { name: waitingName, days: S.day - step.movedDay }) : p.helpAsks.filter((a) => a.stepId === step.id && a.answeredDay === null).map((a) => a.text).join(" · ") || <span className={styles.none}>—</span>}</td>
          </tr>;
        })}</tbody>
      </table>
      {!rows.length && <p className={styles.empty}>{t(p.steps.length ? "projectSteps.emptyFilter" : "projectSteps.emptyList")}</p>}
      <div className={styles.footer}>
        {rights.addStep && (adding ? <form className={styles.composer} onSubmit={(e) => { e.preventDefault(); add(); }} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setAdding(false); setText(""); } }}>
          <input className="nh-input" autoFocus maxLength={500} aria-label={t("projectSteps.stepTitle")} placeholder={t("projectSteps.stepTitle")} value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!text.trim()}>{t("projectSteps.add")}</button><button type="button" className={styles.cell} onClick={() => { setAdding(false); setText(""); }}>{t("projectSteps.cancel")}</button>
          <small>{t("projectSteps.enterAdd")}</small>
        </form> : <button type="button" className={styles.addStep} onClick={() => setAdding(true)}>+ {t("projectSteps.addStep")}</button>)}
        <span className={styles.grow} />
        <span>{t("projectSteps.listFooter", { shown: visible.length, total: p.steps.length, sort: sortLabel })}</span>
        {!all && rows.length > 7 && <button type="button" className={styles.cell} onClick={() => setAll(true)}>{t("projectSteps.showAll")} {rows.length}</button>}
        {sort.column !== "attention" && <button type="button" className={styles.cell} onClick={() => setSort(DEFAULT_SORT)}>{t("projectSteps.listAttention")}</button>}
      </div>
    </div>
    {open && <StepPanel p={p} stepId={open} jira={jira} onClose={() => setOpen(null)} />}
  </div>;
}
