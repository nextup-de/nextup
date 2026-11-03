// The pilot report and the KPI report's inputs (MET D13, D14): the company's projects reduced from its log, the
// people in scope, and `pilotReport` for PIL. Every query names the company. The result holds no user id, name,
// handle or importer id (D2): people are only counted, and imported baselines keep their source label and times.
import { reduce } from "@/features/cases/reducer";
import { dateOfWorkday, workdayOf } from "@/features/clock/calendar";
import { pilotMetrics } from "@/features/metrics/pilot";
import { ziKpis } from "@/features/metrics/zi";
import { PILOT_METRIC_KEYS, type Baseline, type KpiProject, type PilotReport, type Period } from "@/features/metrics/types";
import { loadBaseline } from "./baseline";
import { loadCalendar } from "./calendar";
import { getDb } from "./client";
import { loadSeed } from "./companies";
import { companyDay, loadLog } from "./events";
import { loadSeats } from "./holders";
import { ledgerInputs } from "./metrics";
import { loadCompanyRules } from "./rules";

/** The company's projects from its log, as the pages reduce them (D7: only `Measure.confirmed` counts later). */
export async function kpiProjects(companyId: string, period: Period): Promise<KpiProject[]> {
  const company = await getDb().company.findUniqueOrThrow({ where: { id: companyId }, select: { slug: true } });
  const [seed, seats, log, ledger] = await Promise.all([loadSeed(company.slug), loadSeats(companyId), loadLog(companyId), ledgerInputs(companyId, period)]);
  if (!seed) return [];
  const unitOfCase = new Map(ledger.cases.map((c) => [c.caseId, c.raiserUnitId]));
  const state = reduce({ ...seed, seats }, log);
  return state.projects.map((p) => {
    const decidedDay = p.history.find((e) => e.type === "case.decided")?.day ?? p.openedDay;
    return {
      caseId: p.sources[0] ?? p.id,
      raiserUnitId: p.sources.map((s) => unitOfCase.get(s) ?? null).find((u) => u !== null) ?? null,
      decidedDay,
      doneDay: p.doneDay,
      measures: p.measures.map((m) => ({
        verified: m.confirmed,
        better: m.verdict === "better",
        eur: m.impact?.savingEurPerYear ?? null,
        kwh: m.impact?.energyKwhPerYear ?? null,
        co2Kg: m.impact?.co2KgPerYear ?? null,
      })),
      premiumsEur: p.reward?.amount ?? 0,
    };
  });
}

/** Configured top-level headcount when above 0 (customer-supplied), else the active users. */
export async function peopleInScope(companyId: string): Promise<number> {
  const db = getDb();
  const top = await db.orgUnit.aggregate({ where: { companyId, parentId: null }, _sum: { headcount: true } });
  const configured = top._sum.headcount ?? 0;
  if (configured > 0) return configured;
  return db.user.count({ where: { companyId, active: true } });
}

export async function pilotReport(companyId: string, from: number, to: number): Promise<PilotReport> {
  const period: Period = { from, to };
  const [stored, people, company] = await Promise.all([
    loadBaseline(companyId),
    peopleInScope(companyId),
    getDb().company.findUniqueOrThrow({ where: { id: companyId }, select: { stage: true } }),
  ]);
  const basePeriod: Period | null = stored ? { from: stored.fromDay, to: stored.toDay } : null;
  const [ledger, projects, baseLedger, baseProjects] = await Promise.all([
    ledgerInputs(companyId, period),
    kpiProjects(companyId, period),
    basePeriod ? ledgerInputs(companyId, basePeriod) : Promise.resolve(null),
    basePeriod ? kpiProjects(companyId, basePeriod) : Promise.resolve(null),
  ]);

  const imported: Baseline["imported"] = {};
  for (const [k, v] of Object.entries(stored?.imported ?? {})) {
    if (v) imported[k as keyof Baseline["imported"]] = { ...v, importedBy: "" };
  }
  const metrics = pilotMetrics({
    ledger,
    projects,
    period,
    peopleInScope: people,
    baseline: basePeriod && baseLedger && baseProjects ? { input: baseLedger, projects: baseProjects, period: basePeriod } : null,
    imported,
  });
  const importedCount = Object.keys(imported).length;
  const baseline: PilotReport["baseline"] = stored
    ? { ...stored, imported, source: importedCount === 0 ? "counted" : importedCount >= PILOT_METRIC_KEYS.length ? "imported" : "mixed" }
    : null;

  const dates = company.stage !== "demo" && from >= 1 && to >= 1;
  const calendar = dates ? await loadCalendar(companyId) : null;
  return {
    companyId,
    period,
    fromDate: calendar ? dateOfWorkday(from, calendar) : null,
    toDate: calendar ? dateOfWorkday(to, calendar) : null,
    baseline,
    metrics,
    zi: ziKpis({ cases: ledger.cases, projects, org: ledger.org, period }),
  };
}

export type KpiPeriodKind = "year" | "lastYear" | "golive";

export type KpisData = {
  kind: KpiPeriodKind;
  /** False when the period does not exist yet (go-live without a finished baseline). */
  available: boolean;
  period: Period;
  fromDate: string | null;
  toDate: string | null;
  zi: PilotReport["zi"];
  baselineSource: "counted" | "imported" | "mixed" | null;
  projectsOn: boolean;
  /** Configured headcount is customer-supplied (D13); false when the people are the active users. */
  headcountConfigured: boolean;
};

const EMPTY_ZI: PilotReport["zi"] = {
  company: { unitId: null, label: "", depth: 0, headcount: 0, participationPct: null, ideasPer100: null, implementationPct: null, medianDaysToDecision: null, savingsEur: null, energyKwh: null, co2Kg: null, premiumsEur: null, hidden: true },
  units: [],
};

/** The fixed periods of D19/D20: this year, last year, since go-live (the day after the baseline). */
export async function kpisData(companyId: string, kind: KpiPeriodKind): Promise<KpisData> {
  const db = getDb();
  const [company, baseline, rules, top] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId }, select: { stage: true, demoDay: true } }),
    loadBaseline(companyId),
    loadCompanyRules(companyId),
    db.orgUnit.aggregate({ where: { companyId, parentId: null }, _sum: { headcount: true } }),
  ]);
  let period: Period | null;
  if (company.stage === "demo") {
    const today = company.demoDay;
    period = kind === "year" ? { from: today - 364, to: today } : kind === "lastYear" ? { from: today - 729, to: today - 365 }
      : baseline && baseline.toDay + 1 <= today ? { from: baseline.toDay + 1, to: today } : null;
  } else {
    const calendar = await loadCalendar(companyId);
    const today = companyDay(company, calendar, new Date());
    const year = new Date().getUTCFullYear();
    const startOf = (y: number) => workdayOf(new Date(Date.UTC(y - 1, 11, 31, 12)), calendar) + 1;
    period = kind === "year" ? { from: startOf(year), to: today } : kind === "lastYear" ? { from: startOf(year - 1), to: startOf(year) - 1 }
      : baseline && baseline.toDay + 1 <= today ? { from: baseline.toDay + 1, to: today } : null;
  }
  const projectsOn = rules.steps.projects;
  const headcountConfigured = (top._sum.headcount ?? 0) > 0;
  if (!period || period.from > period.to) {
    return { kind, available: false, period: period ?? { from: 0, to: 0 }, fromDate: null, toDate: null, zi: EMPTY_ZI, baselineSource: null, projectsOn, headcountConfigured };
  }
  const report = await pilotReport(companyId, period.from, period.to);
  return {
    kind, available: true, period, fromDate: report.fromDate, toDate: report.toDate, zi: report.zi,
    baselineSource: report.baseline?.source ?? null, projectsOn, headcountConfigured,
  };
}
