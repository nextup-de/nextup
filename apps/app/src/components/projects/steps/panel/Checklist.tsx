"use client";

import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { newId } from "@/features/cases/events";
import { checkEvent, type CheckPress } from "@/features/projects/step-panel";
import type { ReducedProject, Step } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useRights, useSend } from "../../parts";
import styles from "./Panel.module.css";

export function Checklist({ p, step }: { p: ReducedProject; step: Step }) {
  const { act } = useDemo();
  const send = useSend(p);
  const rights = useRights(p);
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const canEdit = rights.check("project.step.checklist", { stepId: step.id, op: "remove", itemId: "probe" }).ok;
  const canAdd = canEdit && step.checklist.length < 30;
  const press = (input: CheckPress) => {
    const event = checkEvent(step, input);
    return event && send(event.type, event.payload, () => act.project.stepCheck(p.id, step.id, input.op, input.itemId, event.payload.text, event.payload.done));
  };
  const done = step.checklist.filter((x) => x.done).length;
  if (!step.checklist.length && !canAdd) return null;
  return <section className={styles.section} aria-label={t("projectSteps.checklist")}>
    <div className={styles.sectionHead}>
      <h3>{step.checklist.length ? t("projectSteps.checklistProgress", { done, total: step.checklist.length }) : t("projectSteps.checklist")}</h3>
      {canAdd && !adding && <button type="button" className={styles.link} onClick={() => setAdding(true)} aria-label={t("projectSteps.checklistAdd")}>+ {t("projectSteps.add")}</button>}
    </div>
    {step.checklist.length > 0 && <progress className={styles.progress} value={done} max={step.checklist.length} aria-label={t("projectSteps.checklistProgress", { done, total: step.checklist.length })} />}
    {step.checklist.map((item) => <div key={item.id} className={styles.check} data-done={item.done}>
      {editing === item.id ? <form onSubmit={(e) => { e.preventDefault(); if (press({ op: "edit", itemId: item.id, text: editText })) setEditing(null); }}>
        <input className="nh-input" autoFocus value={editText} maxLength={200} aria-label={t("projectSteps.checklistEdit")} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(null); } }} />
      </form> : <label><input type="checkbox" checked={item.done} disabled={!canEdit} onChange={(e) => press({ op: "toggle", itemId: item.id, done: e.target.checked })} /><span>{item.text}</span></label>}
      {canEdit && <>
        <button type="button" className={styles.link} onClick={() => { setEditing(item.id); setEditText(item.text); }} aria-label={t("projectSteps.checklistEdit")}>{t("projectSteps.edit")}</button>
        <button type="button" className={styles.icon} aria-label={t("projectSteps.checklistRemove")} onClick={() => press({ op: "remove", itemId: item.id })}>×</button>
      </>}
    </div>)}
    {adding && <form className={styles.section} onSubmit={(e) => {
      e.preventDefault();
      if (press({ op: "add", itemId: newId("check"), text })) setText("");
    }}>
      <input className="nh-input" autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={200} aria-label={t("projectSteps.checklistText")} onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setAdding(false); setText(""); }
      }} />
      <span className={styles.hint}>{t("projectSteps.enterAdd")}</span>
      <div className={styles.row}>
        <button type="submit" className="nh-btn nh-btn-sm" disabled={!text.trim() || !canAdd}>{t("projectSteps.add")}</button>
        <button type="button" className={styles.link} onClick={() => { setAdding(false); setText(""); }}>{t("projectSteps.cancel")}</button>
      </div>
    </form>}
  </section>;
}
