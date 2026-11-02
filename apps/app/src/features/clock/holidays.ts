// German public holidays, computed (docs/plans CLK, D7). Pure: ISO dates in, ISO dates out.
import type { Region } from "./index";

/** Federal holidays that are not tied to Easter, as [month, day]. */
const FIXED_FEDERAL: [number, number][] = [
  [1, 1],
  [5, 1],
  [10, 3],
  [12, 25],
  [12, 26],
];

/** Fixed-date state holidays: "month-day" -> regions that have it. */
const FIXED_STATE: { month: number; day: number; regions: Region[] }[] = [
  { month: 1, day: 6, regions: ["DE-BW", "DE-BY", "DE-ST"] },
  { month: 3, day: 8, regions: ["DE-BE", "DE-MV"] },
  { month: 8, day: 15, regions: ["DE-SL"] },
  { month: 9, day: 20, regions: ["DE-TH"] },
  { month: 10, day: 31, regions: ["DE-BB", "DE-HB", "DE-HH", "DE-MV", "DE-NI", "DE-SN", "DE-ST", "DE-SH", "DE-TH"] },
  { month: 11, day: 1, regions: ["DE-BW", "DE-BY", "DE-NW", "DE-RP", "DE-SL"] },
];

const CORPUS_CHRISTI: Region[] = ["DE-BW", "DE-BY", "DE-HE", "DE-NW", "DE-RP", "DE-SL"];
const REPENTANCE_DAY: Region[] = ["DE-SN"];

function iso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function shift(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Easter Sunday of a Gregorian year (anonymous Gregorian algorithm), as an ISO date. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

/** Public holidays of a year in a region: ISO dates, sorted, no duplicates. */
export function holidaysOf(year: number, region: Region): string[] {
  const out = new Set<string>();
  for (const [m, d] of FIXED_FEDERAL) out.add(iso(year, m, d));
  const easter = easterSunday(year);
  for (const off of [-2, 1, 39, 50]) out.add(shift(easter, off));
  for (const h of FIXED_STATE) if (h.regions.includes(region)) out.add(iso(year, h.month, h.day));
  if (CORPUS_CHRISTI.includes(region)) out.add(shift(easter, 60));
  if (REPENTANCE_DAY.includes(region)) {
    // the Wednesday before 23 Nov: step back from 22 Nov to the nearest Wednesday
    const nov22 = new Date(Date.UTC(year, 10, 22));
    const back = (nov22.getUTCDay() - 3 + 7) % 7;
    out.add(iso(year, 11, 22 - back));
  }
  return [...out].sort();
}
