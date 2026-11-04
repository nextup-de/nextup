// The pilot report as CSV (PIL D11), through features/api/csv.ts. Pure. One row per week for the company and one
// per unit and week; a hidden unit's numbers are empty and its `hidden` column says why.
import { writeCsv } from "@/features/api/csv";
import { PILOT_METRIC_KEYS, type PilotReport, type ZiRow } from "@/features/metrics/types";

export type CsvWeek = { fromDate: string; toDate: string; report: PilotReport };

const UNIT_COLUMNS = ["ideasPer100", "medianDaysToDecision", "savingsEur", "energyKwh", "co2Kg", "premiumsEur"] as const;
const HEADER = ["week_from", "week_to", "row", "unit", "people", "hidden", ...PILOT_METRIC_KEYS, ...UNIT_COLUMNS];

const cell = (n: number | null | undefined): string => (n === null || n === undefined ? "" : String(n));

/** `{slug}-pilot-report-{from}-{to}.csv` */
export const reportCsvName = (slug: string, from: string, to: string): string => `${slug}-pilot-report-${from}-${to}.csv`;

function unitRow(week: CsvWeek, u: ZiRow, hiddenText: string): string[] {
  const shown = !u.hidden;
  const metric = (key: (typeof PILOT_METRIC_KEYS)[number]) =>
    shown ? cell(key === "participationPct" ? u.participationPct : key === "implementationPct" ? u.implementationPct : null) : "";
  return [
    week.fromDate, week.toDate, "unit", u.label, String(u.headcount), u.hidden ? hiddenText : "",
    ...PILOT_METRIC_KEYS.map(metric),
    ...UNIT_COLUMNS.map((k) => (shown ? cell(u[k]) : "")),
  ];
}

export function reportCsv(weeks: readonly CsvWeek[], hiddenText: string): string {
  const rows: string[][] = [];
  for (const w of weeks) {
    const byKey = new Map(w.report.metrics.map((m) => [m.key, m]));
    const c = w.report.zi.company;
    rows.push([
      w.fromDate, w.toDate, "company", "", String(c.headcount), "",
      ...PILOT_METRIC_KEYS.map((k) => { const m = byKey.get(k); return m && !m.hidden ? cell(m.value) : ""; }),
      ...UNIT_COLUMNS.map((k) => (c.hidden ? "" : cell(c[k]))),
    ]);
    for (const u of w.report.zi.units) rows.push(unitRow(w, u, hiddenText));
  }
  return writeCsv(HEADER, rows);
}
