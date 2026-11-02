// The company's working calendar (one row per company, CLK/D6). No row = DEFAULT_CALENDAR.
import { calendarSpec, DEFAULT_CALENDAR, type CalendarSpec } from "@/features/clock";
import { getDb } from "./client";

export async function loadCalendar(companyId: string): Promise<CalendarSpec> {
  const row = await getDb().companyCalendar.findUnique({ where: { companyId } });
  return row ? calendarSpec(row) : { ...DEFAULT_CALENDAR };
}

/** Replaces the company's calendar. The spec is checked again on the way in. */
export async function saveCalendar(companyId: string, spec: CalendarSpec, by?: string): Promise<void> {
  const s = calendarSpec(spec);
  const data = { region: s.region, workdays: s.workdays, extraHolidays: s.extraHolidays, extraWorkdays: s.extraWorkdays, updatedBy: by ?? null };
  await getDb().companyCalendar.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
}
