// The pilot report by week (PIL D11): stage moves read from the audit rows, the week list, and one week's
// `pilotReport`. Every query names the company. The result holds numbers and unit labels, never a person.
import { pilotWeeks, weekPeriod, type PilotWeek, type PilotWeeks, type StageMove } from "@/features/pilot/weeks";
import type { PilotReport, Period } from "@/features/metrics/types";
import { getDb } from "./client";
import { loadCalendar } from "./calendar";
import { pilotReport } from "./pilot-report";

const STAGE_ACTION = "audit.company.stage";

const stageOf = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** The company's stage moves, oldest first: `changes.stage.{before,after}` of each stage audit row. */
export async function stageMoves(companyId: string): Promise<StageMove[]> {
  const rows = await getDb().auditEvent.findMany({
    where: { companyId, action: STAGE_ACTION },
    orderBy: [{ at: "asc" }, { id: "asc" }],
    select: { at: true, changes: true },
  });
  const moves: StageMove[] = [];
  for (const r of rows) {
    const stage = (r.changes as { stage?: { before?: unknown; after?: unknown } } | null)?.stage;
    const after = stageOf(stage?.after);
    if (after) moves.push({ at: r.at, before: stageOf(stage?.before), after });
  }
  return moves;
}

/** The report weeks: none before the pilot (and none in a sandbox that never was in pilot), paused in sandbox after. */
export async function pilotWeekList(companyId: string, now: Date = new Date()): Promise<PilotWeeks> {
  return pilotWeeks(await stageMoves(companyId), now);
}

export type PilotWeekData = { week: PilotWeek; period: Period; report: PilotReport };

/** One week of the list, or null when the Monday is not a report week or the week has no working day. */
export async function pilotWeek(companyId: string, monday: string, now: Date = new Date()): Promise<PilotWeekData | null> {
  const list = await pilotWeekList(companyId, now);
  const week = list.weeks.find((w) => w.monday === monday);
  if (!week) return null;
  const period = weekPeriod(monday, await loadCalendar(companyId));
  if (!period) return null;
  return { week, period, report: await pilotReport(companyId, period.from, period.to) };
}
