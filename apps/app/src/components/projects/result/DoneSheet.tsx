"use client";
// Mark the project done (plan RES, D13): the lead finishes or drops every step still open, each drop with a reason, sees what "done" was meant to
// mean (the goal's done-when) and may say what is done. One event, project.done with the list. A board with nothing open shows the plain form;
// otherwise a quiet link opens the sheet. Shown only when the rights would let it through (features/projects/result-view.ts).
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { ResultView } from "@/features/projects/result-view";
import { DROP_WHY_MAX } from "@/features/projects/result";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useSend } from "../parts";
import styles from "./Result.module.css";

type End = "done" | "dropped";

export function DoneSheet({ p, done }: { p: ReducedProject; done: NonNullable<ResultView["done"]> }) {
  const { act } = useDemo();
  const t = useT();
  const send = useSend(p);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [ends, setEnds] = useState<Record<string, End | undefined>>({});
  const [whys, setWhys] = useState<Record<string, string>>({});
  if (!done.can) return null;

  const hasOpen = done.open.length > 0;
  if (hasOpen && !open) return <button type="button" className={styles.quiet} onClick={() => setOpen(true)}>{t("projects.markDoneEllipsis")}</button>;

  const why = (id: string) => (whys[id] ?? "").trim();
  const complete = done.open.every((s) => ends[s.stepId] === "done" || (ends[s.stepId] === "dropped" && why(s.stepId).length >= 1 && why(s.stepId).length <= DROP_WHY_MAX));
  const close = () => { setOpen(false); setEnds({}); setWhys({}); };
  const submit = () => {
    if (!complete) return;
    const openSteps = done.open.map((s) => (ends[s.stepId] === "dropped" ? { stepId: s.stepId, end: "dropped" as const, why: why(s.stepId) } : { stepId: s.stepId, end: "done" as const }));
    const payload = { note: note.trim(), ...(hasOpen ? { openSteps } : {}) };
    if (send("project.done", payload, () => act.project.done(p.id, note.trim() || undefined, hasOpen ? openSteps : undefined))) { setNote(""); close(); }
  };

  return (
    <form className={styles.sheet} aria-label={t("projectResult.doneSheetLabel")} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <p className={styles.doneWhen} data-testid="done-when">
        <span className={styles.label}>{t("projectResult.doneWhenLabel")}</span>{" "}
        {done.doneWhen ?? <span className={styles.muted}>{t("projectResult.noDoneWhen")}</span>}
      </p>
      {hasOpen && (
        <>
          <p className={styles.hint}>{t("projectResult.doneOpenHint")}</p>
          <div className={styles.steps}>
            {done.open.map((s) => (
              <fieldset key={s.stepId} className={styles.step} data-testid={"done-step-" + s.stepId}>
                <legend className={styles.stepText}>{s.text}</legend>
                <span className={styles.choices}>
                  <label className={styles.choice}>
                    <input type="radio" name={"end-" + s.stepId} checked={ends[s.stepId] === "done"} onChange={() => setEnds((x) => ({ ...x, [s.stepId]: "done" }))} />
                    {t("projectResult.stepFinish")}
                  </label>
                  <label className={styles.choice}>
                    <input type="radio" name={"end-" + s.stepId} checked={ends[s.stepId] === "dropped"} onChange={() => setEnds((x) => ({ ...x, [s.stepId]: "dropped" }))} />
                    {t("projectResult.stepDrop")}
                  </label>
                </span>
                {ends[s.stepId] === "dropped" && (
                  <label className={styles.field}>
                    <span className={styles.label}>{t("projectResult.dropWhyLabel", { step: s.text })}</span>
                    <input
                      className={`nh-input ${styles.input}`} value={whys[s.stepId] ?? ""} maxLength={DROP_WHY_MAX}
                      onChange={(e) => setWhys((x) => ({ ...x, [s.stepId]: e.target.value }))} placeholder={t("projectResult.dropWhyPlaceholder")}
                    />
                  </label>
                )}
              </fieldset>
            ))}
          </div>
        </>
      )}
      <label className={styles.field}>
        <span className={styles.label}>{t("projects.doneNoteLabel")}</span>
        <input className={`nh-input ${styles.input}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("projects.doneNotePlaceholder")} aria-label={t("projects.doneNoteLabel")} autoFocus={hasOpen} />
      </label>
      {!complete && <p className={styles.hint}>{t("projectResult.doneNeedsChoice")}</p>}
      <span className={styles.row}>
        <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!complete}>{t("projects.move_done")}</button>
        {hasOpen && <button type="button" className={styles.quiet} onClick={close}>{t("common.cancel")}</button>}
      </span>
    </form>
  );
}
