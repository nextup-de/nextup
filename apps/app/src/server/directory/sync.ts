// The directory sync loop (plan DIR, D11). Every DIRECTORY_INTERVAL_MS, for each company with the sync
// switched on: take the run's lease (one runner per company, also across processes), read pages from the
// stored cursor until the source says there are no more, apply each, store the new cursor only after the
// last page, record the counts - or the error, keeping the old cursor. One company's failure never stops
// the others. Follows server/jira-sync.ts: started from instrumentation.ts, idempotent, never throws.
//
//   DIRECTORY_INTERVAL_MS   the round interval; default 900000 (15 minutes)
//
// Not a "use server" module.
import type { DirectorySource } from "@nextup/contracts/public";
import { entraApp } from "@/features/auth/entra";
import { sourceKind, type DirectoryCounts, type DirectorySourceKind } from "@/features/directory";
import { getDb, hasDatabase } from "@/lib/db/client";
import { applyDirectoryDelta } from "@/lib/db/directory";
import {
  claimDirectoryLease, companiesWithDirectoryOn, loadDirectoryRun, recordDirectoryRun, releaseDirectoryLease,
  saveDirectoryCursor,
} from "@/lib/db/directory-run";
import { DIRECTORY_ACTOR, recordAudit } from "@/server/audit/record";
import { successFactorsFor } from "@/server/connectors/directory";
import { graphDirectory } from "@/server/directory/graph";

/** A round that dies without releasing loses its lease after this. */
const LEASE_MS = 10 * 60_000;
const MAX_PAGES = 50;

export type DirectoryCompany = { id: string; slug: string };
/** Which source reads this company's directory, or null when there is no adapter for it. */
export type SourceFor = (
  company: DirectoryCompany & { entraTenantId: string | null; source: DirectorySourceKind },
  now?: Date,
) => Promise<DirectorySource | null> | DirectorySource | null;

const intervalMs = (): number => {
  const n = Number(process.env.DIRECTORY_INTERVAL_MS);
  return Number.isFinite(n) && n >= 500 ? n : 900_000;
};

/** A source that remembers where its round ended (the Graph deltaLink) says so through deltaLink(). */
const endOf = (s: DirectorySource): string | null => {
  const f = (s as { deltaLink?: unknown }).deltaLink;
  return typeof f === "function" ? ((f.call(s) as string | null) ?? null) : null;
};

/** One company's round. Never throws: a failure is recorded on its DirectoryRun row. */
export async function runDirectoryCompany(company: DirectoryCompany, sourceFor: SourceFor = defaultSourceFor, now: Date = new Date()): Promise<void> {
  if (!(await claimDirectoryLease(company.id, LEASE_MS, now))) return;
  try {
    const row = await loadDirectoryRun(company.id);
    if (!row?.on) return;
    const kind = sourceKind(row.source);
    const tenant = await getDb().company.findUnique({ where: { id: company.id }, select: { entraTenantId: true } });
    const source = await sourceFor({ ...company, entraTenantId: tenant?.entraTenantId ?? null, source: kind }, now);
    if (!source) return void (await recordDirectoryRun(company.id, { error: `no adapter for ${row.source}` }, now));
    const total: DirectoryCounts = { added: 0, updated: 0, deactivated: 0, handed: 0 };
    let cursor = row.cursor;
    let finished = false;
    for (let i = 0; i < MAX_PAGES && !finished; i++) {
      const page = await source.delta({ companyId: company.id, cursor });
      const c = await applyDirectoryDelta(company.id, kind, page, now);
      total.added += c.added; total.updated += c.updated; total.deactivated += c.deactivated; total.handed += c.handed;
      if (page.nextCursor) cursor = page.nextCursor;
      else finished = true;
    }
    // Past the page limit the round is not finished: the pages are applied (applying twice changes nothing),
    // the stored cursor stays and the next round starts over.
    if (finished) await saveDirectoryCursor(company.id, endOf(source) ?? cursor);
    await getDb().$transaction(async (tx) => {
      await recordDirectoryRun(company.id, { counts: total }, now, tx);
      if (total.added + total.updated + total.deactivated + total.handed > 0) {
        await recordAudit(company.id, {
          actor: DIRECTORY_ACTOR, action: "audit.directory.run", target: { kind: "directory", id: kind },
          changes: {
            added: { before: null, after: total.added }, updated: { before: null, after: total.updated },
            deactivated: { before: null, after: total.deactivated }, handed: { before: null, after: total.handed },
          },
          source: "directory",
        }, tx);
      }
    });
  } catch (err) {
    await recordDirectoryRun(company.id, { error: err instanceof Error ? err.message : "failed" }, now).catch(() => undefined);
  } finally {
    await releaseDirectoryLease(company.id).catch(() => undefined);
  }
}

/** Graph for a company with a tenant and an Entra app (as before). */
const graphOnly: SourceFor = (c) => {
  if (c.source !== "graph") return null;
  const app = entraApp();
  return c.entraTenantId && app ? graphDirectory({ tenantId: c.entraTenantId, app }) : null;
};

/** The default (D9): Graph as graphOnly, SuccessFactors from the company's Integration row; null when there is none. */
export const defaultSourceFor: SourceFor = (c, now) =>
  c.source === "successfactors" ? successFactorsFor(c.id, now) : graphOnly(c, now);

/** One round over every company with the sync on. Never throws. */
export async function runDirectoryOnce(now: Date = new Date(), source?: SourceFor): Promise<void> {
  try {
    const companies = await companiesWithDirectoryOn();
    for (const c of companies) await runDirectoryCompany(c, source, now).catch(() => undefined);
  } catch (err) {
    console.warn("[directory-sync] round failed -", err instanceof Error ? err.message : err);
  }
}

const globalForDirectory = globalThis as unknown as { __nextupDirectorySync?: ReturnType<typeof setInterval> };

/** Start the loop from instrumentation.ts. Idempotent (dev reloads this module). A no-op without a database. */
export function startDirectorySync(): void {
  if (!hasDatabase() || globalForDirectory.__nextupDirectorySync) return;
  globalForDirectory.__nextupDirectorySync = setInterval(() => void runDirectoryOnce(), intervalMs());
  void runDirectoryOnce();
}
