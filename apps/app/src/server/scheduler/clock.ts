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
import { seatAbove } from "@/features/knowledge";
import { loadKnowledge } from "@/lib/db/knowledge";
import { beforeAgentRun, writeAgentDue } from "./writers/agent";
import { beforeApprovalRun, writeApprovalDue } from "./writers/approval";
import { beforeCaseRun, writeCaseDue } from "./writers/case";
import { beforeOverloadRun, writeOverloadDue } from "./writers/overload";
import { beforeProjectRun, writeProjectDue } from "./writers/project";
import { clockDuePayload } from "./writers/shared";

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
  // Composer: a phase writes events in its writers/<area>.ts, never here.
  await beforeCaseRun(company.id, log.day);
  await beforeProjectRun(company.id, log.day);
  await beforeAgentRun(company.id, log.day);
  await beforeApprovalRun(company.id, log.day);
  await beforeOverloadRun(company.id, log.day);
  const knowledge = await loadKnowledge(company.id);
  const state = reduce(await companySeed(company, knowledge), log);
  const ctx = { state, today: log.day, companyId: company.id };
  let written = 0;
  for (const d of dueNow(state, log.day, (roleId, skip) => seatAbove(knowledge, roleId, skip)?.id ?? null)) {
    // The first area that writes an event for this Due wins; none: the Due is stored as a clock.due fact.
    const w = writeCaseDue(d, ctx) ?? writeProjectDue(d, ctx) ?? writeAgentDue(d, ctx) ?? writeApprovalDue(d, ctx) ?? writeOverloadDue(d, ctx);
    if (w && "skip" in w) continue;
    const row = w ?? { type: "clock.due" as CaseEventType, payload: clockDuePayload(d) };
    const r = await appendEventRow(
      company.id,
      { id: `e_clk_${company.id}_${d.idemKey}`, day: 0, type: row.type, actor: CLOCK_ACTOR, targetId: d.target, payload: row.payload },
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
