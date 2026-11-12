"use client";
// A project draft as a page (plan SET, D9 to D17): what a yes opened, before it starts. The top line, the lead question,
// the template, the invitations, goal and baseline, the first-step hints and the start. Every control is one
// act.project.* event, shown only when the server's rules would let it through (features/projects/draft).
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageHeader } from "@/components/ui/elements";
import { draftView } from "@/features/projects/draft";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { BaselinePanel } from "../ProjectMeasure";
import { HowWeWork } from "../move/HowWeWork";
import { actorOf, useRights, useSend } from "../parts";
import { DraftGoal } from "./DraftGoal";
import { InvitePanel } from "./DraftInvites";
import { DraftLate } from "./DraftLate";
import { DraftLead } from "./DraftLead";
import { DraftTemplate } from "./DraftTemplate";
import { useProjectHints } from "./useProjectHints";
import styles from "./Draft.module.css";

const CHECKS = [
  ["lead", "projectDraft.checkLead"],
  ["template", "projectDraft.checkTemplate"],
  ["team", "projectDraft.checkTeam"],
  ["goal", "projectDraft.checkGoal"],
  ["baseline", "projectDraft.checkBaseline"],
] as const;

export function DraftView({ p }: { p: ReducedProject }) {
  const ctx = useDemo();
  const { act, S, f, href } = ctx;
  const t = useT();
  const r = useRights(p);
  const send = useSend(p);
  const view = draftView(p, actorOf(ctx), S);
  const { stepHints, baseHint } = useProjectHints(p);

  return (
    <div className={styles.page} data-testid="project-draft">
      <Link href={href("/projects")} className={styles.back}>{t("projects.backToAll")}</Link>
      <p className={styles.top} data-testid="draft-top-line">
        {view.startDay === null ? t("projectDraft.topLineNoStart", { name: p.lead }) : t("projectDraft.topLine", { date: f(view.startDay) })}
      </p>
      <PageHeader title={p.title} />

      <DraftLead p={p} view={view} />
      {view.late && view.may.moveStart && view.startDay !== null && <DraftLate p={p} startDay={view.startDay} />}

      <section className={styles.section} aria-labelledby={"check-" + p.id}>
        <h2 id={"check-" + p.id} className={styles.h2}>{t("projectDraft.checklistTitle")}</h2>
        <ul className={styles.checks}>
          {CHECKS.map(([k, label]) => (
            <li key={k} className={styles.check} data-state={view.checklist[k]}>
              <span aria-hidden="true" className={styles.dot} />
              <span className={styles.grow}>{t(label)}</span>
              <span className={styles.muted}>{view.checklist[k] === "done" ? t("projectDraft.checkDone") : t("projectDraft.checkOpen")}</span>
            </li>
          ))}
        </ul>
      </section>

      <DraftTemplate p={p} view={view} />
      <InvitePanel p={p} />
      <DraftGoal p={p} view={view} />
      <HowWeWork p={p} className={styles.section} />

      {p.steps.length > 0 || stepHints.length > 0 ? (
        <section className={styles.section} aria-labelledby={"steps-" + p.id}>
          <h2 id={"steps-" + p.id} className={styles.h2}>{t("projectDraft.stepsOnBoard")}</h2>
          {p.steps.length > 0 && <ol className={styles.tplSteps}>{p.steps.map((s) => <li key={s.id}>{s.text}</li>)}</ol>}
          {stepHints.length > 0 && r.addStep && (
            <>
              <h3 className={styles.h3}>{t("projectDraft.hintsTitle")}</h3>
              <ul className={styles.list}>
                {stepHints.map((h) => (
                  <li key={h.text} className={styles.row}>
                    <span className={styles.grow}>{h.text}</span>
                    <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => send("project.step.added", { stepId: "probe", text: h.text }, () => act.project.addStep(p.id, h.text))}>{t("projectDraft.hintsAdd")}</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : null}

      <BaselinePanel p={p} hint={baseHint} />

      <section className={styles.section} aria-labelledby={"start-" + p.id}>
        <h2 id={"start-" + p.id} className={styles.h2}>{t("projectDraft.startTitle")}</h2>
        {r.lead && (
          <span className={styles.actionRow}>
            <button type="button" className="nh-btn nh-btn-primary" disabled={!view.canStart || !view.may.start} onClick={() => send("project.started", {}, () => act.project.start(p.id))}>{t("projectDraft.startAction")}</button>
          </span>
        )}
        {!view.canStart && <p className={styles.hint}>{t("projectDraft.startWait")}</p>}
      </section>
    </div>
  );
}
