// Next calls register() once, when the server starts and before it takes a request. Its jobs:
// find out whether the configured database is actually there (src/lib/db/mode.ts), then start the
// ticket sync (src/server/tickets-sync.ts) and the error counter's flush (src/server/errors.ts).
import type { Instrumentation } from "next";

export async function register() {
  // The proxy bundle evaluates this file too; only the Node server should open a connection.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { probeDatabase } = await import("@/lib/db/client");
  await probeDatabase();
  // After a vault key rotation (CONNECTOR_VAULT_KEY_PREVIOUS set) every stored secret is sealed again with the current key, once.
  void resealVault();
  // Bug reports to and replies from admin.sellux.ch, once a minute (a no-op without OPS_URL).
  const { startTicketSync } = await import("@/server/tickets-sync");
  startTicketSync();
  // The Jira sync, once a minute for each company that switched it on (a no-op without a database).
  const { startJiraSync } = await import("@/server/jira-sync");
  startJiraSync();
  // The clock scheduler writes what fell due, once, under a per-company lease (a no-op without a database).
  const { startClock } = await import("@/server/scheduler/clock");
  startClock();
  // The nightly retention run deletes what is past each company's rules, under a lease (a no-op without a database).
  const { startRetention } = await import("@/server/scheduler/retention");
  startRetention();
  // The directory sync, every 15 minutes for each company that switched it on (a no-op without a database or Entra app).
  const { startDirectorySync } = await import("@/server/directory/sync");
  startDirectorySync();
  // Every message NextUp sends: new events planned into the outbox, then the due rows delivered (a no-op without a database).
  const { startNotify } = await import("@/server/notify/loop");
  startNotify();
  // The audit log export (syslog or a daily file), every minute for each company that switched it on (a no-op without a database).
  const { startLogExport } = await import("@/server/scheduler/log-export");
  startLogExport();
  // The company context draft a person started in setup, under a lease per company (a no-op without a database).
  const { startContextRuns } = await import("@/server/scheduler/context-run");
  startContextRuns();
  // Errors counted in memory go to the ErrorGroup table once a minute.
  const { startErrorFlush } = await import("@/server/errors");
  startErrorFlush();
}

async function resealVault() {
  try {
    const { vaultKey, vaultPreviousKey } = await import("@/features/connectors/vault");
    const { hasDatabase } = await import("@/lib/db/mode");
    const current = vaultKey();
    const previous = vaultPreviousKey();
    if (!previous || !current || !hasDatabase()) return;
    const { resealAll } = await import("@/lib/db/vault-reseal");
    const failures: string[] = [];
    const r = await resealAll({ current, previous }, undefined, (model, id) => failures.push(`${model} ${id}`));
    console.log(`[vault] re-sealed ${r.resealed}, left ${r.left}, failed ${r.failed}`);
    for (const f of failures) console.error(`[vault] could not open ${f} with either key`);
  } catch (err) {
    console.error("[vault] re-seal failed:", err instanceof Error ? err.message : "unknown error");
  }
}

// Every error a page, server action, route handler or the proxy throws on the server: counted by
// kind (features/errors), never with the request's query or body. routePath is the route's pattern
// (/[company]/(app)/cases/[caseId]); request.path would carry the query string.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { recordError } = await import("@/server/errors");
    recordError("server", err, context.routePath || request.path);
  } catch {
    // Counting an error must never raise one.
  }
};
