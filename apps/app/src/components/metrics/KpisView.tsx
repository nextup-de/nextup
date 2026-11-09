"use client";
// The idea-management KPI report (MET D20): company tiles, one row per unit, a period picker and a CSV export.
// Props in, JSX out; the numbers come from the server actions. A unit under 5 raisers is left out and only
// counted in one line; a figure that is empty or zero everywhere is left out too. Each figure keeps its colour.
import { useState, useTransition } from "react";
import { Banner, DeptChip, PageHeader, SectionCard } from "@/components/ui/elements";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { SAMPLE_KPIS } from "@/features/demo/sample-data";
import { useLocale, useT } from "@/i18n/client";
import type { KpisData, KpiPeriodKind } from "@/lib/db/pilot-report";
import { exportKpisCsvAction, loadKpisAction } from "@/server/actions/kpis";
import { kpiView } from "./kpi-view";
import styles from "./KpisView.module.css";

const PERIODS = [
  ["year", "kpis.periodYear"],
  ["lastYear", "kpis.periodLastYear"],
  ["golive", "kpis.periodGolive"],
] as const;

function download(name: string, body: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function KpisView({ slug, initial }: { slug: string; initial: KpisData }) {
  const t = useT();
  const locale = useLocale();
  const { sampleData, showToast, serverMode } = useDemo();
  const [served, setData] = useState<KpisData>(initial);
  // The Demo data switch: sample figures, in this browser only.
  const data: KpisData = sampleData ? { ...served, available: true, zi: SAMPLE_KPIS, projectsOn: true, baselineSource: "counted", fromDate: null, toDate: null } : served;
  const [error, setError] = useState<"load" | "export" | null>(null);
  const [pending, start] = useTransition();
  const view = kpiView(data.zi, t, data.projectsOn, locale);

  const pick = (kind: KpiPeriodKind) =>
    start(async () => {
      if (sampleData) { setData((d) => ({ ...d, kind })); return; }
      const r = await loadKpisAction(slug, { kind });
      if ("error" in r) setError("load");
      else {
        setError(null);
        setData(r);
      }
    });
  const exportCsv = () =>
    start(async () => {
      if (sampleData) { showToast(t("kpis.exportFailed")); return; } // the server's export holds real counts, not these
      const r = await exportKpisCsvAction(slug, { kind: data.kind });
      if ("error" in r) setError("export");
      else {
        setError(null);
        download(r.name, r.body);
      }
    });

  const baselineKey = data.baselineSource === "imported" ? "kpis.baselineImported" : data.baselineSource === "mixed" ? "kpis.baselineMixed" : "kpis.baselineCounted";
  const rows = view.rows.filter((r) => !r.hidden);
  const hiddenUnits = view.rows.length - rows.length;
  // A column stays when one shown unit has a number in it.
  const columns = (rows[0]?.cells ?? []).filter((c) => rows.some((r) => !r.cells.find((x) => x.id === c.id)?.empty));
  const tiles = view.tiles.filter((c) => !c.empty);

  const tools = (
    <div className={styles.tools}>
      <div className={styles.periods} role="group" aria-label={t("kpis.period")}>
        {PERIODS.map(([kind, label]) => (
          <button key={kind} type="button" className={styles.period} data-on={data.kind === kind} data-testid={`kpis-period-${kind}`} onClick={() => pick(kind)}>
            {t(label)}
          </button>
        ))}
      </div>
      <button type="button" className={styles.export} data-testid="kpis-export" disabled={pending || !data.available} onClick={exportCsv}>
        {t("kpis.export")}
      </button>
    </div>
  );

  return (
    <div className={styles.page} data-testid="kpis-page" aria-busy={pending}>
      {serverMode ? <><h1 className="nh-sr">{t("kpis.title")}</h1>{tools}</> : <PageHeader title={t("kpis.title")} action={tools} />}
      {error && <div data-testid="kpis-error"><Banner tone="error">{t(error === "load" ? "kpis.loadFailed" : "kpis.exportFailed")}</Banner></div>}

      <SectionCard title={t("kpis.company")} name="kpis-company">
        {data.fromDate && data.toDate && <p className={styles.dates} data-testid="kpis-dates">{data.fromDate} – {data.toDate}</p>}
        {!data.available ? (
          <div data-testid="kpis-unavailable"><Banner tone="info">{t("kpis.unavailable")}</Banner></div>
        ) : view.allHidden ? (
          <div data-testid="kpis-all-hidden"><Banner tone="quiet">{t("kpis.tooFew")} · {t("kpis.tooFewWhy")}</Banner></div>
        ) : (
          <>
            {tiles.length > 0 && (
              <section className={styles.tiles} aria-label={t("kpis.company")} data-testid="kpis-tiles">
                {tiles.map((c) => (
                  <div key={c.id} className={styles.tile} data-kpi={c.id} data-testid={`kpis-tile-${c.id}`}>
                    <div className={styles.value}>{c.value}</div>
                    <div className={styles.label}>{c.label}</div>
                    {c.share !== null && <div className={styles.meter} aria-hidden="true"><span style={{ width: c.share + "%" }} /></div>}
                  </div>
                ))}
              </section>
            )}
            {view.projectsOffLine && <div data-testid="kpis-projects-off"><Banner tone="quiet">{view.projectsOffLine}</Banner></div>}
            {data.baselineSource && <div data-testid="kpis-baseline"><Banner tone="quiet">{t(baselineKey)}</Banner></div>}
          </>
        )}
      </SectionCard>

      {data.available && rows.length > 0 && columns.length > 0 && (
        <SectionCard name="kpis-units">
          <div className={styles.scroll}>
            <table className={styles.table} data-testid="kpis-units">
              <thead>
                <tr>
                  <th scope="col">{t("kpis.unit")}</th>
                  {columns.map((c) => <th key={c.id} scope="col" data-kpi={c.id}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} data-testid={`kpis-unit-${r.key}`}>
                    <th scope="row"><span className={styles.unit} style={{ paddingLeft: r.depth * 16 }}><DeptChip name={r.label} /></span></th>
                    {columns.map((col) => {
                      const c = r.cells.find((x) => x.id === col.id);
                      return (
                        <td key={col.id} data-kpi={col.id}>
                          {c && c.share !== null ? (
                            <span className={styles.cellBar}><span className={styles.meter} aria-hidden="true"><span style={{ width: c.share + "%" }} /></span>{c.value}</span>
                          ) : c?.value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
      {data.available && !view.allHidden && hiddenUnits > 0 && <p className={styles.hiddenLine} data-testid="kpis-hidden-units">{t("kpis.hiddenUnits", { count: hiddenUnits })}</p>}
      <p className={styles.foot} data-testid="kpis-footnote">{t("kpis.footnote")}</p>
    </div>
  );
}
