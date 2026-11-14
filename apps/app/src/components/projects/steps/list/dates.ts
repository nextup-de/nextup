import type { ClockSpec } from "@/features/clock";
import { berlinDate, dateOfWorkday, workdayOf } from "@/features/clock/calendar";

/** Match the day numbers displayed by dayFormatter in each clock mode. */
export function listDueDate(date: string, clock: ClockSpec, today: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const instant = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) return null;
  if (clock.mode === "workdays") {
    const day = workdayOf(instant, clock.calendar);
    return day >= 1 && dateOfWorkday(day, clock.calendar) === date ? day : null;
  }
  const day = Math.round((instant.getTime() - Date.parse(`${berlinDate(today)}T12:00:00Z`)) / 86400000);
  return day >= 0 ? day : null;
}

export function listDueOffset(clock: ClockSpec, preset: 0 | 3 | 5 | 10): number {
  return clock.mode === "demo" && preset >= 5 ? preset / 5 * 7 : preset;
}
