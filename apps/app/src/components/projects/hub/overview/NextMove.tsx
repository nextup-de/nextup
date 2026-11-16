"use client";
// The viewer's one next move at the top of a project's Overview (DESIGN_RULES §9, docs/plans/2026-11-16_quiet-screens): one card
// with its filled button, or nothing. A number or a baseline that waits for this viewer comes first, then the project's own move
// (features/projects/selectors nextMove). Who may do it is asked of the rights (useRights, measureView, resultView): this card
// only chooses where the move is shown, never who may make it.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { ADDABLE_PAGES, pagesOf } from "@/features/projects/pages";
import { measureView } from "@/features/projects/measure-view";
import { resultView } from "@/features/projects/result-view";
import { nextMove } from "@/features/projects/selectors";
import type { ReducedProject } from "@/features/projects/types";
import { useLocale, useT } from "@/i18n/client";
import { BaselinePanel, MeasurePanel, RewardPanel } from "../../ProjectMeasure";
import { useProjectHints } from "../../draft/useProjectHints";
import { usePageActs } from "../../page/usePageActs";
import { DoneSheet } from "../../result/DoneSheet";
import { idViewerOf, useRights, useSend } from "../../parts";
import styles from "./Overview.module.css";

export type MoveKind = "measure" | "baseline" | "start" | "steps" | "done" | "reward";

/** Which move the card shows for this viewer, or null: the rest of the Overview leaves that panel out so it is not drawn twice. */
export function useNextMove(p: ReducedProject): MoveKind | null {
  const ctx = useDemo();
  const { S } = ctx;
  const locale = useLocale();
  const r = useRights(p);
  const view = measureView(p, S, idViewerOf(ctx), S.day, locale);
  const move = nextMove(p, S.day);
  if (view.measures.some((m) => m.canConfirm || m.canReenter)) return "measure";
  if (view.baseline.needsConfirm && view.baseline.canConfirm) return "baseline";
  switch (move) {
    case "baseline": return r.baseline ? "baseline" : null;
    case "start": return r.start ? "start" : null;
    case "steps": return p.steps.length === 0 && r.addStep ? "steps" : null;
    case "done": return resultView(p, S, idViewerOf(ctx), S.day, locale).done?.can ? "done" : null;
    case "measure": return p.checks.some((c) => !c.measured && S.day >= c.opensDay && r.measure(c.check)) ? "measure" : null;
    case "reward": return r.reward ? "reward" : null;
    default: return null;
  }
}

export function NextMove({ p, kind }: { p: ReducedProject; kind: MoveKind | null }) {
  const t = useT();
  if (!kind) return null;
  return (
    <section className={styles.card} data-move={kind} aria-label={t("projects.yourMove")}>
      {kind === "measure" ? <MeasurePanel p={p} />
        : kind === "baseline" ? <BaselineMove p={p} />
        : kind === "reward" ? <RewardPanel p={p} />
        : kind === "start" ? <StartMove p={p} />
        : kind === "steps" ? <FirstStepMove p={p} />
        : <DoneMove p={p} />}
    </section>
  );
}

function BaselineMove({ p }: { p: ReducedProject }) {
  const { baseHint } = useProjectHints(p);
  return <BaselinePanel p={p} hint={baseHint} />;
}

/** Start, once the baseline stands: the one filled button. Without steps yet, adding the first one is a quiet link beside it. */
function StartMove({ p }: { p: ReducedProject }) {
  const { act, href, flag } = useDemo();
  const t = useT();
  const send = useSend(p);
  const r = useRights(p);
  const steps = pagesOf(p, { agent: flag("agent") }).find((x) => x.tools.some((tool) => tool.kind === "board" || tool.kind === "list")) ?? null;
  return (
    <div className={styles.moveRow}>
      <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={() => send("project.started", {}, () => act.project.start(p.id))}>{t("projects.move_start")}</button>
      {p.steps.length === 0 && r.addStep && steps && <Link className={styles.link} href={href(`/projects/${p.id}?page=${steps.id}`)}>{t("projectHub.overviewAddFirstStep")}</Link>}
    </div>
  );
}

/** A running project without steps: add the first one, on the page that holds the board (or add that page). */
function FirstStepMove({ p }: { p: ReducedProject }) {
  const { href, flag } = useDemo();
  const t = useT();
  const router = useRouter();
  const pageActs = usePageActs(p);
  const [adding, setAdding] = useState(false);
  const steps = pagesOf(p, { agent: flag("agent") }).find((x) => x.tools.some((tool) => tool.kind === "board" || tool.kind === "list")) ?? null;
  const ready = ADDABLE_PAGES.find((x) => x.id === "steps") ?? null;
  const addStepsPage = async () => {
    if (!ready) return;
    setAdding(true);
    const result = await pageActs.create({ pageId: ready.id, title: ready.title, icon: ready.icon, tools: ready.tools.map(({ kind }) => ({ kind })) });
    setAdding(false);
    if (result.ok) router.push(href(`/projects/${p.id}?page=${ready.id}`));
  };
  return (
    <div className={styles.moveRow}>
      <h3 className={styles.cardTitle}>{t("projectHub.overviewStartTitle")}</h3>
      {steps
        ? <Link className="nh-btn nh-btn-primary nh-btn-sm" href={href(`/projects/${p.id}?page=${steps.id}`)}>{t("projectHub.overviewAddFirstStep")}</Link>
        : ready && <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" disabled={adding} onClick={() => void addStepsPage()}>{t("projectHub.overviewAddStepsPage")}</button>}
    </div>
  );
}

/** Every step is done while the project runs: the same sheet as Manage › Mark it done. */
function DoneMove({ p }: { p: ReducedProject }) {
  const ctx = useDemo();
  const t = useT();
  const locale = useLocale();
  const [marking, setMarking] = useState(false);
  const done = resultView(p, ctx.S, idViewerOf(ctx), ctx.S.day, locale).done;
  if (!done?.can) return null;
  return marking ? <DoneSheet p={p} done={done} onClose={() => setMarking(false)} />
    : <div className={styles.moveRow}><button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={() => setMarking(true)}>{t("projects.markDoneEllipsis")}</button></div>;
}
