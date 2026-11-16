// What confirmed results save (MET D7, LOOP/D20): the one place where the Dashboard's "Saved per year", the pilot
// report and the KPI report count impact figures, so the three can never disagree. Pure. A project is named by its
// title and linked by its id; no person is named or counted (D2).
import type { ReducedProject } from "@/features/projects/types";
import type { KpiProject, Period, Saved, SavedRow } from "./types";

export type ImpactMeasure = KpiProject["measures"][number];

const inPeriod = (d: number | null, p: Period): d is number => d !== null && d >= p.from && d <= p.to;

/** D7: a result counts for savings, energy, CO2 and outcomes only when a second person confirmed it and its verdict is "better". */
export const countsAsVerified = (m: ImpactMeasure): boolean => m.verified && m.better;

/** The projects finished in the period: whose results the reports count for that period. */
export const finishedIn = (projects: readonly KpiProject[], period: Period): KpiProject[] => projects.filter((p) => inPeriod(p.doneDay, period));

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
      check: m.check,
      confirmedDay: m.confirmedDay,
    })),
    premiumsEur: p.reward?.amount ?? 0,
    projectId: p.id,
    title: p.title,
  }));
}

/**
 * "Saved per year" on the Dashboard: the results confirmed in the period (in the unit scope, when one is chosen), each a
 * figure per year, summed by `verifiedSum` with the pilot report's rule (D7: confirmed by a second person, verdict better).
 * The period picks results by the day they were confirmed, the pilot report picks projects by the day they finished; over
 * a period that holds both, the two sums are the same. One row per counted result with a euro figure; CO2, energy and
 * scrap as totals. A "better" result nobody has confirmed yet is never in the sum: it is reported apart, as
 * `unconfirmedEur`, whatever its period. Null when no confirmed result saved a euro.
 */
export function savedPerYear(projects: readonly KpiProject[], period: Period, inScope: ((unitId: string | null) => boolean) | null): Saved | null {
  const scoped = projects.filter((p) => inScope === null || inScope(p.raiserUnitId));
  const confirmed = scoped
    .map((p) => ({ ...p, measures: p.measures.filter((m) => inPeriod(m.confirmedDay ?? null, period)) }))
    .filter((p) => p.measures.length > 0);
  const eur = verifiedSum(confirmed, (m) => m.eur) ?? 0;
  if (eur <= 0) return null;
  const rows = confirmed.flatMap((p) => p.measures.filter((m) => countsAsVerified(m) && (m.eur ?? 0) > 0)
    .map((m): SavedRow => ({ projectId: p.projectId ?? p.caseId, title: p.title ?? "", check: m.check ?? null, eur: m.eur ?? 0 })));
  return {
    rows: rows.sort((a, b) => b.eur - a.eur),
    eur,
    co2Kg: verifiedSum(confirmed, (m) => m.co2Kg) ?? 0,
    kwh: verifiedSum(confirmed, (m) => m.kwh) ?? 0,
    scrap: verifiedSum(confirmed, (m) => m.scrap) ?? 0,
    unconfirmedEur: scoped.flatMap((p) => p.measures.filter((m) => !m.verified && m.better)).reduce((t, m) => t + (m.eur ?? 0), 0),
  };
}
