"use client";
// The manager's Dashboard (MET D19): the wait ledger per unit and role against a baseline. Every number is
// DashboardData: from the log on the server, or - without a database - built here from the browser's own log
// with the same pure functions. Quiet (DESIGN_RULES §9): one row of controls, the tiles with value and change, and
// below one line each that opens - Trend, Answers, By unit and role, Load per desk. The baseline and where it comes
// from live in a tile's overlay. A section with nothing to say is not drawn; no person row, list or link.
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { BaselineDialog } from "@/components/dashboard/shared/BaselineDialog";
import { BreakdownCard } from "@/components/dashboard/shared/BreakdownCard";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { SavedOverlay, SavedTile } from "@/components/dashboard/shared/SavedPerYear";
import { DeskLoadCard } from "@/components/overload/DeskLoadCard";
import { DeptChip, Fold } from "@/components/ui/elements";
import { barHeights, dashboardFromInput, shares, tileViews, trendLabels, type TileView } from "@/features/metrics/dashboard";
import { breakdownCsv, csvFileName } from "@/features/metrics/csv";
import { ledgerInputFromState } from "@/features/metrics/from-state";
import type { DashboardData, TileId } from "@/features/metrics/types";
import { useLocale, useT } from "@/i18n/client";
import { shows } from "@/lib/utils/quiet";
import { exportDashboardCsvAction } from "@/server/actions/metrics";
import s from "./DashboardBoard.module.css";

type Kind = "30d" | "quarter" | "golive";
type Menu = "unit" | "period" | null;

const STATUS_KEY = {
  open: "metrics.stageOpen", discussion: "metrics.stageDiscussion", decided: "metrics.stageDecided",
  asked: "metrics.stageAsked", building: "metrics.stageBuilding", shipped: "metrics.stageShipped",
} as const;
const PAY_KEY = { better: "metrics.payBetter", worse: "metrics.payWorse", same: "metrics.paySame", "not measured": "metrics.payMeasuring" } as const;
const ANSWERS = [
  ["yes", "metrics.answersYes"], ["yesProject", "metrics.answersYesProject"], ["question", "metrics.answersQuestion"],
  ["handed", "metrics.answersHanded"], ["no", "metrics.answersNo"],
] as const;
const SERIES = [["raised", "metrics.trendRaised"], ["answered", "metrics.trendAnswered"], ["onTime", "metrics.trendOnTime"]] as const;

function Close({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <button type="button" className={s.close} onClick={onClose} title={t("common.close")} aria-label={t("common.close")}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  );
}

/** "2 working days" or "0 of 55": the number large, the words after it small. "59%" stays whole. */
function BigValue({ text }: { text: string }) {
  const m = /^(\S+)\s+(.+)$/.exec(text);
  return (
    <span className={s.tileValue}>
      {m ? <>{m[1]}<span className={s.tileUnit}> {m[2]}</span></> : text}
    </span>
  );
}

export function DashboardBoard({ data: fromServer, slug, kind: servedKind, unitId: servedUnit }: {
  data: DashboardData | null; slug: string | null; kind: Kind; unitId: string | null;
}) {
  const { S, log, seed, ready, flag, showToast, tenant, sampleData } = useDemo();
  // The sample data exists only in this browser, so its numbers are built here too.
  const served = sampleData ? null : fromServer;
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState<TileId | "saved" | null>(null);
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

  const canBaseline = served !== null && slug !== null;

  const unitLabel = unitId ? data.units.find((u) => u.id === unitId)?.label ?? t("metrics.dashUnitAll") : t("metrics.dashUnitAll");
  const periodLabel = t(kind === "30d" ? "metrics.dashPeriod30d" : kind === "quarter" ? "metrics.dashPeriodQuarter" : "metrics.dashPeriodGolive");
  const labels = trendLabels(data.trend, t);

  // ── tiles: only those with a number above 0 (lib/utils/quiet.ts); a 0 against a baseline that was not 0 is the result, so it stays ──
  const tileSays = (x: (typeof data.tiles)[number] | undefined) => !!x && (shows(x.value) || (x.value === 0 && shows(x.baseline)));
  const shownTiles = tiles.filter((v, i) => !v.hidden && tileSays(data.tiles[i]));

  // ── trend: months before the first case are left out ──
  const first = data.trend.findIndex((m) => m.raised + m.answered + m.onTime > 0);
  const trend = first < 0 ? [] : data.trend.slice(first).map((m, j) => ({ ...m, at: first + j }));
  const trendMax = Math.max(1, ...trend.map((m) => Math.max(m.raised, m.answered, m.onTime)));

  // ── stages, answers: only the ones with a count ──
  const stages = data.stages.filter((x) => x.open > 0);
  const stageH = barHeights(stages.map((x) => x.open), 6);
  const answerList = ANSWERS.map(([id, key]) => ({ id, key, n: data.answers[id] }));
  const answerTotal = answerList.reduce((a, x) => a + x.n, 0);
  const answerPct = shares(answerList.map((x) => x.n));

  const projects = flag("projects") ? S.projects.filter((p) => p.verdict !== null).slice(0, 8) : [];
  const sel: TileView | undefined = open ? shownTiles.find((x) => x.id === open) : undefined;
  const nothing = data.scopeHidden || data.caseCount === 0;
  // "Saved per year" leads the tiles whenever a confirmed result saved a euro, also in a period without new cases.
  const savedOpen = open === "saved" && data.saved !== null;
  const lead = data.saved ? 1 : 0;
  const tileCount = (nothing ? 0 : shownTiles.length) + lead;

  // A tile is its value and its change; what it is measured against opens with it.
  const tileCard = (v: TileView, i: number) => (
    <button key={v.id} type="button" className={s.tile} data-accent={v.id} onClick={() => setOpen(v.id)} data-testid={`dashboard-tile-${v.id}`} style={{ animationDelay: 40 + i * 50 + "ms" }}>
      <span className={s.tileLabel}><span className={s.tileDot} aria-hidden="true" />{v.label}</span>
      <BigValue text={v.value} />
      {v.delta && <span className={s.delta} data-tone={v.tone ?? undefined}>{v.delta}</span>}
    </button>
  );
  // The overlay's one line under the note: what the value is out of, then the baseline (only when there is one).
  const facts = (v: TileView) => [v.aiOffLine ? "" : v.sub, data.baseline ? v.baselineLine : ""].filter(Boolean).join(" · ");

  return (
    <div className={s.root} data-testid="dashboard-board">
      {(sel || savedOpen || menu) && <div className={s.scrim} onClick={() => { setOpen(null); setMenu(null); }} aria-hidden="true" />}
      <div className={s.page}>
        <h1 className="nh-sr">{t("metrics.dashTitle")}</h1>
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
          <button type="button" className={s.pillQuiet} onClick={() => void exportCsv()} data-testid="dashboard-export">{t("metrics.dashExport")}</button>
        </div>

        {data.scopeHidden && <p className={s.empty} data-testid="dashboard-scope-hidden">{t("metrics.dashScopeHidden")}</p>}
        {!data.scopeHidden && data.caseCount === 0 && <p className={s.empty}>{t("metrics.dashEmpty")}</p>}

        {tileCount > 0 && (
          <div className={s.tiles} data-count={tileCount}>
            {data.saved && <SavedTile saved={data.saved} onOpen={() => setOpen("saved")} delay={40} />}
            {!nothing && shownTiles.map((v, i) => tileCard(v, i + lead))}
          </div>
        )}

        {savedOpen && data.saved && <SavedOverlay saved={data.saved} onClose={() => setOpen(null)} close={<Close onClose={() => setOpen(null)} />} />}

        {sel && (
          <div className={s.overlay} role="dialog" aria-label={sel.label} data-testid="dashboard-detail" data-accent={sel.id}>
            <div className={s.overlayHead}>
              <div className={s.titleCol}>
                <h3 className={s.overlayTitle}><span className={s.overlayValue}>{sel.value}</span> <span className={s.muted}>{sel.label}</span></h3>
                <span className={s.note}>{sel.note}</span>
                {facts(sel) && <span className={s.note} data-testid="dashboard-baseline">{facts(sel)}</span>}
                {sel.aiOffLine && <span className={s.note}>{sel.aiOffLine}</span>}
                {sel.provenance && <span className={s.note} data-testid="dashboard-provenance">{sel.provenance}</span>}
              </div>
              <Close onClose={() => setOpen(null)} />
            </div>
            <div className={s.overlayGrid}>
              <div className={s.panel}>
                <span className={s.panelTitle}>{t("metrics.overlayMonthByMonth")}</span>
                <div className={s.months}>
                  {(() => {
                    const mh = barHeights(sel.months, 4);
                    const off = data.trend.length - sel.months.length;
                    return sel.months.map((m, j) => (
                      <div key={j} className={s.month}>
                        <span className={s.monthVal}>{shows(m) ? m : null}</span>
                        <span className={s.monthBar} data-base={data.trend[off + j]?.baseline ? "true" : undefined} style={{ height: mh[j] + "%" }} />
                        <span className={s.note}>{labels[off + j]}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
              {sel.split && sel.split.some((r) => r.value !== null) && (
                <div className={s.panel}>
                  <span className={s.panelTitle}>{t("metrics.overlayByUnit")}</span>
                  {sel.split.filter((r) => r.value !== null).map((r) => (
                    <div key={r.id} className={s.splitRow}>
                      <span className={s.rowName} style={{ paddingLeft: r.depth * 14 }}><DeptChip name={r.label} /></span>
                      <span className={s.track}><span className={s.fill} style={{ width: r.share + "%" }} /></span>
                      <span className={s.num}>{r.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className={s.sections}>
          {!nothing && (trend.length > 0 || stages.length > 0) && (
            <Fold name="trend" summary={t("metrics.foldTrend")}>
              <div className={s.pair}>
                {trend.length > 0 && (
                  <section className={s.chart} data-testid="dashboard-trend">
                    <h3 className={s.chartTitle}>{t("metrics.trendTitle")}</h3>
                    <div className={s.legendRow}>
                      {SERIES.map(([k, key]) => <span key={k} className={s.legendItem}><span className={s.swatch} data-series={k} />{t(key)}</span>)}
                    </div>
                    <div className={s.groups} role="table" aria-label={t("metrics.trendTable")}>
                      {trend.map((m) => (
                        <div key={m.at} className={s.group} role="row" data-base={m.baseline ? "true" : undefined}>
                          <div className={s.groupBars}>
                            {SERIES.map(([k, key]) => (
                              <span key={k} className={s.gBar} data-series={k} role="cell" aria-label={`${t(key)}: ${m[k]}`} title={`${t(key)}: ${m[k]}`} style={{ height: Math.max(2, (m[k] / trendMax) * 100) + "%" }}>
                                {k === "raised" && m.raised > 0 && <span className={s.gVal}>{m.raised}</span>}
                              </span>
                            ))}
                          </div>
                          <span className={s.step} role="rowheader">{labels[m.at]}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {stages.length > 0 && (
                  <section className={s.chart} data-testid="dashboard-stages">
                    <h3 className={s.chartTitle}>{t("metrics.stageTitle")}</h3>
                    <div className={s.stageBars}>
                      {stages.map((x, i) => {
                        const key = STATUS_KEY[x.status as keyof typeof STATUS_KEY];
                        // The average wait shows on hover; a stage that is being built has none.
                        const avg = x.status !== "building" && x.avgDays !== null ? t("metrics.stageAvg", { n: x.avgDays }) : undefined;
                        return (
                          <div key={x.status} className={s.stage} data-status={x.status} title={avg}>
                            <span className={s.stageN}>{x.open}</span>
                            <span className={s.stageTrack}><span className={s.stageBar} style={{ height: stageH[i] + "%", animationDelay: 80 + i * 60 + "ms" }} /></span>
                            <span className={s.stageName}><span className={s.stageDot} aria-hidden="true" />{key ? t(key) : x.status}</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>
            </Fold>
          )}

          {!nothing && (answerTotal > 0 || projects.length > 0) && (
            <Fold name="answers" summary={t("metrics.foldAnswers")}>
              <div className={s.pair}>
                {answerTotal > 0 && (
                  <section className={s.chart} data-testid="dashboard-answers">
                    <h3 className={s.chartTitle}>{t("metrics.answersTitle")}</h3>
                    <div className={s.stack}>
                      {answerList.map((a) => (a.n > 0 ? <span key={a.id} data-answer={a.id} style={{ flex: `${a.n} 1 0` }} /> : null))}
                    </div>
                    <div className={s.answerList}>
                      {answerList.map((a, i) => a.n > 0 && (
                        <div key={a.id} className={s.answerRow} data-answer={a.id}>
                          <span className={s.legendItem}><span className={s.dot} />{t(a.key)}</span>
                          <span className={s.num}>{answerPct[i]}%</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {projects.length > 0 && (
                  <section className={s.chart} data-testid="dashboard-payoff">
                    <h3 className={s.chartTitle}>{t("metrics.payTitle")}</h3>
                    <div className={s.answerList}>
                      {projects.map((p) => (
                        <div key={p.id} className={s.payRow}>
                          <span className={s.rowName}>{p.title}</span>
                          {p.verdict && <span className={s.verdict} data-verdict={p.verdict}>{t(PAY_KEY[p.verdict])}</span>}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </Fold>
          )}

          {!nothing && <BreakdownCard units={data.units} roles={data.roles} view={view} onView={setView} demoClock={data.demoClock} />}

          {/* The load of the desks (plan OVL, D3): the rows the viewer may see - an admin every desk, the seat above its desk - drawn only while a desk is loaded. */}
          <DeskLoadCard />
        </div>
      </div>
      {dialog && slug && <BaselineDialog slug={slug} demoClock={data.demoClock} current={data.baseline} onClose={() => setDialog(false)} onSaved={() => { setDialog(false); showToast(t("metrics.blSaved")); }} />}
    </div>
  );
}
