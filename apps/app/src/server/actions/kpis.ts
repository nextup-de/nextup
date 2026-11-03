"use server";
// The KPI report's server side (MET D19, D20, D21): every action asks companyAdminOf(slug) first and uses the
// company id of that viewer, never one from the caller. A refused call is { error: "forbidden" }.
import { kpisCsv } from "@/components/metrics/kpi-view";
import { csvFileName } from "@/features/metrics/csv";
import { createT } from "@/i18n";
import { localeForUser } from "@/i18n/server";
import { kpisData, type KpiPeriodKind, type KpisData } from "@/lib/db/pilot-report";
import { companyAdminOf } from "./settings/guard";

const KINDS = ["year", "lastYear", "golive"] as const;
const FORBIDDEN = { error: "forbidden" } as const;
type Forbidden = typeof FORBIDDEN;

export type KpisInput = { kind: KpiPeriodKind };

const cleanKind = (input: KpisInput): KpiPeriodKind => ((KINDS as readonly unknown[]).includes(input?.kind) ? input.kind : "year");

export async function loadKpisAction(slug: string, input: KpisInput): Promise<KpisData | Forbidden> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return FORBIDDEN;
  return kpisData(viewer.companyId, cleanKind(input));
}

export async function exportKpisCsvAction(slug: string, input: KpisInput): Promise<{ name: string; body: string } | Forbidden> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return FORBIDDEN;
  const [data, locale] = await Promise.all([kpisData(viewer.companyId, cleanKind(input)), localeForUser(viewer.companyId, viewer.userId)]);
  return {
    name: csvFileName("nextup-kpis", viewer.companySlug, data.fromDate, data.toDate),
    body: kpisCsv(data.zi, locale, createT(locale), data.projectsOn),
  };
}
