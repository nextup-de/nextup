// Next calls register() once, when the server starts and before it takes a request. Its jobs:
// find out whether the configured database is actually there (src/lib/db/mode.ts), then start the
// ticket sync (src/server/tickets-sync.ts) and the error counter's flush (src/server/errors.ts).
import type { Instrumentation } from "next";

export async function register() {
  // The proxy bundle evaluates this file too; only the Node server should open a connection.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { probeDatabase } = await import("@/lib/db/client");
  await probeDatabase();
  // Bug reports to and replies from admin.sellux.ch, once a minute (a no-op without OPS_URL).
  const { startTicketSync } = await import("@/server/tickets-sync");
  startTicketSync();
  // Errors counted in memory go to the ErrorGroup table once a minute.
  const { startErrorFlush } = await import("@/server/errors");
  startErrorFlush();
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
