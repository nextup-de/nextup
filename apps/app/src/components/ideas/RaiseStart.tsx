"use client";
// The raise page's start: the greeting and the composer at the optical centre (its prompts tucked under it, RaisePrompts.tsx).
// After send the chat opens, and the evaluation (`Evaluating`, here) plays there under the first message. Props in.
import { useEffect, useState, useSyncExternalStore } from "react";
import type { OrbState } from "thinking-orbs/engine";
import { EvalOrb } from "@/components/dashboard/team/EvalOrb";
import { useLocale, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import type { Coach, Phase } from "@/features/ideas/progress";
import { bars, phaseIndex, phaseOf, PHASES, remaining } from "@/features/ideas/progress";
import type { EvalRun } from "@/lib/use-idea-studio";
import s from "./Raise.module.css";

// Each real phase: what it is called, and how the orb moves while it runs. The coach's wait is said by who answers.
const PHASE_LABEL: Record<Exclude<Phase, "coach">, MessageKey> = { draft: "ideas.evalDraft", score: "ideas.evalScore" };
const COACH_LABEL: Record<Coach, MessageKey> = { brain: "ideas.evalCoachBrain", model: "ideas.evalCoachModel", offline: "ideas.evalCoachOffline" };
const ORB: Record<Phase, OrbState> = { draft: "connecting", score: "searching", coach: "weaving" };

export function RaiseStart({ name, composer }: {
  name: string;
  composer: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className={s.start}>
      <h1 className={s.h1}>{t("ideas.startGreeting", { name })}</h1>
      {composer}
      <div className={s.below} />
    </div>
  );
}

const MOTION = "(prefers-reduced-motion: reduce)";
const prefersReduced = () => window.matchMedia(MOTION).matches;
const onMotionPref = (f: () => void) => { const m = window.matchMedia(MOTION); m.addEventListener("change", f); return () => m.removeEventListener("change", f); };

// `inChat`: under the first message in the chat, until NextUp's first reply is ready. It shows the turn's
// real phases (features/ideas/progress) as they happen, the time gone and, while the wait is a usual one, about how much is left.
export function Evaluating({ run, sub, inChat = false }: { run: EvalRun; sub: string; inChat?: boolean }) {
  const t = useT(), locale = useLocale();
  const reduced = useSyncExternalStore(onMotionPref, prefersReduced, () => false); // the orb holds still
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => { const id = setInterval(() => setNow(performance.now()), 200); return () => clearInterval(id); }, []);
  const { progress: p, timings } = run;
  const phase = phaseOf(p), step = phaseIndex(p);
  const label = phase === "coach" ? t(p.coach ? COACH_LABEL[p.coach] : "ideas.evalCoach") : t(PHASE_LABEL[phase]);
  const fills = bars(p, now, timings);
  const gone = Math.max(0, now - (p.at.draft ?? now)) / 1000;
  const left = remaining(p, now, timings);
  const found = p.overall === null ? null : [
    p.threshold === null ? null : t("ideas.evalScored", { n: p.overall, line: p.threshold }),
    p.similar ? t("ideas.evalSimilar", { title: p.similar }) : t("ideas.evalNoSimilar"),
  ].filter(Boolean).join(" · ");
  return (
    <section className={s.eval} data-chat={inChat || undefined} aria-live="polite" aria-label={t("ideas.startEvaluating")}>
      <span className={s.orb} aria-hidden="true"><EvalOrb state={ORB[phase]} size={78} paused={reduced} /></span>
      <h3 className={`${s.evalTitle} ${s.heading}`}>{t("ideas.startEvaluating")}</h3>
      <div className={s.evalLine}><span className={s.evalStep}>{label}</span><span className={s.evalCount}>{step + 1} / {PHASES.length}</span></div>
      <span className={s.evalSub}>{sub}</span>
      {found && <span className={s.evalSub}>{found}</span>}
      <div className={s.evalBars}>{fills.map((f, k) => (
        <span key={k} className={s.evalBar} data-s={k < step ? "done" : k === step ? "now" : undefined}>
          <i className={s.evalFill} style={{ "--fill": f } as React.CSSProperties} />
        </span>
      ))}</div>
      <span className={s.evalTime} aria-hidden="true">
        {t("ideas.evalElapsed", { s: gone.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })} · {left === null ? t("ideas.evalLonger") : t("ideas.evalLeft", { s: Math.max(1, Math.ceil(left / 1000)) })}
      </span>
    </section>
  );
}
