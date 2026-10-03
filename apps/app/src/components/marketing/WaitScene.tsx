"use client";
// One request, both ways. A pinned stage scrubbed by the scroll position: first the request wanders from
// desk to desk (orange is waiting) until an answer comes on day 19; then the same request is matched on the
// routing map and goes straight to its owner. Scroll drives it; the two buttons jump to either end.
//
// Positions are data: the same numbers place the desks and draw the lines, once for wide screens and once
// for phones. Per-frame values (how far a line is drawn, where the request is) go straight to the DOM as CSS
// variables; React state only holds what changes a few times (the day, the desk, the side).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import styles from "./WaitScene.module.css";

type Pt = readonly [number, number];
type DeskId = "sender" | "shift" | "purch" | "fin" | "head" | "lead" | "eng" | "qual";
type Layout = "wide" | "tall";
type Side = "today" | "next";

const BOX: Record<Layout, { w: number; h: number }> = { wide: { w: 1000, h: 620 }, tall: { w: 600, h: 640 } };
// Where each desk stands on the floor, per layout. null = left off the phone floor.
const AT: Record<DeskId, { wide: Pt; tall: Pt | null }> = {
  sender: { wide: [125, 510], tall: [115, 555] },
  shift: { wide: [165, 150], tall: [120, 130] },
  purch: { wide: [575, 480], tall: [415, 455] },
  fin: { wide: [860, 120], tall: [480, 95] },
  head: { wide: [850, 515], tall: [455, 590] },
  lead: { wide: [300, 335], tall: [165, 345] },
  eng: { wide: [600, 185], tall: [300, 215] },
  qual: { wide: [905, 330], tall: null },
};
const DESKS = Object.keys(AT) as DeskId[];

// Today: where the request goes and how many days it lies there. `reason` is one of the ledger's four
// stall reasons; the last hop is the one where somebody works on it. `bend` shapes the detour.
type Hop = { from: DeskId; to: DeskId; days: number; where: string; reason: string; bend: Pt; work?: boolean };
const HOPS: Hop[] = [
  { from: "sender", to: "shift", days: 2, where: "Shift lead", reason: "not responsible", bend: [-0.24, -0.1] },
  { from: "shift", to: "purch", days: 5, where: "Purchasing", reason: "wrong department", bend: [-0.34, 0.2] },
  { from: "purch", to: "fin", days: 6, where: "Finance", reason: "is it important", bend: [0.3, -0.26] },
  { from: "fin", to: "sender", days: 3, where: "Back to the sender", reason: "no time, returned", bend: [0.22, -0.16] },
  { from: "sender", to: "head", days: 3, where: "Head of Production", reason: "answered", bend: [0.16, 0.1], work: true },
];
const STARTS = HOPS.map((_, i) => HOPS.slice(0, i).reduce((sum, h) => sum + h.days, 0));
const TOTAL = HOPS.reduce((sum, h) => sum + h.days, 0);
const WORK = HOPS.filter((h) => h.work).reduce((sum, h) => sum + h.days, 0);
const ANSWERED = 2; // with NextUp, the day the owner answers in this story (the demo's median)

// Scroll progress 0..1 over the pinned section: today plays, holds, then the stage turns to NextUp.
const TODAY = [0.04, 0.54] as const;
const TURN = 0.6;
const NEXT = [0.66, 0.92] as const;
const TRAVEL = 0.9; // days of the clock a hop spends on the way; the rest of its days it lies on the desk
const STILL = "(prefers-reduced-motion: reduce), (max-height: 560px)"; // no pinning: the buttons switch sides

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const ease = (t: number) => t * t * (3 - 2 * t);

// A detour from a to b: a cubic whose two control points sit off the straight line by `bend` x its length.
function detour(a: Pt, b: Pt, bend: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const c = (along: number, off: number) => `${Math.round(a[0] + dx * along - dy * off)} ${Math.round(a[1] + dy * along + dx * off)}`;
  return `M${a[0]} ${a[1]} C${c(0.3, bend[0])} ${c(0.7, bend[1])} ${b[0]} ${b[1]}`;
}

type View = { side: Side; day: number; started: number; arrived: number; beat: number };
function viewAt(p: number): View {
  if (p < TURN) {
    const clock = clamp((p - TODAY[0]) / (TODAY[1] - TODAY[0])) * TOTAL;
    return {
      side: "today", day: Math.floor(clock + 1e-4), beat: 0,
      started: HOPS.filter((_, i) => clock > STARTS[i]).length,
      arrived: HOPS.filter((h, i) => clock >= STARTS[i] + Math.min(TRAVEL, h.days / 2)).length,
    };
  }
  const n = clamp((p - NEXT[0]) / (NEXT[1] - NEXT[0]));
  const beat = n >= 0.84 ? 3 : n >= 0.46 ? 2 : n > 0.02 ? 1 : 0;
  return { side: "next", day: beat === 3 ? ANSWERED : n >= 0.66 ? 1 : 0, started: HOPS.length, arrived: HOPS.length, beat };
}
const sameView = (a: View, b: View) => a.side === b.side && a.day === b.day && a.started === b.started && a.arrived === b.arrived && a.beat === b.beat;

function onStill(cb: () => void) {
  const m = window.matchMedia(STILL);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

type Props = {
  request: string; from: string; decision: string; promiseDays: number;
  owner: string; ownerRole: string; deputy: string; deputyRole: string;
};

export function WaitScene({ request, from, decision, promiseDays, owner, ownerRole, deputy, deputyRole }: Props) {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ side: "today", day: 0, started: 0, arrived: 0, beat: 0 });
  const [manual, setManual] = useState<Side>("today"); // which end to show when the stage is not pinned
  const still = useSyncExternalStore(onStill, () => window.matchMedia(STILL).matches, () => false);

  useEffect(() => {
    const el = root.current, st = stage.current;
    if (!el || !st) return;
    const floors = Array.from(el.querySelectorAll<HTMLElement>("[data-floor]")).map((floor) => ({
      floor,
      hops: Array.from(floor.querySelectorAll<SVGPathElement>("[data-hop]")),
      line: floor.querySelector<SVGPathElement>("[data-line]"),
      dot: floor.querySelector<SVGGElement>("[data-dot]"),
    }));
    const bars = Array.from(el.querySelectorAll<HTMLElement>("[data-bar]"));

    function paint(p: number) {
      const clock = clamp((p - TODAY[0]) / (TODAY[1] - TODAY[0])) * TOTAL;
      const straight = ease(clamp(((p - NEXT[0]) / (NEXT[1] - NEXT[0]) - 0.05) / 0.4));
      for (const f of floors) {
        if (!f.floor.offsetWidth || !f.line || !f.dot) continue; // the other layout is on screen
        let on: SVGPathElement = f.line, along = straight;
        f.line.style.setProperty("--t", straight.toFixed(4));
        HOPS.forEach((h, i) => {
          const t = ease(clamp((clock - STARTS[i]) / Math.min(TRAVEL, h.days / 2)));
          f.hops[i]?.style.setProperty("--t", t.toFixed(4));
          if (p < TURN && clock >= STARTS[i] && f.hops[i]) { on = f.hops[i]; along = t; }
        });
        const at = on.getPointAtLength(on.getTotalLength() * along);
        f.dot.setAttribute("transform", `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`);
      }
      bars.forEach((bar, i) => bar.style.setProperty("--w", clamp((clock - STARTS[i]) / HOPS[i].days).toFixed(4)));
      const next = viewAt(p);
      setView((v) => (sameView(v, next) ? v : next));
    }

    let raf = 0;
    if (still) {
      raf = requestAnimationFrame(() => paint(manual === "today" ? TURN - 0.02 : 1));
      return () => cancelAnimationFrame(raf);
    }
    const measure = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const span = r.height - st.offsetHeight; // how far the page scrolls while the stage is pinned
      const top = parseFloat(getComputedStyle(st).top) || 0;
      paint(span > 0 ? clamp((top - r.top) / span) : 0);
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(measure); };
    queue();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
    };
  }, [still, manual]);

  function go(side: Side) {
    setManual(side);
    const el = root.current, st = stage.current;
    if (still || !el || !st) return;
    const r = el.getBoundingClientRect();
    const top = parseFloat(getComputedStyle(st).top) || 0;
    const p = side === "today" ? TODAY[1] + 0.02 : NEXT[1] + 0.04;
    window.scrollTo({ top: window.scrollY + r.top - top + p * (r.height - st.offsetHeight), behavior: "smooth" });
  }

  const today = view.side === "today";
  const names: Record<DeskId, [string, string]> = { // [wide, phone]
    sender: [from, "Night shift"], shift: ["Shift lead", "Shift lead"], purch: ["Purchasing", "Purchasing"], fin: ["Finance", "Finance"],
    head: ["Head of Production", "Head of Prod."], lead: [ownerRole, "Team lead"], eng: [deputyRole, "Eng. lead"], qual: ["Quality", "Quality"],
  };
  const here: DeskId = !today ? (view.beat >= 2 ? "lead" : "sender") : view.arrived ? HOPS[view.arrived - 1].to : "sender";

  return (
    <section className={styles.scene} ref={root} id="wait" data-side={view.side} data-beat={view.beat} aria-labelledby="wait-title">
      <div className={styles.stage} ref={stage}>
        <div className={styles.top}>
          <h2 id="wait-title" className={styles.eyebrow}>One request, both ways</h2>
          <div className={styles.toggle} role="group" aria-label="Which way the request goes">
            <button type="button" aria-pressed={today} onClick={() => go("today")}>Today</button>
            <button type="button" aria-pressed={!today} onClick={() => go("next")}>With NextUp</button>
          </div>
        </div>

        <div className={styles.cols}>
          <div className={styles.story}>
            <p className={styles.ask}>&ldquo;{request}&rdquo;</p>

            <div className={styles.count}>
              <span className={styles.num}>{view.day}</span>
              <p className={styles.unit}>
                <strong>{view.day === 1 ? "day" : "days"} {today ? "without an answer" : "to the answer"}</strong>
                <span data-on={today ? view.day >= TOTAL : view.beat === 3}>
                  {today
                    ? `${WORK} of them were work. The rest was waiting for someone to say yes, no, or “not me”.`
                    : `Same request, same company. The owner was one desk away.`}
                </span>
              </p>
            </div>

            <div className={styles.ledgers}>
              <ol className={styles.ledger} data-show={today} aria-hidden={!today}>
                {HOPS.map((h, i) => (
                  <li key={h.where} data-on={i < view.started} data-now={today && i === view.started - 1 && view.day < TOTAL} data-work={h.work}>
                    <span>{h.where}</span>
                    <span className={styles.reason}>{h.reason}</span>
                    <span className={styles.days}>{h.days} d</span>
                    <i className={styles.bar} data-bar="" />
                  </li>
                ))}
              </ol>
              <ol className={styles.ledger} data-show={!today} data-kind="next" aria-hidden={today}>
                <li data-on={view.beat >= 1}>
                  <span className={styles.days}>Day 0</span>
                  <span>Raised in one box. The map reads it as <em>{decision}</em>.</span>
                </li>
                <li data-on={view.beat >= 2}>
                  <span className={styles.days}>Day 0</span>
                  <span>On {owner}&rsquo;s desk. Answer owed by day {promiseDays}; after that it moves to {deputy} by itself.</span>
                </li>
                <li data-on={view.beat >= 3}>
                  <span className={styles.days}>Day {ANSWERED}</span>
                  <span>Answered: yes, do it. Everyone could see where it was.</span>
                </li>
              </ol>
            </div>
          </div>

          <div className={styles.floors} aria-hidden="true">
            {(["wide", "tall"] as const).map((kind) => {
              const box = BOX[kind];
              const at = (id: DeskId) => AT[id][kind] ?? AT[id].wide;
              return (
                <div key={kind} className={styles.floor} data-floor={kind}>
                  <svg className={styles.wires} viewBox={`0 0 ${box.w} ${box.h}`}>
                    <g className={styles.tangle}>
                      {HOPS.map((h) => <path key={h.where} data-hop="" className={styles.hop} pathLength={1} d={detour(at(h.from), at(h.to), h.bend)} />)}
                    </g>
                    <path className={styles.deputyLink} d={`M${at("lead").join(" ")} L${at("eng").join(" ")}`} />
                    <path data-line="" className={styles.line} pathLength={1} d={`M${at("sender").join(" ")} L${at("lead").join(" ")}`} />
                    <g data-dot="" className={styles.dot} transform={`translate(${at("sender").join(" ")})`}>
                      <circle r={kind === "wide" ? 15 : 17} /><circle r={kind === "wide" ? 6.5 : 8} />
                    </g>
                  </svg>
                  {DESKS.map((id) => {
                    const pos = AT[id][kind];
                    if (!pos) return null;
                    const hop = HOPS.findIndex((h) => h.to === id);
                    const seen = hop >= 0 && hop < view.arrived;
                    const role = id === "lead" ? "owner" : id === "eng" ? "deputy" : id === "sender" ? "sender" : undefined;
                    const tag = role === "owner" ? `${owner} · owner` : role === "deputy" ? `${deputy} · deputy`
                      : hop < 0 ? "" : kind === "wide" ? `${HOPS[hop].reason} · ${HOPS[hop].days} d` : `${HOPS[hop].days} d`;
                    return (
                      // The same numbers that draw the lines place the desk: a position, not a style.
                      <span key={id} className={styles.desk} data-role={role} data-seen={seen} data-here={here === id} data-low={pos[1] > box.h * 0.7}
                        style={{ "--x": pos[0] / box.w, "--y": pos[1] / box.h } as React.CSSProperties}>
                        <span className={styles.plate}><i />{names[id][kind === "wide" ? 0 : 1]}</span>
                        {tag && <span className={styles.tag}>{tag}</span>}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <p className={styles.note}>An illustrative request on the demo company&rsquo;s routing map. A pilot measures your own.</p>
      </div>
    </section>
  );
}
