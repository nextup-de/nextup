"use client";
// The manager's Dashboard (MET D19): the wait ledger per unit and role against a baseline. Every number is
// DashboardData: from the log on the server, or - without a database - built here from the browser's own log
// with the same pure functions. Six tiles open in place with a month-by-month view; no person row, list or link.
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { sectionTabsFor } from "@/config/nav";
import { BaselineDialog } from "@/components/dashboard/shared/BaselineDialog";
import { BreakdownCard, TooFewToShow } from "@/components/dashboard/shared/BreakdownCard";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { DeptChip } from "@/components/ui/elements";
import { barHeights, dashboardFromInput, shares, tileViews, trendPaths, trendPoints, type TileView } from "@/features/metrics/dashboard";
import { breakdownCsv, csvFileName } from "@/features/metrics/csv";
import { ledgerInputFromState } from "@/features/metrics/from-state";
import type { DashboardData, TileId } from "@/features/metrics/types";
import { useFormat, useLocale, useT } from "@/i18n/client";
import { exportDashboardCsvAction } from "@/server/actions/metrics";
import s from "./DashboardBoard.module.css";
import { personHrefByName } from "@/features/people/links";

type Kind = "30d" | "quarter" | "golive";
type Menu = "unit" | "period" | null;

const STATUS_KEY = {
  open: "metrics.stageOpen", discussion: "metrics.stageDiscussion", decided: "metrics.stageDecided",
  asked: "metrics.stageAsked", building: "metrics.stageBuilding", shipped: "metrics.stageShipped",
} as const;
const PAY_KEY = { better: "metrics.payBetter", worse: "metrics.payWorse", same: "metrics.paySame", "not measured": "metrics.payMeasuring" } as const;
const ANSWER_COLORS = ["var(--nh-brand)", "var(--nh-progress-doing)", "var(--nh-brand-line)", "var(--nh-mute-2)", "var(--nh-line-2)"];

function Close({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <button type="button" className={s.close} onClick={onClose} title={t("common.close")} aria-label={t("common.close")}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  );
}

export function DashboardBoard({ data: fromServer, slug, kind: servedKind, unitId: servedUnit }: {
  data: DashboardData | null; slug: string | null; kind: Kind; unitId: string | null;
}) {
  const { S, log, seed, ready, flag, showToast, tenant, sampleData, role, serverMode } = useDemo();
  const tabbed = sectionTabsFor("dashboard", { role, serverMode }).length > 1; // the strip under the bar already names this page
  // The sample data exists only in this browser, so its numbers are built here too.
  const served = sampleData ? null : fromServer;
  const t = useT();
  const fmt = useFormat();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState<TileId | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [view, setView] = useState<"unit" | "role">("unit");
  const [dialog, setDialog] = useState(false);
  const [localKind, setLocalKind] = useState<Kind>(servedKind);
  const [localUnit, setLocalUnit] = useState<string | null>(servedUnit);

  const kind = served ? servedKind : localKind;
  const unitId = served ? servedUnit : localUnit;

  const data = useMemo<DashboardData | null>(() => {
    if (served) return served;
    if (!ready) return null;
    return dashboardFromInput(ledgerInputFromState(S, log, seed, S.day, true), localKind, localUnit, null, false);
  }, [served, ready, S, log, seed, localKind, localUnit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); setMenu(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tiles = useMemo(() => (data ? tileViews(data, t) : []), [data, t]);
  if (!data) return <PageSkeleton kind="dashboard" delay />;

  const go = (nextKind: Kind, nextUnit: string | null) => {
    setMenu(null);
    if (!served) { setLocalKind(nextKind); setLocalUnit(nextUnit); return; }
    const q = new URLSearchParams();
    if (nextKind !== "30d") q.set("period", nextKind);
    if (nextUnit) q.set("unit", nextUnit);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const rows = view === "unit" ? data.units : data.roles;
  const exportCsv = async () => {
    let name: string;
    let body: string;
    if (served && slug) {
      const r = await exportDashboardCsvAction(slug, { kind, unitId }, view).catch(() => null);
      if (!r || "error" in r) { showToast(t("metrics.dashExportFailed")); return; }
      ({ name, body } = r);
    } else {
      name = csvFileName(view === "role" ? "roles" : "units", tenant.slug, data.fromDate, data.toDate);
      body = breakdownCsv(rows, locale, t);
    }
    const url = URL.createObjectURL(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    showToast(t("metrics.dashExported", { n: rows.length }));
  };

  // ── lead line ──
  const day = (iso: string | null, n: number) => (iso ? fmt.date(iso, "day") : t("metrics.dashDay", { n }));
  const lead = [
    `${day(data.fromDate, data.period.from)} - ${day(data.toDate, data.period.to)}`,
    data.baseline
      ? t("metrics.dashLeadBaseline", { from: day(data.baseline.fromDate, data.baseline.fromDay), to: day(data.baseline.toDate, data.baseline.toDay) })
      : t("metrics.dashLeadNoBaseline"),
    t("metrics.dashLeadCases", { count: data.caseCount }),
    ...(data.demoClock ? [t("metrics.dashLeadSimulated")] : []),
  ].join(" · ");

  const unitLabel = unitId ? data.units.find((u) => u.id === unitId)?.label ?? t("metrics.dashUnitAll") : t("metrics.dashUnitAll");
  const periodLabel = t(kind === "30d" ? "metrics.dashPeriod30d" : kind === "quarter" ? "metrics.dashPeriodQuarter" : "metrics.dashPeriodGolive");
  const canBaseline = served !== null && slug !== null;

  // ── trend ──
  const trend = data.trend;
  const yMax = Math.max(1, ...trend.map((m) => m.raised));
  const lines = (["raised", "answered", "onTime"] as const).map((k) => ({ k, paths: trendPaths(trendPoints(trend.map((m) => m[k]), yMax)) }));
  const stepLabel = (i: number) => (i === trend.length - 1 ? t("metrics.bucketNow") : t("metrics.bucketAgo", { n: trend.length - 1 - i }));

  // ── stages, answers ──
  const stageH = barHeights(data.stages.map((x) => x.open), 6);
  const openTotal = data.stages.reduce((a, x) => a + x.open, 0);
  const answerList = [
    ["metrics.answersYes", data.answers.yes], ["metrics.answersYesProject", data.answers.yesProject], ["metrics.answersQuestion", data.answers.question],
    ["metrics.answersHanded", data.answers.handed], ["metrics.answersNo", data.answers.no],
  ] as const;
  const answerTotal = answerList.reduce((a, [, n]) => a + n, 0);
  const answerPct = shares(answerList.map(([, n]) => n));

  const projects = flag("projects") ? S.projects.filter((p) => p.verdict !== null).slice(0, 8) : [];
  const sel: TileView | undefined = open ? tiles.find((x) => x.id === open) : undefined;

  const tileCard = (v: TileView, i: number) => {
    const h = barHeights(v.months, 10);
    return (
      <button key={v.id} type="button" className={s.tile} onClick={() => setOpen(v.id)} data-testid={`dashboard-tile-${v.id}`} style={{ animationDelay: 60 + i * 50 + "ms" }}>
        <span className={s.tileLabel}>{v.label}</span>
        {v.hidden ? <TooFewToShow /> : (
          <>
            <span className={s.tileValue}>{v.value}</span>
            <span className={s.tileSub}>{v.sub || " "}</span>
            <span className={s.tileBase}>
              {v.baselineLine}
              {v.delta && <span className={s.delta} data-tone={v.tone ?? undefined}> {v.delta}</span>}
            </span>
            {v.aiOffLine && <span className={s.tileSub}>{v.aiOffLine}</span>}
            <span className={s.bars} aria-hidden="true">
              {v.months.map((_, j) => <span key={j} className={s.bar} data-base={data.trend[j]?.baseline ? "true" : undefined} style={{ height: h[j] + "%" }} />)}
            </span>
          </>
        )}
      </button>
    );
  };

  return (
    <div className={s.root} data-testid="dashboard-board">
      {(open || menu) && <div className={s.scrim} onClick={() => { setOpen(null); setMenu(null); }} aria-hidden="true" />}
      <div className={s.page}>
        <div className={s.titleRow}>
          <div className={s.titleCol}>
            <h1 className={tabbed ? "nh-sr" : s.h1}>{t("metrics.dashTitle")}</h1>
            <p className={s.lead} data-testid="dashboard-lead">{lead}</p>
          </div>
          <div className={s.controls}>
            <div className={s.menuWrap}>
              <button type="button" className={s.pill} aria-haspopup="menu" aria-expanded={menu === "unit"} aria-label={t("metrics.dashUnitLabel")} onClick={() => setMenu(menu === "unit" ? null : "unit")} data-testid="dashboard-unit-menu">{unitLabel} ▾</button>
              {menu === "unit" && (
                <div className={s.menu} role="menu">
                  <button type="button" role="menuitemradio" aria-checked={unitId === null} className={s.menuItem} onClick={() => go(kind, null)}>{t("metrics.dashUnitAll")}</button>
                  {data.units.map((u) => (
                    <button key={u.id} type="button" role="menuitemradio" aria-checked={unitId === u.id} className={s.menuItem} style={{ paddingLeft: 12 + u.depth * 14 }} onClick={() => go(kind, u.id)}>{u.label}</button>
                  ))}
                </div>
              )}
            </div>
            <div className={s.menuWrap}>
              <button type="button" className={s.pill} aria-haspopup="menu" aria-expanded={menu === "period"} aria-label={t("metrics.dashPeriodLabel")} onClick={() => setMenu(menu === "period" ? null : "period")} data-testid="dashboard-period-menu">{periodLabel} ▾</button>
              {menu === "period" && (
                <div className={s.menu} role="menu">
                  <button type="button" role="menuitemradio" aria-checked={kind === "30d"} className={s.menuItem} onClick={() => go("30d", unitId)}>{t("metrics.dashPeriod30d")}</button>
                  <button type="button" role="menuitemradio" aria-checked={kind === "quarter"} className={s.menuItem} onClick={() => go("quarter", unitId)}>{t("metrics.dashPeriodQuarter")}</button>
                  <button type="button" role="menuitemradio" aria-checked={kind === "golive"} className={s.menuItem} disabled={!data.baseline} title={data.baseline ? undefined : t("metrics.dashPeriodGoliveNeeds")} onClick={() => go("golive", unitId)}>{t("metrics.dashPeriodGolive")}</button>
                  {canBaseline && <button type="button" role="menuitem" className={s.menuItem} onClick={() => { setMenu(null); setDialog(true); }} data-testid="dashboard-baseline-open">{t("metrics.dashPeriodBaseline")}</button>}
                </div>
              )}
            </div>
            <button type="button" className={s.pillGrey} onClick={() => void exportCsv()} data-testid="dashboard-export">{t("metrics.dashExport")}</button>
          </div>
        </div>

        <div className={s.tiles}>{tiles.map(tileCard)}</div>

        {sel && !sel.hidden && (
          <div className={s.overlay} role="dialog" aria-label={sel.label} data-testid="dashboard-detail">
            <div className={s.overlayHead}>
              <div className={s.titleCol}>
                <h3 className={s.overlayTitle}><span>{sel.value}</span> <span className={s.muted}>{sel.label}</span></h3>
                <span className={s.note}>{sel.note}</span>
                {sel.provenance && <span className={s.note} data-testid="dashboard-provenance">{sel.provenance}</span>}
              </div>
              <Close onClose={() => setOpen(null)} />
            </div>
            <div className={s.overlayGrid}>
              <div className={s.panel}>
                <span className={s.panelTitle}>{t("metrics.overlayMonthByMonth")} <span className={s.legend}>■ {t("metrics.overlayBaselineMonths")} <span className={s.legendNow}>■ {t("metrics.overlayNow")}</span></span></span>
                <div className={s.months}>
                  {(() => {
                    const mh = barHeights(sel.months, 4);
                    return sel.months.map((m, j) => (
                      <div key={j} className={s.month}>
                        <span className={s.monthVal}>{m}</span>
                        <span className={s.monthBar} data-base={data.trend[j]?.baseline ? "true" : undefined} style={{ height: mh[j] + "%" }} />
                        <span className={s.note}>{stepLabel(j)}</span>
                      </div>
                    ));
                  })()}
                </div>
                <span className={s.note}>{t(data.demoClock ? "metrics.bucketCaptionDemo" : "metrics.bucketCaptionWd")}</span>
              </div>
              <div className={s.panel}>
                <span className={s.panelTitle}>{t("metrics.overlayByUnit")}</span>
                {sel.split === null && <span className={s.note}>{t("metrics.overlayNoSplit")}</span>}
                {sel.split?.map((r) => (
                  <div key={r.id} className={s.splitRow}>
                    <span className={s.rowName} style={{ paddingLeft: r.depth * 14 }}><DeptChip name={r.label} /></span>
                    {r.value === null ? <TooFewToShow inline /> : (
                      <>
                        <span className={s.track}><span className={s.fill} style={{ width: r.share + "%" }} /></span>
                        <span className={s.num}>{r.value}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {data.caseCount === 0 && !data.scopeHidden && <p className={s.empty}>{t("metrics.dashEmpty")}</p>}

        <div className={s.pair}>
          <section className={s.card2} data-testid="dashboard-trend">
            <h3 className={s.cardTitle}>{t("metrics.trendTitle")}</h3>
            {data.scopeHidden ? <TooFewToShow /> : (
              <>
                <div className={s.legendRow}>
                  {(["raised", "answered", "onTime"] as const).map((k, i) => (
                    <span key={k} className={s.legendItem}><span className={s.swatch} data-line={i} />{t(k === "raised" ? "metrics.trendRaised" : k === "answered" ? "metrics.trendAnswered" : "metrics.trendOnTime")}</span>
                  ))}
                </div>
                <div className={s.chart}>
                  <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {lines.map(({ k, paths }, i) => <path key={k} d={paths.line} fill="none" className={s.line} data-line={i} vectorEffect="non-scaling-stroke" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />)}
                  </svg>
                </div>
                <div className={s.steps}>
                  {trend.map((m, i) => <span key={i} className={s.step} data-base={m.baseline ? "true" : undefined}>{stepLabel(i)}</span>)}
                </div>
                <div className={s.table} role="table" aria-label={t("metrics.trendTable")}>
                  <div className={s.tr3} role="row" data-head="true">
                    <span role="columnheader">{t("metrics.trendStep")}</span><span className={s.num} role="columnheader">{t("metrics.trendRaised")}</span>
                    <span className={s.num} role="columnheader">{t("metrics.trendAnswered")}</span><span className={s.num} role="columnheader">{t("metrics.trendOnTime")}</span>
                  </div>
                  {trend.map((m, i) => (
                    <div key={i} className={s.tr3} role="row" data-base={m.baseline ? "true" : undefined}>
                      <span role="cell">{stepLabel(i)}</span><span className={s.num} role="cell">{m.raised}</span>
                      <span className={s.num} role="cell">{m.answered}</span><span className={s.num} role="cell">{m.onTime}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className={s.card2} data-testid="dashboard-stages">
            <h3 className={s.cardTitle}>{t("metrics.stageTitle")} <span className={s.muted}>{data.stages.length ? t("metrics.stageSub", { n: openTotal }) : ""}</span></h3>
            {data.scopeHidden ? <TooFewToShow /> : data.stages.length === 0 ? <span className={s.empty}>{t("metrics.stageEmpty")}</span> : (
              <div className={s.stageBars}>
                {data.stages.map((x, i) => {
                  const key = STATUS_KEY[x.status as keyof typeof STATUS_KEY];
                  const running = x.status === "building";
                  return (
                    <div key={x.status} className={s.stage}>
                      <span className={s.stageN}>{x.open}</span>
                      <span className={s.stageBar} data-running={running ? "true" : undefined} style={{ height: stageH[i] + "%" }} />
                      <span className={s.stageName}>{key ? t(key) : x.status}</span>
                      <span className={s.note}>{running ? t("metrics.stageRunning") : x.avgDays === null ? "" : t("metrics.stageAvg", { n: x.avgDays })}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <BreakdownCard units={data.units} roles={data.roles} view={view} onView={setView} demoClock={data.demoClock} />

        <div className={s.pair}>
          <section className={s.card2} data-testid="dashboard-answers">
            <h3 className={s.cardTitle}>{t("metrics.answersTitle")} <span className={s.muted}>{answerTotal ? t("metrics.answersCount", { n: answerTotal }) : ""}</span></h3>
            {data.scopeHidden ? <TooFewToShow /> : answerTotal === 0 ? <span className={s.empty}>{t("metrics.answersEmpty")}</span> : (
              <>
                <div className={s.stack}>
                  {answerList.map(([k, n], i) => <span key={k} style={{ flex: `${n} 1 0`, background: ANSWER_COLORS[i] }} />)}
                </div>
                {answerList.map(([k, n], i) => (
                  <div key={k} className={s.answerRow}>
                    <span className={s.legendItem}><span className={s.dot} style={{ background: ANSWER_COLORS[i] }} />{t(k)}</span>
                    <span className={s.num}>{n}</span><span className={s.num}>{answerPct[i]}%</span>
                  </div>
                ))}
              </>
            )}
          </section>

          {flag("projects") && (
            <section className={s.card2} data-testid="dashboard-payoff">
              <h3 className={s.cardTitle}>{t("metrics.payTitle")} <span className={s.muted}>{t("metrics.paySub")}</span></h3>
              {projects.length === 0 ? <span className={s.empty}>{t("metrics.payEmpty")}</span> : projects.map((p) => (
                <div key={p.id} className={s.answerRow}>
                  <span className={s.rowName}>{p.title}</span>
                  <span className={s.num}>{p.verdict ? t(PAY_KEY[p.verdict]) : ""}</span>
                </div>
              ))}
            </section>
          )}
        </div>

      </div>
      {dialog && slug && <BaselineDialog slug={slug} demoClock={data.demoClock} current={data.baseline} onClose={() => setDialog(false)} onSaved={() => { setDialog(false); showToast(t("metrics.blSaved")); }} />}
    </div>
  );
}
