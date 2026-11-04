// Report weeks of the pilot (PIL D11). Pure: no database, no system clock. ISO weeks, Monday to Sunday, on the
// Europe/Berlin calendar. A week's period is its working days; a pilot has no stored length, so no total.
import type { CalendarSpec } from "@/features/clock";
import { berlinDate, workdayOf } from "@/features/clock/calendar";
import type { Period } from "@/features/metrics/types";

const DAY_MS = 86_400_000;
const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};
const isoOf = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);
/** Noon UTC of a date, so Europe/Berlin names the same calendar date. */
const noon = (iso: string): Date => new Date(dayNumber(iso) * DAY_MS + 12 * 3_600_000);

export const addDays = (iso: string, n: number): string => isoOf(dayNumber(iso) + n);

/** The Monday of the ISO week that holds the date. */
export function mondayOf(iso: string): string {
  const weekday = (new Date(dayNumber(iso) * DAY_MS).getUTCDay() + 6) % 7;
  return addDays(iso, -weekday);
}

/** The ISO week number of a Monday (the week of its Thursday). */
export function isoWeekNumber(monday: string): number {
  const thursday = dayNumber(addDays(monday, 3));
  const year = new Date(thursday * DAY_MS).getUTCFullYear();
  return Math.floor((thursday - dayNumber(`${year}-01-01`)) / 7) + 1;
}

/** True for `yyyy-mm-dd` that is a real date and a Monday. */
export function isMonday(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return isoOf(dayNumber(v)) === v && mondayOf(v) === v;
}

/**
 * The working days of a week: from the day after the last working day before Monday, to the last working day
 * up to Sunday. Null when the week has no working day. A holiday Monday starts the week on Tuesday.
 */
export function weekPeriod(monday: string, cal: CalendarSpec): Period | null {
  const from = workdayOf(noon(addDays(monday, -1)), cal) + 1;
  const to = workdayOf(noon(addDays(monday, 6)), cal);
  return from > to ? null : { from, to };
}

export type StageMove = { at: Date; before: string | null; after: string };

export type PilotWeek = { monday: string; sunday: string; week: number; pilotWeek: number };

export type PilotWeeks = {
  /** before: no move to pilot yet; running: in pilot or live; paused: the company is back in sandbox. */
  state: "before" | "running" | "paused";
  /** The weeks, oldest first; the last one is the current week, or the week of the pause. */
  weeks: PilotWeek[];
  /** The Berlin date of the move back to sandbox while paused. */
  pausedSince: string | null;
};

/**
 * Pilot week 1 is the week of the first move to pilot. The weeks run to today's week, or to the week of the last
 * move to sandbox when the company is back there (paused). Moves may come in any order.
 */
export function pilotWeeks(stageMoves: readonly StageMove[], today: Date): PilotWeeks {
  const moves = [...stageMoves].sort((a, b) => a.at.getTime() - b.at.getTime());
  const first = moves.find((m) => m.after === "pilot");
  if (!first) return { state: "before", weeks: [], pausedSince: null };
  const current = moves[moves.length - 1].after;
  const paused = current === "sandbox";
  const startMonday = mondayOf(berlinDate(first.at));
  const end = paused ? berlinDate(moves[moves.length - 1].at) : berlinDate(today);
  const endMonday = mondayOf(end);
  const weeks: PilotWeek[] = [];
  for (let monday = startMonday; monday <= endMonday; monday = addDays(monday, 7)) {
    weeks.push({ monday, sunday: addDays(monday, 6), week: isoWeekNumber(monday), pilotWeek: weeks.length + 1 });
  }
  return { state: paused ? "paused" : "running", weeks, pausedSince: paused ? end : null };
}
