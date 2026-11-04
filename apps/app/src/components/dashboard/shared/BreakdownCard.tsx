"use client";
// "By unit and role" (MET D11, D19): a table of units (indented under their parent) or roles, 20 rows a page.
// A row under 5 people shows TooFewToShow and no number. No row names a person and none links anywhere.
import { useState } from "react";
import { formatNumber } from "@/features/metrics/dashboard";
import type { BreakdownRow } from "@/features/metrics/types";
import { DeptChip } from "@/components/ui/elements";
import { useT } from "@/i18n/client";
import s from "./DashboardBoard.module.css";

export const BREAKDOWN_PAGE = 20;

/** The shared "too few to show" element: a grey box with the reason, never a number. */
export function TooFewToShow({ inline = false }: { inline?: boolean }) {
  const t = useT();
  return (
    <span className={inline ? s.tooFewInline : s.tooFew} data-testid="dashboard-too-few">
      {t("metrics.tooFew")} · {t("metrics.tooFewWhy")}
    </span>
  );
}

export function BreakdownCard({ units, roles, view, onView, demoClock }: {
  units: BreakdownRow[]; roles: BreakdownRow[]; view: "unit" | "role"; onView: (v: "unit" | "role") => void; demoClock: boolean;
}) {
  const t = useT();
  const [page, setPage] = useState(0);
  const rows = view === "unit" ? units : roles;
  const pages = Math.max(1, Math.ceil(rows.length / BREAKDOWN_PAGE));
  const at = Math.min(page, pages - 1);
  const shown = rows.slice(at * BREAKDOWN_PAGE, (at + 1) * BREAKDOWN_PAGE);
  const num = (v: number | null) => (v === null ? t("metrics.valueNone") : formatNumber(v, t));
  const pct = (v: number | null) => (v === null ? t("metrics.valueNone") : t("metrics.unitPct", { n: formatNumber(v, t) }));
  const pick = (v: "unit" | "role") => () => { setPage(0); onView(v); };

  return (
    <section className={s.card2} data-testid="dashboard-breakdown">
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>{t("metrics.bdTitle")}</h3>
        <div className={s.seg} role="group" aria-label={t("metrics.bdTitle")}>
          <button type="button" className={s.segBtn} aria-pressed={view === "unit"} onClick={pick("unit")} data-testid="dashboard-view-units">{t("metrics.bdUnits")}</button>
          <button type="button" className={s.segBtn} aria-pressed={view === "role"} onClick={pick("role")} data-testid="dashboard-view-roles">{t("metrics.bdRoles")}</button>
        </div>
      </div>
      {rows.length === 0 && <span className={s.empty}>{t("metrics.bdEmpty")}</span>}
      {rows.length > 0 && (
        <div className={s.table} role="table" aria-label={t("metrics.bdTitle")}>
          <div className={s.tr} role="row" data-head="true">
            <span role="columnheader">{t(view === "unit" ? "metrics.bdUnitCol" : "metrics.bdRoleCol")}</span>
            <span className={s.num} role="columnheader">{t("metrics.bdCases")}</span>
            <span className={s.num} role="columnheader">{t("metrics.bdFirst")} ({demoClock ? t("metrics.dashLeadSimulated") : t("metrics.bdFirstUnit")})</span>
            <span className={s.num} role="columnheader">{t("metrics.bdOnTime")}</span>
            <span className={s.num} role="columnheader">{t("metrics.bdPast")}</span>
            <span className={s.num} role="columnheader">{t("metrics.bdEsc")}</span>
          </div>
          {shown.map((r) =>
            r.hidden ? (
              <div key={r.kind + r.id} className={s.tr} role="row" data-testid="dashboard-row">
                <span className={s.rowName} style={{ paddingLeft: r.depth * 16 }} role="cell">{r.kind === "unit" ? <DeptChip name={r.label} /> : r.label}</span>
                <span className={s.hiddenCell} role="cell"><TooFewToShow inline /></span>
              </div>
            ) : (
              <div key={r.kind + r.id} className={s.tr} role="row" data-testid="dashboard-row">
                <span className={s.rowName} style={{ paddingLeft: r.depth * 16 }} role="cell">{r.kind === "unit" ? <DeptChip name={r.label} /> : r.label}</span>
                <span className={s.num} role="cell">{num(r.cases)}</span>
                <span className={s.num} role="cell">{num(r.firstReasonedAnswer)}</span>
                <span className={s.num} role="cell">{pct(r.onTimePct)}</span>
                <span className={s.num} role="cell">{num(r.pastPromise)}</span>
                <span className={s.num} role="cell">{num(r.escalated)}</span>
              </div>
            ),
          )}
        </div>
      )}
      {rows.length > BREAKDOWN_PAGE && (
        <div className={s.pager}>
          <span>{t("metrics.bdRange", { from: at * BREAKDOWN_PAGE + 1, to: Math.min(rows.length, (at + 1) * BREAKDOWN_PAGE), total: rows.length })}</span>
          <button type="button" className={s.pageBtn} disabled={at === 0} onClick={() => setPage(at - 1)} aria-label={t("metrics.bdPrev")}>‹</button>
          <button type="button" className={s.pageBtn} disabled={at >= pages - 1} onClick={() => setPage(at + 1)} aria-label={t("metrics.bdNext")}>›</button>
        </div>
      )}
    </section>
  );
}
