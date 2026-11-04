// The company's working calendar (one row per company, CLK/D6). No row = DEFAULT_CALENDAR.
import { calendarSpec, DEFAULT_CALENDAR, type CalendarSpec } from "@/features/clock";
import { getDb } from "./client";
import { memo } from "./company-memo";
import type { Tx } from "./org-edit";

export function loadCalendar(companyId: string): Promise<CalendarSpec> {
  return memo("calendar", companyId, async () => {
    const row = await getDb().companyCalendar.findUnique({ where: { companyId } });
    return row ? calendarSpec(row) : { ...DEFAULT_CALENDAR };
  });
}

/** Replaces the company's calendar. The spec is checked again on the way in. */
export async function saveCalendar(companyId: string, spec: CalendarSpec, by?: string, tx?: Tx): Promise<void> {
  const s = calendarSpec(spec);
  const data = { region: s.region, workdays: s.workdays, extraHolidays: s.extraHolidays, extraWorkdays: s.extraWorkdays, updatedBy: by ?? null };
  await (tx ?? getDb()).companyCalendar.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
}
