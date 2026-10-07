"use client";
// The raise page's start: the greeting, the composer at the optical centre and, under it, how NextUp
// works (empty), the optional context (once typing) or the evaluation (after send). Props in.
import { useRef, useSyncExternalStore } from "react";
import { EvalOrb } from "@/components/dashboard/team/EvalOrb";
import s from "./Raise.module.css";

export const EVAL_STEPS = ["Reading your idea", "Org chart · who is responsible", "Similar ideas", "Cost and impact", "Feasibility", "Past decisions", "Risks and blockers", "Routing"];
const PROMPTS = ["Impact", "Who’s blocked", "Already tried", "Deadline"];

export function RaiseStart({ name, composer, typed, evalStep, evalSub, context, onContext }: {
  name: string;
  composer: React.ReactNode;
  typed: boolean;
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
        {evalStep !== null ? <Evaluating step={evalStep} sub={evalSub} /> : typed ? (
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
        ) : <HowItWorks />}
      </div>
    </div>
  );
}

function HowItWorks() {
  const bar = (key: string, w: number) => <span className={s.tileRow}><span className={s.tileKey}>{key}</span><span className={s.bar}><span className={s.barFill} data-w={w} /></span></span>;
  const squares = (key: string, on: number) => <span className={s.tileRow}><span className={s.tileKey}>{key}</span><span className={s.squares}>{[0, 1, 2, 3, 4].map((i) => <span key={i} className={s.square} data-on={i < on} />)}</span></span>;
  const steps: [React.ReactNode, string, string][] = [
    [<><span className={s.tileRow}><span className={s.goldDot} /><span className={s.bar} /></span><span className={s.tileRow}><span className={s.tag}>Idea</span><span className={s.tag}>Problem</span></span></>,
      "Raise it", "Anyone, from any team, starts with an idea or a problem in one line."],
    [<>{bar("Org", 82)}{bar("Budget", 64)}{bar("Goals", 91)}</>, "It does the research", "Nextup checks it against your org, budget, past ideas and goals."],
    [<>{squares("Clarity", 4)}{squares("Impact", 3)}{squares("Evidence", 5)}</>, "It grills you", "A few sharp questions fill the gaps — scores update as you answer."],
    [<><span className={s.tileRow} data-split="true"><span className={s.faces}><span className={s.face} data-avatar="blue">TV</span><span className={s.face} data-avatar="amber">RH</span></span><span className={s.tag} data-tone="blue">Routed</span></span><span className={s.bar}><span className={s.barFill} data-w={58} /></span></>,
      "Sent to the right desk", "You review, publish, and follow it in Overview."],
  ];
  return (
    <section className={`${s.box} ${s.how}`} aria-label="How NextUp works">
      <div className={s.boxHead}><h2 className={`${s.boxTitle} ${s.heading}`}>How NextUp works</h2><span className={s.boxTag}>Raised → grilled → routed</span></div>
      <div className={s.steps}>
        {steps.map(([tile, title, text]) => (
          <div key={title} className={s.step}>
            <div className={s.tile} aria-hidden="true">{tile}</div>
            <h3 className={s.stepTitle}>{title}</h3>
            <p className={s.stepText}>{text}</p>
          </div>
        ))}
      </div>
    </section>
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
