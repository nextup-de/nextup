"use client";
import { useMemo, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { dateOfWorkday, isWorkday, workdayOf } from "@/features/clock/calendar";
import { toStepAdded, validStep, type CreateStepInput } from "@/features/projects/create-step";
import { newId } from "@/features/cases/events";
import type { ReducedProject, StepColumn } from "@/features/projects/types";
import { columnLabel } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { PersonFace } from "@/components/ui/elements";
import { teamOf, useRights, useSend, withIds } from "../parts";
import styles from "./CreateStepDialog.module.css";

type Props = {
  p: ReducedProject; open: boolean; onClose: () => void;
  preset?: { column?: StepColumn; dueDay?: number | null; title?: string; note?: string };
};

export function CreateStepDialog(props: Props) {
  return props.open ? <CreateStepForm key={props.p.id} {...props} /> : null;
}

function CreateStepForm({ p, onClose, preset }: Props) {
  const { act, S, seed, actorUserId, persona } = useDemo();
  const t = useT();
  const locale = useLocale();
  const rights = useRights(p);
  const send = useSend(p);
  const team = useMemo(() => {
    const members = withIds(teamOf(p, seed.seats));
    if (actorUserId && !members.some((person) => person.userId === actorUserId)) {
      members.push({ userId: actorUserId, name: persona.who.name });
    }
    return members;
  }, [p, seed.seats, actorUserId, persona.who.name]);
  const [title, setTitle] = useState(preset?.title ?? "");
  const [column, setColumn] = useState<StepColumn>(preset?.column ?? "todo");
  const [ownerUserId, setOwnerUserId] = useState(actorUserId ?? "");
  const [today] = useState(() => new Date());
  const calendar = seed.clock.mode === "workdays" ? seed.clock.calendar : null;
  const dateForDay = (day: number) => {
    if (calendar) return day >= 1 ? dateOfWorkday(day, calendar) : "";
    const date = new Date(today);
    date.setDate(date.getDate() + day - S.day);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const dayForDate = (date: string): number | null => {
    if (!date) return null;
    if (calendar) {
      const day = workdayOf(new Date(`${date}T12:00:00Z`), calendar);
      return isWorkday(date, calendar) && dateOfWorkday(day, calendar) === date ? day : null;
    }
    const todayIso = dateForDay(S.day);
    const selected = new Date(`${date}T12:00:00Z`).getTime();
    const start = new Date(`${todayIso}T12:00:00Z`).getTime();
    return S.day + Math.round((selected - start) / 86_400_000);
  };
  const [dueDate, setDueDate] = useState(preset?.dueDay != null ? dateForDay(preset.dueDay) : "");
  const [note, setNote] = useState(preset?.note ?? "");
  const [addAnother, setAddAnother] = useState(false);
  const [invalidDate, setInvalidDate] = useState(false);
  const [dateTouched, setDateTouched] = useState(false);
  const dueDay = dueDate ? dayForDate(dueDate) : (dateTouched ? null : (preset?.dueDay ?? null));
  const owner = team.find((person) => person.userId === ownerUserId);
  const input: CreateStepInput = { title, column, owner: owner?.name ?? null, ownerUserId: owner?.userId ?? null, dueDay, note };
  const canSubmit = validStep(input) && rights.addStep && !invalidDate;

  const submit = () => {
    if (!canSubmit) return;
    const payload = toStepAdded(input, preset, newId);
    if (!send("project.step.added", payload, () => act.project.addStep(
      p.id,
      payload.text,
      payload.owner,
      payload.dueDay,
      payload.to,
      payload.note,
      payload.ownerUserId,
    ))) return;
    if (!addAnother) { onClose(); return; }
    setTitle("");
    setNote("");
    setDueDate("");
    setDateTouched(true);
    setInvalidDate(false);
    document.getElementById("create-step-title")?.focus();
  };

  return <div className={styles.overlay}>
    <button type="button" className={styles.scrim} onClick={onClose} aria-label={t("projectSteps.close")} tabIndex={-1} />
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="create-step-heading" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <header className={styles.header}>
          <h2 id="create-step-heading">{t("projectSteps.newStepDialog")}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t("projectSteps.close")}>×</button>
        </header>
        <div className={styles.body}>
          <input id="create-step-title" className={`nh-input ${styles.title}`} autoFocus maxLength={500} value={title} onChange={(event) => setTitle(event.target.value)} aria-label={t("projectSteps.stepTitle")} />
          <div className={styles.fields}>
            <label className={styles.field}>
              <span>{t("projectSteps.column")}</span>
              <select className="nh-input nh-select" value={column} onChange={(event) => setColumn(event.target.value as StepColumn)}>
                {(["todo", "doing", "blocked", "done"] as StepColumn[]).map((item) => <option key={item} value={item}>{columnLabel(item, locale)}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>{t("projectSteps.owner")}</span>
              <span className={styles.ownerControl}>
                {owner && <PersonFace name={owner.name} size="sm" />}
                <select className="nh-input nh-select" value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)} aria-label={t("projectSteps.owner")}>
                  <option value="">{t("projectSteps.noOwner")}</option>
                  {team.map((person) => <option key={person.userId} value={person.userId}>{person.userId === actorUserId ? `${person.name} · ${t("projectSteps.you")}` : person.name}</option>)}
                </select>
              </span>
            </label>
            <label className={styles.field}>
              <span>{t("projectSteps.due")}</span>
              <span className={styles.dateControl} data-empty={!dueDate}>
                <input type="date" min={dateForDay(S.day)} value={dueDate} onChange={(event) => {
                  const value = event.target.value;
                  setDueDate(value);
                  setDateTouched(true);
                  setInvalidDate(Boolean(value) && dayForDate(value) === null);
                }} aria-label={t("projectSteps.due")} />
                {!dueDate && <span>{t("projectSteps.addDate")}</span>}
              </span>
              {invalidDate && <span className={styles.error}>{t("projectSteps.chooseWorkday")}</span>}
            </label>
          </div>
          <label className={styles.details}>
            <span>{t("projectSteps.stepDetails")}</span>
            <textarea className="nh-input" maxLength={2000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>
        <footer className={styles.footer}>
          <label className={styles.addAnother}><input type="checkbox" checked={addAnother} onChange={(event) => setAddAnother(event.target.checked)} />{t("projectSteps.addAnother")}</label>
          <span className={styles.spacer} />
          <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={onClose}>{t("projectSteps.cancel")}</button>
          <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!canSubmit}>{t("projectSteps.addStep")}</button>
        </footer>
      </form>
    </section>
  </div>;
}
