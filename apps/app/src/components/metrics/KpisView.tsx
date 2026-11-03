"use client";
// The idea-management KPI report (MET D20): company tiles, one row per unit, a period picker and a CSV export.
// Props in, JSX out; the numbers come from the server actions. Hidden rows say "too few" and carry no value.
import { useState, useTransition } from "react";
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
  const [data, setData] = useState<KpisData>(initial);
  const [error, setError] = useState<"load" | "export" | null>(null);
  const [pending, start] = useTransition();
  const view = kpiView(data.zi, t, data.projectsOn, locale);

  const pick = (kind: KpiPeriodKind) =>
    start(async () => {
      const r = await loadKpisAction(slug, { kind });
      if ("error" in r) setError("load");
      else {
        setError(null);
        setData(r);
      }
    });
  const exportCsv = () =>
    start(async () => {
      const r = await exportKpisCsvAction(slug, { kind: data.kind });
      if ("error" in r) setError("export");
      else {
        setError(null);
        download(r.name, r.body);
      }
    });

  const baselineKey = data.baselineSource === "imported" ? "kpis.baselineImported" : data.baselineSource === "mixed" ? "kpis.baselineMixed" : "kpis.baselineCounted";
  const header = (view.rows.find((r) => !r.hidden) ?? view.rows[0])?.cells ?? [];

  return (
    <div className={styles.page} data-testid="kpis-page" aria-busy={pending}>
      <div className={styles.head}>
        <h1 className={styles.title}>{t("kpis.title")}</h1>
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
      </div>
      {data.fromDate && data.toDate && <p className={styles.dates} data-testid="kpis-dates">{data.fromDate} – {data.toDate}</p>}
      {error && <p className={styles.error} role="alert" data-testid="kpis-error">{t(error === "load" ? "kpis.loadFailed" : "kpis.exportFailed")}</p>}

      {!data.available ? (
        <p className={styles.note} data-testid="kpis-unavailable">{t("kpis.unavailable")}</p>
      ) : (
        <>
          <section className={styles.tiles} aria-label={t("kpis.company")} data-testid="kpis-tiles">
            {view.tiles.map((c) => (
              <div key={c.id} className={styles.tile} data-hidden={view.allHidden} data-testid={`kpis-tile-${c.id}`}>
                <div className={styles.value}>{c.value}</div>
                <div className={styles.label}>{c.label}</div>
              </div>
            ))}
          </section>
          {view.projectsOffLine && <p className={styles.note} data-testid="kpis-projects-off">{view.projectsOffLine}</p>}
          {data.baselineSource && <p className={styles.note} data-testid="kpis-baseline">{t(baselineKey)}</p>}

          {view.rows.length > 0 && (
            <div className={styles.scroll}>
              <table className={styles.table} data-testid="kpis-units">
                <thead>
                  <tr>
                    <th scope="col">{t("kpis.unit")}</th>
                    {header.map((c) => <th key={c.id} scope="col">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((r) => (
                    <tr key={r.key} data-testid={`kpis-unit-${r.key}`} data-hidden={r.hidden}>
                      <th scope="row" style={{ paddingLeft: 12 + r.depth * 16 }}>{r.label}</th>
                      {r.hidden ? <td colSpan={header.length} className={styles.hiddenCell}>{r.cells[0]?.value}</td> : r.cells.map((c) => <td key={c.id}>{c.value}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <p className={styles.foot} data-testid="kpis-footnote">{t("kpis.footnote")}</p>
    </div>
  );
}
