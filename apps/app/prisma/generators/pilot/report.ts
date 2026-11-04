// `report`: one runPilotReports pass for one company (PIL D13). What it writes is outbox rows, as the weekly run would;
// the gate marks a sandbox company's rows skipped. Nothing is sent from here.
import { runPilotReports } from "../../../src/server/notify/pilot-report";

export async function reportOnce(slug: string, now: Date): Promise<number> {
  return runPilotReports(now, slug);
}
