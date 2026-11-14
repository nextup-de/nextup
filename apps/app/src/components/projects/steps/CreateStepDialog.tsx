"use client";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { ReducedProject, StepColumn } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useRights, useSend } from "../parts";
import styles from "../Projects.module.css";

type Props = {
  p: ReducedProject; open: boolean; onClose: () => void;
  preset?: { column?: StepColumn; dueDay?: number | null; title?: string; note?: string };
};

export function CreateStepDialog(props: Props) {
  return props.open ? <CreateStepForm key={props.p.id} {...props} /> : null;
}

function CreateStepForm({ p, onClose, preset }: Props) {
  const { act } = useDemo();
  const t = useT();
  const rights = useRights(p);
  const send = useSend(p);
  const [title, setTitle] = useState(preset?.title ?? "");
  const submit = () => {
    const text = title.trim();
    if (!text || !rights.addStep) return;
    const to = preset?.column ?? "todo";
    const dueDay = preset?.dueDay ?? undefined;
    const note = preset?.note;
    if (send("project.step.added", { stepId: "probe", text, to, dueDay, note }, () => act.project.addStep(p.id, text, undefined, dueDay, to, note))) onClose();
  };
  return <div className={styles.sheetWrap}>
    <button type="button" className={styles.scrim} onClick={onClose} aria-label={t("common.close")} tabIndex={-1} />
    <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={t("projects.newStep")} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <form className={styles.sheetBody} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <textarea className="nh-input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label={t("projects.newStep")} maxLength={500} rows={2} autoFocus />
        <div className={styles.actionRow}>
          <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!title.trim() || !rights.addStep}>{t("projects.addStepBtn")}</button>
          <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={onClose}>{t("common.cancel")}</button>
        </div>
      </form>
    </div>
  </div>;
}
