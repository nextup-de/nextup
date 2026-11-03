// What the Calendar settings page lists besides the form: the next days off and why each is off.
// Pure: a calendar and today's ISO date in, plain rows out.
import { isWorkday } from "@/features/clock/calendar";
import { holidaysOf } from "@/features/clock/holidays";
import type { CalendarSpec } from "@/features/clock";

export type OffReason = "weekend" | "holiday" | "extra";
export type DayOff = { date: string; reason: OffReason };

const DAY_MS = 86_400_000;
const nextIso = (iso: string): string => new Date(Date.parse(`${iso}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/** The next `count` non-working days from `today` on (today included), within a year. */
export function nextDaysOff(today: string, cal: CalendarSpec, count = 5): DayOff[] {
  const extra = new Set(cal.extraHolidays);
  const out: DayOff[] = [];
  let d = today;
  for (let i = 0; i < 366 && out.length < count; i++, d = nextIso(d)) {
    if (isWorkday(d, cal)) continue;
    const reason: OffReason = extra.has(d) ? "extra" : holidaysOf(Number(d.slice(0, 4)), cal.region).includes(d) ? "holiday" : "weekend";
    out.push({ date: d, reason });
  }
  return out;
}
