"use client";
// The raise page's start: the greeting, the composer at the optical centre (its prompts tucked under it, RaisePrompts.tsx) and, after send, the evaluation. Props in.
import { useSyncExternalStore } from "react";
import { EvalOrb } from "@/components/dashboard/team/EvalOrb";
import s from "./Raise.module.css";

export const EVAL_STEPS = ["Reading your idea", "Org chart · who is responsible", "Similar ideas", "Cost and impact", "Feasibility", "Past decisions", "Risks and blockers", "Routing"];

export function RaiseStart({ name, composer, evalStep, evalSub }: {
  name: string;
  composer: React.ReactNode;
  evalStep: number | null;
  evalSub: string;
}) {
  return (
    <div className={s.start}>
      <h1 className={s.h1}>Raise it, {name}</h1>
      {composer}
      <div className={s.below}>
        {evalStep !== null && <Evaluating step={evalStep} sub={evalSub} />}
      </div>
    </div>
  );
}

const MOTION = "(prefers-reduced-motion: reduce)";
const prefersReduced = () => window.matchMedia(MOTION).matches;
const onMotionPref = (f: () => void) => { const m = window.matchMedia(MOTION); m.addEventListener("change", f); return () => m.removeEventListener("change", f); };

function Evaluating({ step, sub }: { step: number; sub: string }) {
  const reduced = useSyncExternalStore(onMotionPref, prefersReduced, () => false); // the orb holds still
  return (
    <section className={s.eval} aria-live="polite" aria-label="Evaluating">
      <span className={s.orb} aria-hidden="true"><EvalOrb state="connecting" size={78} paused={reduced} /></span>
      <h3 className={`${s.evalTitle} ${s.heading}`}>Evaluating</h3>
      <div className={s.evalLine}><span className={s.evalStep}>{EVAL_STEPS[step]}</span><span className={s.evalCount}>{step + 1} / {EVAL_STEPS.length}</span></div>
      <span className={s.evalSub}>{sub}</span>
      <div className={s.evalBars}>{EVAL_STEPS.map((_, k) => <span key={k} className={s.evalBar} data-s={k < step ? "done" : k === step ? "now" : undefined} />)}</div>
    </section>
  );
}
