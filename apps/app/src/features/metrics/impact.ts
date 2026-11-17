// What confirmed results save (MET D7, LOOP/D20): the one place where the Dashboard's "Saved per year", the pilot
// report and the KPI report count impact figures. One sum (`verifiedSum`) and one choice of which results a period
// counts (`countedIn`, two rules until Kevin picks one for all three). Pure. A project is named by its title and linked
// by its id; no person is named or counted (D2).
import type { ReducedProject } from "@/features/projects/types";
import type { KpiProject, Period, Saved, SavedRow } from "./types";

export type ImpactMeasure = KpiProject["measures"][number];

const inPeriod = (d: number | null, p: Period): d is number => d !== null && d >= p.from && d <= p.to;

/**
 * What a result saves in euros per year: its own euro figure, else its hours priced with the company's hour cost (one
 * value for the whole company, Settings › Rules). Never both, so nothing counts twice; no hour cost, no euros from hours.
 */
export const euroOf = (m: ImpactMeasure, hourCostEur: number | null): number | null =>
  m.eur ?? (m.hours != null && hourCostEur !== null && hourCostEur > 0 ? m.hours * hourCostEur : null);

/** D7: a result counts for savings, energy, CO2 and outcomes only when a second person confirmed it and its verdict is "better". */
export const countsAsVerified = (m: ImpactMeasure): boolean => m.verified && m.better;

/** The projects finished in the period. */
export const finishedIn = (projects: readonly KpiProject[], period: Period): KpiProject[] => projects.filter((p) => inPeriod(p.doneDay, period));

/**
 * Which results a period counts, each project with only those results left:
 * - "finished": every check of the projects finished in the period (the pilot and the KPI report, as they always counted);
 * - "latest": per project only its latest check confirmed by the end of the period (a 90-day check replaces the 30-day
 *   figure), counted in the period it was confirmed (the Dashboard).
 * They differ in two cases: a project whose 30- and 90-day checks both carry a figure ("finished" adds both), and a result
 * confirmed outside the period its project finished in. Kevin decides whether all three share one (asked 16 Nov); his
 * answer is a change of DASHBOARD_RULE or REPORT_RULE below.
 */
export type CountRule = "finished" | "latest";
export const DASHBOARD_RULE: CountRule = "latest";
export const REPORT_RULE: CountRule = "finished";

export function countedIn(projects: readonly KpiProject[], period: Period, rule: CountRule): KpiProject[] {
  if (rule === "finished") return finishedIn(projects, period);
  return projects.flatMap((p) => {
    const confirmed = p.measures.filter((m) => m.verified && m.confirmedDay != null && m.confirmedDay <= period.to);
    if (confirmed.length === 0) return [];
    const latest = confirmed.reduce((a, b) => ((b.check ?? 0) > (a.check ?? 0) ? b : a));
    return inPeriod(latest.confirmedDay ?? null, period) ? [{ ...p, measures: [latest] }] : [];
  });
}

/** The verified sum of one figure over these projects; null when there is no project to count, 0 when none of them saved anything. */
export function verifiedSum(projects: readonly KpiProject[], pick: (m: ImpactMeasure) => number | null | undefined): number | null {
  if (projects.length === 0) return null;
  return projects.flatMap((p) => p.measures.filter(countsAsVerified)).reduce((t, m) => t + (pick(m) ?? 0), 0);
}

/** The company's projects as the reports read them: each in the unit of its first source case's raiser, its results with their figures. */
export function kpiProjectsOf(projects: readonly ReducedProject[], raiserUnitOf: (caseId: string) => string | null): KpiProject[] {
  return projects.map((p) => ({
    caseId: p.sources[0] ?? p.id,
    raiserUnitId: p.sources.map((s) => raiserUnitOf(s)).find((u) => u !== null) ?? null,
    decidedDay: p.history.find((e) => e.type === "case.decided")?.day ?? p.openedDay,
    doneDay: p.doneDay,
    measures: p.measures.map((m) => ({
      verified: m.confirmed,
      better: m.verdict === "better",
      eur: m.impact?.savingEurPerYear ?? null,
      kwh: m.impact?.energyKwhPerYear ?? null,
      co2Kg: m.impact?.co2KgPerYear ?? null,
      scrap: m.impact?.scrapPartsPerYear ?? null,
      hours: m.impact?.hoursPerYear ?? null,
      check: m.check,
      confirmedDay: m.confirmedDay,
    })),
    premiumsEur: p.reward?.amount ?? 0,
    projectId: p.id,
    title: p.title,
  }));
}

/**
 * "Saved per year" on the Dashboard: the results DASHBOARD_RULE counts in the period (in the unit scope, when one is
 * chosen), each a figure per year, summed by `verifiedSum` (D7: confirmed by a second person, verdict better). One row
 * per counted result with a euro figure (`euroOf`: its own, else its hours times the hour cost); CO2, energy and scrap as
 * totals; hours that have no hour cost to price them as hours. A "better" result nobody has confirmed yet is never in the
 * sum: it is reported apart, as `unconfirmedEur`, whatever its period. Null when no confirmed result saved a euro.
 */
export function savedPerYear(projects: readonly KpiProject[], period: Period, inScope: ((unitId: string | null) => boolean) | null, hourCostEur: number | null = null): Saved | null {
  const scoped = projects.filter((p) => inScope === null || inScope(p.raiserUnitId));
  const confirmed = countedIn(scoped, period, DASHBOARD_RULE);
  const eur = verifiedSum(confirmed, (m) => euroOf(m, hourCostEur)) ?? 0;
  if (eur <= 0) return null;
  const rows = confirmed.flatMap((p) => p.measures.filter((m) => countsAsVerified(m) && (euroOf(m, hourCostEur) ?? 0) > 0)
    .map((m): SavedRow => {
      const priced = m.eur == null; // the euros are the hours times the hour cost
      return { projectId: p.projectId ?? p.caseId, title: p.title ?? "", check: m.check ?? null, eur: euroOf(m, hourCostEur) ?? 0, hours: priced ? m.hours ?? null : null, rate: priced ? hourCostEur : null };
    }));
  return {
    rows: rows.sort((a, b) => b.eur - a.eur),
    eur,
    co2Kg: verifiedSum(confirmed, (m) => m.co2Kg) ?? 0,
    kwh: verifiedSum(confirmed, (m) => m.kwh) ?? 0,
    scrap: verifiedSum(confirmed, (m) => m.scrap) ?? 0,
    unconfirmedEur: scoped.flatMap((p) => p.measures.filter((m) => !m.verified && m.better)).reduce((t, m) => t + (euroOf(m, hourCostEur) ?? 0), 0),
    unpricedHours: hourCostEur === null || hourCostEur <= 0 ? verifiedSum(confirmed, (m) => (m.eur == null ? m.hours : null)) ?? 0 : 0,
  };
}
