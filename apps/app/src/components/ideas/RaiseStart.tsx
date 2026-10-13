"use client";
// The raise page's start: the greeting, the composer at the optical centre and, under it, the optional
// context or, after send, the evaluation. Props in.
import { useRef, useSyncExternalStore } from "react";
import { EvalOrb } from "@/components/dashboard/team/EvalOrb";
import s from "./Raise.module.css";

export const EVAL_STEPS = ["Reading your idea", "Org chart · who is responsible", "Similar ideas", "Cost and impact", "Feasibility", "Past decisions", "Risks and blockers", "Routing"];
const PROMPTS = ["Impact", "Who’s blocked", "Already tried", "Deadline"];

export function RaiseStart({ name, composer, evalStep, evalSub, context, onContext }: {
  name: string;
  composer: React.ReactNode;
  evalStep: number | null;
  evalSub: string;
  context: string;
  onContext: (v: string) => void;
}) {
  const ctx = useRef<HTMLTextAreaElement>(null);
  const prompt = (label: string) => {
    if (!context.includes("*" + label + "*")) onContext((context.trim() ? context.replace(/\s*$/, "") + "\n" : "") + "*" + label + "* ");
    setTimeout(() => { const el = ctx.current; if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; } }, 30);
  };
  return (
    <div className={s.start}>
      <h1 className={s.h1}>Raise it, {name}</h1>
      {composer}
      <div className={s.below}>
        {evalStep !== null ? <Evaluating step={evalStep} sub={evalSub} /> : (
          <section className={s.box} aria-label="Add context">
            <div className={s.boxHead}><h2 className={`${s.boxTitle} ${s.heading}`}>Add context</h2><span className={s.boxTag}>Optional</span></div>
            <div className={s.ctxBody}>
              <textarea ref={ctx} className={s.ctx} rows={4} value={context} onChange={(e) => onContext(e.target.value)} aria-label="Context"
                placeholder="What’s happening, who does it affect, what have you already tried? The more context, the better Nextup can grill and route it." />
              <div className={s.prompts}>
                <span className={s.promptsLabel}>Prompts</span>
                {PROMPTS.map((p) => <button key={p} type="button" className={s.choice} data-on={context.includes("*" + p + "*")} onClick={() => prompt(p)}>{p}</button>)}
              </div>
            </div>
          </section>
        )}
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
