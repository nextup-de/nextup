"use server";
// The Dashboard's server side (MET D19, D21): every action asks companyAdminOf(slug) first and uses the company
// id of that viewer, never one from the caller. A refused call is { error: "forbidden" }.
import { createHash } from "node:crypto";
import { baselineFromCsv } from "@/features/metrics/baseline";
import { breakdownCsv, csvFileName } from "@/features/metrics/csv";
import type { Baseline, DashboardData } from "@/features/metrics/types";
import { workdayOf } from "@/features/clock/calendar";
import { createT } from "@/i18n";
import { localeForUser } from "@/i18n/server";
import { saveBaseline } from "@/lib/db/baseline";
import { loadCalendar } from "@/lib/db/calendar";
import { getDb } from "@/lib/db/client";
import { dashboardData, type DashboardInput } from "@/lib/db/metrics";
import { recordAudit } from "@/server/audit/record";
import { companyAdminOf } from "./settings/guard";

const KINDS = ["30d", "quarter", "golive"] as const;
const MAX_CSV_BYTES = 100_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const FORBIDDEN = { error: "forbidden" } as const;
type Forbidden = typeof FORBIDDEN;

function cleanInput(input: DashboardInput): DashboardInput {
  return {
    kind: (KINDS as readonly unknown[]).includes(input?.kind) ? input.kind : "30d",
    unitId: typeof input?.unitId === "string" && input.unitId !== "" ? input.unitId : null,
  };
}

export async function loadDashboardAction(slug: string, input: DashboardInput): Promise<DashboardData | Forbidden> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return FORBIDDEN;
  return dashboardData(viewer.companyId, cleanInput(input));
}

export async function exportDashboardCsvAction(
  slug: string,
  input: DashboardInput,
  kind: "unit" | "role",
): Promise<{ name: string; body: string } | Forbidden> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return FORBIDDEN;
  const [data, locale] = await Promise.all([dashboardData(viewer.companyId, cleanInput(input)), localeForUser(viewer.companyId, viewer.userId)]);
  const rows = kind === "role" ? data.roles : data.units;
  return {
    name: csvFileName(kind === "role" ? "roles" : "units", viewer.companySlug, data.fromDate, data.toDate),
    body: breakdownCsv(rows, locale, createT(locale)),
  };
}

export type SaveBaselineResult =
  | { ok: true }
  | Forbidden
  | { error: "period" | "source" | "too-large" }
  | { error: "csv"; reason: "header" | "key" | "value"; line: number };

const text = (form: FormData, key: string): string => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

/**
 * Fields: `fromDate`, `toDate` (ISO, first and last day of the fixed period; a working-days company), or
 * `fromDay`, `toDay` (a demo company); optional `csv` (text or file) with `source` (its label).
 */
export async function saveBaselineAction(slug: string, form: FormData): Promise<SaveBaselineResult> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return FORBIDDEN;
  const companyId = viewer.companyId;

  const company = await getDb().company.findUnique({ where: { id: companyId }, select: { stage: true } });
  if (!company) return FORBIDDEN;
  let fromDay: number;
  let toDay: number;
  let fromDate: string | null = null;
  let toDate: string | null = null;
  if (company.stage === "demo") {
    fromDay = Number(text(form, "fromDay"));
    toDay = Number(text(form, "toDay"));
  } else {
    fromDate = text(form, "fromDate");
    toDate = text(form, "toDate");
    if (!ISO.test(fromDate) || !ISO.test(toDate)) return { error: "period" };
    const calendar = await loadCalendar(companyId);
    const at = (iso: string) => new Date(iso + "T12:00:00Z");
    const before = new Date(at(fromDate).getTime() - 86_400_000);
    fromDay = workdayOf(before, calendar) + 1;
    toDay = workdayOf(at(toDate), calendar);
  }
  if (!Number.isInteger(fromDay) || !Number.isInteger(toDay) || fromDay < 1 || fromDay > toDay) return { error: "period" };

  const imported: Baseline["imported"] = {};
  const raw = form.get("csv");
  const csv = typeof raw === "string" ? raw : raw instanceof File ? await raw.text() : "";
  if (csv.trim() !== "") {
    if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) return { error: "too-large" };
    const source = text(form, "source");
    if (source === "") return { error: "source" };
    const parsed = baselineFromCsv(csv);
    if ("error" in parsed) return { error: "csv", reason: parsed.error, line: parsed.line };
    const sha256 = createHash("sha256").update(csv).digest("hex");
    const importedAt = new Date().toISOString();
    for (const [key, value] of Object.entries(parsed.values)) {
      imported[key as keyof Baseline["imported"]] = { value: value as number, source, sha256, importedBy: viewer.userId, importedAt };
    }
  }

  const baseline: Baseline = { fromDay, toDay, fromDate, toDate, imported };
  await saveBaseline(companyId, baseline, viewer.userId, recordAudit);
  return { ok: true };
}
