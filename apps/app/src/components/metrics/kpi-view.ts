// The KPI report as display text (MET D20). Pure: a ZI result and a translator in, strings out. A hidden row
// carries the "too few" text in every cell and no value (D6); with projects off, savings, energy, CO2 and premiums
// are replaced by the projects-off line.
import type { ZiRow } from "@/features/metrics/types";
import type { Locale, MessageKey, T } from "@/i18n";
import { formatEuro, formatNumber } from "@/i18n/format";

type Zi = { company: ZiRow; units: ZiRow[] };

export type KpiCell = { id: string; label: string; value: string };
export type KpiRowView = { key: string; label: string; depth: number; hidden: boolean; cells: KpiCell[] };
export type KpiView = {
  tiles: KpiCell[];
  rows: KpiRowView[];
  /** Set when projects are off: shown in place of the project figures. */
  projectsOffLine: string | null;
  allHidden: boolean;
};

const IDS = [
  ["participation", "kpis.tileParticipation", "kpis.colParticipation"],
  ["ideasPer100", "kpis.tileIdeasPer100", "kpis.colIdeasPer100"],
  ["implemented", "kpis.tileImplemented", "kpis.colImplemented"],
  ["days", "kpis.tileDays", "kpis.colDays"],
  ["savings", "kpis.tileSavings", "kpis.colSavings"],
  ["energy", "kpis.tileEnergy", "kpis.colEnergy"],
  ["co2", "kpis.tileCo2", "kpis.colCo2"],
  ["premiums", "kpis.tilePremiums", "kpis.colPremiums"],
] as const satisfies readonly (readonly [string, MessageKey, MessageKey])[];

const PROJECT_IDS: readonly string[] = ["savings", "energy", "co2", "premiums"];
const DASH = "–";

function values(row: ZiRow, locale: Locale, t: T): Record<string, string> {
  const pct = (v: number | null) => (v === null ? DASH : `${formatNumber(locale, v)} %`);
  const eur = (v: number | null) => (v === null ? DASH : formatEuro(locale, Math.round(v)));
  const amount = (v: number | null, unit: string) => (v === null ? DASH : `${formatNumber(locale, v)} ${unit}`);
  return {
    participation: pct(row.participationPct),
    ideasPer100: row.ideasPer100 === null ? DASH : formatNumber(locale, row.ideasPer100),
    implemented: pct(row.implementationPct),
    days: row.medianDaysToDecision === null ? DASH : t("kpis.daysValue", { value: formatNumber(locale, row.medianDaysToDecision) }),
    savings: eur(row.savingsEur),
    energy: amount(row.energyKwh, "kWh"),
    co2: amount(row.co2Kg, "kg"),
    premiums: eur(row.premiumsEur),
  };
}

export function kpiView(zi: Zi, t: T, projectsOn: boolean, locale: Locale): KpiView {
  const ids = IDS.filter(([id]) => projectsOn || !PROJECT_IDS.includes(id));
  const cellsOf = (row: ZiRow, kind: "tile" | "col"): KpiCell[] => {
    const text = values(row, locale, t);
    return ids.map(([id, tile, col]) => ({ id, label: t(kind === "tile" ? tile : col), value: row.hidden ? t("kpis.tooFew") : text[id] }));
  };
  return {
    tiles: cellsOf(zi.company, "tile"),
    rows: zi.units.map((u, i) => ({ key: u.unitId ?? String(i), label: u.label, depth: u.depth, hidden: u.hidden, cells: cellsOf(u, "col") })),
    projectsOffLine: projectsOn ? null : t("kpis.projectsOff"),
    allHidden: zi.company.hidden,
  };
}

/** A field with `;`, `"` or a line break gets quotes; a leading = + - @ is defused so a sheet does not run it. */
function field(raw: string): string {
  const safe = /^[=+\-@]/.test(raw) ? "'" + raw : raw;
  return /[;"\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

/** `;` separated, the same suppression as the screen: a hidden row reads "too few" in every figure column (D6, D19). */
export function kpisCsv(zi: Zi, locale: Locale, t: T, projectsOn: boolean): string {
  const num = (v: number | null, hidden: boolean) => {
    if (hidden) return t("kpis.csvTooFew");
    if (v === null) return "";
    const s = String(Math.round(v * 10) / 10);
    return locale === "de" ? s.replace(".", ",") : s;
  };
  const head: MessageKey[] = ["kpis.csvUnit", "kpis.csvParticipation", "kpis.csvIdeasPer100", "kpis.csvImplemented", "kpis.csvDays"];
  if (projectsOn) head.push("kpis.csvSavings", "kpis.csvEnergy", "kpis.csvCo2", "kpis.csvPremiums");
  const line = (r: ZiRow, label: string) => [
    label,
    num(r.participationPct, r.hidden), num(r.ideasPer100, r.hidden), num(r.implementationPct, r.hidden), num(r.medianDaysToDecision, r.hidden),
    ...(projectsOn ? [num(r.savingsEur, r.hidden), num(r.energyKwh, r.hidden), num(r.co2Kg, r.hidden), num(r.premiumsEur, r.hidden)] : []),
  ];
  const lines = [head.map((k) => t(k)), line(zi.company, t("kpis.company")), ...zi.units.map((u) => line(u, u.label))];
  return lines.map((l) => l.map(field).join(";")).join("\n") + "\n";
}
