"use client";
// "By unit and role" (MET D11, D19): the units as a tree that opens level by level, or the roles, 20 a page.
// A row under 5 people is left out and only counted in one quiet line (shownRows); a unit with nothing in the
// period is left out too. No row names a person and none links anywhere.
import { useState } from "react";
import { formatNumber } from "@/features/metrics/dashboard";
import { shownRows, type ShownRow } from "@/features/metrics/breakdown-view";
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
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const unitView = shownRows(units);
  const roleView = shownRows(roles);
  const both = unitView.rows.length > 0 && roleView.rows.length > 0;
  // A view with nothing to show is not offered: with every role under 5 people the card shows units only.
  const mode: "unit" | "role" = both ? view : roleView.rows.length > 0 && unitView.rows.length === 0 ? "role" : "unit";
  const current = mode === "unit" ? unitView : roleView;
  if (current.rows.length === 0) return null;

  const num = (v: number | null) => (v === null ? "" : formatNumber(v, t));
  const pick = (v: "unit" | "role") => () => { setPage(0); onView(v); };
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Units: a row shows while every unit above it is open. Roles: flat, paged.
  const byId = new Map(current.rows.map((r) => [r.row.id, r]));
  const visible = (r: ShownRow): boolean => r.parentId === null || (open.has(r.parentId) && visible(byId.get(r.parentId)!));
  const listed = mode === "unit" ? current.rows.filter(visible) : current.rows;
  const pages = Math.max(1, Math.ceil(listed.length / BREAKDOWN_PAGE));
  const at = Math.min(page, pages - 1);
  const shown = mode === "role" ? listed.slice(at * BREAKDOWN_PAGE, (at + 1) * BREAKDOWN_PAGE) : listed;

  return (
    <section className={s.card2} data-testid="dashboard-breakdown">
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>{t(both ? "metrics.bdTitle" : mode === "unit" ? "metrics.bdUnits" : "metrics.bdRoles")}</h3>
        {both && (
          <div className={s.seg} role="group" aria-label={t("metrics.bdTitle")}>
            <button type="button" className={s.segBtn} aria-pressed={mode === "unit"} onClick={pick("unit")} data-testid="dashboard-view-units">{t("metrics.bdUnits")}</button>
            <button type="button" className={s.segBtn} aria-pressed={mode === "role"} onClick={pick("role")} data-testid="dashboard-view-roles">{t("metrics.bdRoles")}</button>
          </div>
        )}
      </div>
      <div className={s.table} role="table" aria-label={t("metrics.bdTitle")}>
        <div className={s.tr} role="row" data-head="true" data-stalled={mode === "unit" ? "true" : undefined}>
          <span role="columnheader">{t(mode === "unit" ? "metrics.bdUnitCol" : "metrics.bdRoleCol")}</span>
          <span className={s.num} role="columnheader">{t("metrics.bdCases")}</span>
          <span className={s.num} role="columnheader">{t("metrics.bdFirst")} ({demoClock ? t("metrics.dashLeadSimulated") : t("metrics.bdFirstUnit")})</span>
          <span role="columnheader">{t("metrics.bdOnTime")}</span>
          <span className={s.num} role="columnheader">{t("metrics.bdPast")}</span>
          <span className={s.num} role="columnheader">{t("metrics.bdEsc")}</span>
          {mode === "unit" && <span className={s.num} role="columnheader" title={t("projectResult.stalledHint")}>{t("projectResult.stalledColumn")}</span>}
        </div>
        {shown.map(({ row: r, hasKids, figures }) => {
          const isOpen = open.has(r.id);
          const label = r.kind === "unit" ? <DeptChip name={r.label} /> : <span className={s.roleName}>{r.label}</span>;
          return (
            <div key={r.kind + r.id} className={s.tr} role="row" data-testid="dashboard-row" data-depth={Math.min(r.depth, 3)} data-group={figures ? undefined : "true"} data-stalled={mode === "unit" ? "true" : undefined}>
              <span className={s.rowName} role="cell">
                {mode === "unit" && hasKids ? (
                  <button type="button" className={s.twisty} aria-expanded={isOpen} onClick={() => toggle(r.id)}
                    aria-label={t(isOpen ? "metrics.bdCollapse" : "metrics.bdExpand", { name: r.label })} data-testid="dashboard-row-toggle">
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1.5L6.5 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                ) : mode === "unit" ? <span className={s.twistySpace} aria-hidden="true" /> : null}
                {label}
              </span>
              {figures ? (
                <>
                  <span className={`${s.num} ${s.strong}`} role="cell">{num(r.cases)}</span>
                  <span className={s.num} role="cell">{num(r.firstReasonedAnswer)}</span>
                  <span className={s.onTime} role="cell">
                    {r.onTimePct !== null && (
                      <>
                        <span className={s.meter} aria-hidden="true"><span className={s.meterFill} data-tone={r.onTimePct >= 80 ? "good" : r.onTimePct >= 50 ? "mid" : "low"} style={{ width: r.onTimePct + "%" }} /></span>
                        <span className={s.meterVal}>{t("metrics.unitPct", { n: formatNumber(r.onTimePct, t) })}</span>
                      </>
                    )}
                  </span>
                  <span className={s.num} role="cell">{r.pastPromise ? <span className={s.badge} data-tone="late">{num(r.pastPromise)}</span> : null}</span>
                  <span className={s.num} role="cell">{r.escalated ? <span className={s.badge} data-tone="esc">{num(r.escalated)}</span> : null}</span>
                  {mode === "unit" && <span className={s.num} role="cell" data-testid="dashboard-stalled">{r.stalled ? <span className={s.badge} data-tone="esc">{num(r.stalled)}</span> : null}</span>}
                </>
              ) : <span className={s.groupCell} role="cell" />}
            </div>
          );
        })}
      </div>
      {mode === "role" && listed.length > BREAKDOWN_PAGE && (
        <div className={s.pager}>
          <span>{t("metrics.bdRange", { from: at * BREAKDOWN_PAGE + 1, to: Math.min(listed.length, (at + 1) * BREAKDOWN_PAGE), total: listed.length })}</span>
          <button type="button" className={s.pageBtn} disabled={at === 0} onClick={() => setPage(at - 1)} aria-label={t("metrics.bdPrev")}>‹</button>
          <button type="button" className={s.pageBtn} disabled={at >= pages - 1} onClick={() => setPage(at + 1)} aria-label={t("metrics.bdNext")}>›</button>
        </div>
      )}
      {current.hidden > 0 && <span className={s.foot} data-testid="dashboard-hidden-count">{t("metrics.bdHidden", { count: current.hidden })}</span>}
    </section>
  );
}
