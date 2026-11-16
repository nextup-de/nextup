"use client";
// The Backlog (Paper "Jira pages · new header", frame "NextUp · Work · Backlog (Jira Backlog)"): the open steps, most urgent
// first, a "Later" lane (steps parked off the board, not possible yet) and the steps the idea suggests.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { backlogOf } from "@/features/projects/backlog-view";
import { stepKey } from "@/features/projects/list-view";
import { columnLabel } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { useRights, useSend } from "../parts";
import { StepPanel } from "../steps/StepPanel";
import type { ToolProps } from "./types";
import styles from "./Backlog.module.css";

const SHOWN = 5;

export function BacklogTool({ p, jira, hints }: ToolProps) {
  const { S, actorUserId, act } = useDemo();
  const t = useT();
  const locale = useLocale();
  const rights = useRights(p);
  const send = useSend(p);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const view = backlogOf(p, { day: S.day, me: actorUserId });
  const rows = all ? view.open : view.open.slice(0, SHOWN);
  const total = view.done + view.doing + view.todo;

  return <div className={styles.backlog}>
    <div className={styles.main}>
      <section className={styles.card} aria-label={t("projectPages.backlogOnBoard")}>
        <header className={styles.head}>
          <h2>{t("projectPages.backlogOnBoard")}</h2>
          <span className={styles.count}>{view.open.length}</span>
          <span className={styles.spacer} />
          {total > 0 && <span className={styles.bar} aria-hidden="true">
            <span data-part="done" style={{ flexGrow: view.done }} /><span data-part="doing" style={{ flexGrow: view.doing }} /><span data-part="todo" style={{ flexGrow: view.todo }} />
          </span>}
          <span className={styles.meta}>{t("projectPages.backlogCounts", { done: view.done, doing: view.doing, todo: view.todo })}</span>
        </header>
        {view.open.length === 0 ? <p className={styles.empty}>{t("projectPages.backlogEmpty")}</p> : <ul className={styles.rows}>
          {rows.map((step) => {
            const late = step.dueDay !== null && step.dueDay < S.day;
            return <li key={step.id} className={styles.row}>
              <span className={styles.key}>{stepKey(step)}</span>
              <button type="button" className={styles.step} onClick={() => setOpen(step.id)}>{step.text}</button>
              <span className={styles.chip} data-tone={late ? "late" : step.column}>{late ? t("projects.lateShort") : columnLabel(step.column, locale)}</span>
              <span className={styles.owner}>{step.ownerUserId && step.ownerUserId === actorUserId ? t("projectSteps.you") : step.owner ?? t("projectSteps.noOwner")}</span>
            </li>;
          })}
        </ul>}
        {!all && view.open.length > SHOWN && <button type="button" className={styles.more} onClick={() => setAll(true)}>{t("projectPages.backlogShowMore", { count: view.open.length - SHOWN })}</button>}
      </section>
      <section className={styles.card} aria-label={t("projectPages.backlogLater")}>
        <header className={styles.head}>
          <h2>{t("projectPages.backlogLater")}</h2>
          <span className={styles.count}>0</span>
          <span className={styles.spacer} />
          <span className={styles.meta}>{t("projectPages.backlogLaterHint")}</span>
        </header>
        <div className={styles.later}><strong>{t("projectPages.backlogLaterEmpty")}</strong></div>
      </section>
    </div>
    <aside className={styles.side} aria-label={t("projects.suggestedSteps")}>
      <h2 className={styles.sideTitle}><span aria-hidden="true">✦</span>{t("projects.suggestedSteps")}</h2>
      <p className={styles.meta}>{t("projectPages.backlogSuggestHint")}</p>
      {hints.length === 0 ? <p className={styles.meta}>{t("projectPages.backlogNoSuggestions")}</p> : hints.map((hint) => <div key={hint.text} className={styles.hint}>
        <span className={styles.hintLabel}>{hint.label}</span>
        <span className={styles.hintText}>{hint.text}</span>
        {rights.addStep && <button type="button" className={styles.add} aria-label={t("projects.addStepNamed", { text: hint.text })} onClick={() => send("project.step.added", { stepId: "probe", text: hint.text }, () => act.project.addStep(p.id, hint.text))}>{t("projectSteps.add")}</button>}
      </div>)}
    </aside>
    {open && <StepPanel p={p} stepId={open} jira={jira} onClose={() => setOpen(null)} />}
  </div>;
}
