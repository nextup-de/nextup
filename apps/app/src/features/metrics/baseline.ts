// The baseline row (MET D12): parsing a stored value and reading an imported CSV. Pure.
import { PILOT_METRIC_KEYS, type Baseline, type PilotMetricKey } from "./types";

export const BASELINE_RULE_KEY = "metrics_baseline";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isDay = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isKey = (k: string): k is PilotMetricKey => (PILOT_METRIC_KEYS as readonly string[]).includes(k);

/** A stored value as a Baseline, or null when it is not one (reversed or non-integer period, unknown key, bad provenance). */
export function parseBaseline(value: unknown): Baseline | null {
  if (!isObj(value)) return null;
  const { fromDay, toDay } = value;
  if (!isDay(fromDay) || !isDay(toDay) || fromDay > toDay) return null;
  const dates: (string | null)[] = [];
  for (const k of ["fromDate", "toDate"] as const) {
    const d = value[k];
    if (d !== null && d !== undefined && typeof d !== "string") return null;
    dates.push(typeof d === "string" ? d : null);
  }
  const rawImported = value.imported ?? {};
  if (!isObj(rawImported)) return null;
  const imported: Baseline["imported"] = {};
  for (const [k, v] of Object.entries(rawImported)) {
    if (!isKey(k) || !isObj(v)) return null;
    const { value: n, source, sha256, importedBy, importedAt } = v;
    if (typeof n !== "number" || !Number.isFinite(n)) return null;
    if (typeof source !== "string" || typeof sha256 !== "string" || typeof importedBy !== "string" || typeof importedAt !== "string") return null;
    imported[k] = { value: n, source, sha256, importedBy, importedAt };
  }
  return { fromDay, toDay, fromDate: dates[0], toDate: dates[1], imported };
}

/**
 * `metric;value` lines, decimal comma or point. The first non-empty line is the header. Returns the
 * values, or the first error with its 1-based line number. The caller attaches source, file hash,
 * importer and timestamp before anything is stored.
 */
export function baselineFromCsv(
  csv: string,
): { values: Partial<Record<PilotMetricKey, number>> } | { error: "header" | "key" | "value"; line: number } {
  const lines = csv.replace(/^﻿/, "").split(/\r\n|\n|\r/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length || lines[i].trim().toLowerCase() !== "metric;value") return { error: "header", line: i < lines.length ? i + 1 : 1 };
  const values: Partial<Record<PilotMetricKey, number>> = {};
  for (i++; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw === "") continue;
    const parts = raw.split(";");
    const key = parts[0].trim();
    if (!isKey(key)) return { error: "key", line: i + 1 };
    const num = (parts[1] ?? "").trim().replace(",", ".");
    if (parts.length !== 2 || !/^-?\d+(\.\d+)?$/.test(num)) return { error: "value", line: i + 1 };
    values[key] = Number(num);
  }
  return { values };
}
