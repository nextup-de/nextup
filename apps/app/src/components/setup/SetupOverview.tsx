"use client";
// The setup overview (Paper: "setup-overview"): every phase with its owner, its status, what it waits
// for and a link. Used by /setup and, read-only, by /admin/setup. While something is waiting it looks
// again by itself; a hidden tab does not poll.
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MessageKey } from "@/i18n";
import { formatDate } from "@/i18n/format";
import { useLocale, useT } from "@/i18n/client";
import { REASON_MAX } from "@/features/settings/declined";
import type { LineDecline, PhaseKey, PhaseLine, PhaseOwner, PhaseStatus, SetupPhase } from "@/features/settings/setup-phases";
import { declineSystemAction, reopenSystemAction } from "@/server/actions/settings/declined";
import s from "./SetupOverview.module.css";

/** The page reads a dozen tables and asks the mail relay, so it looks less often than the case lists. */
const POLL_MS = 15_000;

const PHASE: Record<PhaseKey, MessageKey> = {
  server: "settingsSetupPhases.phaseServer", signIn: "settingsSetupPhases.phaseSignIn", connectors: "settingsSetupPhases.phaseConnectors",
  context: "settingsSetupPhases.phaseContext", company: "settingsSetupPhases.phaseCompany", open: "settingsSetupPhases.phaseOpen",
};
const OWNER: Record<PhaseOwner, MessageKey> = {
  nextupAndIt: "settingsSetupPhases.ownerNextupAndIt", customerIt: "settingsSetupPhases.ownerCustomerIt", system: "settingsSetupPhases.ownerSystem",
  pilotLead: "settingsSetupPhases.ownerPilotLead", customerAdmin: "settingsSetupPhases.ownerCustomerAdmin",
};
const STATUS: Record<PhaseStatus, MessageKey> = {
  done: "settingsSetupPhases.statusDone", yourTurn: "settingsSetupPhases.statusYourTurn", waiting: "settingsSetupPhases.statusWaiting",
  problem: "settingsSetupPhases.statusProblem", notUsed: "settingsSetupPhases.statusNotUsed",
};

function usePoll(on: boolean) {
  const { refresh } = useRouter();
  useEffect(() => {
    if (!on) return;
    const tick = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [on, refresh]);
}

/** "We do not use this" with its one-line reason, or "Use it after all" (Q9.1). Only shown to whoever can act. */
function Decline({ slug, decline }: { slug: string; decline: LineDecline }) {
  const t = useT();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const done = (r: { ok: boolean; reason?: string }) => {
    if (!r.ok) return setError(r.reason === "reason" ? "settingsSetupPhases.declineErrReason" : "settingsSetupPhases.declineErrFailed");
    setError(null); setAsking(false); setReason("");
    router.refresh();
  };
  const err = error ? <p className={s.declineError} role="alert">{t(error)}</p> : null;
  if (decline.declined) {
    return (
      <div className={s.decline}>
        <button type="button" className={s.textButton} disabled={pending} onClick={() => start(async () => done(await reopenSystemAction(slug, decline.system)))} data-testid={`setup-reopen-${decline.system}`}>
          {t("settingsSetupPhases.reopenButton")}
        </button>
        {err}
      </div>
    );
  }
  if (!asking) {
    return (
      <div className={s.decline}>
        <button type="button" className={s.textButton} onClick={() => setAsking(true)} data-testid={`setup-decline-${decline.system}`}>{t("settingsSetupPhases.declineButton")}</button>
      </div>
    );
  }
  const id = `setup-decline-reason-${decline.system}`;
  return (
    <form className={s.declineForm} onSubmit={(e) => { e.preventDefault(); start(async () => done(await declineSystemAction(slug, decline.system, reason))); }}>
      <label className={s.declineLabel} htmlFor={id}>{t("settingsSetupPhases.declineReason")}</label>
      <div className={s.declineRow}>
        <input id={id} className={s.declineInput} value={reason} maxLength={REASON_MAX} required autoFocus onChange={(e) => setReason(e.target.value)} data-testid={`${id}`} />
        <button type="submit" className={s.quiet} disabled={pending} data-testid={`setup-decline-save-${decline.system}`}>{t("settingsSetupPhases.declineSave")}</button>
        <button type="button" className={s.textButton} disabled={pending} onClick={() => { setAsking(false); setError(null); }}>{t("settingsSetupPhases.declineCancel")}</button>
      </div>
      <p className={s.declineHint}>{t("settingsSetupPhases.declineHint")}</p>
      {err}
    </form>
  );
}

function Line({ line, slug }: { line: PhaseLine; slug: string | null }) {
  const t = useT();
  const locale = useLocale();
  const v: Record<string, string | number> = { ...line.values };
  if (typeof v.time === "string") v.time = formatDate(locale, v.time, "dateTime");
  if (typeof v.date === "string") v.date = formatDate(locale, v.date, "day");
  if (typeof v.stepKey === "string") v.step = t(v.stepKey as MessageKey);
  if (typeof v.systemKey === "string") v.system = t(v.systemKey as MessageKey);
  return (
    <li className={s.line} data-status={line.status} data-testid={`setup-line-${line.key}`} data-declined={line.decline?.declined ? "" : undefined}>
      {t(line.line, v)}
      {line.decline && slug ? <Decline slug={slug} decline={line.decline} /> : null}
    </li>
  );
}

function actionOf(phase: SetupPhase): MessageKey {
  if (!phase.canAct) return "settingsSetupPhases.actionView";
  if (phase.status === "problem") return "settingsSetupPhases.actionFix";
  return phase.status === "yourTurn" ? "settingsSetupPhases.actionContinue" : "settingsSetupPhases.actionView";
}

function Row({ phase, n, slug }: { phase: SetupPhase; n: number; slug: string | null }) {
  const t = useT();
  // "Your turn" is only true for someone who can do it. Everyone else sees that it is open.
  const status = phase.status === "yourTurn" && !phase.canAct ? "settingsSetupPhases.statusOpen" : STATUS[phase.status];
  const urgent = phase.canAct && (phase.status === "yourTurn" || phase.status === "problem");
  return (
    <li className={s.row} data-testid={`setup-phase-${phase.key}`} data-status={phase.status} data-can-act={phase.canAct ? "" : undefined}>
      <span className={s.number} aria-hidden="true">{phase.status === "done" ? "✓" : n}</span>
      <div className={s.body}>
        <div className={s.head}>
          <h2 className={s.name}>{t(PHASE[phase.key])}</h2>
          <span className={s.status} data-testid="setup-phase-status">{t(status)}</span>
        </div>
        <p className={s.owner}>{t("settingsSetupPhases.ownerLabel", { owner: t(OWNER[phase.owner]) })}</p>
        <ul className={s.lines}>{phase.lines.map((l) => <Line key={l.key} line={l} slug={phase.canAct ? slug : null} />)}</ul>
      </div>
      <div className={s.end}>
        {/* No prefetch: this page refreshes itself, and every link leads to a page that reads a lot. */}
        {phase.href ? <Link prefetch={false} className={urgent ? s.primary : s.quiet} href={phase.href} data-testid="setup-phase-link">{t(actionOf(phase))}</Link> : null}
      </div>
    </li>
  );
}

/** `slug`: the company, where its stack admin may record "We do not use this"; null on the read-only console. */
export function SetupOverview({ phases, poll, ledeKey, slug = null }: { phases: SetupPhase[] | null; poll: boolean; ledeKey: MessageKey; slug?: string | null }) {
  const t = useT();
  usePoll(poll);
  const done = phases?.filter((p) => p.status === "done" || p.status === "notUsed").length ?? 0;
  return (
    <section className={s.page} data-testid="setup-overview" data-polling={poll ? "" : undefined}>
      <header className={s.intro}>
        <h1 className={s.title}>{t("settingsSetupPhases.title")}</h1>
        <p className={s.lede}>{t(ledeKey)}</p>
        {phases ? <p className={s.progress} data-testid="setup-overview-progress">{t("settingsSetupPhases.progress", { done, total: phases.length })}</p> : null}
        {phases && poll ? <p className={s.watching} role="status" data-testid="setup-overview-watching">{t("settingsSetupPhases.watching")}</p> : null}
      </header>
      {phases
        ? <ol className={s.list} aria-label={t("settingsSetupPhases.phasesAria")}>{phases.map((p, i) => <Row key={p.key} phase={p} n={i + 1} slug={slug} />)}</ol>
        : <p className={s.watching} role="status" data-testid="setup-overview-unreadable">{t("settingsSetupPhases.unreadable")}</p>}
    </section>
  );
}
