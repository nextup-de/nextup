"use client";
// The Dashboard: the Claude Design handoff "Dashboard", its markup and classes 1:1 (dc-convert ->
// DashboardBoard.module.css). How ideas move from raised to in progress: how fast they are decided,
// where the waiting goes, and whether shipped work paid off. Every widget opens in place as an overlay
// (its slot keeps its height so the page does not jump); ✕, the backdrop or Escape puts it back.
// The seed holds the stall reasons, the ledger, the outcomes and the KPI headlines; the rest is the
// handoff's demo data in dashboardPreview.ts until the log can count it (DASHBOARD-FOR-KEVIN.txt).
// Demo data off: every widget shows its empty line and the KPIs read "—".
import Link from "next/link";
import { useEffect, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { barHeights, pastPromise, ringOffset, shares, trendPaths, trendPoints } from "@/features/metrics/dashboard";
import { deliveredCount, stallSplit } from "@/features/metrics/overview";
import { ini } from "@/lib/utils/format";
import {
  ANSWERS, BEFORE, BY_DEPT, KPIS, LEADS, MONTHS7, RUNNING, SCORED, SHIPPED_BY, SHIPPED_THIS_YEAR, STAGES, STALL_DETAIL, SUPPORTED,
  TREND, TREND_FIRST_LONG, TREND_MAX, TREND_MONTHS, TREND_YEAR, type KpiId, type KpiUnit, type ListRow,
} from "./dashboardPreview";
import s from "./DashboardBoard.module.css";

const KPI_COUNT = 4; // the handoff's kpiCount: "4" shows the first four, "6" all six
const STAGES_LEFT = true; // the handoff's topRowOrder, default "Stages left"
const ALL = "All departments";

type ListKey = "l:sup" | "l:ai" | "l:dep";
type Widget = "trend" | "stage" | "out" | "pay" | "why" | ListKey;
type Open = Widget | `k:${KpiId}` | null;

const round1 = (v: number) => Math.round(v * 10) / 10;
const FMT: Record<KpiUnit, (v: number) => string> = {
  days: (v) => round1(v) + "d", count: (v) => String(v), euroK: (v) => "€" + v + "k", daysSaved: (v) => v + " d", pct: (v) => v + "%",
  hours: (v) => (v >= 48 ? Math.round(v / 24) + " d" : v + " h"),
};
const RESULT_TONE: Record<string, string> = { "As promised": "blue", "Beat it": "green", Short: "short", Running: "grey" };

function Close({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className={s.closeAll2} onClick={onClose} title="Close" aria-label="Close">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" strokeWidth="2.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  );
}

// A row that names a case (or a person) links there; anything else stays a plain row.
function Row({ to, className, style, children }: { to: string | null; className: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return to ? <Link href={to} className={className} style={style} onClick={(e) => e.stopPropagation()}>{children}</Link> : <div className={className} style={style}>{children}</div>;
}

export function DashboardBoard() {
  const { seed, D, demo, ready, href } = useDemo();
  const [open, setOpen] = useState<Open>(null);
  const [ph, setPh] = useState(0); // the opened widget's height, kept by its slot
  const [menu, setMenu] = useState(false);
  const [scope, setScope] = useState(ALL);
  const [hov, setHov] = useState<string | null>(null);
  const [month, setMonth] = useState(TREND.length - 1);
  const [stage, setStage] = useState(3);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); setMenu(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!ready) return <PageSkeleton kind="dashboard" delay />;

  const P = seed.promiseDays, M = seed.metrics, L = seed.ledger;
  const empty = !demo;
  const dash = (v: string | number) => (demo ? String(v) : "—");
  const close = () => setOpen(null);
  // Open a widget from anything inside it: its slot keeps the card's height while it floats.
  const openFrom = (k: Widget, el: Element) => { setPh((el.closest("[data-w]") ?? el).getBoundingClientRect().height); setOpen(k); };
  const cardClick = (k: Widget) => (e: React.MouseEvent<HTMLElement>) => { if (open !== k) openFrom(k, e.currentTarget); };
  const slot = (k: Widget) => (open === k ? { minHeight: ph } : undefined);
  const on = (k: Widget) => (open === k ? "true" : undefined);
  const enter = (k: string) => () => setHov(k);
  const hovOff = () => setHov(null);
  const caseHref = (title: string) => { const c = D.cases.find((x) => x.title === title); return c ? href("/cases/" + c.id) : null; };
  const personHref = (name: string) => (seed.people.some((x) => x.name === name) ? href("/people/" + encodeURIComponent(name)) : null);

  // ── KPIs ──
  const headline: Record<KpiId, { value: string; delta: string; sub?: string }> = {
    dec: { value: M.ideaToDecision.now, delta: M.ideaToDecision.was },
    ship: { value: String(SHIPPED_THIS_YEAR), delta: M.shippedWas, sub: M.stoppedEarly + " stopped early" },
    val: { value: M.valueBooked.now, delta: M.valueBooked.delta, sub: M.valueBooked.sub },
    saved: { value: M.waitingDaysSaved.now, delta: "vs old route" },
    within: { value: L.withinPromise, delta: L.withinPromiseWas },
    first: { value: L.firstAnswer, delta: L.firstAnswerWas },
  };
  const kpis = KPIS.slice(0, KPI_COUNT);
  const kSel = open?.startsWith("k:") ? KPIS.find((k) => "k:" + k.id === open) ?? null : null;

  // ── ideas raised per month ──
  const trend = empty ? [] : TREND;
  const pts = trendPoints(trend.map(([v]) => (demo ? v : 0)), TREND_MAX);
  const paths = trendPaths(pts);
  const trendOpen = open === "trend";
  const hi = hov?.startsWith("t:") ? +hov.slice(2) : -1;
  const tip = demo && hi >= 0 && trend[hi] ? (() => {
    const [r, a, w, ap] = trend[hi], p = pts[hi], d = hi ? r - trend[hi - 1][0] : null;
    return {
      p, m: TREND_MONTHS[hi] + " " + TREND_YEAR, tx: hi === 0 ? "-12%" : hi === pts.length - 1 ? "-88%" : "-50%",
      delta: d == null ? "first month" : (d >= 0 ? "+" : "") + d + " vs " + TREND_MONTHS[hi - 1], first: d == null,
      rows: [["Raised", String(r)], ["Answered", a + " of " + r], ["Within 5 days", Math.round((w / a) * 100) + "%"], ["Approved or piloted", String(ap)]],
    };
  })() : null;
  const pickMonth = (i: number) => (e: React.MouseEvent<HTMLElement>) => { e.stopPropagation(); setMonth(i); if (!trendOpen) openFrom("trend", e.currentTarget); };

  // ── ideas per stage ──
  const stages = empty ? [] : STAGES;
  const stageOpen = open === "stage";
  const openN = stages.reduce((a, x) => a + x.n, 0);
  const stageH = barHeights(stages.map((x) => (demo ? x.n : 0)), 0);
  const sel = stages[Math.min(stage, stages.length - 1)];
  const pickStage = (i: number) => (e: React.MouseEvent<HTMLElement>) => { e.stopPropagation(); setStage(i); if (!stageOpen) openFrom("stage", e.currentTarget); };

  // ── how team leads answered ──
  const answers = empty ? [] : ANSWERS;
  const answerPct = shares(answers.map((o) => o.n));
  const answerTotal = answers.reduce((a, o) => a + o.n, 0);

  // ── did shipped work pay off ──
  const payOpen = open === "pay";
  const payRows = [
    ...D.outcomes.map((o) => ({ t: o.title, p: o.promised, d: o.actual, res: o.verdict as string, ...(SHIPPED_BY[o.title] ?? { team: "", when: "" }) })),
    ...(payOpen && D.outcomes.length ? RUNNING.map((r) => ({ t: r.title, p: r.promised, d: r.actual, res: "Running", team: r.team, when: r.when })) : []),
  ].slice(0, payOpen ? undefined : 4);

  // ── where the waiting goes ──
  const split = stallSplit(D.stall);
  const stallMax = Math.max(1, ...D.stall.map((x) => x.days));
  const within = parseFloat(L.withinPromise) / 100;

  // ── the three lists ──
  const lists: { key: ListKey; title: string; sub: string; rows: ListRow[]; emptyText: string }[] = [
    { key: "l:sup", title: "Most supported", sub: "From the feed", rows: SUPPORTED, emptyText: "No supporters yet. Ideas people back in the feed show up here." },
    { key: "l:ai", title: "Highest AI score", sub: "Value, feasibility, cost, fit, risk", rows: SCORED, emptyText: "No ideas scored yet. Each idea gets an AI score as soon as it is raised." },
    { key: "l:dep", title: "Ideas by department", sub: "Raised this quarter", rows: BY_DEPT, emptyText: "No department has raised an idea yet." },
  ];
  const scopes = [ALL, ...seed.depts.map((d) => d.name)];

  const trendCard = (
    <div className={s.div30} style={{ ...slot("trend"), order: STAGES_LEFT ? 2 : 1 }}>
      <div className={`${s.click} ${s.card}`} data-w="trend" data-open={on("trend")} onClick={cardClick("trend")}>
        <div className={s.div31}>
          <div className={s.div32}>
            <h3 className={s.h32}>Ideas raised per month</h3>
            <span className={s.m2}>{trend.length ? (demo ? (trendOpen ? "Tap a month or a row to compare" : `Last ${trend.length} months · up from ${trend[0][0]} in ${TREND_FIRST_LONG}`) : "measured in pilot") : "No ideas raised yet"}</span>
          </div>
          {trendOpen && <Close onClose={close} />}
        </div>
        <div className={s.div33}>
          <div className={s.div34}>
            {[80, 60, 40, 20, 0].map((v) => <span key={v} className={s.v4} style={{ top: 100 - (v / TREND_MAX) * 100 + "%" }}>{demo ? v : ""}</span>)}
          </div>
          <div className={s.div34}>
            {[80, 60, 40, 20, 0].map((v) => <div key={v} className={s.div35} style={{ top: 100 - (v / TREND_MAX) * 100 + "%" }} />)}
            <div className={s.div36}>
              <svg className={s.svg} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <path d={paths.area} fill="#e8f1ff" />
                <path d={paths.line} fill="none" stroke="#007aff" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              {pts.map((p, i) => <div key={i} className={s.pick2} onClick={pickMonth(i)} onMouseEnter={enter("t:" + i)} onMouseLeave={hovOff} style={{ left: p.x + "%" }} />)}
              {tip && <div className={s.div37} style={{ left: tip.p.x + "%", top: tip.p.y + "%" }} />}
              {pts.map((p, i) => (
                <div key={i}>
                  <div className={s.pick3} onClick={pickMonth(i)} onMouseEnter={enter("t:" + i)} onMouseLeave={hovOff} style={{ left: p.x + "%", top: p.y + "%" }}>
                    <span className={s.span5} data-big={(trendOpen && month === i) || hi === i ? "true" : undefined} data-on={trendOpen && month === i ? "true" : undefined} />
                  </div>
                  <span className={s.v5} style={{ left: p.x + "%", top: p.y + "%" }}>{demo ? p.v : ""}</span>
                </div>
              ))}
            </div>
          </div>
          {tip && (
            <div className={s.div38} style={{ left: `calc(28px + (100% - 28px) * ${tip.p.x / 100})`, top: `calc((100% - 24px) * ${tip.p.y / 100})`, transform: `translate(${tip.tx},calc(-100% - 20px))` }}>
              <div className={s.div39}><span className={s.m3}>{tip.m}</span><span className={s.delta2} data-first={tip.first ? "true" : undefined}>{tip.delta}</span></div>
              {tip.rows.map(([k, v]) => <div key={k} className={s.div40}><span className={s.m}>{k}</span><span className={s.v6}>{v}</span></div>)}
            </div>
          )}
          <div />
          <div className={s.div34}>
            {pts.map((p, i) => <span key={i} className={s.m4} data-on={trendOpen && month === i ? "true" : undefined} style={{ left: p.x + "%" }}>{TREND_MONTHS[i]}</span>)}
          </div>
        </div>
        {trendOpen && (
          <div className={s.div41} role="table" aria-label="Ideas per month">
            <div className={s.div42} role="row">
              <span role="columnheader">Month</span><span className={s.raised} role="columnheader">Raised</span><span className={s.raised} role="columnheader">Answered</span>
              <span className={s.raised} role="columnheader">Within 5 days</span><span className={s.raised} role="columnheader">Approved or piloted</span>
            </div>
            {trend.map(([r, a, w, ap], i) => ({ r, a, w, ap, i })).reverse().map(({ r, a, w, ap, i }) => (
              <div key={i} className={s.pick4} role="row" data-on={month === i ? "true" : undefined} onClick={pickMonth(i)}>
                <span className={s.v} role="cell">{TREND_MONTHS[i]} {TREND_YEAR}</span><span className={s.raised2} role="cell">{dash(r)}</span>
                <span className={s.raised} role="cell">{dash(a)}</span><span className={s.raised} role="cell">{dash(Math.round((w / a) * 100) + "%")}</span><span className={s.raised} role="cell">{dash(ap)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const stageCard = (
    <div className={s.div43} style={{ ...slot("stage"), order: STAGES_LEFT ? 1 : 2 }}>
      <div className={`${s.click} ${s.card}`} data-w="stage" data-open={on("stage")} onClick={cardClick("stage")}>
        <div className={s.div31}>
          <div className={s.div32}>
            <h3 className={s.h32}>Ideas per stage</h3>
            <span className={s.m2}>{stages.length ? (stageOpen ? "Tap a bar to see its ideas" : `${dash(openN)} open ideas · average days in each stage`) : "Nothing in motion yet"}</span>
          </div>
          {stageOpen && <Close onClose={close} />}
        </div>
        {!stages.length && <span className={s.span6}>No ideas raised yet. Each one shows up here as it moves from Raised to In progress.</span>}
        {stages.length > 0 && (
          <>
            <div className={s.div44}>
              {stages.map((x, i) => {
                const over = pastPromise(x.days, P, x.running);
                const isSel = stageOpen && stage === i;
                return (
                  <div key={x.name} className={s.pick5} data-dim={stageOpen && !isSel ? "true" : undefined} onClick={pickStage(i)} onMouseEnter={enter("s:" + i)} onMouseLeave={hovOff}>
                    {demo && hov === "s:" + i && (
                      <div className={s.div45} data-edge={i === 0 ? "start" : i === stages.length - 1 ? "end" : undefined}>
                        <span className={s.m3}>{x.name}</span>
                        <div className={s.div46}><span className={s.m}>Ideas</span><span className={s.v6}>{x.n} · {Math.round((x.n / openN) * 100)}% of open</span></div>
                        <div className={s.div46}><span className={s.m}>{x.running ? "Running for" : "Avg wait"}</span><span className={s.v6} data-tone={over ? "late" : undefined}>{x.days} d{x.running ? " avg" : ""}</span></div>
                        <div className={s.div46}><span className={s.m}>Longest</span><span className={s.v6}>{x.ideas[0]?.days ?? 0} d</span></div>
                      </div>
                    )}
                    <span className={s.value2}>{dash(x.n)}</span>
                    <div className={s.div47} data-ring={isSel ? "true" : undefined} style={{ color: x.color }}>
                      <div className={s.div48} style={{ height: stageH[i] + "%", background: x.color, animationDelay: 120 + i * 70 + "ms" }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={s.div49}>
              {stages.map((x, i) => (
                <div key={x.name} className={s.pick6} onClick={pickStage(i)}>
                  <span className={s.name2}>{x.name}</span>
                  <span className={s.days} data-tone={pastPromise(x.days, P, x.running) ? "late" : undefined}>{demo ? (x.running ? `${x.days} d running` : `${x.days} d avg`) : "measured in pilot"}</span>
                </div>
              ))}
            </div>
            {stageOpen && sel && (
              <div className={s.div50}>
                <div className={s.div51}>
                  <span className={s.name3}>{sel.name} · {sel.n} ideas</span>
                  <span className={s.span7}>Longest in stage first</span>
                </div>
                {sel.ideas.map((it, j) => (
                  <Row key={it.title} to={caseHref(it.title)} className={s.a} style={{ animationDelay: 40 + j * 50 + "ms" }}>
                    <div className={s.div52}><span className={s.title}>{it.title}</span><span className={s.m2}>{it.who}</span></div>
                    <span className={s.d} data-tone={pastPromise(it.days, P, sel.running) ? "late" : undefined}>{it.days} d {sel.running ? "running" : "in stage"}</span>
                  </Row>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className={s.root}>
      {open && <div className={s.closeAll} onClick={close} aria-hidden="true" />}
      <div className={s.div7}>
        <div className={s.div8}>
          <div className={s.div9}><h1 className={s.dashboard2}>Dashboard</h1></div>
          <div className={s.div10}>
            {menu && <div className={s.closeMenu} onClick={() => setMenu(false)} aria-hidden="true" />}
            <button type="button" className={s.toggleMenu} onClick={() => setMenu(!menu)} aria-expanded={menu} aria-haspopup="menu">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
              {scope}
            </button>
            {menu && (
              <div className={s.div11} role="menu">
                {scopes.map((l) => (
                  <button key={l} type="button" role="menuitemradio" aria-checked={l === scope} className={s.pick} data-on={l === scope ? "true" : undefined} onClick={() => { setScope(l); setMenu(false); }}>
                    <span className={s.label}>{l}</span><span className={s.check}>{l === scope ? "✓" : ""}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={s.div12}>
          {kpis.map((k, i) => {
            const h = headline[k.id], hs = barHeights(k.vals, 12);
            return (
              <button key={k.id} type="button" className={s.toggle} onClick={() => setOpen(open === "k:" + k.id ? null : `k:${k.id}`)} style={{ animationDelay: 80 + i * 60 + "ms" }}>
                <span className={s.label2}>{k.label}</span>
                <div className={s.div13}>
                  <span className={s.value}>{dash(h.value)}</span>
                  {demo && <span className={s.delta}>{h.delta}</span>}
                </div>
                <span className={s.sub}>{demo ? h.sub ?? k.sub : "measured in pilot"}</span>
                <div className={s.div14}>
                  {k.vals.map((v, j) => {
                    const key = "b:" + k.id + ":" + j, hv = demo && hov === key;
                    return (
                      <div key={j} className={s.div15} onMouseEnter={enter(key)} onMouseLeave={hovOff}>
                        <div className={s.div16} data-pilot={demo && j >= BEFORE ? "true" : undefined} data-dim={demo && hov?.startsWith("b:" + k.id + ":") && !hv ? "true" : undefined}
                          style={{ height: (demo ? hs[j] : 30) + "%", animationDelay: 200 + j * 40 + "ms" }} />
                        {hv && <span className={s.span}><strong className={s.v}>{FMT[k.unit](v)}</strong> <span className={s.m}>{MONTHS7[j] + (j < BEFORE ? " · before" : "")}</span></span>}
                      </div>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
        {kSel && (() => {
          const bad = (v: number) => kSel.limit != null && v > kSel.limit;
          const mh = barHeights(kSel.vals, 4), sMax = Math.max(...kSel.split.map((x) => x[1]));
          return (
            <div className={s.div17} role="dialog" aria-label={kSel.label}>
              <div className={s.div18}>
                <div className={s.div9}>
                  <h3 className={s.h3}><span>{dash(headline[kSel.id].value)}</span> <span className={s.label3}>{kSel.label}</span></h3>
                  <span className={s.note}>{kSel.note}</span>
                </div>
                <Close onClose={close} />
              </div>
              <div className={s.div19}>
                <div className={s.div20}>
                  <div className={s.div21}>
                    <span className={s.monthByMonth}>Month by month</span>
                    <span className={s.span2}><span className={s.beforeNextup}><span className={s.span3} />Before NextUp</span><span className={s.beforeNextup}><span className={s.span4} />Since the pilot</span></span>
                  </div>
                  <div className={s.div22}>
                    {kSel.vals.map((v, i) => {
                      const tone = i < BEFORE ? "before" : bad(v) ? "late" : undefined;
                      return (
                        <div key={i} className={s.div23}>
                          <span className={s.v2} data-tone={tone === "late" ? "late" : undefined}>{dash(FMT[kSel.unit](v))}</span>
                          <div className={s.div24} data-tone={tone} style={{ height: (demo ? mh[i] : 4) + "%", animationDelay: 60 + i * 50 + "ms" }} />
                          <span className={s.m2}>{MONTHS7[i]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className={s.div25}>
                  <span className={s.splitTitle}>{kSel.splitTitle}</span>
                  {kSel.split.map(([name, v], i) => (
                    <div key={name} className={s.div26} style={{ animationDelay: 80 + i * 50 + "ms" }}>
                      <span className={s.name}>{name}</span>
                      <div className={s.div27}><div className={s.div28} data-tone={bad(v) ? "late" : undefined} style={{ width: (demo ? (v / sMax) * 100 : 0) + "%" }} /></div>
                      <span className={s.v3} data-tone={bad(v) ? "late" : undefined}>{dash(FMT[kSel.unit](v))}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        <div className={s.div29}>
          {trendCard}
          {stageCard}
        </div>

        <div className={s.div53}>
          <div className={s.div54}>
            <div className={s.div55} style={slot("out")}>
              <div className={`${s.click2} ${s.card}`} data-w="out" data-open={on("out")} onClick={cardClick("out")}>
                <div className={s.div31}>
                  <div className={s.div32}>
                    <h3 className={s.h32}>How team leads answered</h3>
                    <span className={s.m2}>{answers.length ? (open === "out" ? "Per team lead, this quarter" : `${dash(answerTotal)} answers this quarter`) : "No answers yet"}</span>
                  </div>
                  {open === "out" && <Close onClose={close} />}
                </div>
                {!answers.length && <span className={s.span6}>No answers yet. Approve, pilot, more info, route and decline are counted here once leads respond.</span>}
                {answers.length > 0 && (
                  <>
                    <div className={s.div56}>
                      {answers.map((o, i) => <div key={o.label} className={s.div57} style={{ flex: o.n + " 1 0", background: o.color, animationDelay: 200 + i * 60 + "ms" }} />)}
                    </div>
                    <div className={s.div55}>
                      {answers.map((o, i) => (
                        <div key={o.label} className={s.div58}>
                          <span className={s.label4}><span className={s.span8} style={{ background: o.color }} />{o.label}</span>
                          <span className={s.n}>{dash(o.n)}</span>
                          <span className={s.pct}>{demo ? answerPct[i] + "%" : ""}</span>
                        </div>
                      ))}
                    </div>
                    {open === "out" && (
                      <div className={s.div59}>
                        <div className={s.div60}>
                          <span>Team lead</span><span className={s.raised}>Answers</span><span className={s.raised}>Median</span><span className={s.raised}>Within 5 d</span><span>Answer mix</span>
                        </div>
                        {LEADS.map((l, i) => (
                          <Row key={l.name} to={personHref(l.name)} className={s.a2} style={{ animationDelay: 40 + i * 50 + "ms" }}>
                            <span className={s.span9}>
                              <span className={s.ini}>{ini(l.name)}</span>
                              <span className={s.span10}><span className={s.name4}>{l.name}</span><span className={s.dept}>{l.dept}</span></span>
                            </span>
                            <span className={s.raised2}>{dash(l.mix.reduce((a, b) => a + b, 0))}</span>
                            <span className={s.raised} data-tone={l.median > P ? "late" : undefined}>{dash(l.median + " d")}</span>
                            <span className={s.raised}>{dash(l.within)}</span>
                            <div className={s.div61}>
                              {l.mix.map((n, j) => <div key={j} title={`${ANSWERS[j].label}: ${n}`} style={{ flex: `${n} 1 0`, background: ANSWERS[j].color }} />)}
                            </div>
                          </Row>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className={s.div55} style={slot("pay")}>
              <div className={`${s.click3} ${s.card}`} data-w="pay" data-open={on("pay")} onClick={cardClick("pay")}>
                <div className={s.div31}>
                  <div className={s.div32}>
                    <h3 className={s.h32}>Did shipped work pay off</h3>
                    <span className={s.m2}>{payOpen ? "Ideas that shipped or are running, against what they promised" : "Ideas that shipped, against what they promised"}</span>
                  </div>
                  {payOpen && <Close onClose={close} />}
                </div>
                {!D.outcomes.length && <span className={s.span11}>Nothing shipped yet. Each idea in progress is checked against what it promised once it ships.</span>}
                {D.outcomes.length > 0 && (
                  <>
                    <div className={s.div62}>
                      <span className={s.value3}>{dash(M.valueBooked.now)}</span>
                      <span className={s.span12}>
                        booked so far: <strong className={s.n435k}>{M.valueBooked.delta}</strong> since the baseline, {M.valueBooked.sub}.{" "}
                        <strong className={s.n435k}>{deliveredCount(D.outcomes)} of {D.outcomes.length}</strong> shipped ideas met or beat their promise.
                      </span>
                    </div>
                    <div className={`${s.div55} ${s.payTable}`}>
                      <div className={s.div63}>
                        <span>Shipped</span>
                        {payOpen && <><span>Team</span><span>Shipped on</span></>}
                        <span className={s.promised}>Promised</span><span>Delivered</span><span className={s.raised}>Result</span>
                      </div>
                      {payRows.map((r, i) => (
                        <Row key={r.t} to={caseHref(r.t)} className={s.a3} style={{ animationDelay: (payOpen && i >= 4 ? (i - 4) * 60 : 0) + "ms" }}>
                          <span className={s.t}>{r.t}</span>
                          {payOpen && <><span className={s.team}>{r.team}</span><span className={s.team}>{r.when}</span></>}
                          <span className={`${s.team} ${s.promised}`}>{dash(r.p)}</span>
                          <span className={s.v}>{dash(r.d)}</span>
                          <span className={s.res} data-tone={RESULT_TONE[r.res]}>{r.res}</span>
                        </Row>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className={s.div43} style={slot("why")}>
            <div className={`${s.click4} ${s.card}`} data-w="why" data-open={on("why")} onClick={cardClick("why")}>
              <div className={s.div31}>
                <div className={s.div32}>
                  <h3 className={s.h32}>Where the waiting goes</h3>
                  <span className={s.m2}>{split ? split.total + " waiting days, tagged by reason · how fast people hear back" : "No waiting days tagged yet"}</span>
                </div>
                {open === "why" && <Close onClose={close} />}
              </div>
              {!split && <span className={s.span13}>Once cases move, each day of waiting is labelled: wrong department, not responsible, no time, or could not rank it. The split tells you whether the routing or the capacity is the problem.</span>}
              {split && (
                <div className={s.div64}>
                  <div className={s.div65}>
                    <div className={s.div66}>
                      <div className={s.div67}>
                        <div className={s.div68}>
                          <svg className={s.svg2} width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
                            <circle cx="38" cy="38" r="34" fill="none" stroke="#e3e8f0" strokeWidth="7" />
                            <circle className={s.circle} cx="38" cy="38" r="34" fill="none" stroke="#007aff" strokeWidth="7" strokeLinecap="round" strokeDasharray="213.6" strokeDashoffset={ringOffset(demo ? within : 0)} />
                          </svg>
                          <span className={s.within}>{dash(L.withinPromise)}</span>
                        </div>
                        <div className={s.div69}>
                          <span className={s.span14}>Answered within {P} days</span>
                          <span className={s.m2}>{demo ? L.withinPromiseWas : "measured in pilot"}</span>
                        </div>
                      </div>
                      <div className={s.div70}>
                        <span className={s.first}>{dash(L.firstAnswer)}</span>
                        <span className={s.span14}>Median to first answer</span>
                        <span className={s.m2}>{demo ? L.firstAnswerWas : "measured in pilot"}</span>
                      </div>
                    </div>
                    <div className={s.div55}>
                      {[["Escalated this quarter", L.escalated], ["Handed sideways", L.handedOver], ["Proposed owner overruled", L.overrides]].map(([label, v]) => (
                        <div key={label} className={s.div71}><span className={s.label5}>{label}</span><span className={s.v2}>{dash(v)}</span></div>
                      ))}
                    </div>
                  </div>
                  <div className={s.div72}>
                    <div className={s.div73}>
                      <div className={s.div74}>
                        <div className={s.div75} style={{ width: ((split.routing / split.total) * 100).toFixed(1) + "%" }} />
                        <div className={s.div76} />
                      </div>
                      <div className={s.div77}>
                        <span><strong className={s.n435k}>{dash(split.routing)} d routing</strong><span className={s.span15}> · the routing is wrong</span></span>
                        <span><strong className={s.capD}>{dash(split.total - split.routing)} d capacity</strong><span className={s.span15}> · time or priority</span></span>
                      </div>
                    </div>
                    <div className={s.div55}>
                      {split.parts.map((r, i) => {
                        const detail = STALL_DETAIL[r.reason];
                        return (
                          <div key={r.reason} className={s.div78}>
                            <div className={s.div79}>
                              <span className={s.reason}>{r.reason}</span>
                              <div className={s.div80}><div className={s.div81} data-routing={r.routing ? "true" : undefined} style={{ width: (r.days / stallMax) * 100 + "%", animationDelay: 200 + i * 60 + "ms" }} /></div>
                              <span className={s.label6}>{dash(r.days + " d")}</span>
                            </div>
                            {open === "why" && (
                              <div className={s.div82}>
                                <span className={s.desc}>{detail?.desc ?? r.note}</span>
                                {(detail?.ex ?? []).map(([t, d]) => (
                                  <Row key={t} to={caseHref(t)} className={s.a4}><span className={s.t2}>{t}</span><span className={s.d2}>{d}</span></Row>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={s.div83}>
          {lists.map((l) => {
            const isOpen = open === l.key;
            const rows = empty ? [] : l.rows;
            const shown = isOpen ? rows : rows.slice(0, 4);
            const openIt = (e: React.MouseEvent<HTMLElement>) => { if (!isOpen) openFrom(l.key, e.currentTarget); };
            return (
              <div key={l.key} style={slot(l.key)}>
                <div className={`${s.div84} ${s.card}`} data-w={l.key} data-open={on(l.key)}>
                  <div className={s.openIt} onClick={openIt}>
                    <div className={s.div69}><h3 className={s.h32}>{l.title}</h3><span className={s.m2}>{l.sub}</span></div>
                    {isOpen && <Close onClose={close} />}
                  </div>
                  {!rows.length && <div className={s.emptyText}>{l.emptyText}</div>}
                  <div className={s.div85}>
                    {shown.map((r, i) => (
                      <Row key={r.title} to={caseHref(r.title)} className={s.a5} style={{ animationDelay: (isOpen && i >= 4 ? (i - 4) * 50 : 0) + "ms" }}>
                        <div className={s.div86}>
                          <div className={s.div87}><span className={s.title2}>{r.title}</span><span className={s.right}>{r.right}</span></div>
                          <div className={s.div88}>
                            {r.pills.map((p) => <span key={p.label} className={s.label7} data-tint={p.tint}>{p.label}</span>)}
                            <span className={s.meta}>{r.meta}</span>
                          </div>
                        </div>
                      </Row>
                    ))}
                  </div>
                  {!isOpen && rows.length > 4 && <button type="button" className={s.openIt2} onClick={openIt}>Show all {rows.length}</button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
