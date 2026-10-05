"use client";
// The raise page's start: the greeting, the composer at the optical centre and, under it, how NextUp
// works (empty), the optional context (once typing) or the evaluation (after send). Props in.
import { useRef } from "react";
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
            <div className={s.boxHead}><h2 className={`${s.boxTitle} ${s.serif}`}>Add context</h2><span className={s.boxTag}>Optional</span></div>
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
    [<><span className={s.tileRow} data-split="true"><span className={s.faces}><span className={s.face}>TV</span><span className={s.face}>RH</span></span><span className={s.tag} data-tone="blue">Routed</span></span><span className={s.bar}><span className={s.barFill} data-w={58} /></span></>,
      "Sent to the right desk", "You review, publish, and follow it in Overview."],
  ];
  return (
    <section className={`${s.box} ${s.how}`} aria-label="How NextUp works">
      <div className={s.boxHead}><h2 className={`${s.boxTitle} ${s.serif}`}>How NextUp works</h2><span className={s.boxTag}>Raised → grilled → routed</span></div>
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

// The spinning network: 54 points on a sphere (golden angle), each tied to its 2-3 nearest. Fixed geometry.
const ORB = (() => {
  const N = 54, pts: [number, number, number][] = [];
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) { const y = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - y * y), a = i * 2.39996 + rnd() * 0.3; pts.push([Math.cos(a) * r, y, Math.sin(a) * r]); }
  const P = pts.map(([x, y, z]) => ({ x: 60 + x * 50, y: 60 + y * 50, z }));
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [], seen = new Set<string>();
  pts.forEach((p, i) => {
    pts.map((q, j): [number, number] => [j, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 2 + (i % 2))
      .forEach(([j]) => { const k = i < j ? i + "-" + j : j + "-" + i; if (seen.has(k)) return; seen.add(k); edges.push({ x1: P[i].x, y1: P[i].y, x2: P[j].x, y2: P[j].y }); });
  });
  const nodes = P.map((p, i) => ({ cx: p.x, cy: p.y, r: 0.7 + (p.z + 1) * 0.9 + (i % 7 === 0 ? 0.8 : 0), op: 0.35 + (p.z + 1) * 0.33 }));
  return { nodes, edges };
})();

function Evaluating({ step, sub }: { step: number; sub: string }) {
  return (
    <section className={s.eval} aria-live="polite" aria-label="Evaluating">
      <svg className={s.orb} viewBox="0 0 120 120" aria-hidden="true">
        {ORB.edges.map((e, i) => <line key={i} x1={e.x1.toFixed(1)} y1={e.y1.toFixed(1)} x2={e.x2.toFixed(1)} y2={e.y2.toFixed(1)} stroke="#1c1c1e" strokeOpacity="0.22" strokeWidth="0.45" />)}
        {ORB.nodes.map((n, i) => <circle key={i} cx={n.cx.toFixed(1)} cy={n.cy.toFixed(1)} r={n.r.toFixed(2)} fill="#1c1c1e" fillOpacity={n.op.toFixed(2)} />)}
      </svg>
      <h3 className={`${s.evalTitle} ${s.serif}`}>Evaluating</h3>
      <div className={s.evalLine}><span className={s.evalStep}>{EVAL_STEPS[step]}</span><span className={s.evalCount}>{step + 1} / {EVAL_STEPS.length}</span></div>
      <span className={s.evalSub}>{sub}</span>
      <div className={s.evalBars}>{EVAL_STEPS.map((_, k) => <span key={k} className={s.evalBar} data-s={k < step ? "done" : k === step ? "now" : undefined} />)}</div>
    </section>
  );
}
