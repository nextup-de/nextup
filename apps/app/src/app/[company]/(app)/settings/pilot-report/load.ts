// Loads the pilot report for the page, the CSV and the print view (PIL D11). Server only. The caller has
// already passed `companyAdminOf`; every query here names that company.
import type { PilotReportView, WeekRow } from "@/components/settings/PilotReport";
import { berlinDate } from "@/features/clock/calendar";
import type { PilotReport } from "@/features/metrics/types";
import { isMonday, weekPeriod } from "@/features/pilot/weeks";
import { getDb } from "@/lib/db/client";
import { loadCalendar } from "@/lib/db/calendar";
import { pilotReport } from "@/lib/db/pilot-report";
import { pilotWeekList } from "@/lib/db/pilot-week";
import { loadCompanyRules } from "@/lib/db/rules";

export type LoadedWeek = { row: WeekRow; report: PilotReport };

export type LoadedReport = {
  view: PilotReportView;
  /** Every report week with its numbers, oldest first (the CSV). */
  weeks: LoadedWeek[];
  slug: string;
};

const metricOf = (r: PilotReport, key: string) => r.metrics.find((m) => m.key === key);
const shown = (r: PilotReport, key: string): number | null => {
  const m = metricOf(r, key);
  return m && !m.hidden ? m.value : null;
};

function rowOf(base: { monday: string; week: number; pilotWeek: number; from: string; to: string; running: boolean }, r: PilotReport): WeekRow {
  return {
    ...base,
    cases: shown(r, "casesPer10"),
    firstAnswer: shown(r, "firstReasonedAnswer"),
    onTime: shown(r, "withinPromisePct"),
    using: shown(r, "participationPct"),
  };
}

/** `weekParam` is the Monday (yyyy-mm-dd) of the week; anything else means the newest week. */
export async function loadPilotReport(slug: string, companyId: string, weekParam: string | undefined, now: Date = new Date()): Promise<LoadedReport> {
  const db = getDb();
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, stage: true, demoDay: true } });
  const rules = await loadCompanyRules(companyId);
  const hrefs = {
    dashboardHref: `/${slug}/dashboard`,
    goLiveHref: `/${slug}/settings/go-live`,
  };
  const empty = { slug, company: company.name, promiseDays: rules.promiseDays, selected: null, rows: [], baseline: null, csvHref: null, printHref: null, ...hrefs };

  if (company.stage === "demo") {
    const report = await pilotReport(companyId, Math.max(1, company.demoDay - 4), company.demoDay);
    const today = berlinDate(now);
    const row = rowOf({ monday: today, week: 0, pilotWeek: 0, from: today, to: today, running: false }, report);
    const view: PilotReportView = {
      ...empty, state: "demo", pausedSince: null, baseline: report.baseline,
      selected: { row, prev: null, next: null, asOf: now.toISOString(), metrics: report.metrics, units: report.zi.units },
      rows: [row],
    };
    return { view, weeks: [], slug };
  }

  const list = await pilotWeekList(companyId, now);
  if (list.weeks.length === 0) return { view: { ...empty, state: "before", pausedSince: null }, weeks: [], slug };

  const cal = await loadCalendar(companyId);
  const today = berlinDate(now);
  const loaded: LoadedWeek[] = [];
  for (const w of list.weeks) {
    const period = weekPeriod(w.monday, cal);
    if (!period) continue; // a week without a working day has no numbers
    const report = await pilotReport(companyId, period.from, period.to);
    const running = list.state === "running" && w.monday <= today && today <= w.sunday;
    loaded.push({ row: rowOf({ monday: w.monday, week: w.week, pilotWeek: w.pilotWeek, from: w.monday, to: w.sunday, running }, report), report });
  }
  const chosen = isMonday(weekParam) ? loaded.findIndex((l) => l.row.monday === weekParam) : -1;
  const index = chosen >= 0 ? chosen : loaded.length - 1;
  const current = loaded[index];
  const view: PilotReportView = {
    ...empty,
    state: list.state === "paused" ? "paused" : "running",
    pausedSince: list.pausedSince,
    baseline: current?.report.baseline ?? null,
    rows: loaded.map((l) => l.row),
    selected: current
      ? {
          row: current.row,
          prev: index > 0 ? loaded[index - 1].row.monday : null,
          next: index < loaded.length - 1 ? loaded[index + 1].row.monday : null,
          asOf: now.toISOString(),
          metrics: current.report.metrics,
          units: current.report.zi.units,
        }
      : null,
    csvHref: current ? `/${slug}/settings/pilot-report/export` : null,
    printHref: current ? `/${slug}/settings/pilot-report/print?week=${current.row.monday}` : null,
  };
  return { view, weeks: loaded, slug };
}
