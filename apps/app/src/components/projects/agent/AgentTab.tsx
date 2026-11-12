"use client";
// The Agent tab (plan AGT, D11, D12, D15, D18, D22, D25): the switch, the suggestions that wait for the person as cards (accept, edit then
// accept, dismiss with a reason) and what came of the ones answered. Every card says it was drafted with AI; nothing is sent until a person
// accepts. A closed AI gate shows no error: the tab simply has no suggestions today.
import { useState, useTransition } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Pill } from "@/components/dashboard/shared/primitives";
import { DISMISS_WHY_MAX, NUDGE_MAX, REPORT_MAX, STEP_TITLE_MAX } from "@/features/agent/limits";
import type { AgentTab as AgentTabView, AnsweredRow, OpenCard, Outcome } from "@/features/agent/view";
import type { AgentSuggestionKind } from "@/features/agent/types";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { acceptSuggestionAction, dismissSuggestionAction, switchAgentAction } from "@/server/agent/actions";
import styles from "./Agent.module.css";

const KIND = { unblock: "projectAgent.kindUnblock", report: "projectAgent.kindReport", plan: "projectAgent.kindPlan" } as const;
const RIDE = { quiet: "projectAgent.rideQuiet", stalled: "projectAgent.rideStalled", late: "projectAgent.rideLate", blocked: "projectAgent.rideBlocked" } as const;
const MAX: Record<AgentSuggestionKind, number> = { unblock: NUDGE_MAX, report: REPORT_MAX, plan: STEP_TITLE_MAX };

/** What a card sends when the person has not edited it: the draft, or for a Plan the proposed step's title. */
const draftOf = (c: OpenCard): string => (typeof c.text === "string" ? "" : c.kind === "plan" ? c.text.step?.title ?? "" : c.text.draft);

export function AgentTab({ p, view, failed }: { p: ReducedProject; view: AgentTabView; failed: boolean }) {
  const t = useT();
  const { tenant, showToast } = useDemo();
  const [pending, start] = useTransition();
  // The server action ends in revalidatePath: the page refreshes itself; a refusal comes back as its sentence.
  const run = (go: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await go();
      if (!r.ok && r.error) showToast(r.error);
    });
  return (
    <div className={styles.tab} data-testid="agent-tab">
      <section className={styles.block} aria-labelledby={"agent-" + p.id}>
        <h2 id={"agent-" + p.id} className={styles.title}>{t("projectAgent.title")}</h2>
        <p className={styles.hint}>{view.on ? t("projectAgent.stateOn") : t("projectAgent.stateOff")}</p>
        {view.canSwitch && (
          <span className={styles.row}>
            <button type="button" className="nh-btn nh-btn-sm" disabled={pending} onClick={() => run(() => switchAgentAction(tenant.slug, p.id, !view.on))}>
              {view.on ? t("projectAgent.switchOff") : t("projectAgent.switchOn")}
            </button>
          </span>
        )}
      </section>

      <section className={styles.block} aria-labelledby={"agent-open-" + p.id}>
        <h2 id={"agent-open-" + p.id} className={styles.title}>{t("projectAgent.openTitle")}</h2>
        {view.empty !== null && <p className={styles.hint}>{t("projectAgent.noneToday")}</p>}
        {failed && <p className={styles.hint} role="status">{t("projectAgent.loadFailed")}</p>}
        {view.open.length > 0 && (
          <ul className={styles.cards}>
            {view.open.map((c) => (
              <li key={c.id}><Card c={c} busy={pending} run={run} slug={tenant.slug} /></li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.block} aria-labelledby={"agent-history-" + p.id}>
        <h2 id={"agent-history-" + p.id} className={styles.title}>{t("projectAgent.historyTitle")}</h2>
        {view.answered.length === 0 ? <p className={styles.hint}>{t("projectAgent.historyNone")}</p> : (
          <ul className={styles.history}>{view.answered.map((a) => <li key={a.id}><Past a={a} /></li>)}</ul>
        )}
      </section>
    </div>
  );
}

type Run = (go: () => Promise<{ ok: boolean; error?: string }>) => void;

function Card({ c, busy, run, slug }: { c: OpenCard; busy: boolean; run: Run; slug: string }) {
  const t = useT();
  const { f } = useDemo();
  const [mode, setMode] = useState<"view" | "edit" | "dismiss">("view");
  const [text, setText] = useState(() => draftOf(c));
  const [why, setWhy] = useState("");
  const words = typeof c.text === "string" ? null : c.text;
  const step = words?.step ?? null;
  const ok = text.trim().length > 0 && text.trim().length <= MAX[c.kind];
  return (
    <article className={styles.card} aria-label={words?.title ?? t(KIND[c.kind])} data-testid="agent-card" data-kind={c.kind}>
      <div className={styles.head}>
        <span className={styles.kind}>{t(KIND[c.kind])}</span>
        <Pill tone="soft">{t("projectAgent.aiLabel")}</Pill>
      </div>
      {c.text === "removed" && <p className={styles.hint}>{t("projectAgent.removedText")}</p>}
      {c.text === "loading" && <p className={styles.hint} role="status">…</p>}
      {words && (
        <>
          <h3 className={styles.cardTitle}>{words.title}</h3>
          {c.ride && <p className={styles.meta}>{t(RIDE[c.ride.kind], { date: f(c.ride.day) })}</p>}
          {c.stepTitle && <p className={styles.meta}>{t("projectAgent.forStep", { step: c.stepTitle })}</p>}
          {words.why && <p className={styles.why}>{words.why}</p>}
          {c.kind !== "plan" && words.draft && (
            <>
              <span className={styles.draftLabel}>{t("projectAgent.draftLabel")}</span>
              <p className={styles.draft}>{words.draft}</p>
            </>
          )}
          {c.kind === "plan" && step && <p className={styles.draft}>{t("projectAgent.planStepLine", { title: step.title, role: step.role, days: step.dueInDays })}</p>}
        </>
      )}
      <p className={styles.meta}>{t("projectAgent.waitsUntil", { date: f(c.expiresDay) })}</p>

      {c.canAnswer && words && mode === "view" && (
        <span className={styles.row}>
          <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" disabled={busy} onClick={() => run(() => acceptSuggestionAction(slug, c.id))}>{t("projectAgent.accept")}</button>
          <button type="button" className="nh-btn nh-btn-sm" disabled={busy} onClick={() => setMode("edit")}>{t("projectAgent.edit")}</button>
          <button type="button" className="nh-btn nh-btn-sm" disabled={busy} onClick={() => setMode("dismiss")}>{t("projectAgent.dismiss")}</button>
        </span>
      )}
      {c.canAnswer && !words && c.text === "removed" && (
        <span className={styles.row}>
          <button type="button" className="nh-btn nh-btn-sm" disabled={busy} onClick={() => run(() => dismissSuggestionAction(slug, c.id))}>{t("projectAgent.dismiss")}</button>
        </span>
      )}
      {mode === "edit" && (
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (ok) run(() => acceptSuggestionAction(slug, c.id, text.trim())); }}>
          <label className={styles.form}>
            <span className={styles.label}>{t("projectAgent.editLabel")}</span>
            <textarea className={`nh-input nh-textarea ${styles.textarea}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX[c.kind]} rows={c.kind === "plan" ? 2 : 6} />
          </label>
          <span className={styles.row}>
            <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={busy || !ok}>{t("projectAgent.acceptSend")}</button>
            <button type="button" className="nh-btn nh-btn-sm" onClick={() => { setMode("view"); setText(draftOf(c)); }}>{t("projectAgent.editCancel")}</button>
          </span>
        </form>
      )}
      {mode === "dismiss" && (
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); run(() => dismissSuggestionAction(slug, c.id, why.trim() || undefined)); }}>
          <label className={styles.form}>
            <span className={styles.label}>{t("projectAgent.dismissWhy")}</span>
            <input className={`nh-input ${styles.input}`} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={DISMISS_WHY_MAX} />
          </label>
          <span className={styles.row}>
            <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={busy}>{t("projectAgent.dismissSend")}</button>
            <button type="button" className="nh-btn nh-btn-sm" onClick={() => setMode("view")}>{t("projectAgent.editCancel")}</button>
          </span>
        </form>
      )}
    </article>
  );
}

function outcomeLine(t: ReturnType<typeof useT>, f: (d: number) => string, o: Outcome): string {
  switch (o.type) {
    case "notice": return o.stepTitle ? t("projectAgent.outcomeNotice", { step: o.stepTitle }) : t("projectAgent.outcomeNoticeNoStep");
    case "update": return o.week !== null ? t("projectAgent.outcomeUpdate", { date: f(o.week) }) : t("projectAgent.outcomeUpdateNoWeek");
    case "step": return o.title ? t("projectAgent.outcomeStep", { title: o.title }) : t("projectAgent.outcomeStepNoTitle");
    case "dismissed": return o.why ? t("projectAgent.outcomeDismissedWhy", { why: o.why }) : t("projectAgent.outcomeDismissed");
    case "expired": return t("projectAgent.expired");
  }
}

function Past({ a }: { a: AnsweredRow }) {
  const t = useT();
  const { f } = useDemo();
  return (
    <div className={styles.past} data-testid="agent-past">
      <span>{outcomeLine(t, f, a.outcome)}</span>
      <span className={styles.pastMeta}>{t(KIND[a.kind])} · {f(a.day)}{a.edited ? " · " + t("projectAgent.outcomeEdited") : ""}</span>
    </div>
  );
}
