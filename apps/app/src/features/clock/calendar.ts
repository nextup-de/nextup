// Working-day arithmetic (docs/plans CLK, D5). Pure: no database, no system clock.
import type { CalendarSpec, Region } from "./index";
import { holidaysOf } from "./holidays";

/** Working-day numbers count the working days after this date. */
export const CLOCK_EPOCH = "2025-01-01";

const DAY_MS = 86_400_000;

const berlinFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Europe/Berlin calendar date (yyyy-mm-dd) of an instant. */
export function berlinDate(date: Date): string {
  const parts = berlinFormat.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const holidayCache = new Map<string, Set<string>>();

function holidaySet(year: number, region: Region): Set<string> {
  const key = `${region}:${year}`;
  let set = holidayCache.get(key);
  if (!set) {
    set = new Set(holidaysOf(year, region));
    holidayCache.set(key, set);
  }
  return set;
}

function toDay(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

const EPOCH_DAY = toDay(CLOCK_EPOCH);

function workdayAt(day: number, cal: CalendarSpec, extraHol: Set<string>, extraWork: Set<string>): boolean {
  const date = fromDay(day);
  if (extraWork.has(date)) return true;
  if (extraHol.has(date)) return false;
  const weekday = ((new Date(day * DAY_MS).getUTCDay() + 6) % 7) + 1;
  if (!cal.workdays.includes(weekday)) return false;
  return !holidaySet(Number(date.slice(0, 4)), cal.region).has(date);
}

function tester(cal: CalendarSpec): (day: number) => boolean {
  const extraHol = new Set(cal.extraHolidays);
  const extraWork = new Set(cal.extraWorkdays);
  return (day) => workdayAt(day, cal, extraHol, extraWork);
}

/** Is this ISO date a working day of the calendar? */
export function isWorkday(isoDate: string, cal: CalendarSpec): boolean {
  return tester(cal)(toDay(isoDate));
}

/** Working days of cal in (CLOCK_EPOCH, Berlin date of date]; a non-working date has the number before it. */
export function workdayOf(date: Date, cal: CalendarSpec): number {
  const end = toDay(berlinDate(date));
  const is = tester(cal);
  let n = 0;
  for (let d = EPOCH_DAY + 1; d <= end; d++) if (is(d)) n++;
  return n;
}

/** ISO date of working day n (n >= 1). */
export function dateOfWorkday(n: number, cal: CalendarSpec): string {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`working day must be an integer >= 1, got ${n}`);
  if (cal.workdays.length === 0 && cal.extraWorkdays.length === 0) throw new RangeError("calendar has no working days");
  const is = tester(cal);
  let count = 0;
  for (let d = EPOCH_DAY + 1; ; d++) {
    if (is(d) && ++count === n) return fromDay(d);
  }
}

/** The ISO date n working days after (n < 0: before) isoDate; the start date itself need not be a working day. */
export function addWorkdays(isoDate: string, n: number, cal: CalendarSpec): string {
  const is = tester(cal);
  const step = n < 0 ? -1 : 1;
  let day = toDay(isoDate);
  let left = Math.abs(n);
  while (left > 0) {
    day += step;
    if (is(day)) left--;
  }
  return fromDay(day);
}
