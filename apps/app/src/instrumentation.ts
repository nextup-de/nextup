// Next calls register() once, when the server starts and before it takes a request. The one job
// here: find out whether the configured database is actually there (src/lib/db/mode.ts), then
// start the ticket sync (src/server/tickets-sync.ts).
export async function register() {
  // The proxy bundle evaluates this file too; only the Node server should open a connection.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { probeDatabase } = await import("@/lib/db/client");
  await probeDatabase();
  // Bug reports to and replies from admin.sellux.ch, once a minute (a no-op without OPS_URL).
  const { startTicketSync } = await import("@/server/tickets-sync");
  startTicketSync();
}
