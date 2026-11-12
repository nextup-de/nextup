"use client";
// The setup overview (Paper: "setup-overview"): every phase with its owner, its status, what it waits
// for and a link. Used by /setup and, read-only, by /admin/setup. While something is waiting it looks
// again by itself; a hidden tab does not poll.
import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MessageKey } from "@/i18n";
import { formatDate } from "@/i18n/format";
import { useLocale, useT } from "@/i18n/client";
import type { PhaseKey, PhaseLine, PhaseOwner, PhaseStatus, SetupPhase } from "@/features/settings/setup-phases";
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

function Line({ line }: { line: PhaseLine }) {
  const t = useT();
  const locale = useLocale();
  const v: Record<string, string | number> = { ...line.values };
  if (typeof v.time === "string") v.time = formatDate(locale, v.time, "dateTime");
  if (typeof v.date === "string") v.date = formatDate(locale, v.date, "day");
  if (typeof v.stepKey === "string") v.step = t(v.stepKey as MessageKey);
  return <li className={s.line} data-status={line.status} data-testid={`setup-line-${line.key}`}>{t(line.line, v)}</li>;
}

function actionOf(phase: SetupPhase): MessageKey {
  if (!phase.canAct) return "settingsSetupPhases.actionView";
  if (phase.status === "problem") return "settingsSetupPhases.actionFix";
  return phase.status === "yourTurn" ? "settingsSetupPhases.actionContinue" : "settingsSetupPhases.actionView";
}

function Row({ phase, n }: { phase: SetupPhase; n: number }) {
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
        <ul className={s.lines}>{phase.lines.map((l) => <Line key={l.key} line={l} />)}</ul>
      </div>
      <div className={s.end}>
        {/* No prefetch: this page refreshes itself, and every link leads to a page that reads a lot. */}
        {phase.href ? <Link prefetch={false} className={urgent ? s.primary : s.quiet} href={phase.href} data-testid="setup-phase-link">{t(actionOf(phase))}</Link> : null}
      </div>
    </li>
  );
}

/** `after` is what a page adds below the phases: /admin/setup puts the hand-over there. */
export function SetupOverview({ phases, poll, ledeKey, after }: { phases: SetupPhase[] | null; poll: boolean; ledeKey: MessageKey; after?: ReactNode }) {
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
        ? <ol className={s.list} aria-label={t("settingsSetupPhases.phasesAria")}>{phases.map((p, i) => <Row key={p.key} phase={p} n={i + 1} />)}</ol>
        : <p className={s.watching} role="status" data-testid="setup-overview-unreadable">{t("settingsSetupPhases.unreadable")}</p>}
      {after}
    </section>
  );
}
