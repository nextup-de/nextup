// The clock scheduler (CLK/D13). dueNow() says what fell due; this writes each fact once.
//
// Every CLOCK_INTERVAL_MS (default 60000), for every company that is not a demo: take its clock
// lease (one runner at a time, also across processes), load seed and log, append each Due as a
// clock.due event, record the run, release. The idemKey is unique per company, so a restart or a
// second instance cannot write a fact twice: a duplicate counts as done. Demo companies are left
// alone (their reducer escalates at render time). Started from instrumentation.ts, like jira-sync.ts.
//
// Not a "use server" module.
import { reduce } from "@/features/cases/reducer";
import type { CaseEventType } from "@/features/cases/events";
import { CLOCK_ACTOR } from "@/features/clock/actor";
import { dueNow } from "@/features/clock/due";
import { getDb, hasDatabase } from "@/lib/db/client";
import { claimClockLease, recordClockRun, releaseClockLease } from "@/lib/db/clock-lease";
import { companySeed } from "@/lib/db/companies";
import { appendEventRow, loadLog } from "@/lib/db/events";

/** A run that dies without releasing loses its lease after this. */
const LEASE_MS = 5 * 60_000;
const CLOCK_SOURCE = "clock";

const intervalMs = (): number => {
  const n = Number(process.env.CLOCK_INTERVAL_MS);
  return Number.isFinite(n) && n >= 500 ? n : 60_000;
};

/** One company's run. Throws on failure; the caller records it. Returns how many facts were newly written. */
async function runCompany(company: { id: string; slug: string; seedJson: unknown; stage: string }, now: Date): Promise<number> {
  const log = await loadLog(company.id, now);
  const state = reduce(await companySeed(company), log);
  let written = 0;
  for (const d of dueNow(state, log.day)) {
    if (d.kind === "handover") {
      const seat = state.seats.find((x) => x.id === d.toRoleHolderId);
      if (!seat) continue; // the seat is gone
      const h = await appendEventRow(
        company.id,
        { id: `e_clk_${company.id}_${d.idemKey}`, day: 0, type: "case.handed" as CaseEventType, actor: CLOCK_ACTOR, targetId: d.target, payload: { to: seat.label, toRoleHolderId: seat.id, why: "deadline" } },
        { source: CLOCK_SOURCE, idemKey: d.idemKey, now },
      );
      if (!h.ok) throw new Error(h.error);
      if (!h.duplicate) written++;
      continue;
    }
    const payload: Record<string, unknown> = { kind: d.kind, dueDay: d.dueDay };
    if (d.check !== undefined) payload.check = d.check;
    if (d.toRoleHolderId !== undefined) payload.toRoleHolderId = d.toRoleHolderId;
    const r = await appendEventRow(
      company.id,
      { id: `e_clk_${company.id}_${d.idemKey}`, day: 0, type: "clock.due" as CaseEventType, actor: CLOCK_ACTOR, targetId: d.target, payload },
      { source: CLOCK_SOURCE, idemKey: d.idemKey, now },
    );
    if (!r.ok) throw new Error(r.error);
    if (!r.duplicate) written++;
  }
  return written;
}

/**
 * One pass over every non-demo company. A company whose lease another run holds is skipped; one that
 * fails records its error and never stops the others. Never throws.
 */
export async function runClockOnce(now: Date = new Date()): Promise<{ slug: string; written: number }[]> {
  const out: { slug: string; written: number }[] = [];
  // A plain Company read, no tenant rows (as companiesWithIntegrationOn).
  const companies = await getDb().company.findMany({
    where: { stage: { not: "demo" } },
    select: { id: true, slug: true, seedJson: true, stage: true },
    orderBy: { createdAt: "asc" },
  });
  for (const company of companies) {
    try {
      if (!(await claimClockLease(company.id, LEASE_MS, now))) continue;
    } catch (e) {
      console.warn(`[clock] ${company.slug}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    try {
      const written = await runCompany(company, now);
      await recordClockRun(company.id, {}, now);
      out.push({ slug: company.slug, written });
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      console.warn(`[clock] ${company.slug}: ${why}`);
      await recordClockRun(company.id, { error: why }, now).catch(() => undefined);
    } finally {
      await releaseClockLease(company.id).catch(() => undefined);
    }
  }
  return out;
}

const globalForClock = globalThis as unknown as { __nextupClock?: ReturnType<typeof setInterval> };

const tick = (): void => {
  void runClockOnce().catch((e) => console.warn(`[clock] run: ${e instanceof Error ? e.message : String(e)}`));
};

/** Start the loop from instrumentation.ts. Idempotent (dev reloads this module); a no-op without a database. */
export function startClock(): void {
  if (!hasDatabase() || globalForClock.__nextupClock) return;
  globalForClock.__nextupClock = setInterval(tick, intervalMs());
  tick();
}
