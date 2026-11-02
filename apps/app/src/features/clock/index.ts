// The company clock's types and the working calendar spec (docs/plans CLK, D6/D8). Pure: no date
// arithmetic yet (CLK-A1), no database. A company without a CompanyCalendar row has DEFAULT_CALENDAR.

export const REGIONS = [
  "DE", "DE-BW", "DE-BY", "DE-BE", "DE-BB", "DE-HB", "DE-HH", "DE-HE", "DE-MV", "DE-NI", "DE-NW", "DE-RP", "DE-SL", "DE-SN", "DE-ST", "DE-SH", "DE-TH",
] as const;
export type Region = (typeof REGIONS)[number];

/** workdays are ISO weekdays, 1 = Monday ... 7 = Sunday; the extra lists hold ISO dates (yyyy-mm-dd). */
export type CalendarSpec = { region: Region; workdays: number[]; extraHolidays: string[]; extraWorkdays: string[] };

export const DEFAULT_CALENDAR: CalendarSpec = { region: "DE", workdays: [1, 2, 3, 4, 5], extraHolidays: [], extraWorkdays: [] };

/** demo = the simulated day counter; workdays = the real calendar of the company. */
export type ClockSpec = { mode: "demo" } | { mode: "workdays"; calendar: CalendarSpec };

export const DEMO_CLOCK: ClockSpec = { mode: "demo" };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = ISO_DATE.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function isoDates(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.filter(isIsoDate))].sort() : [];
}

/** Checks a stored row (or anything) and falls back per field. Never throws. */
export function calendarSpec(row: unknown): CalendarSpec {
  const r = typeof row === "object" && row !== null ? (row as Record<string, unknown>) : {};
  const region = (REGIONS as readonly unknown[]).includes(r.region) ? (r.region as Region) : DEFAULT_CALENDAR.region;
  const days = Array.isArray(r.workdays)
    ? [...new Set(r.workdays.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b)
    : [];
  return {
    region,
    workdays: days.length > 0 ? days : [...DEFAULT_CALENDAR.workdays],
    extraHolidays: isoDates(r.extraHolidays),
    extraWorkdays: isoDates(r.extraWorkdays),
  };
}
