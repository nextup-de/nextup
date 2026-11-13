"use client";
// A project draft as a page (plan SET, D9 to D17): what a yes opened, before it starts. Set up as a process (Kevin,
// 13 Nov 2026): status lines on top (lead, template, team, goal, baseline, start) and below them one step at a time -
// it opens on the first open step, a saved step moves on to the next open one, and Back and Next walk the steps when
// one needs a second look or can wait. Every control is one act.project.* event, shown only when the server's rules
// would let it through (features/projects/draft).
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageHeader } from "@/components/ui/elements";
import { stepLabel } from "@/features/approvals/steps";
import { unmetApprovals } from "@/features/approvals/rights";
import type { ApprovalRule, ApprovalStepInput } from "@/features/approvals/types";
import { draftView } from "@/features/projects/draft";
import type { ReducedProject } from "@/features/projects/types";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { BaselinePanel } from "../ProjectMeasure";
import { HowWeWork } from "../move/HowWeWork";
import { actorOf, useRights, useSend } from "../parts";
import { ApprovalSteps } from "./ApprovalSteps";
import { DraftGoal } from "./DraftGoal";
import { InvitePanel } from "./DraftInvites";
import { DraftLate } from "./DraftLate";
import { DraftLead } from "./DraftLead";
import { DraftTemplate } from "./DraftTemplate";
import { useProjectHints } from "./useProjectHints";
import styles from "./Draft.module.css";
import approvalStyles from "./ApprovalSteps.module.css";

const STEPS = ["lead", "template", "team", "goal", "baseline", "start"] as const;
type Step = (typeof STEPS)[number];
const onHash = (fn: () => void) => { window.addEventListener("hashchange", fn); return () => window.removeEventListener("hashchange", fn); };

export function DraftView({ p }: { p: ReducedProject }) {
  const ctx = useDemo();
  const { act, S, f, href } = ctx;
  const t = useT();
  const r = useRights(p);
  const send = useSend(p);
  const view = draftView(p, actorOf(ctx), S);
  const { stepHints, baseHint } = useProjectHints(p);
  // The approvals of the yes that opened this draft (plan GAT, D21, D33): the case with its runs, whether the draft waits for them and what Start still lacks.
  const kase = S.cases.find((c) => p.sources.includes(c.id) && (c.approvals !== null || c.approvalRuns.length > 0)) ?? null;
  const waits = p.waitsForApproval ?? false;
  const unmet = kase ? unmetApprovals(kase, S) : { missing: [] as ApprovalStepInput[], broken: [] as ApprovalRule[] };
  const lacks = !waits && unmet.missing.length > 0;
  const broken = !waits && unmet.broken.length > 0;
  const mayAsk = kase !== null && (r.lead || (kase.decided?.byUserId ?? null) === ctx.actorUserId);
  const missingList = unmet.missing.map((m) => stepLabel(m, S.approvals, S.approvals.roles).name).filter(Boolean).join(", ");
  const ruleText = (rule: ApprovalRule) => [rule.kind, rule.roleId ?? rule.councilId, rule.minEur !== null ? `≥ ${rule.minEur}` : ""].filter(Boolean).join(" ");
  const askMissing = () => {
    if (!kase || !lacks) return;
    act.provisional(kase.id, { supplement: true, approvals: unmet.missing.map((m) => ({ kind: m.kind, ...(m.roleId !== undefined ? { roleId: m.roleId } : {}), ...(m.councilId !== undefined ? { councilId: m.councilId } : {}), byHand: m.byHand === true })) });
  };

  // The step shown: the first one still open (the start once all are done); one picked by hand (Back, Next, a line)
  // holds until a save changes which step is the first open one.
  const stateOf = (k: Step): "done" | "open" => (k === "start" ? "open" : view.checklist[k] === "done" ? "done" : "open");
  const firstOpen = STEPS.findIndex((k) => stateOf(k) === "open");
  const [look, setLook] = useState<{ at: number; from: number } | null>(null);
  // A link to an invitation (#invite-…, from the inbox) opens the team step.
  const invited = useSyncExternalStore(onHash, () => window.location.hash.startsWith("#invite-"), () => false);
  const at = look && look.from === firstOpen ? look.at : invited ? STEPS.indexOf("team") : firstOpen;
  const go = (k: number) => setLook({ at: k, from: firstOpen });
  const step = STEPS[at];

  return (
    <div className={styles.page} data-testid="project-draft">
      <Link href={href("/projects")} className={styles.back}>{t("projects.backToAll")}</Link>
      <p className={styles.top} data-testid="draft-top-line">
        {view.startDay === null ? t("projectDraft.topLineNoStart", { name: p.lead }) : t("projectDraft.topLine", { date: f(view.startDay) })}
      </p>
      <PageHeader title={p.title} />
      {waits && <span className={approvalStyles.badge} data-testid="draft-waits-approval">{t("approvals.waitsForApproval")}</span>}

      {view.late && view.may.moveStart && view.startDay !== null && <DraftLate p={p} startDay={view.startDay} />}

      <nav aria-label={t("projectDraft.stepsLabel")}>
        <ol className={styles.lines}>
          {STEPS.map((k, i) => (
            <li key={k} data-state={stateOf(k)}>
              <button type="button" className={styles.line} aria-current={i === at ? "step" : undefined} onClick={() => go(i)}>
                <span className={styles.lineBar} aria-hidden="true" />
                <span className={styles.lineLabel}>{t(("projectDraft.line_" + k) as MessageKey)}</span>
                <span className={styles.lineState}>
                  {k === "start" ? (view.startDay !== null ? f(view.startDay) : "") : stateOf(k) === "done" ? t("projectDraft.checkDone") : t("projectDraft.checkOpen")}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className={styles.step} data-testid="draft-step" data-step={step}>
        <span className={styles.stepCount}>{t("projectDraft.stepOf", { n: at + 1, total: STEPS.length })}</span>
        {step === "lead" && (p.leadState === "pending" ? <DraftLead p={p} view={view} /> : (
          <section className={styles.section}>
            <h2 className={styles.h2}>{t("projectDraft.line_lead")}</h2>
            <p className={styles.muted}>{t("projectDraft.leadTaken", { name: p.lead })}</p>
          </section>
        ))}
        {step === "template" && <DraftTemplate p={p} view={view} />}
        {step === "team" && <InvitePanel p={p} />}
        {step === "goal" && <><DraftGoal p={p} view={view} /><HowWeWork p={p} className={styles.section} /></>}
        {step === "baseline" && <BaselinePanel p={p} hint={baseHint} />}
        {step === "start" && (
          <>
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

            {kase && (
              <section className={styles.section} aria-labelledby={"approvals-" + p.id}>
                <h2 id={"approvals-" + p.id} className={styles.h2}>{t("approvals.title")}</h2>
                <ApprovalSteps kase={kase} />
              </section>
            )}

            <section className={styles.section} aria-labelledby={"start-" + p.id}>
              <h2 id={"start-" + p.id} className={styles.h2}>{t("projectDraft.startTitle")}</h2>
              {r.lead && (
                <span className={styles.actionRow}>
                  <button type="button" className="nh-btn nh-btn-primary" disabled={!view.canStart || !view.may.start || waits || lacks || broken} onClick={() => send("project.started", {}, () => act.project.start(p.id))}>{t("projectDraft.startAction")}</button>
                </span>
              )}
              {waits && <p className={approvalStyles.note} data-tone="hold" data-testid="draft-start-waits">{t("approvals.permStartWaits")}</p>}
              {lacks && (
                <>
                  <p className={approvalStyles.note} data-tone="hold" data-testid="draft-needs-approval">{t("approvals.needsNewApproval", { list: missingList })}</p>
                  {mayAsk && <span className={styles.actionRow}><button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" data-testid="draft-ask-approval" onClick={askMissing}>{t("approvals.askMissingApproval")}</button></span>}
                </>
              )}
              {broken && <p className={approvalStyles.note} data-tone="hold" data-testid="draft-approver-missing">{t("approvals.approverMissing", { rule: unmet.broken.map(ruleText).join("; ") })}</p>}
              {view.baselineWaits && <p className={styles.hint} data-testid="draft-baseline-waits">{t("projectResult.baselineWaits")}</p>}
              {!view.canStart && !waits && !lacks && !broken && <p className={styles.hint}>{t("projectDraft.startWait")}</p>}
            </section>
          </>
        )}
      </div>

      <div className={styles.stepFoot}>
        {at > 0 && <button type="button" className={styles.quiet} onClick={() => go(at - 1)}><span aria-hidden="true">← </span>{t("common.back")}</button>}
        <span className={styles.stepGap} />
        {/* Next is quiet while the step is open (it can wait), the main button once it is done. */}
        {at < STEPS.length - 1 && (
          <button type="button" className={stateOf(step) === "done" ? "nh-btn nh-btn-primary nh-btn-sm" : "nh-btn nh-btn-ghost nh-btn-sm"} onClick={() => go(at + 1)}>
            {t("common.next")}<span aria-hidden="true"> →</span>
          </button>
        )}
      </div>
    </div>
  );
}
