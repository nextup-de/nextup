// The weekly check-in rhythm of a project (plan MOV, D21). Pure: a project's start day and weekday, a day number and the
// clock in, a working-day number out. The one place that knows which day a week's check-in falls on; the update reminder
// (clock), the lead's inbox item and the weekly draft all ask here, and never compute `checkInDay - 5` themselves.
import { dateOfWorkday, isWorkday, workdayOf } from "@/features/clock/calendar";
import type { CalendarSpec, ClockSpec } from "@/features/clock";
import type { ReducedProject } from "./types";

const DAY_MS = 86_400_000;
/** The working days of the demo clock: its week is five days long. */
const DEMO_WEEK = 5;

/** The weekday of a working-day number: 1 = Monday ... 7 = Sunday. The demo clock cycles Monday to Friday from day 0 = Monday. Workdays mode needs day >= 1. */
export function weekdayOfDay(day: number, clock: ClockSpec): number {
  if (clock.mode === "demo") return (((day % DEMO_WEEK) + DEMO_WEEK) % DEMO_WEEK) + 1;
  return isoWeekday(dateOfWorkday(day, clock.calendar));
}

/** The weekday the project's weekly check-in falls on: the one the lead set, else the weekday of its start; null before the start. */
export function checkInWeekdayOf(p: Pick<ReducedProject, "checkInWeekday" | "startedDay">, clock: ClockSpec): number | null {
  if (p.checkInWeekday !== null) return p.checkInWeekday;
  return p.startedDay === null ? null : weekdayOfDay(p.startedDay, clock);
}

/**
 * The working-day number of the check-in day of the week that contains `day`. Workdays mode: that weekday of the same ISO
 * week when it is a working day, else the next working day of that week, else the last working day before it in that week;
 * a week with no working day has no check-in (null, never a day of another week). Demo mode: startedDay + 5k. Null before the
 * start, when `day` is before the start, or when the week's check-in would fall before the start.
 */
export function checkInDayOf(p: Pick<ReducedProject, "checkInWeekday" | "startedDay">, day: number, clock: ClockSpec): number | null {
  if (p.startedDay === null || day < p.startedDay) return null;
  if (clock.mode === "demo") return p.startedDay + DEMO_WEEK * Math.floor((day - p.startedDay) / DEMO_WEEK);
  const weekday = checkInWeekdayOf(p, clock);
  if (weekday === null) return null;
  const found = checkInOfWeek(mondayOf(dateOfWorkday(day, clock.calendar)), weekday, clock.calendar);
  return found === null || found < p.startedDay ? null : found;
}

/** The check-in day of the nearest earlier week that has one, never before the start; null when there is none. */
export function previousCheckInDayOf(p: Pick<ReducedProject, "checkInWeekday" | "startedDay">, checkInDay: number, clock: ClockSpec): number | null {
  if (p.startedDay === null) return null;
  if (clock.mode === "demo") {
    const before = checkInDay - DEMO_WEEK;
    return before < p.startedDay ? null : before;
  }
  const weekday = checkInWeekdayOf(p, clock);
  if (weekday === null) return null;
  const startDate = dateOfWorkday(p.startedDay, clock.calendar);
  let monday = mondayOf(dateOfWorkday(checkInDay, clock.calendar));
  for (;;) {
    monday = shiftDate(monday, -7);
    // Weeks only go further back from here: once a week ends before the start, nothing after it can count.
    if (shiftDate(monday, 6) < startDate) return null;
    const found = checkInOfWeek(monday, weekday, clock.calendar);
    if (found !== null) return found >= p.startedDay ? found : null;
  }
}

/** The check-in working day of the ISO week that starts on `monday` (an ISO date), or null when the week has no working day to hold it. */
function checkInOfWeek(monday: string, weekday: number, cal: CalendarSpec): number | null {
  const at = (offset: number) => shiftDate(monday, offset);
  const target = weekday - 1;
  const order = [target];
  for (let o = target + 1; o <= 6; o++) order.push(o);
  for (let o = target - 1; o >= 0; o--) order.push(o);
  const date = order.map(at).find((d) => isWorkday(d, cal));
  return date === undefined ? null : workdayOf(new Date(`${date}T12:00:00Z`), cal);
}

function isoWeekday(isoDate: string): number {
  return ((new Date(`${isoDate}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

function shiftDate(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function mondayOf(isoDate: string): string {
  return shiftDate(isoDate, 1 - isoWeekday(isoDate));
}
