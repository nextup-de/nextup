// Gives the stored events of every real (non-demo) company working-day numbers (CLK-B1, D9): each
// event's `day` becomes workdayOf(ts, calendar). Demo companies are never touched. Idempotent.
import { workdayOf } from "@/features/clock/calendar";
import { getDb } from "./client";
import { loadCalendar } from "./calendar";

export type ClockBackfillLine = { slug: string; changed: number; line: string };

export async function backfillClock(): Promise<ClockBackfillLine[]> {
  const db = getDb();
  const companies = await db.company.findMany({ where: { stage: { not: "demo" } }, select: { id: true, slug: true }, orderBy: { slug: "asc" } });
  const out: ClockBackfillLine[] = [];
  for (const c of companies) {
    const cal = await loadCalendar(c.id);
    const events = await db.caseEvent.findMany({ where: { companyId: c.id }, select: { id: true, day: true, ts: true } });
    const byDay = new Map<number, string[]>();
    for (const e of events) {
      const day = workdayOf(e.ts, cal);
      if (day !== e.day) byDay.set(day, [...(byDay.get(day) ?? []), e.id]);
    }
    let changed = 0;
    for (const [day, ids] of byDay) {
      const { count } = await db.caseEvent.updateMany({ where: { companyId: c.id, id: { in: ids } }, data: { day } });
      changed += count;
    }
    out.push({ slug: c.slug, changed, line: changed > 0 ? `${c.slug}: ${changed} days set` : `${c.slug}: left as it is` });
  }
  return out;
}
