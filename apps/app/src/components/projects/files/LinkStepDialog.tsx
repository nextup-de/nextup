"use client";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { FileRow } from "@/features/files/items";
import { linkedSteps } from "@/features/files/view";
import { stepKey } from "@/features/projects/list-view";
import type { ReducedProject, Step } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useSend } from "../parts";
import type { FilesPartProps } from "./types";
import styles from "./Panel.module.css";

/** The open steps of the project a file can be linked to, the ones whose words appear in the file's name first. */
export function stepChoices(p: Pick<ReducedProject, "steps" | "links">, row: Pick<FileRow, "name" | "webUrl">): { suggested: Step[]; others: Step[] } {
  const linked = new Set(linkedSteps(row, p).map((s) => s.stepId));
  const words = row.name.replace(/\.[^.]+$/, "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4);
  const open = p.steps.filter((s) => !s.dropped && s.column !== "done" && !linked.has(s.id));
  const hit = (s: Step) => words.some((w) => s.text.toLowerCase().includes(w));
  return { suggested: open.filter(hit), others: open.filter((s) => !hit(s)) };
}

/** The one event that links a file to a step (D7): the file's address, system sharepoint, the step. */
export const linkEvent = (row: Pick<FileRow, "webUrl">, step: Step) => ({ url: row.webUrl, system: "sharepoint", key: stepKey(step), stepId: step.id });

/** Link the file to the step: asks the rights, then appends project.linked through the project's link act. True when it went through. */
export function appendLink(
  send: (type: string, payload: ReturnType<typeof linkEvent>, go: () => void) => boolean,
  link: (projectId: string, url: string, system: string, key: string, stepId: string) => void,
  projectId: string, row: Pick<FileRow, "webUrl">, step: Step,
): boolean {
  const ev = linkEvent(row, step);
  return send("project.linked", ev, () => link(projectId, ev.url, ev.system, ev.key, ev.stepId));
}

/** The dialog of 3.2: pick a step and link the file to it. The link lives in NextUp only; SharePoint is not changed. */
export function LinkStepDialog({ state, actions }: FilesPartProps) {
  const t = useT();
  const { act } = useDemo();
  const { p, dialog, editor } = state;
  const send = useSend(p);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  if (dialog?.kind !== "link-step" || !editor) return null;
  const row = dialog.row;
  const { suggested, others } = stepChoices(p, row);
  const match = (s: Step) => s.text.toLowerCase().includes(query.trim().toLowerCase()) || stepKey(s).toLowerCase().includes(query.trim().toLowerCase());
  const chosen = p.steps.find((s) => s.id === picked) ?? null;
  const group = (title: string, steps: Step[]) => steps.length === 0 ? null : <div className={styles.options} role="radiogroup" aria-label={title}>
    <span className={styles.groupHead}>{title}</span>
    {steps.map((s) => <button key={s.id} type="button" role="radio" aria-checked={picked === s.id} className={styles.option} onClick={() => setPicked(s.id)}>
      <span>{s.text}</span><span className={styles.optionKey}>{stepKey(s)}</span>
    </button>)}
  </div>;
  const link = () => {
    if (!chosen) return;
    if (appendLink(send, act.project.link, p.id, row, chosen)) { setPicked(null); setQuery(""); actions.closeDialog(); }
  };

  return <div className={styles.dialog} role="presentation" onClick={(e) => { if (e.target === e.currentTarget) actions.closeDialog(); }} onKeyDown={(e) => { if (e.key === "Escape") actions.closeDialog(); }}>
    <section className={styles.sheet} role="dialog" aria-modal="true" aria-label={t("projectFiles.linkStepTitle")}>
      <div className={styles.sheetHead}>
        <h2 className={styles.sheetTitle}>{t("projectFiles.linkStepTitle")}</h2>
        <button type="button" className={styles.link} aria-label={t("projectFiles.close")} onClick={actions.closeDialog}>×</button>
      </div>
      <input className="nh-input" autoFocus aria-label={t("projectFiles.linkSearchSteps")} placeholder={t("projectFiles.linkSearchSteps")} value={query} onChange={(e) => setQuery(e.target.value)} />
      {group(t("projectFiles.linkSuggested", { name: row.name }), suggested.filter(match))}
      {group(t("projectFiles.linkOther"), others.filter(match))}
      <div className={styles.actions}>
        <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={actions.closeDialog}>{t("projectFiles.cancel")}</button>
        <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!chosen} onClick={link}>{chosen ? t("projectFiles.linkTo", { key: stepKey(chosen) }) : t("projectFiles.linkStepSave")}</button>
      </div>
    </section>
  </div>;
}
