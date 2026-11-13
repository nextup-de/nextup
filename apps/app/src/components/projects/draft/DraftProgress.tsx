"use client";
// "Getting ready": the five setup checks of a draft as one row of steps (design: Paper "Project draft · setup"). The first open
// check is the next one; an open check links to its part of the page. Lead, goal and baseline are needed to start, template
// and team are optional (features/projects/draft).
import type { DraftView } from "@/features/projects/draft";
import type { ReducedProject } from "@/features/projects/types";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import styles from "./Draft.module.css";

const KEYS = ["lead", "template", "team", "goal", "baseline"] as const;
type Key = (typeof KEYS)[number];
const NEEDED: ReadonlySet<Key> = new Set(["lead", "goal", "baseline"]);
const TEMPLATE_NAME: Record<string, MessageKey> = { "quick-win": "projectDraft.tpl_quickWin", "8d": "projectDraft.tpl_eightD", investment: "projectDraft.tpl_investment" };

/** The anchor of each check's part of the page (the ids its heading carries). */
export const anchorOf = (k: Key, id: string) => ({ lead: "lead-", template: "template-", team: "invites-", goal: "goal-", baseline: "baseline-" })[k] + id;

export function DraftProgress({ p, view }: { p: ReducedProject; view: DraftView }) {
  const t = useT();
  const done = KEYS.filter((k) => view.checklist[k] === "done").length;
  const next = KEYS.find((k) => view.checklist[k] !== "done") ?? null;
  const sub = (k: Key): string => {
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
        <span className={styles.muted}>{t("projectDraft.progressCount", { done, total: KEYS.length })}</span>
      </div>
      <ol className={styles.steps}>
        {KEYS.map((k) => {
          const state = view.checklist[k] === "done" ? "done" : k === next ? "next" : "open";
          const body = (
            <>
              <span className={styles.track} aria-hidden="true"><span className={styles.mark} /><span className={styles.rule} /></span>
              <span className={styles.stepLabel}>{t(`projectDraft.progress_${k}` as MessageKey)}</span>
              <span className={styles.stepSub}>{sub(k)}</span>
              <span className={styles.srOnly}>{state === "done" ? t("projectDraft.checkDone") : t("projectDraft.checkOpen")}</span>
            </>
          );
          return (
            <li key={k} className={styles.step} data-state={state} aria-current={state === "next" ? "step" : undefined}>
              {state === "done" ? <span className={styles.stepBody}>{body}</span> : <a className={styles.stepBody} href={"#" + anchorOf(k, p.id)}>{body}</a>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
