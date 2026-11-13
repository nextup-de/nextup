"use client";
// "Getting ready": the setup of a draft as status lines (design: Paper "Project draft · setup"): the five checks and the
// start. The page shows one step at a time (Kevin, 13 Nov 2026); a line shows its step. The first open check is the next
// one. Lead, goal and baseline are needed to start, template and team are optional (features/projects/draft).
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { DraftView } from "@/features/projects/draft";
import type { ReducedProject } from "@/features/projects/types";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import styles from "./Draft.module.css";

/** The setup's steps in order: the five checks, then the start. */
export const STEPS = ["lead", "template", "team", "goal", "baseline", "start"] as const;
export type SetupStep = (typeof STEPS)[number];
type Key = Exclude<SetupStep, "start">;
const NEEDED: ReadonlySet<Key> = new Set(["lead", "goal", "baseline"]);
const TEMPLATE_NAME: Record<string, MessageKey> = { "quick-win": "projectDraft.tpl_quickWin", "8d": "projectDraft.tpl_eightD", investment: "projectDraft.tpl_investment" };

/** `at`: the step shown under the lines; `onPick` shows another. The first open check is the next one, in blue. */
export function DraftProgress({ p, view, at, onPick }: { p: ReducedProject; view: DraftView; at: SetupStep; onPick: (k: SetupStep) => void }) {
  const { f } = useDemo();
  const t = useT();
  const checks = STEPS.filter((k): k is Key => k !== "start");
  const done = checks.filter((k) => view.checklist[k] === "done").length;
  const next: SetupStep = checks.find((k) => view.checklist[k] !== "done") ?? "start";
  const sub = (k: SetupStep): string => {
    if (k === "start") return view.startDay !== null ? f(view.startDay) : "";
    if (view.checklist[k] === "done") {
      if (k === "lead") return p.lead;
      if (k === "template" && p.template) return t(TEMPLATE_NAME[p.template.key] ?? "projectDraft.checkDone");
      return t("projectDraft.checkDone");
    }
    if (k === "lead") return t("projectDraft.progressWaitsFor", { name: p.lead });
    return t(NEEDED.has(k) ? "projectDraft.progressNeeded" : "projectDraft.progressOptional");
  };

  return (
    <section className={`${styles.section} ${styles.progress}`} aria-labelledby={"check-" + p.id} data-testid="draft-progress">
      <div className={styles.head}>
        <h2 id={"check-" + p.id} className={styles.h2}>{t("projectDraft.progressTitle")}</h2>
        <span className={styles.muted}>{t("projectDraft.progressCount", { done, total: checks.length })}</span>
      </div>
      <ol className={styles.steps}>
        {STEPS.map((k) => {
          const state = k !== "start" && view.checklist[k] === "done" ? "done" : k === next ? "next" : "open";
          return (
            <li key={k} className={styles.step} data-state={state}>
              <button type="button" className={styles.stepBody} aria-current={k === at ? "step" : undefined} onClick={() => onPick(k)}>
                <span className={styles.track} aria-hidden="true"><span className={styles.mark} /><span className={styles.rule} /></span>
                <span className={styles.stepLabel}>{t(`projectDraft.progress_${k}` as MessageKey)}</span>
                <span className={styles.stepSub}>{sub(k)}</span>
                {k !== "start" && <span className={styles.srOnly}>{state === "done" ? t("projectDraft.checkDone") : t("projectDraft.checkOpen")}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
