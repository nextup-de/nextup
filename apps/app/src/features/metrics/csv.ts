// The breakdown as a CSV (MET D19): `;` separated, the same suppression as the screen. Pure.
import type { Locale, T } from "@/i18n";
import type { BreakdownRow } from "./types";

/** A field with `;`, `"` or a line break gets quotes; a leading = + - @ is defused so a sheet does not run it as a formula. */
function field(raw: string): string {
  const safe = /^[=+\-@]/.test(raw) ? "'" + raw : raw;
  return /[;"\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

function num(v: number | null, locale: Locale, tooFew: string, hidden: boolean): string {
  if (hidden) return tooFew;
  if (v === null) return "";
  const s = String(Math.round(v * 10) / 10);
  return locale === "de" ? s.replace(".", ",") : s;
}

export function breakdownCsv(rows: BreakdownRow[], locale: Locale, t: T): string {
  const tooFew = t("metrics.csvTooFew");
  const lines = [
    [t("metrics.csvName"), t("metrics.csvCases"), t("metrics.csvFirstReasonedAnswer"), t("metrics.csvOnTime"), t("metrics.csvPastPromise"), t("metrics.csvEscalated")],
    ...rows.map((r) => [
      r.label,
      num(r.cases, locale, tooFew, r.hidden),
      num(r.firstReasonedAnswer, locale, tooFew, r.hidden),
      num(r.onTimePct, locale, tooFew, r.hidden),
      num(r.pastPromise, locale, tooFew, r.hidden),
      num(r.escalated, locale, tooFew, r.hidden),
    ]),
  ];
  return lines.map((l) => l.map(field).join(";")).join("\n") + "\n";
}

const slugPart = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** `<prefix>-<slug>-<from>-<to>.csv`; a missing date reads "all". */
export function csvFileName(prefix: string, slug: string, fromDate: string | null, toDate: string | null): string {
  return [prefix, slug, fromDate ?? "all", toDate ?? "all"].map(slugPart).filter(Boolean).join("-") + ".csv";
}
