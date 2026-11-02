"use client";
// The raise page's start: the greeting and the composer at the optical centre (its prompts tucked under it, RaisePrompts.tsx).
// After send the chat opens, and the evaluation (`Evaluating`, here) plays there under the first message. Props in.
import { useSyncExternalStore } from "react";
import { EvalOrb } from "@/components/dashboard/team/EvalOrb";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import s from "./Raise.module.css";

export const EVAL_STEPS: readonly MessageKey[] = ["ideas.startStepReading", "ideas.startStepOrg", "ideas.startStepSimilar", "ideas.startStepCost", "ideas.startStepFeasibility", "ideas.startStepPast", "ideas.startStepRisks", "ideas.startStepRouting"];

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

// `inChat`: under the first message in the chat, until NextUp's first reply is ready.
export function Evaluating({ step, sub, inChat = false }: { step: number; sub: string; inChat?: boolean }) {
  const t = useT();
  const reduced = useSyncExternalStore(onMotionPref, prefersReduced, () => false); // the orb holds still
  return (
    <section className={s.eval} data-chat={inChat || undefined} aria-live="polite" aria-label={t("ideas.startEvaluating")}>
      <span className={s.orb} aria-hidden="true"><EvalOrb state="connecting" size={78} paused={reduced} /></span>
      <h3 className={`${s.evalTitle} ${s.heading}`}>{t("ideas.startEvaluating")}</h3>
      <div className={s.evalLine}><span className={s.evalStep}>{t(EVAL_STEPS[step])}</span><span className={s.evalCount}>{step + 1} / {EVAL_STEPS.length}</span></div>
      <span className={s.evalSub}>{sub}</span>
      <div className={s.evalBars}>{EVAL_STEPS.map((_, k) => <span key={k} className={s.evalBar} data-s={k < step ? "done" : k === step ? "now" : undefined} />)}</div>
    </section>
  );
}
