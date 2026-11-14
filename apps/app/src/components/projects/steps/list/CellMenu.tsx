"use client";
import { useEffect, useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { berlinDate, dateOfWorkday, workdayOf } from "@/features/clock/calendar";
import { cellEdit } from "@/features/projects/list-view";
import { statusOptions } from "@/features/projects/step-panel";
import type { ReducedProject, Step } from "@/features/projects/types";
import { columnLabel, type JiraRow } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { useSend, type Person } from "../../parts";
import { MarkBlockedForm } from "../MarkBlockedForm";
import styles from "./List.module.css";

export function CellMenu({ p, step, column, jira, team, onClose }: {
  p: ReducedProject; step: Step; column: "status" | "owner" | "due"; jira: JiraRow; team: Person[]; onClose: () => void;
}) {
  const { act, S, seed } = useDemo();
  const send = useSend(p);
  const t = useT();
  const locale = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [date, setDate] = useState("");
  const [badDate, setBadDate] = useState(false);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input, button:not(:disabled), textarea")?.focus();
    const outside = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [onClose]);
  const edit = (event: ReturnType<typeof cellEdit>) => {
    const { stepId: _stepId, ...change } = event.payload;
    if (send(event.type, event.payload, () => act.project.editStep(p.id, step.id, change))) onClose();
  };
  const setDue = (day: number | null) => edit(cellEdit(step, "due", day));
  const chooseDate = () => {
    if (!date) return;
    const clock = seed.clock;
    let day: number;
    if (clock.mode === "workdays") {
      day = workdayOf(new Date(`${date}T12:00:00Z`), clock.calendar);
      if (day < 1 || dateOfWorkday(day, clock.calendar) !== date) { setBadDate(true); return; }
    } else {
      // Demo dates use the same offset from today's date as dayFormatter.
      day = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${berlinDate(new Date())}T12:00:00Z`)) / 86400000);
      if (day < 0) { setBadDate(true); return; }
    }
    setDue(day);
  };
  return <div ref={ref} className={styles.menu} role="dialog" aria-label={t(column === "status" ? "projectSteps.changeStatus" : column === "owner" ? "projectSteps.changeOwner" : "projectSteps.changeDue")} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); onClose(); } }}>
    {column === "status" && (blocked ? <MarkBlockedForm p={p} step={step} onCancel={onClose} onDone={onClose} /> : <>
      <div role="menu" aria-label={t("projectSteps.status")}>
        {statusOptions(p, step, jira).map((option) => <button type="button" role="menuitemradio" aria-checked={option.current} key={option.column} disabled={option.current} onClick={() => {
          if (option.requiresReason) { setBlocked(true); return; }
          const event = cellEdit(step, "status", option.column);
          if (send(event.type, event.payload, () => act.project.moveStep(p.id, step.id, option.column))) onClose();
        }}>{columnLabel(option.column, locale)}{option.requiresReason ? "…" : ""}</button>)}
      </div>
      {jira.state === "synced" && <small>{t("projectSteps.jiraFollows")}</small>}
    </>)}
    {column === "owner" && <>
      <input className="nh-input" type="search" aria-label={t("projectSteps.listSearchPeople")} placeholder={t("projectSteps.listSearchPeople")} value={query} onChange={(e) => setQuery(e.target.value)} />
      {team.filter((person) => person.name.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale))).map((person) => <button type="button" key={person.userId} aria-pressed={step.ownerUserId === person.userId} onClick={() => edit(cellEdit(step, "owner", person))}>{person.name}</button>)}
      <button type="button" onClick={() => edit(cellEdit(step, "owner", null))}>{t("projectSteps.noOwner")}</button>
    </>}
    {column === "due" && <>
      {([0, 3, 5, 10] as const).map((days) => <button type="button" key={days} onClick={() => setDue(S.day + days)}>{t(days === 0 ? "common.today" : days === 3 ? "projectSteps.listThreeDays" : days === 5 ? "projectSteps.listWeek" : "projectSteps.listTwoWeeks")}</button>)}
      <form onSubmit={(e) => { e.preventDefault(); chooseDate(); }}>
        <label>{t("projectSteps.listDate")}<input className="nh-input" type="date" required value={date} onChange={(e) => { setDate(e.target.value); setBadDate(false); }} /></label>
        {badDate && <p role="alert">{t("projectSteps.listBadDate")}</p>}
        <button type="submit">{t("projectSteps.save")}</button>
      </form>
      <button type="button" onClick={() => setDue(null)}>{t("projectSteps.clearDue")}</button>
    </>}
  </div>;
}
